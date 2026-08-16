// pages/api/admin/leagues/[id]/standings.ts
// GET (staff manager) → standings + tournois liés d'une league, scopés
// tenant + id. Contrairement à l'endpoint public /api/leagues/[slug], il
// n'applique PAS de filtre is_public/draft : l'admin doit pouvoir consulter
// les standings d'une league en cours de préparation.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import type {
  LeagueStandingPublic,
  LeagueStandingsResponse,
  LeagueTournamentRef,
} from '@/types/leagues';

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
      'admin-leagues-standings'
    )
  )
    return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawId = req.query.id;
  const leagueId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!leagueId || !isValidUUID(leagueId)) {
    return res.status(400).json({ error: 'Missing or invalid league id' });
  }

  // League existe & appartient au tenant ?
  const { data: league, error: lErr } = await supabaseAdmin
    .from('leagues')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', leagueId)
    .maybeSingle();
  if (lErr) {
    logger.error('[admin/leagues/standings] league read error', lErr);
    return res.status(500).json({ error: 'Failed to load league' });
  }
  if (!league) return res.status(404).json({ error: 'League not found' });

  // 1) Standings (join teams pour les noms).
  const { data: standingRows, error: sErr } = await supabaseAdmin
    .from('league_standings')
    .select('team_id, points, tournaments_counted, best_rank, rank')
    .eq('tenant_id', ctx.tenantId)
    .eq('league_id', leagueId);
  if (sErr) {
    logger.error('[admin/leagues/standings] standings read error', sErr);
    return res.status(500).json({ error: 'Failed to load standings' });
  }
  const standingsRaw = (standingRows || []) as Array<{
    team_id: string;
    points: number;
    tournaments_counted: number;
    best_rank: number | null;
    rank: number;
  }>;
  standingsRaw.sort((a, b) => a.rank - b.rank);

  const teamIds = [...new Set(standingsRaw.map((s) => s.team_id))];
  const teamById = new Map<
    string,
    { name: string; slug: string | null; logo_url: string | null }
  >();
  if (teamIds.length > 0) {
    const { data: teamRows } = await supabaseAdmin
      .from('teams')
      .select('id, name, slug, logo_url')
      .eq('tenant_id', ctx.tenantId)
      .in('id', teamIds);
    for (const t of (teamRows || []) as Array<{
      id: string;
      name: string;
      slug: string | null;
      logo_url: string | null;
    }>) {
      teamById.set(t.id, {
        name: t.name,
        slug: t.slug ?? null,
        logo_url: t.logo_url ?? null,
      });
    }
  }

  const standings: LeagueStandingPublic[] = standingsRaw.map((s) => {
    const t = teamById.get(s.team_id);
    return {
      teamId: s.team_id,
      teamName: t?.name ?? null,
      teamSlug: t?.slug ?? null,
      logoUrl: t?.logo_url ?? null,
      points: s.points,
      tournamentsCounted: s.tournaments_counted,
      bestRank: s.best_rank,
      rank: s.rank,
    };
  });

  // 2) Tournois liés (join tournaments pour name/slug).
  const { data: linkRows } = await supabaseAdmin
    .from('league_tournaments')
    .select('tournament_id, weight')
    .eq('tenant_id', ctx.tenantId)
    .eq('league_id', leagueId);
  const links = (linkRows || []) as Array<{
    tournament_id: string;
    weight: number | null;
  }>;
  const linkTournamentIds = [...new Set(links.map((l) => l.tournament_id))];
  const tournamentById = new Map<
    string,
    { name: string | null; slug: string | null }
  >();
  if (linkTournamentIds.length > 0) {
    const { data: tRows } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, slug')
      .eq('tenant_id', ctx.tenantId)
      .in('id', linkTournamentIds);
    for (const t of (tRows || []) as Array<{
      id: string;
      name: string | null;
      slug: string | null;
    }>) {
      tournamentById.set(t.id, { name: t.name ?? null, slug: t.slug ?? null });
    }
  }
  const tournaments: LeagueTournamentRef[] = links.map((l) => {
    const t = tournamentById.get(l.tournament_id);
    return {
      id: l.tournament_id,
      name: t?.name ?? null,
      slug: t?.slug ?? null,
      weight: l.weight ?? 1,
    };
  });

  const response: LeagueStandingsResponse = { standings, tournaments };
  return res.status(200).json(response);
}

export default withStaffRoute(handler, 'admin');
