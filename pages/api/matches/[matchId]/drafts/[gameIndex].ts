// pages/api/matches/[matchId]/drafts/[gameIndex].ts
// Public spectator endpoint for the MOBA draft (Lot 5).
//
// Returns the assembled DraftState for (matchId, gameIndex) without
// authentication so a caster can embed the stream-friendly UI in OBS.
// The draftId is a UUID — un-guessable — and `match_drafts` already
// carries a `select_public` RLS policy (Lot 0), so this is safe to
// expose tenant-agnostic. Lot 4 admin GET remains the source of truth
// when staff is logged in.
//
// Realtime fan-out is the primary update mechanism; the short s-maxage
// is a fallback for the initial render and for OBS browser sources
// that lose their WS for a few seconds.

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { supabaseAdmin } from '@/utils/supabase';
import { isValidUUID } from '@/utils/apiHelpers';
import { getDraftState, DraftEngineError } from '@/utils/draftEngine';
import { logger } from '../../../../../utils/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'public-draft')) {
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable.' });
  }

  const { matchId, gameIndex } = req.query;
  if (
    !matchId ||
    Array.isArray(matchId) ||
    !isValidUUID(matchId as string)
  ) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }
  const gameIndexNum = Number(gameIndex);
  if (!Number.isInteger(gameIndexNum) || gameIndexNum < 1) {
    return res
      .status(400)
      .json({ error: 'gameIndex must be a positive integer.' });
  }

  try {
    // Resolve the match's tenant_id so we can drive the engine without
    // exposing the cross-tenant lookup pattern to public callers. If the
    // match doesn't exist we return 404 with no tenant info leaked.
    const { data: matchRow, error: matchErr } = await supabaseAdmin
      .from('matches')
      .select('id, tenant_id')
      .eq('id', matchId)
      .maybeSingle();
    if (matchErr) {
      logger.error('[public/draft] match lookup error:', matchErr);
      return res.status(500).json({ error: 'Internal server error' });
    }
    if (!matchRow) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const state = await getDraftState({
      matchId: matchId as string,
      gameIndex: gameIndexNum,
      tenantId: (matchRow as any).tenant_id,
    });

    // Short cache — Realtime is the primary fan-out, this is the fallback
    // for fresh tabs and reconnecting OBS browser sources.
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=15');
    return res.status(200).json({ draft: state });
  } catch (err) {
    if (err instanceof DraftEngineError) {
      return res
        .status(err.status)
        .json({ error: err.message, code: err.code, ...(err.detail ?? {}) });
    }
    logger.error('[public/draft] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
