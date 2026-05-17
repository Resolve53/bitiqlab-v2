import { BinanceTradingClient, Order } from './binance-trading';
import { PortfolioRiskManager } from './portfolio-risk-manager';

export interface ExecutionContext {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface ExecutionResult {
  success: boolean;
  orderId?: number;
  executedPrice?: number;
  executedQuantity?: number;
  status: 'FILLED' | 'PARTIAL' | 'REJECTED' | 'PENDING';
  error?: string;
  attempts: number;
  slPrice: number;
  tpPrice: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const EXPONENTIAL_BACKOFF = 2;

export class TradeExecutionService {
  private client: BinanceTradingClient;
  private riskManager: PortfolioRiskManager;

  constructor(accountBalance: number, apiKey?: string, apiSecret?: string) {
    this.client = new BinanceTradingClient(apiKey, apiSecret, true);
    this.riskManager = new PortfolioRiskManager(accountBalance);
  }

  async executeTradeWithRetry(context: ExecutionContext): Promise<ExecutionResult> {
    const maxRetries = context.maxRetries || MAX_RETRIES;
    const retryDelay = context.retryDelayMs || RETRY_DELAY_MS;

    let lastError: Error | null = null;
    let attempt = 0;

    // Calculate SL and TP prices
    const slPrice = this.calculateStopLossPrice(
      context.entryPrice,
      context.side,
      context.stopLossPercent
    );
    const tpPrice = this.calculateTakeProfitPrice(
      context.entryPrice,
      context.side,
      context.takeProfitPercent
    );

    while (attempt < maxRetries) {
      attempt++;

      try {
        // Validate position size before placement
        const validation = this.riskManager.validatePositionSize(
          {
            symbol: context.symbol,
            side: context.side === 'BUY' ? 'long' : 'short',
            entryPrice: context.entryPrice,
            quantity: context.quantity,
            currentPrice: context.entryPrice,
            unrealizedPnL: 0,
          },
          context.stopLossPercent,
          0 // Current portfolio exposure (simplified)
        );

        if (!validation.isValid) {
          return {
            success: false,
            status: 'REJECTED',
            error: validation.reason,
            attempts: attempt,
            slPrice,
            tpPrice,
          };
        }

        // Place order
        const order = await this.client.marketOrder(
          context.symbol,
          context.side,
          context.quantity
        );

        return {
          success: true,
          orderId: order.orderId,
          executedPrice: order.price,
          executedQuantity: order.executedQty,
          status: this.mapOrderStatus(order.status),
          attempts: attempt,
          slPrice,
          tpPrice,
        };
      } catch (error) {
        lastError = error as Error;
        console.warn(`Trade execution attempt ${attempt} failed:`, lastError.message);

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = retryDelay * Math.pow(EXPONENTIAL_BACKOFF, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      status: 'REJECTED',
      error: lastError?.message || 'Max retries exceeded',
      attempts: attempt,
      slPrice,
      tpPrice,
    };
  }

  private calculateStopLossPrice(
    entryPrice: number,
    side: 'BUY' | 'SELL',
    slPercent: number
  ): number {
    if (side === 'BUY') {
      return entryPrice * (1 - slPercent / 100);
    } else {
      return entryPrice * (1 + slPercent / 100);
    }
  }

  private calculateTakeProfitPrice(
    entryPrice: number,
    side: 'BUY' | 'SELL',
    tpPercent: number
  ): number {
    if (side === 'BUY') {
      return entryPrice * (1 + tpPercent / 100);
    } else {
      return entryPrice * (1 - tpPercent / 100);
    }
  }

  private mapOrderStatus(binanceStatus: string): 'FILLED' | 'PARTIAL' | 'REJECTED' | 'PENDING' {
    switch (binanceStatus) {
      case 'FILLED':
        return 'FILLED';
      case 'PARTIALLY_FILLED':
        return 'PARTIAL';
      case 'REJECTED':
      case 'EXPIRED':
        return 'REJECTED';
      case 'NEW':
      case 'PENDING_CANCEL':
        return 'PENDING';
      default:
        return 'PENDING';
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async monitorTradeWithSLTP(
    orderId: number,
    symbol: string,
    slPrice: number,
    tpPrice: number,
    pollIntervalMs: number = 10000
  ): Promise<{ exitReason: 'SL' | 'TP' | 'TIMEOUT'; exitPrice: number }> {
    const timeoutMs = 24 * 60 * 60 * 1000; // 24 hours
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const currentPrice = await this.client.getPrice(symbol);

        // Check if SL hit
        if (currentPrice <= slPrice) {
          return { exitReason: 'SL', exitPrice: currentPrice };
        }

        // Check if TP hit
        if (currentPrice >= tpPrice) {
          return { exitReason: 'TP', exitPrice: currentPrice };
        }

        await this.sleep(pollIntervalMs);
      } catch (error) {
        console.error('Error monitoring trade:', error);
        await this.sleep(pollIntervalMs);
      }
    }

    // Timeout after 24 hours
    const finalPrice = await this.client.getPrice(symbol);
    return { exitReason: 'TIMEOUT', exitPrice: finalPrice };
  }

  async closePosition(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    reason: string = 'Manual close'
  ): Promise<ExecutionResult> {
    console.log(`Closing ${side} position for ${symbol} (${quantity}): ${reason}`);

    try {
      const closeSide = side === 'BUY' ? 'SELL' : 'BUY';
      const order = await this.client.marketOrder(symbol, closeSide, quantity);

      return {
        success: true,
        orderId: order.orderId,
        executedPrice: order.price,
        executedQuantity: order.executedQty,
        status: 'FILLED',
        attempts: 1,
        slPrice: 0,
        tpPrice: 0,
      };
    } catch (error) {
      console.error('Error closing position:', error);
      return {
        success: false,
        status: 'REJECTED',
        error: error instanceof Error ? error.message : 'Failed to close position',
        attempts: 1,
        slPrice: 0,
        tpPrice: 0,
      };
    }
  }
}
