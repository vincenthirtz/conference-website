// pages/api/admin/matches/[matchId]/drafts/index.ts
// MOBA draft init (Lot 2 — engine API).
//
// POST : initialise a draft for a given (matchId, gameIndex).
//        Body: { gameIndex: number, fearless?: boolean, pickTimerSeconds?: number }
//        Resolves the game slug from the match's tournament and seeds the
//        match_draft_steps rows from config/games/<slug>.draftFlows[format].
//        409 if a draft already exists for (matchId, gameIndex).

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import { initDraft, DraftEngineError } from '@/utils/draftEngine';
import { logger } from '../../../../../../utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { matchId } = req.query;
  if (!matchId || Array.isArray(matchId) || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const gameIndex = Number(body.gameIndex);
  if (!Number.isInteger(gameIndex) || gameIndex < 1) {
    return res
      .status(400)
      .json({ error: 'gameIndex must be a positive integer.' });
  }

  const fearless =
    typeof body.fearless === 'boolean' ? body.fearless : undefined;
  const pickTimerSeconds =
    body.pickTimerSeconds === undefined
      ? undefined
      : Number(body.pickTimerSeconds);

  try {
    const state = await initDraft({
      matchId,
      gameIndex,
      tenantId: ctx.tenantId,
      fearless,
      pickTimerSeconds,
    });
    return res.status(201).json({ draft: state });
  } catch (err) {
    if (err instanceof DraftEngineError) {
      return res
        .status(err.status)
        .json({ error: err.message, code: err.code, ...(err.detail ?? {}) });
    }
    logger.error('[admin/matches/:id/drafts] init error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'match-draft-init' }),
  'admin'
);
