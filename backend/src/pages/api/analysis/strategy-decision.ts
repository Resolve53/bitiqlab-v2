import type { NextApiRequest, NextApiResponse } from 'next';
import { getDB } from '@/lib/db';
import { asyncHandler, sendSuccess, sendError } from '@/lib/utils';
import {
  evaluatePromotionReadiness,
  promoteStrategyToBitiq,
} from '@/lib/bitiq-promotion-service';

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return sendError(res, 'Method not allowed', 405, req);
  }

  const { strategyId, decision, reason, session_id, deploy_to_bitiq } = req.body;

  if (!strategyId || !decision || !['promote', 'archive'].includes(decision)) {
    return sendError(
      res,
      'Missing or invalid fields: strategyId, decision (promote|archive)',
      400,
      req
    );
  }

  try {
    const db = getDB();
    const strategy = await db.getStrategy(strategyId);

    const readiness = await evaluatePromotionReadiness(strategyId, session_id);

    const result = {
      strategyId,
      decision,
      timestamp: new Date(),
      reason: reason || 'No reason provided',
      meetsPromotionCriteria: readiness.ready,
      readiness,
    };

    if (decision === 'archive') {
      await db.updateStrategy(strategyId, { status: 'failed' });
      return sendSuccess(
        res,
        {
          ...result,
          message: `Strategy archived. Reason: ${reason || 'none'}`,
        },
        200,
        req
      );
    }

    await db.updateStrategy(strategyId, { status: 'approved' });

    let bitiqResult = null;
    if (deploy_to_bitiq !== false) {
      bitiqResult = await promoteStrategyToBitiq({
        strategyId,
        sessionId: session_id,
        notes: reason,
        force: !readiness.ready,
      });
    }

    return sendSuccess(
      res,
      {
        ...result,
        bitiq: bitiqResult,
        message: bitiqResult?.success
          ? bitiqResult.message
          : `Strategy approved. Bitiq: ${bitiqResult?.error || 'not deployed'}`,
      },
      200,
      req
    );
  } catch (error) {
    console.error('Error making strategy decision:', error);
    return sendError(
      res,
      error instanceof Error ? error.message : 'Failed to make strategy decision',
      500,
      req
    );
  }
});
