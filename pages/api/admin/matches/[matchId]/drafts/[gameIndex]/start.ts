// pages/api/admin/matches/[matchId]/drafts/[gameIndex]/start.ts
// Explicit start of a pending draft (Lot 3 — server-side timer).
//
// POST  — transition pending → in_progress, stamp started_at, and arm the
//         deadline_at on step 1 so the auto-pick cron can race against it.
//         Requires sides assigned. Returns the fresh DraftState.

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  withStaffRoute,
  AuthenticatedStaffContext,
} from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import { startDraft, DraftEngineError } from '@/utils/draftEngine';
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

  try {
    const state = await startDraft({
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
    logger.error(
      '[admin/matches/:id/drafts/:gameIndex/start] error:',
      err
    );
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'match-draft-start' }),
  'admin'
);
