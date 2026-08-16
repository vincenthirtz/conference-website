// pages/api/admin/matches/[matchId]/drafts/[gameIndex]/index.ts
// Draft resource for (matchId, gameIndex). Admin-only.
//
//   GET    : return the assembled DraftState (Lot 2).
//   DELETE : drop the draft + steps so the operator can re-init with the
//            correct gameIndex / fearless flag without SQL. Refuses to
//            delete an in_progress draft unless ?force=1 (engine guard).

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  getDraftState,
  deleteDraft,
  DraftEngineError,
} from '@/utils/draftEngine';
import { logger } from '../../../../../../../utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const method = req.method;
  if (method !== 'GET' && method !== 'DELETE') {
    res.setHeader('Allow', 'GET,DELETE');
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
    switch (method) {
      case 'GET': {
        const state = await getDraftState({
          matchId,
          gameIndex: gameIndexNum,
          tenantId: ctx.tenantId,
        });
        return res.status(200).json({ draft: state });
      }
      case 'DELETE': {
        const force = req.query.force === '1' || req.query.force === 'true';
        const result = await deleteDraft({
          matchId,
          gameIndex: gameIndexNum,
          tenantId: ctx.tenantId,
          force,
        });
        return res.status(200).json({ success: true, ...result });
      }
    }
  } catch (err) {
    if (err instanceof DraftEngineError) {
      return res
        .status(err.status)
        .json({ error: err.message, code: err.code, ...(err.detail ?? {}) });
    }
    logger.error(
      '[admin/matches/:id/drafts/:gameIndex] %s error:',
      req.method,
      err
    );
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withStaffRoute(handler, 'admin');
