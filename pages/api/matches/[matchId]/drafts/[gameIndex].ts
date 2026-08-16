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
  if (!matchId || Array.isArray(matchId) || !isValidUUID(matchId as string)) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }
  const gameIndexNum = Number(gameIndex);
  if (!Number.isInteger(gameIndexNum) || gameIndexNum < 1) {
    return res
      .status(400)
      .json({ error: 'gameIndex must be a positive integer.' });
  }

  try {
    // Resolve the match's tenant_id + team ids so we can drive the engine
    // without exposing the cross-tenant lookup pattern to public callers,
    // AND surface the team names for the spectator UI's auto-title.
    const { data: matchRow, error: matchErr } = await supabaseAdmin
      .from('matches')
      .select('id, tenant_id, team1_id, team2_id')
      .eq('id', matchId)
      .maybeSingle();
    if (matchErr) {
      logger.error('[public/draft] match lookup error:', matchErr);
      return res.status(500).json({ error: 'Internal server error' });
    }
    if (!matchRow) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const tenantId = (matchRow as any).tenant_id;
    const state = await getDraftState({
      matchId: matchId as string,
      gameIndex: gameIndexNum,
      tenantId,
    });

    // Fetch the two team names so the spectator UI can render
    // "Phoenix vs. Dragons" without the caster having to pass ?title=.
    // Best-effort : if the lookup fails or a team is missing, we just
    // fall back to nulls and the UI degrades gracefully.
    let team1Name: string | null = null;
    let team2Name: string | null = null;
    const teamIds = [
      (matchRow as any).team1_id,
      (matchRow as any).team2_id,
    ].filter((v): v is string => typeof v === 'string');
    if (teamIds.length > 0) {
      const { data: teamRows } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .in('id', teamIds);
      const byId = new Map(
        ((teamRows ?? []) as Array<{ id: string; name: string | null }>).map(
          (t) => [t.id, t.name ?? null]
        )
      );
      team1Name = byId.get((matchRow as any).team1_id) ?? null;
      team2Name = byId.get((matchRow as any).team2_id) ?? null;
    }

    // Short cache — Realtime is the primary fan-out, this is the fallback
    // for fresh tabs and reconnecting OBS browser sources.
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=5, stale-while-revalidate=15'
    );
    return res.status(200).json({
      draft: state,
      teams: { team1Name, team2Name },
    });
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
