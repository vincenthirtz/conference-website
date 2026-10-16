// utils/stages/publicStandings.ts
// Classement public d'un tournoi : un tableau par phase à points (round robin,
// poules, suisse), pour l'onglet « Classement » de /tournament/[id].
//
// LE RANG NE SE RECALCULE PAS ICI. Il vient de `computeStageStandings` /
// `computeGroupedStandings` — la même source que l'admin, avec la confrontation
// directe et les départages manuels du staff. Un second tri « pour l'affichage »
// finirait tôt ou tard par contredire le classement officiel.
//
// Ce module ne fait qu'AJOUTER ce qu'un spectateur attend en plus : matchs
// joués, maps gagnées/perdues, forme récente, logo.

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import {
  computeGroupedStandings,
  computeStageStandings,
  type PrefetchedRead,
  type PrefetchedStageInputs,
  type StageMatchRow,
  type StageStanding,
  type TiebreakerOverrideRow,
} from './standings';
import type { TiebreakerKey } from './tiebreakers';
import { isCountedStatus } from './countedMatches';
import {
  excludeAnnulledMatches,
  groupDisqualificationsByStage,
  type DisqualificationMap,
  type DisqualificationMode,
  type DisqualificationRow,
} from './disqualification';
import { oneRelation, type Relation } from '@/utils/supabase/relation';

/** Types de phase qui produisent un classement à points. */
export const STANDINGS_STAGE_TYPES = ['round_robin', 'group', 'swiss'] as const;

/** Nombre de résultats montrés dans la colonne « forme ». */
export const FORM_LENGTH = 5;

export type FormResult = 'W' | 'L' | 'D';

export type PublicStandingRow = {
  rank: number;
  teamId: string;
  teamName: string;
  shortName: string | null;
  slug: string | null;
  logoUrl: string | null;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  mapsWon: number;
  mapsLost: number;
  /** Du plus ancien au plus récent. */
  form: FormResult[];
  tiebrokenBy: TiebreakerKey | null;
  /** Équipe disqualifiée de la phase : classée en dernier, à badger. */
  disqualified: boolean;
  /** `forfeit` (matchs restants perdus) ou `annul` (matchs ignorés). */
  disqualificationMode: DisqualificationMode | null;
};

export type PublicStandingsTable = {
  /** Clé stable (stage, ou stage + poule). */
  key: string;
  stageName: string;
  stageType: string;
  /** Poule (« A », « B »…) pour un stage de type group. */
  groupKey: string | null;
  rows: PublicStandingRow[];
};

export type StandingsMatch = {
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  round_number: number | null;
  scheduled_at: string | null;
};

type TeamInfo = {
  name: string;
  slug?: string | null;
  short_name: string | null;
  logo_url: string | null;
};

/** Ordre chronologique : date prévue, puis manche (un match sans date se range par manche). */
function chronological(a: StandingsMatch, b: StandingsMatch): number {
  const ra = a.round_number ?? 0;
  const rb = b.round_number ?? 0;
  if (a.scheduled_at && b.scheduled_at && a.scheduled_at !== b.scheduled_at) {
    return a.scheduled_at < b.scheduled_at ? -1 : 1;
  }
  return ra - rb;
}

/**
 * Ajoute aux lignes du classement officiel les compteurs d'affichage.
 * PURE — `finished` = matchs tranchés (terminés ou forfaits) de la phase,
 * déjà filtrés.
 */
export function enrichStandings(
  standings: StageStanding[],
  finished: StandingsMatch[],
  teams: Map<string, TeamInfo>
): PublicStandingRow[] {
  const ordered = finished.slice().sort(chronological);

  return standings.map((s) => {
    let mapsWon = 0;
    let mapsLost = 0;
    let played = 0;
    const form: FormResult[] = [];

    for (const m of ordered) {
      const side =
        m.team1_id === s.teamId ? 1 : m.team2_id === s.teamId ? 2 : 0;
      if (side === 0 || !m.team1_id || !m.team2_id) continue;
      played += 1;
      const own = (side === 1 ? m.team1_score : m.team2_score) ?? 0;
      const other = (side === 1 ? m.team2_score : m.team1_score) ?? 0;
      mapsWon += own;
      mapsLost += other;
      form.push(
        m.winner_team_id === s.teamId ? 'W' : m.winner_team_id ? 'L' : 'D'
      );
    }

    const team = teams.get(s.teamId);
    return {
      rank: s.rank,
      teamId: s.teamId,
      teamName: team?.name ?? s.teamName ?? '—',
      shortName: team?.short_name ?? null,
      slug: team?.slug ?? null,
      logoUrl: team?.logo_url ?? null,
      played,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      points: s.score,
      mapsWon,
      mapsLost,
      form: form.slice(-FORM_LENGTH),
      tiebrokenBy: s.tiebrokenBy ?? null,
      disqualified: s.disqualified === true,
      disqualificationMode: s.disqualificationMode ?? null,
    };
  });
}

/** Ligne de `stage_teams` lue une fois pour toutes les phases. */
type PrefetchedStageTeamRow = DisqualificationRow & {
  seed: number | null;
  team: Relation<TeamInfo & { id: string }>;
};

/** Ligne de `matches` lue une fois pour toutes les phases. */
type PrefetchedMatchRow = StageMatchRow & {
  stage_id: string;
  scheduled_at: string | null;
};

/** Ce que `prefetchStandingsInputs` a lu, rangé par phase. */
export type StandingsPrefetch = {
  /** Équipes des phases (embed `teams`), par id. */
  teams: Map<string, TeamInfo>;
  /** Matchs tranchés (terminés ou forfaits), exempts exclus, par phase. */
  finishedByStage: Map<string, StandingsMatch[]>;
  /** Disqualifications, par phase. */
  disqualifications: Map<string, DisqualificationMap>;
  /** Entrées du calcul officiel d'UNE phase (cf. PrefetchedStageInputs). */
  stageInputs(stage: { id: string; settings?: unknown }): PrefetchedStageInputs;
};

/** Lignes d'une lecture groupée, par phase (ordre de lecture conservé). */
function byStage<R extends { stage_id: string }>(rows: R[]): Map<string, R[]> {
  const out = new Map<string, R[]>();
  for (const row of rows) {
    const list = out.get(row.stage_id);
    if (list) list.push(row);
    else out.set(row.stage_id, [row]);
  }
  return out;
}

/** La part d'une phase dans une lecture groupée — ou l'erreur de celle-ci. */
function readOfStage<R>(
  error: { message: string } | null,
  rows: Map<string, R[]>,
  stageId: string
): PrefetchedRead<R> {
  return error
    ? { data: null, error }
    : { data: rows.get(stageId) ?? [], error: null };
}

/**
 * Lit EN UNE FOIS, pour toutes les phases données, ce que le classement public
 * puis le calcul officiel (`computeStageStandings` /
 * `computeGroupedStandings`) lisaient phase par phase : 3 requêtes au plus,
 * quel que soit le nombre de phases (3 + 4 à 5 PAR PHASE auparavant).
 *
 * Chaque lecture est l'UNION de celles qu'elle remplace (mêmes filtres de
 * tenant et de phase), refiltrée en mémoire pour rendre à chacun ses lignes :
 *   - `matches` : hors `cancelled` et supprimés, comme le calcul officiel ;
 *     le public n'en garde que les tranchés non exempts, comme sa lecture
 *     d'avant (`status in (finished, walkover)`) ;
 *   - `stage_teams` : seed, embed `teams` et disqualification (trois lectures
 *     en une) ;
 *   - `stage_tiebreaker_overrides` : seulement si une phase n'est pas en
 *     poules — le classement par poule ne les applique pas.
 */
export async function prefetchStandingsInputs(
  tenantId: string,
  stages: { id: string; stage_type: string }[]
): Promise<StandingsPrefetch> {
  const stageIds = stages.map((s) => s.id);
  const needsOverrides = stages.some((s) => s.stage_type !== 'group');
  const [matchesRes, stageTeamsRes, overridesRes] = await Promise.all([
    supabaseAdmin
      .from('matches')
      .select(
        'stage_id, id, status, is_bye, round_number, team1_id, team2_id, winner_team_id, team1_score, team2_score, scheduled_at, group_key, deleted_at'
      )
      .eq('tenant_id', tenantId)
      .in('stage_id', stageIds)
      .neq('status', 'cancelled')
      .is('deleted_at', null),
    supabaseAdmin
      .from('stage_teams')
      .select(
        'stage_id, team_id, seed, disqualified_at, disqualification_mode, disqualification_reason, disqualified_by, team:teams(id, name, slug, short_name, logo_url)'
      )
      .eq('tenant_id', tenantId)
      .in('stage_id', stageIds),
    needsOverrides
      ? supabaseAdmin
          .from('stage_tiebreaker_overrides')
          .select('stage_id, winner_team_id, loser_team_id')
          .eq('tenant_id', tenantId)
          .in('stage_id', stageIds)
      : null,
  ]);
  if (matchesRes.error) {
    logger.error('public standings matches error:', matchesRes.error);
  }
  if (stageTeamsRes.error) {
    logger.error('public standings teams error:', stageTeamsRes.error);
  }

  const matchRows = (matchesRes.data || []) as PrefetchedMatchRow[];
  const stageTeamRows = (stageTeamsRes.data || []) as PrefetchedStageTeamRow[];
  // Lecture en échec : aucun départage manuel, comme la lecture par phase
  // (applyTiebreakerOverrides).
  const overrideRows = (
    overridesRes && !overridesRes.error ? overridesRes.data || [] : []
  ) as (TiebreakerOverrideRow & { stage_id: string })[];

  const teams = new Map<string, TeamInfo>();
  // `team` est un embed PostgREST : objet OU tableau selon ce que PostgREST
  // juge unique. `oneRelation` dénoue les deux formes.
  for (const row of stageTeamRows) {
    const team = oneRelation(row.team);
    if (team?.id) teams.set(team.id, team);
  }

  const finishedByStage = new Map<string, StandingsMatch[]>();
  for (const m of matchRows) {
    // Forfaits compris (match tranché), supprimés exclus : même règle que
    // le classement officiel (utils/stages/countedMatches).
    if (!isCountedStatus(m.status) || m.is_bye) continue;
    const list = finishedByStage.get(m.stage_id) ?? [];
    list.push(m);
    finishedByStage.set(m.stage_id, list);
  }

  const disqualifications = groupDisqualificationsByStage(stageTeamRows);
  const teamsByStage = byStage(stageTeamRows);
  const matchesByStage = byStage(matchRows);
  const overridesByStage = byStage(overrideRows);

  return {
    teams,
    finishedByStage,
    disqualifications,
    stageInputs: (stage) => ({
      stageTeams: readOfStage(stageTeamsRes.error, teamsByStage, stage.id),
      matches: readOfStage(matchesRes.error, matchesByStage, stage.id),
      disqualified: disqualifications.get(stage.id) ?? new Map(),
      settings: stage.settings,
      overrides: overridesByStage.get(stage.id) ?? [],
    }),
  };
}

/**
 * Lit les classements de toutes les phases à points d'un tournoi.
 * Une phase en erreur est journalisée et omise : elle ne doit pas vider la page.
 *
 * 4 requêtes au plus, quel que soit le nombre de phases : les phases, puis
 * `prefetchStandingsInputs`. Le calcul officiel reçoit ces lectures au lieu
 * de les refaire phase par phase (9 requêtes pour UNE phase round robin).
 */
export async function readPublicStandings(
  tenantId: string,
  tournamentId: string
): Promise<PublicStandingsTable[]> {
  if (!supabaseAdmin) return [];

  // `deleted_at` / `is_public` ne sont PAS fiables sur ces lignes (voir les
  // autres pages publiques du tournoi, qui les ignorent aussi). `settings`
  // sert au calcul officiel (ordre de départage, poules).
  const { data: stages, error } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, name, stage_type, order_index, settings')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .in('stage_type', STANDINGS_STAGE_TYPES as unknown as string[])
    .order('order_index', { ascending: true });

  if (error) {
    logger.error('public standings stages error:', error);
    return [];
  }
  if (!stages || stages.length === 0) return [];

  const standingStages = stages as {
    id: string;
    name: string;
    stage_type: string;
    settings: unknown;
  }[];
  const prefetch = await prefetchStandingsInputs(tenantId, standingStages);
  const { teams } = prefetch;

  const tables: PublicStandingsTable[] = [];
  for (const stage of standingStages) {
    // Matchs d'une disqualifiée en mode « annul » : ni joués, ni maps, ni
    // forme — comme dans le classement officiel.
    const finished = excludeAnnulledMatches(
      prefetch.finishedByStage.get(stage.id) ?? [],
      prefetch.disqualifications.get(stage.id) ?? new Map()
    );
    const inputs = prefetch.stageInputs(stage);
    try {
      if (stage.stage_type === 'group') {
        const grouped = await computeGroupedStandings(
          tenantId,
          stage.id,
          inputs
        );
        for (const key of Object.keys(grouped.groups).sort()) {
          const inGroup = new Set(grouped.groups[key].map((s) => s.teamId));
          tables.push({
            key: `${stage.id}:${key}`,
            stageName: stage.name,
            stageType: stage.stage_type,
            groupKey: key,
            rows: enrichStandings(
              grouped.groups[key],
              finished.filter(
                (m) =>
                  inGroup.has(m.team1_id ?? '') && inGroup.has(m.team2_id ?? '')
              ),
              teams
            ),
          });
        }
        continue;
      }
      const standings = await computeStageStandings(
        tenantId,
        stage.id,
        stage.stage_type,
        inputs
      );
      if (standings.length === 0) continue;
      tables.push({
        key: stage.id,
        stageName: stage.name,
        stageType: stage.stage_type,
        groupKey: null,
        rows: enrichStandings(standings, finished, teams),
      });
    } catch (err) {
      logger.error('public standings stage error:', stage.id, err);
    }
  }
  return tables;
}
