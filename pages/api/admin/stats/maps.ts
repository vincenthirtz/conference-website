import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { sanitizeSearch } from '@/utils/apiHelpers';

type MapStatsRow = {
  map_name: string;
  tournament_id: string | null;
  tournament: {
    id: string | null;
    name: string | null;
    slug: string | null;
  } | null;
  matches_played: number;
  matches_won_attack: number | null;
  matches_won_defense: number | null;
  rounds_played: number | null;
  rounds_won_attack: number | null;
  rounds_won_defense: number | null;
  match_winrate_attack: number | null;
  match_winrate_defense: number | null;
  round_winrate_attack: number | null;
  round_winrate_defense: number | null;
  avg_total_rounds: number | null;
  pick_rate: number | null;
  ban_rate: number | null;
};

type ResponseData =
  | {
      stats: MapStatsRow[];
      total: number | null;
    }
  | { error: string };

// Mapping des colonnes API vers les colonnes de la vue
const SORT_COLUMN_MAP: Record<string, string> = {
  pick_rate: 'games_played',
  ban_rate: 'games_played',
  matches_played: 'games_played',
  rounds_played: 'total_rounds',
  match_winrate_attack: 'wins_team1',
  match_winrate_defense: 'wins_team2',
  avg_total_rounds: 'total_rounds',
  map_name: 'map_name',
};

const SORTABLE_COLUMNS = new Set(Object.keys(SORT_COLUMN_MAP));

function normalizeSortBy(value: string | null | undefined): string {
  if (!value) return 'games_played';
  const key = value.toString().toLowerCase();
  return SORTABLE_COLUMNS.has(key) ? SORT_COLUMN_MAP[key] : 'games_played';
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

  // Vue map_stats_view avec colonnes:
  // map_name, games_played, wins_team1, wins_team2, total_rounds, diff_team1, diff_team2
  let query = supabaseAdmin
    .from('map_stats_view')
    .select(
      `
      map_name,
      games_played,
      wins_team1,
      wins_team2,
      total_rounds,
      diff_team1,
      diff_team2
    `,
      { count: 'exact' }
    )
    .gte('games_played', minMatchesNum)
    .order(sortByNormalized, {
      ascending: sortDirNormalized === 'asc',
      nullsFirst: false,
    })
    .range(offsetNum, offsetNum + limitNum - 1);

  if (search) {
    query = query.ilike('map_name', `%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[/api/admin/stats/maps] fetch error', error);
    return res.status(500).json({ error: 'Failed to load map stats.' });
  }

  // Transformer les données de la vue vers le format attendu par le frontend
  const stats: MapStatsRow[] = (data || []).map((row: any) => {
    const gamesPlayed = row.games_played ?? 0;
    const winsTeam1 = row.wins_team1 ?? 0;
    const winsTeam2 = row.wins_team2 ?? 0;
    const totalGames = winsTeam1 + winsTeam2;

    // Calculer les winrates à partir des données disponibles
    const winrateTeam1 = totalGames > 0 ? winsTeam1 / totalGames : null;
    const winrateTeam2 = totalGames > 0 ? winsTeam2 / totalGames : null;

    return {
      map_name: row.map_name,
      tournament_id: null,
      tournament: null,
      matches_played: gamesPlayed,
      matches_won_attack: winsTeam1,
      matches_won_defense: winsTeam2,
      rounds_played: row.total_rounds ?? null,
      rounds_won_attack: null,
      rounds_won_defense: null,
      match_winrate_attack: winrateTeam1,
      match_winrate_defense: winrateTeam2,
      round_winrate_attack: null,
      round_winrate_defense: null,
      avg_total_rounds:
        gamesPlayed > 0 ? (row.total_rounds ?? 0) / gamesPlayed : null,
      pick_rate: null,
      ban_rate: null,
    };
  });

  // Export CSV si demandé
  if (exportFormat === 'csv') {
    const header = [
      'map_name',
      'tournament',
      'matches_played',
      'pick_rate',
      'ban_rate',
      'match_winrate_attack',
      'match_winrate_defense',
      'rounds_played',
      'round_winrate_attack',
      'round_winrate_defense',
      'avg_total_rounds',
    ];

    const rows = stats.map((s) =>
      [
        s.map_name ?? '',
        s.tournament?.name ?? '',
        s.matches_played ?? 0,
        s.pick_rate ?? '',
        s.ban_rate ?? '',
        s.match_winrate_attack ?? '',
        s.match_winrate_defense ?? '',
        s.rounds_played ?? '',
        s.round_winrate_attack ?? '',
        s.round_winrate_defense ?? '',
        s.avg_total_rounds ?? '',
      ].join(',')
    );

    const csv = [header.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="map-stats.csv"'
    );
    res.status(200).end(csv);
    return;
  }

  return res.status(200).json({ stats, total: count ?? null });
}

export default withStaffRoute(handler, 'manager');
