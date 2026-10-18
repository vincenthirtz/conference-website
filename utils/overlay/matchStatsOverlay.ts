// utils/overlay/matchStatsOverlay.ts
//
// Le cœur PUR de la carte « avant-match » des sources de stream : ce que le
// caster lit à l'antenne avant le premier veto — rang, bilan, écart de maps,
// forme, confrontations directes, bilan de chaque équipe sur les maps du pool
// du soir, héros qu'elle bannit le plus.
//
// POURQUOI. La source `maps` n'a rien à montrer tant qu'aucune map n'est
// choisie : elle restait transparente pendant tout l'avant-match, au moment
// précis où les casters ont le plus besoin de matière (constaté le 2026-10-18
// sur la Cup 2026, J7).
//
// TROIS RÈGLES :
//   1. LE CLASSEMENT EST CELUI DE LA PAGE PUBLIQUE (readPublicStandings) : ce
//      module choisit la table, il ne recompte rien.
//   2. « AVANT CE MATCH » : les stats excluent le match affiché. Le caster dit
//      « elles arrivent à 5-1 » ; une ligne qui bougerait pendant la rencontre
//      contredirait le tableau de score posé à côté.
//   3. TOUT EST VU DEPUIS LE MATCH AFFICHÉ : `team1` est l'équipe de gauche de
//      CE match, y compris dans une confrontation passée où elle jouait à
//      droite.
//
// Rien ici ne touche au réseau. Le handler lit, ce module décide.

import { readHeroBans, heroName } from '@/utils/matches/heroBans';
import { mapNameKey, type PoolMap, type PoolSource } from '@/utils/maps/pool';
import type {
  FormResult,
  PublicStandingsTable,
} from '@/utils/stages/publicStandings';
import { matchPhase, type OverlaySide } from './matchOverlay';

/** Confrontations directes détaillées (les plus récentes). */
export const STATS_MEETINGS_LIMIT = 3;

/** Héros bannis affichés par équipe. */
export const STATS_HERO_BANS_LIMIT = 3;

/**
 * Au-delà, le pool ne tient plus lisiblement dans la carte : on ne garde que
 * les maps que l'une des deux équipes a déjà jouées. Le pool d'un soir de la
 * Cup compte 11 maps ; le catalogue complet d'un jeu, une trentaine.
 */
export const STATS_MAX_POOL_ROWS = 12;

export type StatsMatchRow = {
  id: string;
  status: string | null;
  started_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  round_name: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  is_bye?: boolean | null;
  deleted_at?: string | null;
};

export type StatsGameRow = {
  match_id: string;
  map_name: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  hero_bans?: unknown;
};

export type OverlayStatsStanding = {
  rank: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  /** Maps gagnées moins maps perdues. */
  mapDiff: number;
  /** Derniers résultats, du plus ancien au plus récent. */
  form: FormResult[];
  disqualified: boolean;
};

export type OverlayStatsMeeting = {
  roundName: string | null;
  /** Scores vus du match affiché (team1 = équipe de gauche de CE match). */
  team1Score: number | null;
  team2Score: number | null;
  winner: OverlaySide | null;
};

export type OverlayStatsRecord = { wins: number; losses: number };

export type OverlayStatsMapRow = {
  name: string;
  /** Mode (control, escort…) tel que le pool le déclare. */
  type: string | null;
  team1: OverlayStatsRecord;
  team2: OverlayStatsRecord;
};

export type OverlayStatsHeroBan = { hero: string; name: string; count: number };

export type OverlayStatsPoolScope = 'date' | 'round' | 'tournament' | 'catalog';

export type OverlayMatchStats = {
  /** Le match pour lequel ces stats ont été calculées. */
  matchId: string;
  /** Phase dont vient le classement ; null sans phase à points. */
  stageName: string | null;
  team1: OverlayStatsStanding | null;
  team2: OverlayStatsStanding | null;
  headToHead: {
    team1Wins: number;
    team2Wins: number;
    /** Les plus récentes d'abord. */
    meetings: OverlayStatsMeeting[];
  };
  pool: {
    /** D'où vient le pool : sa date, sa journée, le tournoi, ou le catalogue. */
    scope: OverlayStatsPoolScope;
    /** `YYYY-MM-DD` pour un pool daté, sinon null. */
    date: string | null;
    maps: OverlayStatsMapRow[];
  };
  heroBans: {
    team1: OverlayStatsHeroBan[];
    team2: OverlayStatsHeroBan[];
  };
};

export type OverlayMatchStatsResponse = OverlayMatchStats & {
  serverTime: string;
};

/**
 * La table de classement à citer : la phase la plus récente où les DEUX
 * équipes figurent, sinon la plus récente où l'une d'elles figure.
 */
function pickTable(
  tables: PublicStandingsTable[],
  team1Id: string | null,
  team2Id: string | null
): PublicStandingsTable | null {
  const has = (t: PublicStandingsTable, id: string | null) =>
    id != null && t.rows.some((r) => r.teamId === id);
  for (let i = tables.length - 1; i >= 0; i -= 1) {
    if (has(tables[i], team1Id) && has(tables[i], team2Id)) return tables[i];
  }
  for (let i = tables.length - 1; i >= 0; i -= 1) {
    if (has(tables[i], team1Id) || has(tables[i], team2Id)) return tables[i];
  }
  return null;
}

function standingOf(
  table: PublicStandingsTable | null,
  teamId: string | null
): OverlayStatsStanding | null {
  if (!table || !teamId) return null;
  const row = table.rows.find((r) => r.teamId === teamId);
  if (!row) return null;
  return {
    rank: row.rank,
    played: row.played,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    mapDiff: row.mapsWon - row.mapsLost,
    form: row.form,
    disqualified: row.disqualified,
  };
}

/** Un match qui compte dans les stats : vivant, réel, autre que celui affiché. */
function counts(row: StatsMatchRow, currentId: string): boolean {
  if (row.id === currentId) return false;
  if (row.deleted_at || row.is_bye) return false;
  const status = (row.status ?? '').trim().toLowerCase();
  return status !== 'cancelled' && status !== 'canceled';
}

/**
 * Vainqueur d'une map : `winner_team_id` d'abord (c'est la feuille de match),
 * sinon le score s'il désigne quelqu'un. Même règle que l'analytique tournoi.
 */
function gameWinner(game: StatsGameRow, match: StatsMatchRow): string | null {
  if (game.winner_team_id) return game.winner_team_id;
  const s1 = game.team1_score ?? 0;
  const s2 = game.team2_score ?? 0;
  if (s1 > s2) return match.team1_id;
  if (s2 > s1) return match.team2_id;
  return null;
}

function msOf(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function poolScope(source: PoolSource): OverlayStatsPoolScope {
  if (source === 'tournament-date') return 'date';
  if (source === 'tournament-round') return 'round';
  if (source === 'tournament') return 'tournament';
  return 'catalog';
}

/**
 * Compose la carte « avant-match » d'un match.
 *
 * `matches` = les matchs du tournoi (le handler les lit tous, le tri se fait
 * ici) ; `games` = les maps jouées de ces matchs ; `pool` = le pool effectif
 * du match (date, puis journée, puis tournoi — cf. resolveEffectiveMapPool).
 */
export function buildMatchStats(input: {
  match: Pick<StatsMatchRow, 'id' | 'team1_id' | 'team2_id'>;
  tables: PublicStandingsTable[];
  matches: StatsMatchRow[];
  games: StatsGameRow[];
  pool: { maps: PoolMap[]; source: PoolSource; date: string | null };
}): OverlayMatchStats {
  const { match } = input;
  const t1 = match.team1_id;
  const t2 = match.team2_id;

  const table = pickTable(input.tables, t1, t2);

  // Les matchs retenus, une fois pour toutes.
  const kept = new Map<string, StatsMatchRow>();
  for (const row of input.matches) {
    if (counts(row, match.id)) kept.set(row.id, row);
  }

  /* ── Confrontations directes ── */
  const meetings: (OverlayStatsMeeting & { at: number })[] = [];
  let team1Wins = 0;
  let team2Wins = 0;
  if (t1 && t2) {
    for (const row of kept.values()) {
      const sameSides = row.team1_id === t1 && row.team2_id === t2;
      const swapped = row.team1_id === t2 && row.team2_id === t1;
      if (!sameSides && !swapped) continue;
      if (matchPhase(row) !== 'final') continue;
      const winner: OverlaySide | null =
        row.winner_team_id === t1 ? 1 : row.winner_team_id === t2 ? 2 : null;
      if (winner === 1) team1Wins += 1;
      if (winner === 2) team2Wins += 1;
      meetings.push({
        roundName: row.round_name ?? null,
        team1Score: sameSides ? row.team1_score : row.team2_score,
        team2Score: sameSides ? row.team2_score : row.team1_score,
        winner,
        at: msOf(row.completed_at ?? row.started_at ?? row.scheduled_at),
      });
    }
  }
  meetings.sort((a, b) => b.at - a.at);

  /* ── Bilan par map et bans, équipe par équipe ── */
  const records = new Map<string, Map<string, OverlayStatsRecord>>();
  const bans = new Map<string, Map<string, number>>();
  for (const id of [t1, t2]) {
    if (id) {
      records.set(id, new Map());
      bans.set(id, new Map());
    }
  }

  for (const game of input.games) {
    const row = kept.get(game.match_id);
    if (!row) continue;
    const winner = gameWinner(game, row);
    for (const id of [row.team1_id, row.team2_id]) {
      if (!id) continue;
      const byMap = records.get(id);
      if (byMap && game.map_name && winner) {
        const key = mapNameKey(game.map_name);
        const rec = byMap.get(key) ?? { wins: 0, losses: 0 };
        if (winner === id) rec.wins += 1;
        else rec.losses += 1;
        byMap.set(key, rec);
      }
    }
    for (const ban of readHeroBans(game.hero_bans)) {
      const made = bans.get(ban.team_id);
      if (made) made.set(ban.hero, (made.get(ban.hero) ?? 0) + 1);
    }
  }

  const recordOf = (teamId: string | null, key: string): OverlayStatsRecord => {
    const rec = teamId ? records.get(teamId)?.get(key) : undefined;
    return rec ? { ...rec } : { wins: 0, losses: 0 };
  };

  let mapRows: OverlayStatsMapRow[] = input.pool.maps.map((m) => {
    const key = mapNameKey(m.name);
    return {
      name: m.name,
      type: m.type ?? null,
      team1: recordOf(t1, key),
      team2: recordOf(t2, key),
    };
  });
  if (mapRows.length > STATS_MAX_POOL_ROWS) {
    const played = (r: OverlayStatsMapRow) =>
      r.team1.wins + r.team1.losses + r.team2.wins + r.team2.losses;
    mapRows = mapRows
      .filter((r) => played(r) > 0)
      .sort((a, b) => played(b) - played(a))
      .slice(0, STATS_MAX_POOL_ROWS);
  }

  const topBans = (teamId: string | null): OverlayStatsHeroBan[] => {
    const made = teamId ? bans.get(teamId) : undefined;
    if (!made) return [];
    return Array.from(made.entries())
      .map(([hero, count]) => ({ hero, name: heroName(hero), count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'))
      .slice(0, STATS_HERO_BANS_LIMIT);
  };

  const scope = poolScope(input.pool.source);
  return {
    matchId: match.id,
    stageName: table?.stageName ?? null,
    team1: standingOf(table, t1),
    team2: standingOf(table, t2),
    headToHead: {
      team1Wins,
      team2Wins,
      meetings: meetings
        .slice(0, STATS_MEETINGS_LIMIT)
        .map(({ at: _at, ...m }) => m),
    },
    pool: {
      scope,
      date: scope === 'date' ? input.pool.date : null,
      maps: mapRows,
    },
    heroBans: { team1: topBans(t1), team2: topBans(t2) },
  };
}
