export interface PortfolioPosition {
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  quantity: number;
  currentPrice: number;
  unrealizedPnL: number;
  volatility?: number; // historical volatility %
}

export interface PortfolioRiskMetrics {
  totalAccountValue: number;
  totalRiskAmount: number; // sum of position SL distances
  portfolioHeat: number; // % of account at risk
  largestPosition: PortfolioPosition | null;
  totalOpenPositions: number;
  maxConcurrentPositions: number;
  currentExposure: number; // % of account deployed
  riskPerPosition: number; // avg risk per trade
}

const DEFAULT_MAX_CONCURRENT_POSITIONS = 50;
const MAX_PORTFOLIO_HEAT = 0.05; // 5% max risk at any time
const VOLATILITY_MULTIPLIER = 1.2;

export class PortfolioRiskManager {
  private accountBalance: number;
  private maxConcurrentPositions: number;
  private maxPortfolioHeat: number;

  constructor(
    accountBalance: number,
    maxPositions: number = DEFAULT_MAX_CONCURRENT_POSITIONS,
    maxHeat: number = MAX_PORTFOLIO_HEAT
  ) {
    this.accountBalance = accountBalance;
    this.maxConcurrentPositions = maxPositions;
    this.maxPortfolioHeat = maxHeat;
  }

  validatePositionSize(
    position: PortfolioPosition,
    stopLossPercent: number,
    currentPortfolioExposure: number
  ): {
    isValid: boolean;
    adjustedQuantity?: number;
    reason?: string;
  } {
    // Risk amount for this trade
    const riskAmount = position.entryPrice * position.quantity * (stopLossPercent / 100);
    const riskAsPortfolioPercent = riskAmount / this.accountBalance;

    // Check if adding this position would exceed max heat
    const totalPortfolioHeat = currentPortfolioExposure + riskAsPortfolioPercent;
    if (totalPortfolioHeat > this.maxPortfolioHeat) {
      const maxRiskAllowed = this.maxPortfolioHeat - currentPortfolioExposure;
      const maxQuantity = (maxRiskAllowed * this.accountBalance) /
        (position.entryPrice * (stopLossPercent / 100));

      return {
        isValid: false,
        adjustedQuantity: maxQuantity,
        reason: `Portfolio heat (${(totalPortfolioHeat * 100).toFixed(2)}%) would exceed max (${(this.maxPortfolioHeat * 100).toFixed(2)}%)`,
      };
    }

    return { isValid: true };
  }

  calculateMetrics(positions: PortfolioPosition[]): PortfolioRiskMetrics {
    let totalRisk = 0;
    let totalExposure = 0;
    let largestPosition = null;
    let largestExposure = 0;

    for (const pos of positions) {
      const exposure = (pos.entryPrice * pos.quantity) / this.accountBalance;
      totalExposure += exposure;

      // Estimate risk (assume 2% SL for positions without explicit SL)
      const slPercent = 0.02;
      const positionRisk = pos.entryPrice * pos.quantity * slPercent;
      totalRisk += positionRisk;

      if (exposure > largestExposure) {
        largestExposure = exposure;
        largestPosition = pos;
      }
    }

    return {
      totalAccountValue: this.accountBalance,
      totalRiskAmount: totalRisk,
      portfolioHeat: totalRisk / this.accountBalance,
      largestPosition,
      totalOpenPositions: positions.length,
      maxConcurrentPositions: this.maxConcurrentPositions,
      currentExposure: totalExposure,
      riskPerPosition: positions.length > 0 ? totalRisk / positions.length : 0,
    };
  }

  adjustPositionSizeForVolatility(
    baseSize: number,
    volatilityPercent: number
  ): number {
    // Higher volatility = smaller position size
    // volatilityPercent: annualized historical volatility
    const avgVolatility = 30; // assume 30% average crypto volatility
    const volumAdjustment = avgVolatility / Math.max(volatilityPercent, 5);

    return baseSize * Math.min(volumAdjustment, 1.5); // Cap at 1.5x
  }

  canOpenNewPosition(currentMetrics: PortfolioRiskMetrics): {
    allowed: boolean;
    reason?: string;
  } {
    // Check position count limit
    if (currentMetrics.totalOpenPositions >= this.maxConcurrentPositions) {
      return {
        allowed: false,
        reason: `Max positions (${this.maxConcurrentPositions}) reached`,
      };
    }

    // Check portfolio heat
    if (currentMetrics.portfolioHeat >= this.maxPortfolioHeat) {
      return {
        allowed: false,
        reason: `Portfolio heat (${(currentMetrics.portfolioHeat * 100).toFixed(2)}%) at or exceeds max`,
      };
    }

    return { allowed: true };
  }

  calculateTrailingSLPrice(
    currentPrice: number,
    highestPrice: number,
    trailingPercent: number
  ): number {
    // Trailing SL follows highest price by X%
    return highestPrice * (1 - trailingPercent / 100);
  }

  calculateVolatilityAdjustedSL(
    entryPrice: number,
    volatilityPercent: number,
    baseSLPercent: number = 2
  ): number {
    // ATR-style SL: use volatility to adjust SL distance
    const atrMultiplier = volatilityPercent / 30; // normalized to 30% baseline
    return baseSLPercent * Math.max(atrMultiplier, 0.5); // Min 0.5x, no cap
  }

  getPortfolioHeatPercentage(metrics: PortfolioRiskMetrics): number {
    return metrics.portfolioHeat * 100;
  }

  getHeatlightStatus(metrics: PortfolioRiskMetrics): 'green' | 'yellow' | 'red' {
    const heat = metrics.portfolioHeat;
    if (heat < 0.02) return 'green'; // < 2% = safe
    if (heat < 0.04) return 'yellow'; // 2-4% = caution
    return 'red'; // > 4% = high risk
  }
}
