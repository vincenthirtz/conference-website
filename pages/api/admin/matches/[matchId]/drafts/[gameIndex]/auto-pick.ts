// pages/api/admin/matches/[matchId]/drafts/[gameIndex]/auto-pick.ts
// Manual / test trigger for the auto-pick logic (Lot 3 — server-side timer).
//
// POST — runs applyAutoPickIfExpired() on the targeted draft. Returns the
//        new DraftState when a hero was auto-picked, or 200 + autoPicked=false
//        when there was nothing to do (deadline still in the future, draft
//        not in progress, or current step already committed).

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  withStaffRoute,
  AuthenticatedStaffContext,
} from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import { supabaseAdmin } from '@/utils/supabase';
import { applyAutoPickIfExpired, DraftEngineError } from '@/utils/draftEngine';
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

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable.' });
  }

  try {
    // Resolve the draft id from (matchId, gameIndex, tenantId).
    const { data: draftRow, error: dErr } = await supabaseAdmin
      .from('match_drafts')
      .select('id')
      .eq('match_id', matchId)
      .eq('game_index', gameIndexNum)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    if (dErr) {
      return res.status(500).json({ error: dErr.message });
    }
    if (!draftRow) {
      return res
        .status(404)
        .json({ error: 'Draft not found.', code: 'DRAFT_NOT_FOUND' });
    }

    const result = await applyAutoPickIfExpired({
      draftId: (draftRow as any).id,
      tenantId: ctx.tenantId,
    });
    if (!result) {
      return res.status(200).json({ autoPicked: false });
    }
    return res.status(200).json({
      autoPicked: true,
      stepNumber: result.stepNumber,
      heroId: result.heroId,
      draft: result.state,
    });
  } catch (err) {
    if (err instanceof DraftEngineError) {
      return res
        .status(err.status)
        .json({ error: err.message, code: err.code, ...(err.detail ?? {}) });
    }
    logger.error(
      '[admin/matches/:id/drafts/:gameIndex/auto-pick] error:',
      err
    );
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'match-draft-auto-pick' }),
  'manager'
);
