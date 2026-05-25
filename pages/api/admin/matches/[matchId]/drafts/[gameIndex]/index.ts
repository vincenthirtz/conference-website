// pages/api/admin/matches/[matchId]/drafts/[gameIndex]/index.ts
// GET draft state for (matchId, gameIndex). Admin-only — the public
// spectator endpoint will be added later (Lot 5).
//
// Response : { draft: DraftState | null }

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  withStaffRoute,
  AuthenticatedStaffContext,
} from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { getDraftState, DraftEngineError } from '@/utils/draftEngine';
import { logger } from '../../../../../../../utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { matchId, gameIndex } = req.query;
  if (!matchId || Array.isArray(matchId) || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }
  const gameIndexNum = Number(gameIndex);
  if (!Number.isInteger(gameIndexNum) || gameIndexNum < 1) {
    return res
      .status(400)
      .json({ error: 'gameIndex must be a positive integer.' });
  }

  try {
    const state = await getDraftState({
      matchId,
      gameIndex: gameIndexNum,
      tenantId: ctx.tenantId,
    });
    return res.status(200).json({ draft: state });
  } catch (err) {
    if (err instanceof DraftEngineError) {
      return res
        .status(err.status)
        .json({ error: err.message, code: err.code, ...(err.detail ?? {}) });
    }
    logger.error('[admin/matches/:id/drafts/:gameIndex] get error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withStaffRoute(handler, 'manager');
