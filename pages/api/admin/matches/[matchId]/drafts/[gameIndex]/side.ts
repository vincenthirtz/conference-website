// pages/api/admin/matches/[matchId]/drafts/[gameIndex]/side.ts
// Assign team1Side / team2Side on a pending draft (Lot 2 — engine API).
//
// PATCH body : { team1Side: string, team2Side: string }
//   - lol  : blue | red
//   - dota2: radiant | dire
//   - team1Side !== team2Side
//   - Only allowed before any step has been committed.

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  withStaffRoute,
  AuthenticatedStaffContext,
} from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import { setDraftSides, DraftEngineError } from '@/utils/draftEngine';
import { logger } from '../../../../../../../utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
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

  const body = (req.body ?? {}) as Record<string, unknown>;
  const team1Side = body.team1Side;
  const team2Side = body.team2Side;
  if (typeof team1Side !== 'string' || typeof team2Side !== 'string') {
    return res
      .status(400)
      .json({ error: 'team1Side and team2Side are required strings.' });
  }

  try {
    const state = await setDraftSides({
      matchId,
      gameIndex: gameIndexNum,
      tenantId: ctx.tenantId,
      team1Side,
      team2Side,
    });
    return res.status(200).json({ draft: state });
  } catch (err) {
    if (err instanceof DraftEngineError) {
      return res
        .status(err.status)
        .json({ error: err.message, code: err.code, ...(err.detail ?? {}) });
    }
    logger.error(
      '[admin/matches/:id/drafts/:gameIndex/side] error:',
      err
    );
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'match-draft-side' }),
  'admin'
);
