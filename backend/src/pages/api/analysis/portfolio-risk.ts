import type { NextApiRequest, NextApiResponse } from 'next';
import { PortfolioRiskManager } from '@/lib/portfolio-risk-manager';
import { asyncHandler } from '@/lib/utils';

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    accountBalance,
    positions = [],
    maxPositions = 50,
    maxPortfolioHeat = 0.05,
  } = req.body;

  if (!accountBalance || accountBalance <= 0) {
    return res.status(400).json({
      error: 'Invalid account balance',
    });
  }

  try {
    const riskManager = new PortfolioRiskManager(accountBalance, maxPositions, maxPortfolioHeat);

    // Calculate metrics
    const metrics = riskManager.calculateMetrics(positions);

    // Get heat light status
    const heatStatus = riskManager.getHeatlightStatus(metrics);

    // Check if new position can be opened
    const canOpenNew = riskManager.canOpenNewPosition(metrics);

    res.status(200).json({
      success: true,
      data: {
        metrics,
        heatStatus,
        canOpenNewPosition: canOpenNew.allowed,
        warnings: canOpenNew.reason ? [canOpenNew.reason] : [],
        riskSummary: {
          portfolioHeatPercent: `${(metrics.portfolioHeat * 100).toFixed(2)}%`,
          maxAllowed: `${(maxPortfolioHeat * 100).toFixed(2)}%`,
          status: heatStatus,
          riskPerPosition: `$${metrics.riskPerPosition.toFixed(2)}`,
          totalRisk: `$${metrics.totalRiskAmount.toFixed(2)}`,
        },
      },
    });
  } catch (error) {
    console.error('Error calculating portfolio risk:', error);
    res.status(500).json({
      error: 'Failed to calculate portfolio risk',
    });
  }
});
