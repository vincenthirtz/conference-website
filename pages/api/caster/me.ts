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

  // cast_assignments link to a match. On filtre les matches a venir dans les
  // 24h, status pending ou ongoing, scopes au tenant du caster.
  const { data: assignments, error: assignErr } = await admin
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
    .eq('tenant_id', ctx.tenantId);

  if (assignErr) {
    logger.error('[caster/me] cast_assignments error', assignErr);
    return res.status(500).json({ error: 'Failed to load assignments.' });
  }

  type AssignmentRow = {
    id: string;
    role: string | null;
    created_at: string;
    match: unknown;
  };

  const upcoming = ((assignments as AssignmentRow[] | null) ?? [])
    .map((a) => {
      const m = Array.isArray(a.match) ? a.match[0] : a.match;
      return { assignment: a, match: m as Record<string, unknown> | null };
    })
    .filter(({ match }) => {
      if (!match) return false;
      const scheduledAt = match.scheduled_at as string | null;
      if (!scheduledAt) return false;
      const t = new Date(scheduledAt).getTime();
      const status = match.status as string;
      if (!Number.isFinite(t)) return false;
      if (t < now.getTime() - 60 * 60_000) return false;
      if (t > horizon.getTime()) return false;
      if (status !== 'pending' && status !== 'ongoing') return false;
      return true;
    })
    .sort((a, b) => {
      const ta = new Date(a.match!.scheduled_at as string).getTime();
      const tb = new Date(b.match!.scheduled_at as string).getTime();
      return ta - tb;
    })
    .map(({ assignment, match }) => {
      const t1 = Array.isArray(match!.team1) ? match!.team1[0] : match!.team1;
      const t2 = Array.isArray(match!.team2) ? match!.team2[0] : match!.team2;
      const tn = Array.isArray(match!.tournament)
        ? match!.tournament[0]
        : match!.tournament;
      return {
        assignmentId: assignment.id,
        role: assignment.role,
        match: {
          id: match!.id,
          scheduledAt: match!.scheduled_at,
          status: match!.status,
          matchFormat: match!.match_format,
          roundName: match!.round_name,
          streamUrl: match!.stream_url,
          lobbyCode: match!.lobby_code,
          team1: t1
            ? {
                id: (t1 as Record<string, unknown>).id,
                name: (t1 as Record<string, unknown>).name,
                shortName: (t1 as Record<string, unknown>).short_name,
                logoUrl: (t1 as Record<string, unknown>).logo_url,
              }
            : null,
          team2: t2
            ? {
                id: (t2 as Record<string, unknown>).id,
                name: (t2 as Record<string, unknown>).name,
                shortName: (t2 as Record<string, unknown>).short_name,
                logoUrl: (t2 as Record<string, unknown>).logo_url,
              }
            : null,
          tournament: tn
            ? {
                id: (tn as Record<string, unknown>).id,
                name: (tn as Record<string, unknown>).name,
                slug: (tn as Record<string, unknown>).slug,
              }
            : null,
        },
      };
    });

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

export default withCasterRoute(handler);
