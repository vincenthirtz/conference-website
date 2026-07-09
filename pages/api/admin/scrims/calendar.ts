// pages/api/admin/scrims/calendar.ts
// GET (staff manager) — événements de l'agenda admin sur une plage [from, to) :
//   - scrims non supprimés (éditables) avec durée + noms d'équipes,
//   - matches programmés (lecture seule, pour repérer les collisions à l'œil).
// Query : from (ISO, requis), to (ISO, requis). Fenêtre bornée à ~90 jours.
//
// Noms d'équipes résolus via une map teams (robuste, pas d'embed PostgREST).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { logger } from '@/utils/logger';

const MAX_RANGE_MS = 92 * 24 * 3600 * 1000;

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin)
    return res.status(500).json({ error: 'Supabase admin not configured' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const fromRaw = Array.isArray(req.query.from) ? req.query.from[0] : req.query.from;
  const toRaw = Array.isArray(req.query.to) ? req.query.to[0] : req.query.to;
  const fromMs = fromRaw ? Date.parse(fromRaw) : NaN;
  const toMs = toRaw ? Date.parse(toRaw) : NaN;
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || toMs <= fromMs) {
    return res.status(400).json({ error: 'from/to (ISO) requis, to > from' });
  }
  if (toMs - fromMs > MAX_RANGE_MS) {
    return res.status(400).json({ error: 'Plage trop large (max ~90 jours).' });
  }
  const from = new Date(fromMs).toISOString();
  const to = new Date(toMs).toISOString();

  try {
    const [scrimsRes, matchesRes] = await Promise.all([
      supabaseAdmin
        .from('scrims')
        .select(
          'id, name, status, scheduled_date, duration_minutes, team1_id, team2_id'
        )
        .eq('tenant_id', ctx.tenantId)
        .is('deleted_at', null)
        .not('scheduled_date', 'is', null)
        .gte('scheduled_date', from)
        .lte('scheduled_date', to),
      supabaseAdmin
        .from('matches')
        .select('id, status, scheduled_at, team1_id, team2_id')
        .eq('tenant_id', ctx.tenantId)
        .not('scheduled_at', 'is', null)
        .gte('scheduled_at', from)
        .lte('scheduled_at', to),
    ]);

    const scrimRows = scrimsRes.data ?? [];
    const matchRows = matchesRes.data ?? [];

    // Résout les noms d'équipes en un seul lookup.
    const teamIds = new Set<string>();
    for (const r of [...scrimRows, ...matchRows]) {
      if (r.team1_id) teamIds.add(r.team1_id as string);
      if (r.team2_id) teamIds.add(r.team2_id as string);
    }
    const nameById = new Map<string, string>();
    if (teamIds.size > 0) {
      const { data: teams } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .eq('tenant_id', ctx.tenantId)
        .in('id', Array.from(teamIds));
      for (const t of teams ?? []) {
        nameById.set(t.id as string, (t.name as string) ?? '');
      }
    }
    const nm = (id: unknown) =>
      id ? (nameById.get(id as string) ?? null) : null;

    const scrims = scrimRows.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      scheduled_date: s.scheduled_date,
      duration_minutes: (s.duration_minutes as number | null) ?? null,
      team1_id: s.team1_id,
      team2_id: s.team2_id,
      team1Name: nm(s.team1_id),
      team2Name: nm(s.team2_id),
    }));

    const matches = matchRows.map((m) => ({
      id: m.id,
      status: m.status,
      scheduled_at: m.scheduled_at,
      team1Name: nm(m.team1_id),
      team2Name: nm(m.team2_id),
    }));

    return res.status(200).json({ scrims, matches });
  } catch (err) {
    logger.error('[admin/scrims/calendar] error:', err);
    return res.status(500).json({ error: 'Failed to load calendar events' });
  }
}
