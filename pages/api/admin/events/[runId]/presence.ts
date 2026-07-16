// pages/api/admin/events/[runId]/presence.ts
//
// Feature: Run-of-show — Lot 5 (cues + presence).
// GET : liste les casters assignes au run + statut de presence DERIVE.
//
// Strategie :
//   1. On collecte les segments du run (event_segments).
//   2. On extrait les match_id de type='match' → on lookup cast_assignments
//      pour ces matches → on collecte les cast_member_id distincts assignes.
//   3. On fetch cast_members (name, image_url) pour chacun.
//   4. On fetch caster_presence pour chacun (left-join cote API).
//   5. Statut derivé serveur :
//        - 'online'   si last_seen_at >= now - 60s ET event_run_id === runId
//        - 'idle'     si now - 180s <= last_seen_at < now - 60s ET event_run_id === runId
//        - 'offline'  si last_seen_at < now - 180s (et row presente)
//        - 'unknown'  si pas de row caster_presence OU event_run_id !== runId
//
// Auth : withStaffRoute(_, 'admin') (meme seuil que start/end run / cues).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

type PresenceItem = {
  cast_member_id: string;
  name: string;
  image_url: string | null;
  status: 'online' | 'idle' | 'offline' | 'unknown';
  last_seen_at: string | null;
  user_agent?: string;
};

function deriveStatus(
  lastSeenAtIso: string | null | undefined,
  runIdMatches: boolean,
  nowMs: number
): PresenceItem['status'] {
  if (!lastSeenAtIso) return 'unknown';
  if (!runIdMatches) return 'unknown';
  const t = Date.parse(lastSeenAtIso);
  if (!Number.isFinite(t)) return 'unknown';
  const ageMs = nowMs - t;
  if (ageMs < 60_000) return 'online';
  if (ageMs < 180_000) return 'idle';
  return 'offline';
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-events-presence'
    )
  )
    return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  const { runId } = req.query;
  if (!runId || Array.isArray(runId) || !isValidUUID(runId)) {
    return res.status(400).json({ error: 'Invalid runId.' });
  }

  // 1) Ownership du run.
  const { data: run, error: runErr } = await admin
    .from('event_runs')
    .select('id, tenant_id')
    .eq('id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (runErr) {
    logger.error('[admin/presence] run lookup error', runErr);
    return res.status(500).json({ error: 'Failed to load event run.' });
  }
  if (!run) {
    return res.status(404).json({ error: 'Event run not found.' });
  }

  // 2) Segments du run, on garde les match_id pour les segments type='match'.
  const { data: segments, error: segErr } = await admin
    .from('event_segments')
    .select('id, type, match_id')
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId);

  if (segErr) {
    logger.error('[admin/presence] segments error', segErr);
    return res.status(500).json({ error: 'Failed to load segments.' });
  }

  type SegRow = {
    id: string;
    type: string;
    match_id: string | null;
  };
  const matchIds = Array.from(
    new Set(
      ((segments as SegRow[] | null) ?? [])
        .filter((s) => s.type === 'match' && !!s.match_id)
        .map((s) => s.match_id as string)
    )
  );

  // 3) cast_assignments → cast_member_id distincts assignes au run.
  let casterIds: string[] = [];
  if (matchIds.length > 0) {
    const { data: assignments, error: assignErr } = await admin
      .from('cast_assignments')
      .select('cast_member_id')
      .eq('tenant_id', ctx.tenantId)
      .in('match_id', matchIds);

    if (assignErr) {
      logger.error('[admin/presence] assignments error', assignErr);
      return res.status(500).json({ error: 'Failed to load assignments.' });
    }

    casterIds = Array.from(
      new Set(
        ((assignments as { cast_member_id: string }[] | null) ?? []).map(
          (a) => a.cast_member_id
        )
      )
    );
  }

  if (casterIds.length === 0) {
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ presence: [] });
  }

  // 4) cast_members actifs du tenant.
  const { data: members, error: membersErr } = await admin
    .from('cast_members')
    .select('id, name, image_url, is_active')
    .eq('tenant_id', ctx.tenantId)
    .in('id', casterIds);

  if (membersErr) {
    logger.error('[admin/presence] cast_members error', membersErr);
    return res.status(500).json({ error: 'Failed to load cast_members.' });
  }

  type MemberRow = {
    id: string;
    name: string;
    image_url: string | null;
    is_active: boolean;
  };
  const activeMembers = ((members as MemberRow[] | null) ?? []).filter(
    (m) => m.is_active
  );

  if (activeMembers.length === 0) {
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ presence: [] });
  }

  const activeIds = activeMembers.map((m) => m.id);

  // 5) caster_presence pour chaque caster actif.
  const { data: presenceRows, error: presErr } = await admin
    .from('caster_presence')
    .select('cast_member_id, event_run_id, last_seen_at, user_agent')
    .eq('tenant_id', ctx.tenantId)
    .in('cast_member_id', activeIds);

  if (presErr) {
    logger.error('[admin/presence] caster_presence error', presErr);
    return res.status(500).json({ error: 'Failed to load presence.' });
  }

  type PresenceRow = {
    cast_member_id: string;
    event_run_id: string | null;
    last_seen_at: string;
    user_agent: string | null;
  };
  const presenceByMember = new Map<string, PresenceRow>();
  for (const p of (presenceRows as PresenceRow[] | null) ?? []) {
    presenceByMember.set(p.cast_member_id, p);
  }

  const nowMs = Date.now();
  const presence: PresenceItem[] = activeMembers.map((m) => {
    const p = presenceByMember.get(m.id);
    const runIdMatches = p?.event_run_id === runId;
    const status = deriveStatus(p?.last_seen_at, runIdMatches, nowMs);
    const item: PresenceItem = {
      cast_member_id: m.id,
      name: m.name,
      image_url: m.image_url,
      status,
      last_seen_at: p?.last_seen_at ?? null,
    };
    if (p?.user_agent) item.user_agent = p.user_agent;
    return item;
  });

  // Tri : online > idle > offline > unknown, puis name ASC.
  const statusRank: Record<PresenceItem['status'], number> = {
    online: 0,
    idle: 1,
    offline: 2,
    unknown: 3,
  };
  presence.sort((a, b) => {
    const r = statusRank[a.status] - statusRank[b.status];
    if (r !== 0) return r;
    return a.name.localeCompare(b.name);
  });

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({ presence });
}

export default withStaffRoute(handler, 'admin');
