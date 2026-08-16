// pages/api/caster/me.ts
//
// Feature: Run-of-show — Lot 2.
// GET : caster connecte (fiche cast_members) + ses prochaines assignations
// dans les 24h.
//
// Auth : withCasterRoute (staff role >= caster + cast_members link actif).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  withCasterRoute,
  type AuthenticatedCasterContext,
} from '@/utils/casterAuth';
import { logger } from '@/utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedCasterContext
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'caster-me'))
    return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service unavailable.' });
  }
  const admin = supabaseAdmin;

  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60_000);

  // Lot 9 : cast_assignments est désormais polymorphique. On query les deux
  // formes (match-based et scrim-based) en parallèle puis on merge.
  const [matchRes, scrimRes] = await Promise.all([
    admin
      .from('cast_assignments')
      .select(
        `
        id,
        role,
        created_at,
        match:match_id(
          id, scheduled_at, status, match_format, round_name, stream_url, lobby_code,
          team1:team1_id(id, name, short_name, logo_url),
          team2:team2_id(id, name, short_name, logo_url),
          tournament:tournament_id(id, name, slug)
        )
        `
      )
      .eq('cast_member_id', ctx.caster.id)
      .eq('tenant_id', ctx.tenantId)
      .not('match_id', 'is', null),
    admin
      .from('cast_assignments')
      .select(
        `
        id,
        role,
        created_at,
        scrim:scrim_id(
          id, slug, scheduled_date, status, stream_url,
          team1:team1_id(id, name, short_name, logo_url),
          team2:team2_id(id, name, short_name, logo_url)
        )
        `
      )
      .eq('cast_member_id', ctx.caster.id)
      .eq('tenant_id', ctx.tenantId)
      .not('scrim_id', 'is', null),
  ]);

  if (matchRes.error) {
    logger.error('[caster/me] cast_assignments match error', matchRes.error);
    return res.status(500).json({ error: 'Failed to load assignments.' });
  }
  if (scrimRes.error) {
    logger.error('[caster/me] cast_assignments scrim error', scrimRes.error);
  }

  type AssignmentRow = {
    id: string;
    role: string | null;
    created_at: string;
    match?: unknown;
    scrim?: unknown;
  };

  const flattenedMatches = ((matchRes.data as AssignmentRow[] | null) ?? [])
    .map((a) => {
      const m = Array.isArray(a.match) ? a.match[0] : a.match;
      return { assignment: a, entity: m as Record<string, unknown> | null };
    })
    .filter(({ entity }) => {
      if (!entity) return false;
      const scheduledAt = entity.scheduled_at as string | null;
      if (!scheduledAt) return false;
      const t = new Date(scheduledAt).getTime();
      const status = entity.status as string;
      if (!Number.isFinite(t)) return false;
      if (t < now.getTime() - 60 * 60_000) return false;
      if (t > horizon.getTime()) return false;
      if (status !== 'pending' && status !== 'ongoing') return false;
      return true;
    })
    .map(({ assignment, entity }) => {
      const m = entity!;
      const t1 = Array.isArray(m.team1) ? m.team1[0] : m.team1;
      const t2 = Array.isArray(m.team2) ? m.team2[0] : m.team2;
      const tn = Array.isArray(m.tournament) ? m.tournament[0] : m.tournament;
      return {
        kind: 'match' as const,
        assignmentId: assignment.id,
        role: assignment.role,
        startsAt: m.scheduled_at as string,
        match: {
          id: m.id,
          scheduledAt: m.scheduled_at,
          status: m.status,
          matchFormat: m.match_format,
          roundName: m.round_name,
          streamUrl: m.stream_url,
          lobbyCode: m.lobby_code,
          team1: shapeTeam(t1),
          team2: shapeTeam(t2),
          tournament: tn
            ? {
                id: (tn as Record<string, unknown>).id,
                name: (tn as Record<string, unknown>).name,
                slug: (tn as Record<string, unknown>).slug,
              }
            : null,
        },
        scrim: null,
      };
    });

  const flattenedScrims = ((scrimRes.data as AssignmentRow[] | null) ?? [])
    .map((a) => {
      const s = Array.isArray(a.scrim) ? a.scrim[0] : a.scrim;
      return { assignment: a, entity: s as Record<string, unknown> | null };
    })
    .filter(({ entity }) => {
      if (!entity) return false;
      const scheduledAt = entity.scheduled_date as string | null;
      if (!scheduledAt) return false;
      const t = new Date(scheduledAt).getTime();
      if (!Number.isFinite(t)) return false;
      if (t < now.getTime() - 60 * 60_000) return false;
      if (t > horizon.getTime()) return false;
      // scrim status fixe filter : on garde tout sauf cancelled/deleted
      const status = entity.status as string;
      if (status === 'cancelled') return false;
      return true;
    })
    .map(({ assignment, entity }) => {
      const s = entity!;
      const t1 = Array.isArray(s.team1) ? s.team1[0] : s.team1;
      const t2 = Array.isArray(s.team2) ? s.team2[0] : s.team2;
      return {
        kind: 'scrim' as const,
        assignmentId: assignment.id,
        role: assignment.role,
        startsAt: s.scheduled_date as string,
        match: null,
        scrim: {
          id: s.id,
          slug: s.slug,
          scheduledAt: s.scheduled_date,
          status: s.status,
          streamUrl: s.stream_url,
          team1: shapeTeam(t1),
          team2: shapeTeam(t2),
        },
      };
    });

  const upcoming = [...flattenedMatches, ...flattenedScrims].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );

  return res.status(200).json({
    caster: {
      id: ctx.caster.id,
      name: ctx.caster.name,
      title: ctx.caster.title,
      imageUrl: ctx.caster.image_url,
      twitchUrl: ctx.caster.twitch_url,
      city: ctx.caster.city,
    },
    upcomingAssignments: upcoming,
  });
}

function shapeTeam(t: unknown): {
  id: unknown;
  name: unknown;
  shortName: unknown;
  logoUrl: unknown;
} | null {
  if (!t || typeof t !== 'object') return null;
  const r = t as Record<string, unknown>;
  return {
    id: r.id,
    name: r.name,
    shortName: r.short_name,
    logoUrl: r.logo_url,
  };
}

export default withCasterRoute(handler);
