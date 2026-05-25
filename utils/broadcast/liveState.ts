// utils/broadcast/liveState.ts
//
// Lot 7 — Aggregator helpers for the Live Broadcast Console.
// Reads the current `live` event_run + its `live` segment + the casters
// assigned to the segment's match + the active stream URL, alongside
// the persisted `broadcast_state` JSONB.

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';

export type BroadcastStateV1 = {
  v: 1;
  on_air: boolean;
  lower_third: string | null;
  pip: { enabled: boolean };
};

export type LiveSegmentLite = {
  id: string;
  ord: number;
  type: 'match' | 'break' | 'intro' | 'outro' | 'custom';
  title: string;
  status: 'upcoming' | 'live' | 'done' | 'skipped';
  match_id: string | null;
  duration_min: number | null;
};

export type CasterLite = {
  castMemberId: string;
  displayName: string | null;
  discordUserId: string | null;
};

export type LiveTeamLite = {
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
};

export type LiveMatchLite = {
  matchId: string;
  team1: LiveTeamLite | null;
  team2: LiveTeamLite | null;
  team1Score: number | null;
  team2Score: number | null;
  streamUrl: string | null;
};

export type BroadcastLiveState = {
  run: {
    id: string;
    name: string;
    slug: string;
    status: 'draft' | 'live' | 'done';
    startedAt: string | null;
    scheduledAt: string | null;
  } | null;
  currentSegment: LiveSegmentLite | null;
  match: LiveMatchLite | null;
  casters: CasterLite[];
  state: BroadcastStateV1;
  generatedAt: string;
};

export const DEFAULT_BROADCAST_STATE: BroadcastStateV1 = {
  v: 1,
  on_air: false,
  lower_third: null,
  pip: { enabled: false },
};

export function normalizeState(raw: unknown): BroadcastStateV1 {
  if (!raw || typeof raw !== 'object') return DEFAULT_BROADCAST_STATE;
  const r = raw as Record<string, unknown>;
  const pip = r.pip && typeof r.pip === 'object' ? (r.pip as any) : {};
  return {
    v: 1,
    on_air: r.on_air === true,
    lower_third:
      typeof r.lower_third === 'string' && r.lower_third.length > 0
        ? r.lower_third
        : null,
    pip: { enabled: pip.enabled === true },
  };
}

/**
 * Resolve the current live broadcast state for a tenant. Returns a
 * fully-populated payload even when no run is live — fields are nulled
 * so the UI doesn't crash on initial render.
 */
export async function fetchLiveBroadcastState(
  tenantId: string
): Promise<BroadcastLiveState> {
  const generatedAt = new Date().toISOString();
  const empty: BroadcastLiveState = {
    run: null,
    currentSegment: null,
    match: null,
    casters: [],
    state: DEFAULT_BROADCAST_STATE,
    generatedAt,
  };

  if (!supabaseAdmin) return empty;

  const { data: run } = await supabaseAdmin
    .from('event_runs')
    .select(
      'id, name, slug, status, started_at, scheduled_at, broadcast_state'
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'live')
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!run) return empty;

  const state = normalizeState((run as any).broadcast_state);

  // Current segment = first segment in status='live' (ordered by ord).
  // V1 supposes a single live segment at any time — the Director enforces
  // that invariant.
  const { data: segments } = await supabaseAdmin
    .from('event_segments')
    .select('id, ord, type, title, status, match_id, duration_min')
    .eq('tenant_id', tenantId)
    .eq('event_run_id', (run as any).id)
    .eq('status', 'live')
    .order('ord', { ascending: true })
    .limit(1);

  const currentSegment: LiveSegmentLite | null = (segments ?? [])[0]
    ? ({
        id: (segments![0] as any).id,
        ord: (segments![0] as any).ord,
        type: (segments![0] as any).type,
        title: (segments![0] as any).title,
        status: (segments![0] as any).status,
        match_id: (segments![0] as any).match_id ?? null,
        duration_min: (segments![0] as any).duration_min ?? null,
      } as LiveSegmentLite)
    : null;

  let match: LiveMatchLite | null = null;
  let casters: CasterLite[] = [];

  if (currentSegment?.match_id) {
    const matchId = currentSegment.match_id;
    const { data: m } = await supabaseAdmin
      .from('matches')
      .select(
        'id, team1_id, team2_id, team1_score, team2_score, stream_url'
      )
      .eq('id', matchId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (m) {
      const teamIds = [m.team1_id, m.team2_id].filter(
        (v): v is string => typeof v === 'string' && v.length > 0
      );
      const teamMap = new Map<string, LiveTeamLite>();
      if (teamIds.length > 0) {
        const { data: teams } = await supabaseAdmin
          .from('teams')
          .select('id, name, short_name, logo_url')
          .eq('tenant_id', tenantId)
          .in('id', teamIds);
        for (const t of (teams ?? []) as any[]) {
          teamMap.set(t.id, {
            id: t.id,
            name: t.name,
            shortName: t.short_name ?? null,
            logoUrl: t.logo_url ?? null,
          });
        }
      }
      match = {
        matchId,
        team1: m.team1_id ? (teamMap.get(m.team1_id) ?? null) : null,
        team2: m.team2_id ? (teamMap.get(m.team2_id) ?? null) : null,
        team1Score: m.team1_score ?? null,
        team2Score: m.team2_score ?? null,
        streamUrl: m.stream_url ?? null,
      };

      // Casters assigned to the match.
      const { data: assignments } = await supabaseAdmin
        .from('cast_assignments')
        .select('cast_member_id')
        .eq('tenant_id', tenantId)
        .eq('match_id', matchId);

      const memberIds = ((assignments ?? []) as any[])
        .map((a) => a.cast_member_id as string | null)
        .filter((v): v is string => typeof v === 'string' && v.length > 0);

      if (memberIds.length > 0) {
        const { data: members } = await supabaseAdmin
          .from('cast_members')
          .select('id, display_name, auth_user_id')
          .in('id', memberIds);

        // Resolve Discord user IDs from auth_user_id.
        const authIds = ((members ?? []) as any[])
          .map((m2) => m2.auth_user_id)
          .filter((v): v is string => typeof v === 'string' && v.length > 0);
        const discordByAuth = new Map<string, string>();
        if (authIds.length > 0) {
          const { data: links } = await supabaseAdmin
            .from('user_discord_links')
            .select('user_id, discord_user_id')
            .in('user_id', authIds);
          for (const l of (links ?? []) as any[]) {
            discordByAuth.set(l.user_id, l.discord_user_id);
          }
        }

        casters = ((members ?? []) as any[]).map((m2) => ({
          castMemberId: m2.id,
          displayName: m2.display_name ?? null,
          discordUserId: m2.auth_user_id
            ? (discordByAuth.get(m2.auth_user_id) ?? null)
            : null,
        }));
      }
    }
  }

  return {
    run: {
      id: (run as any).id,
      name: (run as any).name,
      slug: (run as any).slug,
      status: (run as any).status,
      startedAt: (run as any).started_at ?? null,
      scheduledAt: (run as any).scheduled_at ?? null,
    },
    currentSegment,
    match,
    casters,
    state,
    generatedAt,
  };
}

/**
 * Persist a partial broadcast_state update on the given run.
 * Returns the merged JSONB or null on failure.
 */
export async function updateBroadcastState(
  tenantId: string,
  runId: string,
  patch: Partial<BroadcastStateV1>
): Promise<BroadcastStateV1 | null> {
  if (!supabaseAdmin) return null;

  const { data: row } = await supabaseAdmin
    .from('event_runs')
    .select('broadcast_state')
    .eq('id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!row) return null;

  const current = normalizeState((row as any).broadcast_state);
  const next: BroadcastStateV1 = {
    v: 1,
    on_air: typeof patch.on_air === 'boolean' ? patch.on_air : current.on_air,
    lower_third:
      patch.lower_third === undefined
        ? current.lower_third
        : patch.lower_third && patch.lower_third.length > 0
          ? patch.lower_third
          : null,
    pip: {
      enabled:
        patch.pip && typeof patch.pip.enabled === 'boolean'
          ? patch.pip.enabled
          : current.pip.enabled,
    },
  };

  const { error } = await supabaseAdmin
    .from('event_runs')
    .update({ broadcast_state: next, updated_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('tenant_id', tenantId);

  if (error) {
    logger.error('[broadcast/liveState] updateBroadcastState error', error);
    return null;
  }
  return next;
}
