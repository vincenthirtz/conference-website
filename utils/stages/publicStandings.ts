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
  type StageStanding,
} from './standings';
import type { TiebreakerKey } from './tiebreakers';
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
 * PURE — `finished` = matchs terminés de la phase, déjà filtrés.
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
    };
  });
}

/**
 * Lit les classements de toutes les phases à points d'un tournoi.
 * Une phase en erreur est journalisée et omise : elle ne doit pas vider la page.
 */
export async function readPublicStandings(
  tenantId: string,
  tournamentId: string
): Promise<PublicStandingsTable[]> {
  if (!supabaseAdmin) return [];

  // `deleted_at` / `is_public` ne sont PAS fiables sur ces lignes (voir les
  // autres pages publiques du tournoi, qui les ignorent aussi).
  const { data: stages, error } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, name, stage_type, order_index')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .in('stage_type', STANDINGS_STAGE_TYPES as unknown as string[])
    .order('order_index', { ascending: true });

  if (error) {
    logger.error('public standings stages error:', error);
    return [];
  }
  if (!stages || stages.length === 0) return [];

  const stageIds = stages.map((s: { id: string }) => s.id);
  const [matchesRes, stageTeamsRes] = await Promise.all([
    supabaseAdmin
      .from('matches')
      .select(
        'stage_id, team1_id, team2_id, winner_team_id, team1_score, team2_score, round_number, scheduled_at, is_bye'
      )
      .eq('tenant_id', tenantId)
      .in('stage_id', stageIds)
      .eq('status', 'finished'),
    supabaseAdmin
      .from('stage_teams')
      .select('team:teams(id, name, slug, short_name, logo_url)')
      .eq('tenant_id', tenantId)
      .in('stage_id', stageIds),
  ]);
  if (matchesRes.error) {
    logger.error('public standings matches error:', matchesRes.error);
  }
  if (stageTeamsRes.error) {
    logger.error('public standings teams error:', stageTeamsRes.error);
  }

  const teams = new Map<string, TeamInfo>();
  // `team` est un embed PostgREST : objet OU tableau selon ce que PostgREST
  // juge unique. `oneRelation` dénoue les deux formes.
  for (const row of (stageTeamsRes.data || []) as {
    team: Relation<TeamInfo & { id: string }>;
  }[]) {
    const team = oneRelation(row.team);
    if (team?.id) teams.set(team.id, team);
  }

  const finishedByStage = new Map<string, StandingsMatch[]>();
  for (const m of (matchesRes.data || []) as (StandingsMatch & {
    stage_id: string;
    is_bye: boolean | null;
  })[]) {
    if (m.is_bye) continue;
    const list = finishedByStage.get(m.stage_id) ?? [];
    list.push(m);
    finishedByStage.set(m.stage_id, list);
  }

  const tables: PublicStandingsTable[] = [];
  for (const stage of stages as {
    id: string;
    name: string;
    stage_type: string;
  }[]) {
    const finished = finishedByStage.get(stage.id) ?? [];
    try {
      if (stage.stage_type === 'group') {
        const grouped = await computeGroupedStandings(tenantId, stage.id);
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
        stage.stage_type
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
