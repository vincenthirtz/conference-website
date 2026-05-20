// GET /api/bot/v1/leaderboards/teams
//
// Classement global des equipes calcule a la volee depuis les matchs
// status='finished' / 'walkover'. Wins / losses agreges + score (1pt par
// win, 0 par loss / bye). Tri par wins desc puis losses asc puis nom.
//
// Query :
//   - period : 'all' (defaut) ou 'month' (matchs completed dans les 30j)
//   - limit  : 1..100, defaut 25
//   - tournamentId : filtre optionnel pour un classement specifique au tournoi
//
// Auth : x-api-key (lecture publique).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const periodRaw =
    typeof req.query.period === 'string'
      ? req.query.period.trim().toLowerCase()
      : 'all';
  const period = periodRaw === 'month' ? 'month' : 'all';

  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const tournamentFilter =
    typeof req.query.tournamentId === 'string' &&
    req.query.tournamentId.trim()
      ? req.query.tournamentId.trim()
      : null;
  if (tournamentFilter && !isValidUUID(tournamentFilter)) {
    return res.status(400).json({ error: 'tournamentId invalide' });
  }

  let q = supabaseAdmin
    .from('matches')
    .select(
      'team1_id, team2_id, winner_team_id, is_bye, completed_at, tournament_id'
    )
    .eq('tenant_id', req.botContext!.tenantId)
    .in('status', ['finished', 'walkover']);
  if (tournamentFilter) q = q.eq('tournament_id', tournamentFilter);
  if (period === 'month') {
    const since = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    q = q.gte('completed_at', since);
  }

  const { data: matches, error: mErr } = await q;
  if (mErr) {
    logger.error('[bot/leaderboards/teams] matches error', mErr);
    return res.status(500).json({ error: 'Erreur de chargement des matchs' });
  }

  type Agg = { teamId: string; wins: number; losses: number; byes: number };
  const aggByTeam = new Map<string, Agg>();
  function bump(teamId: string, field: 'wins' | 'losses' | 'byes') {
    let a = aggByTeam.get(teamId);
    if (!a) {
      a = { teamId, wins: 0, losses: 0, byes: 0 };
      aggByTeam.set(teamId, a);
    }
    a[field] += 1;
  }

  for (const row of matches ?? []) {
    const r = row as {
      team1_id: string | null;
      team2_id: string | null;
      winner_team_id: string | null;
      is_bye: boolean | null;
    };
    if (r.is_bye) {
      if (r.team1_id) bump(r.team1_id, 'byes');
      continue;
    }
    if (!r.team1_id || !r.team2_id) continue;
    if (r.winner_team_id === r.team1_id) {
      bump(r.team1_id, 'wins');
      bump(r.team2_id, 'losses');
    } else if (r.winner_team_id === r.team2_id) {
      bump(r.team2_id, 'wins');
      bump(r.team1_id, 'losses');
    } else {
      // pas de winner = match nul -> on compte ni win ni loss pour le
      // leaderboard simple (la nullité Swiss est gérée par Buchholz, pas ici)
      continue;
    }
  }

  const teamIds = [...aggByTeam.keys()];
  if (teamIds.length === 0) {
    return res
      .status(200)
      .json({ period, total: 0, leaderboard: [], tournamentId: tournamentFilter });
  }

  const { data: teamsData, error: tErr } = await supabaseAdmin
    .from('teams')
    .select('id, name, short_name, slug, logo_url, country')
    .eq('tenant_id', req.botContext!.tenantId)
    .in('id', teamIds);
  if (tErr) {
    logger.error('[bot/leaderboards/teams] teams error', tErr);
    return res.status(500).json({ error: 'Erreur de chargement des équipes' });
  }
  const teamById = new Map<
    string,
    {
      id: string;
      name: string;
      short_name: string | null;
      slug: string | null;
      logo_url: string | null;
      country: string | null;
    }
  >();
  for (const t of teamsData ?? []) {
    const row = t as {
      id: string;
      name: string;
      short_name: string | null;
      slug: string | null;
      logo_url: string | null;
      country: string | null;
    };
    teamById.set(row.id, row);
  }

  const ranked = [...aggByTeam.values()]
    .map((a) => {
      const team = teamById.get(a.teamId);
      const total = a.wins + a.losses;
      const winRate = total > 0 ? a.wins / total : 0;
      return {
        teamId: a.teamId,
        team: team
          ? {
              name: team.name,
              shortName: team.short_name,
              slug: team.slug,
              logoUrl: team.logo_url,
              country: team.country,
            }
          : null,
        wins: a.wins,
        losses: a.losses,
        byes: a.byes,
        matchesPlayed: total + a.byes,
        winRate: Math.round(winRate * 1000) / 1000,
        score: a.wins,
      };
    })
    .filter((r) => r.team !== null)
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return (a.team!.name ?? '').localeCompare(b.team!.name ?? '');
    })
    .slice(0, limit)
    .map((r, idx) => ({ rank: idx + 1, ...r }));

  res.setHeader(
    'Cache-Control',
    'public, s-maxage=300, stale-while-revalidate=60'
  );
  return res.status(200).json({
    period,
    tournamentId: tournamentFilter,
    total: ranked.length,
    leaderboard: ranked,
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 30, key: 'bot-leaderboards-teams' },
});
