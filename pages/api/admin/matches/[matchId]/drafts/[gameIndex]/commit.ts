// pages/api/admin/matches/[matchId]/drafts/[gameIndex]/commit.ts
// Commit a single ban/pick step (Lot 2 — engine API).
//
// POST body : { stepNumber: number, heroId: string }
//   - stepNumber must equal current_step + 1.
//   - heroId must reference a game_heroes row for the same game.
//   - hero must not already be banned/picked in this draft.
//   - if draft.fearless and gameIndex > 1 : hero must not have been picked
//     in any previous game of the same match.
//   - Sides must be assigned before the first commit.
//   - Transitions pending → in_progress on step 1, in_progress → completed
//     once the last flow step is committed.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import { commitDraftStep, DraftEngineError } from '@/utils/draftEngine';
import { logger } from '../../../../../../../utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
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
  const stepNumber = Number(body.stepNumber);
  const heroId = body.heroId;
  if (!Number.isInteger(stepNumber) || stepNumber < 1) {
    return res
      .status(400)
      .json({ error: 'stepNumber must be a positive integer.' });
  }
  if (typeof heroId !== 'string' || !isValidUUID(heroId)) {
    return res.status(400).json({ error: 'heroId must be a UUID.' });
  }

  try {
    const state = await commitDraftStep({
      matchId,
      gameIndex: gameIndexNum,
      tenantId: ctx.tenantId,
      stepNumber,
      heroId,
    });
    return res.status(200).json({ draft: state });
  } catch (err) {
    if (err instanceof DraftEngineError) {
      return res
        .status(err.status)
        .json({ error: err.message, code: err.code, ...(err.detail ?? {}) });
    }
    logger.error('[admin/matches/:id/drafts/:gameIndex/commit] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'match-draft-commit' }),
  { permission: 'arbitrate_matches' }
);
