/**
 * Continuous Coin Monitoring Service
 * Monitors multiple coins every 5 seconds, evaluates conditions, and logs results
 */

import { getPriceCache } from "./price-cache";
import { getEvaluator, StrategySignal } from "./strategy-evaluator";
import { getTradingClient } from "./binance-trading";
import { getDB } from "./db";
import { confirmSignalBeforeExecution } from "./signal-confirmation-service";

export interface MonitoringConfig {
  session_id: string;
  strategy_id: string;
  coins: string[];
  symbol: string;
  timeframe: string;
  entry_rules?: any;
  exit_rules?: any;
  auto_trade?: boolean;
  poll_interval_ms?: number;
}

export interface MonitoringStatus {
  job_id: string;
  status: "running" | "stopped" | "error";
  session_id: string;
  coins_monitored: string[];
  last_prices: Map<string, number>;
  last_evaluation: Date | null;
  signals_generated: number;
  trades_executed: number;
  error?: string;
}

export interface MonitoringResult {
  symbol: string;
  timestamp: Date;
  price: number;
  signal: StrategySignal | null;
  trade_executed?: boolean;
  error?: string;
}

class MonitoringJob {
  private config: MonitoringConfig;
  private status: MonitoringStatus;
  private intervalHandle: NodeJS.Timeout | null = null;
  private isRunning = false;
  private results: MonitoringResult[] = [];

  constructor(config: MonitoringConfig) {
    this.config = {
      poll_interval_ms: 5000,
      auto_trade: false,
      ...config,
    };

    this.status = {
      job_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: "stopped",
      session_id: config.session_id,
      coins_monitored: config.coins,
      last_prices: new Map(),
      last_evaluation: null,
      signals_generated: 0,
      trades_executed: 0,
    };
  }

  getStatus(): MonitoringStatus {
    return {
      ...this.status,
      last_prices: new Map(this.status.last_prices),
    };
  }

  getJobId(): string {
    return this.status.job_id;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn(`[COIN-MONITOR] Job ${this.status.job_id} already running`);
      return;
    }

    this.isRunning = true;
    this.status.status = "running";
    console.log(`[COIN-MONITOR] Starting job ${this.status.job_id} for session ${this.config.session_id}`);
    console.log(`[COIN-MONITOR] Monitoring coins: ${this.config.coins.join(", ")}`);
    console.log(`[COIN-MONITOR] Poll interval: ${this.config.poll_interval_ms}ms`);

    // Persist job status to database
    try {
      const db = getDB();
      await db.createMonitoringJobStatus({
        job_id: this.status.job_id,
        session_id: this.config.session_id,
        strategy_id: this.config.strategy_id,
        coins: this.config.coins,
        status: "running",
        signals_generated: 0,
        trades_executed: 0,
      });
      console.log(`[COIN-MONITOR] ✓ Job status persisted to database`);
    } catch (error) {
      console.error(`[COIN-MONITOR] Warning: Failed to persist job status:`, error);
      // Continue anyway, monitoring can still run
    }

    // Run first cycle immediately
    await this.pollCycle();

    // Then set interval for subsequent cycles
    this.intervalHandle = setInterval(
      () => this.pollCycle(),
      this.config.poll_interval_ms
    );
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.isRunning = false;
    this.status.status = "stopped";
    console.log(`[COIN-MONITOR] Stopped job ${this.status.job_id}`);
  }

  private async pollCycle(): Promise<void> {
    try {
      const priceCache = getPriceCache();
      const evaluator = getEvaluator();
      const db = getDB();

      // Update prices from cache
      const coins = this.config.coins;
      await priceCache.updatePrices(coins);

      const cycleResults: MonitoringResult[] = [];
      let tradeCount = 0;

      // Evaluate each coin
      for (const coin of coins) {
        try {
          const priceData = priceCache.getPrice(coin);
          if (!priceData) {
            cycleResults.push({
              symbol: coin,
              timestamp: new Date(),
              price: 0,
              signal: null,
              error: "Price not available",
            });
            continue;
          }

          const price = priceData.price;
          this.status.last_prices.set(coin, price);

          // Evaluate entry/exit conditions
          let signal: StrategySignal | null = null;
          let tradeExecuted = false;

          try {
            // Get session to check position status
            const session = await db.getTradingSession(this.config.session_id);
            if (!session) {
              throw new Error("Trading session not found");
            }

            // Check if we have an open position
            const trades = await db.listPaperTrades(this.config.session_id);
            let hasOpenPosition = false;
            let lastBuyPrice = 0;
            let lastBuyQuantity = 0;

            for (const trade of trades) {
              if (trade.side === "BUY" && trade.symbol === coin) {
                hasOpenPosition = true;
                lastBuyPrice = trade.entry_price;
                lastBuyQuantity = trade.quantity;
              } else if (trade.side === "SELL" && trade.symbol === coin) {
                hasOpenPosition = false;
              }
            }

            // Evaluate conditions
            if (!hasOpenPosition) {
              signal = await evaluator.evaluateEntry(
                coin,
                this.config.timeframe,
                this.config.entry_rules || { indicators: ["rsi", "macd"] },
                price
              );

              // Auto-trade if enabled and signal is strong
              if (this.config.auto_trade && signal.signal === "BUY" && signal.confidence > 50) {
                const confirmation = await confirmSignalBeforeExecution({
                  symbol: coin,
                  side: "BUY",
                  strategyId: this.config.strategy_id,
                  sessionId: this.config.session_id,
                  technicalReason: signal.reason,
                  technicalConfidence: signal.confidence,
                  timeframe: this.config.timeframe,
                  currentPrice: price,
                  entryRules: this.config.entry_rules,
                });

                if (!confirmation.approved) {
                  cycleResults.push({
                    symbol: coin,
                    timestamp: new Date(),
                    price,
                    signal,
                    trade_executed: false,
                    error: confirmation.blockReason,
                  });
                  continue;
                }

                const tradingClient = getTradingClient(true);
                const riskAmount = session.initial_balance * 0.02;
                const quantity = Math.round((riskAmount / price) * 10000) / 10000;

                try {
                  const order = await tradingClient.marketOrder(coin, "BUY", quantity);
                  await db.createPaperTrade({
                    session_id: this.config.session_id,
                    strategy_id: this.config.strategy_id,
                    symbol: coin,
                    side: "BUY",
                    entry_price: price,
                    quantity,
                    status: order.status,
                    reason_entry: signal.reason,
                  });

                  tradeExecuted = true;
                  tradeCount++;
                  console.log(`[COIN-MONITOR] ✓ BUY ${coin} @ $${price}`);
                } catch (tradeError) {
                  console.error(`[COIN-MONITOR] Failed to execute BUY ${coin}:`, tradeError);
                }
              }
            } else {
              // Check exit conditions
              const exitRules = this.config.exit_rules || {
                stop_loss_percent: 2,
                take_profit_percent: 5,
              };

              const exitSignal = await evaluator.evaluateExit(coin, lastBuyPrice, price, exitRules);

              if (exitSignal.shouldExit) {
                const tradingClient = getTradingClient(true);

                try {
                  const order = await tradingClient.marketOrder(coin, "SELL", lastBuyQuantity);
                  await db.createPaperTrade({
                    session_id: this.config.session_id,
                    strategy_id: this.config.strategy_id,
                    symbol: coin,
                    side: "SELL",
                    entry_price: price,
                    quantity: lastBuyQuantity,
                    status: order.status,
                    reason_entry: exitSignal.reason,
                  });

                  tradeExecuted = true;
                  tradeCount++;
                  console.log(`[COIN-MONITOR] ✓ SELL ${coin} @ $${price} - ${exitSignal.reason}`);
                } catch (tradeError) {
                  console.error(`[COIN-MONITOR] Failed to execute SELL ${coin}:`, tradeError);
                }
              }
            }
          } catch (evalError) {
            console.error(`[COIN-MONITOR] Evaluation error for ${coin}:`, evalError);
            cycleResults.push({
              symbol: coin,
              timestamp: new Date(),
              price,
              signal: null,
              error: evalError instanceof Error ? evalError.message : "Unknown error",
            });
            continue;
          }

          cycleResults.push({
            symbol: coin,
            timestamp: new Date(),
            price,
            signal,
            trade_executed: tradeExecuted,
          });
        } catch (coinError) {
          console.error(`[COIN-MONITOR] Error processing ${coin}:`, coinError);
          cycleResults.push({
            symbol: coin,
            timestamp: new Date(),
            price: 0,
            signal: null,
            error: coinError instanceof Error ? coinError.message : "Unknown error",
          });
        }
      }

      // Update status
      this.status.last_evaluation = new Date();
      if (tradeCount > 0) {
        this.status.signals_generated++;
        this.status.trades_executed += tradeCount;
      }

      // Persist updated status to database (non-blocking)
      try {
        const db = getDB();
        await db.updateMonitoringJobStatus(this.status.job_id, {
          last_evaluation: this.status.last_evaluation,
          signals_generated: this.status.signals_generated,
          trades_executed: this.status.trades_executed,
        });
      } catch (error) {
        console.warn(`[COIN-MONITOR] Warning: Failed to update job status in DB:`, error);
      }

      // Store last 100 results
      this.results = [...this.results, ...cycleResults].slice(-100);

      console.log(
        `[COIN-MONITOR] Cycle complete: ${coins.length} coins evaluated, ${tradeCount} trades`
      );
    } catch (error) {
      this.status.status = "error";
      this.status.error = error instanceof Error ? error.message : "Unknown error";
      console.error(`[COIN-MONITOR] Poll cycle error:`, error);
    }
  }

  getResults(): MonitoringResult[] {
    return [...this.results];
  }

  getLastResult(symbol: string): MonitoringResult | undefined {
    return this.results.find((r) => r.symbol === symbol);
  }
}

// Global jobs registry
const jobs = new Map<string, MonitoringJob>();

export function createMonitoringJob(config: MonitoringConfig): MonitoringJob {
  const job = new MonitoringJob(config);
  jobs.set(job.getJobId(), job);
  return job;
}

export function getMonitoringJob(jobId: string): MonitoringJob | undefined {
  return jobs.get(jobId);
}

export function listMonitoringJobs(): MonitoringJob[] {
  return Array.from(jobs.values());
}

export function stopMonitoringJob(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (job) {
    job.stop();
    jobs.delete(jobId);
    return true;
  }
  return false;
}

export function stopAllMonitoringJobs(): void {
  for (const [jobId, job] of jobs) {
    job.stop();
    jobs.delete(jobId);
  }
}

export { MonitoringJob };
