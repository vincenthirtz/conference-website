// pages/api/overlay/[runId].ts
//
// Feature: Production broadcast automatisée (roadmap #07).
//
// GET (PUBLIC) : everything a chrome-less overlay renderer (OBS browser
// source) needs for a given run — scene + overlay flags from broadcast_state,
// the current match (teams/scores/format/status) and active sponsors.
//
// PUBLIC + cacheable: no auth, `Cache-Control: s-maxage=5, stale-while-
// revalidate`. NEVER leaks staff-only fields (auto_director, casters, stream
// URLs, checklists, broadcast messages…).
//
// Friendliness contract for OBS sources that may poll before the show starts:
//   - malformed runId        → 400 (clear config error)
//   - run not found/not live → 200 with a safe empty-ish shape (scene
//     'starting', match null) so the browser source never errors mid-broadcast.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';
import {
  fetchLiveBroadcastState,
  normalizeState,
  type BroadcastScene,
} from '@/utils/broadcast/liveState';

type OverlayTeam = {
  name: string;
  logoUrl: string | null;
  score: number | null;
};

type OverlayPayload = {
  scene: BroadcastScene;
  onAir: boolean;
  lowerThird: string | null;
  pip: { enabled: boolean };
  match: {
    team1: OverlayTeam | null;
    team2: OverlayTeam | null;
    format: string | null;
    status: string | null;
  } | null;
  sponsors: Array<{
    name: string;
    logoUrl: string | null;
    websiteUrl: string | null;
  }>;
};

/** Active sponsors (global partners today — see report; per-run scoping is a
 * future slice). Never throws; returns [] on failure. */
async function loadSponsors(
  admin: NonNullable<typeof supabaseAdmin>
): Promise<OverlayPayload['sponsors']> {
  const { data, error } = await admin
    .from('partners')
    .select('name, logo_url, website_url, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  if (error) {
    logger.error('[overlay] sponsors load error', error);
    return [];
  }
  return ((data ?? []) as any[]).map((p) => ({
    name: p.name,
    logoUrl: p.logo_url ?? null,
    websiteUrl: p.website_url ?? null,
  }));
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 120, windowMs: 60_000 }, 'overlay'))
    return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable.' });
  }
  const admin = supabaseAdmin;

  const { runId } = req.query;
  if (!runId || Array.isArray(runId) || !isValidUUID(runId)) {
    return res.status(400).json({ error: 'Invalid runId.' });
  }

  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate');

  const sponsors = await loadSponsors(admin);

  const emptyShape: OverlayPayload = {
    scene: 'starting',
    onAir: false,
    lowerThird: null,
    pip: { enabled: false },
    match: null,
    sponsors,
  };

  // Load the requested run (tenant is derived from the run — public reads are
  // scoped by the run id, never by a caller-supplied tenant).
  const { data: run, error: runErr } = await admin
    .from('event_runs')
    .select('id, tenant_id, status, broadcast_state')
    .eq('id', runId)
    .maybeSingle();

  if (runErr) {
    logger.error('[overlay] run load error', runErr);
    return res.status(200).json(emptyShape);
  }

  // Not found or not live → friendly empty-ish shape (still with sponsors).
  if (!run || (run as any).status !== 'live') {
    return res.status(200).json(emptyShape);
  }

  const tenantId = (run as any).tenant_id as string;
  const state = normalizeState((run as any).broadcast_state);

  // Reuse liveState for the current segment's match + team join. It is
  // tenant-scoped and (per the single-live-run invariant) resolves to this run;
  // we still verify run identity before trusting its match block.
  const live = await fetchLiveBroadcastState(tenantId);
  const sameRun = live.run?.id === runId;

  let match: OverlayPayload['match'] = null;
  if (sameRun && live.currentSegment?.match_id && live.match) {
    // Supplement format + status (not carried by liveState's match block).
    const { data: m } = await admin
      .from('matches')
      .select('match_format, status')
      .eq('id', live.match.matchId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const toTeam = (
      t: { name: string; logoUrl: string | null } | null,
      score: number | null
    ): OverlayTeam | null =>
      t ? { name: t.name, logoUrl: t.logoUrl ?? null, score } : null;

    match = {
      team1: toTeam(live.match.team1, live.match.team1Score),
      team2: toTeam(live.match.team2, live.match.team2Score),
      format: (m as any)?.match_format ?? null,
      status: (m as any)?.status ?? null,
    };
  }

  const payload: OverlayPayload = {
    scene: state.scene,
    onAir: state.on_air,
    lowerThird: state.lower_third,
    pip: { enabled: state.pip.enabled },
    match,
    sponsors,
  };

  return res.status(200).json(payload);
}
