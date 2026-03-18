import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { sanitizeSearch, escapePostgrestValue } from '@/utils/apiHelpers';

type TeamStatsRow = {
  team_id: string;
  team_name: string | null;
  team_short_name: string | null;
  team_logo_url: string | null;
  team?: {
    id: string | null;
    name: string | null;
    short_name: string | null;
    logo_url: string | null;
  };
  tournament_id: string | null;
  tournament_name: string | null;
  tournament_slug: string | null;
  tournament?: {
    id: string | null;
    name: string | null;
    slug: string | null;
  } | null;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  maps_won: number;
  maps_lost: number;
  map_ties: number | null;
  winrate: number | null;
  map_winrate: number | null;
  points: number | null;
  last_match_at: string | null;
};

type ResponseData =
  | {
      stats: TeamStatsRow[];
      total: number | null;
    }
  | { error: string };

const SORTABLE_COLUMNS = new Set([
  'winrate',
  'map_winrate',
  'matches_played',
  'wins',
  'losses',
  'maps_won',
  'maps_lost',
  'points',
  'last_match_at',
  'team_name',
]);

function normalizeSortBy(value: string | null | undefined): string {
  if (!value) return 'winrate';
  const key = value.toString().toLowerCase();
  return SORTABLE_COLUMNS.has(key) ? key : 'winrate';
}

function normalizeSortDir(value: string | null | undefined): 'asc' | 'desc' {
  return value === 'asc' ? 'asc' : 'desc';
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable.' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    limit = '100',
    offset = '0',
    tournamentId,
    minMatches = '0',
    sortBy,
    sortDir,
    export: exportFormat,
  } = req.query;

  const limitNum = Math.max(1, Math.min(1000, Number(limit) || 100));
  const offsetNum = Math.max(0, Number(offset) || 0);
  const search = sanitizeSearch(req.query.search);
  const minMatchesNum = Math.max(0, Number(minMatches) || 0);
  const sortByNormalized = normalizeSortBy(
    typeof sortBy === 'string' ? sortBy : null
  );
  const sortDirNormalized = normalizeSortDir(
    typeof sortDir === 'string' ? sortDir : null
  );

  // Vue ou table matérialisée suggérée : team_stats_view
  // Colonnes attendues (noms alignés avec TeamStatsRow)
  let query = supabaseAdmin
    .from('team_stats_view')
    .select(
      `
      team_id,
      team_name,
      team_short_name,
      team_logo_url,
      tournament_id,
      tournament_name,
      tournament_slug,
      matches_played,
      wins,
      losses,
      draws,
      maps_won,
      maps_lost,
      map_ties,
      winrate,
      map_winrate,
      points,
      last_match_at
    `,
      { count: 'exact' }
    )
    .gte('matches_played', minMatchesNum)
    .order(sortByNormalized, { ascending: sortDirNormalized === 'asc' })
    .range(offsetNum, offsetNum + limitNum - 1);

  if (tournamentId && typeof tournamentId === 'string') {
    query = query.eq('tournament_id', tournamentId);
  }

  if (search) {
    const safe = escapePostgrestValue(search);
    query = query.or(
      `team_name.ilike.%${safe}%,team_short_name.ilike.%${safe}%`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[/api/admin/stats/teams] fetch error', error);
    return res
      .status(500)
      .json({ error: 'Failed to load team stats.' });
  }

  const stats: TeamStatsRow[] = (data || []).map((row: any) => ({
    team_id: row.team_id,
    team_name: row.team_name,
    team_short_name: row.team_short_name,
    team_logo_url: row.team_logo_url,
    team: {
      id: row.team_id,
      name: row.team_name,
      short_name: row.team_short_name,
      logo_url: row.team_logo_url,
    },
    tournament_id: row.tournament_id,
    tournament_name: row.tournament_name,
    tournament_slug: row.tournament_slug,
    tournament: row.tournament_id
      ? {
          id: row.tournament_id,
          name: row.tournament_name,
          slug: row.tournament_slug,
        }
      : null,
    matches_played: row.matches_played ?? 0,
    wins: row.wins ?? 0,
    losses: row.losses ?? 0,
    draws: row.draws ?? 0,
    maps_won: row.maps_won ?? 0,
    maps_lost: row.maps_lost ?? 0,
    map_ties: row.map_ties ?? 0,
    winrate: row.winrate,
    map_winrate: row.map_winrate,
    points: row.points ?? null,
    last_match_at: row.last_match_at ?? null,
  }));

  // Export CSV si demandé
  if (exportFormat === 'csv') {
    const header = [
      'team_name',
      'team_short_name',
      'tournament',
      'matches_played',
      'wins',
      'losses',
      'draws',
      'maps_won',
      'maps_lost',
      'map_ties',
      'winrate',
      'map_winrate',
      'points',
      'last_match_at',
    ];

    const rows = stats.map((s) =>
      [
        s.team?.name ?? '',
        s.team?.short_name ?? '',
        s.tournament?.name ?? '',
        s.matches_played ?? 0,
        s.wins ?? 0,
        s.losses ?? 0,
        s.draws ?? 0,
        s.maps_won ?? 0,
        s.maps_lost ?? 0,
        s.map_ties ?? 0,
        s.winrate ?? '',
        s.map_winrate ?? '',
        s.points ?? '',
        s.last_match_at ?? '',
      ].join(',')
    );

    const csv = [header.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=\"team-stats.csv\"'
    );
    res.status(200).end(csv);
    return;
  }

  return res.status(200).json({ stats, total: count ?? null });
}

export default withStaffRoute(handler, 'manager');
