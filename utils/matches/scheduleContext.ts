// utils/matches/scheduleContext.ts
//
// Le chargement partagé « tout ce qu'il faut savoir pour juger un calendrier » :
// le tournoi, ses matchs, et les contraintes des équipes engagées.
//
// Écrit une fois parce que trois routes en ont besoin — le diagnostic (lot 3),
// l'aperçu d'impact d'un déplacement (lot 5) et l'auto-scheduler contraint
// (lot 6). Trois chargements séparés, c'est trois occasions de juger le même
// calendrier sur des données différentes.

import { supabaseAdmin } from '../supabase';
import type { AvailabilityConstraint } from './availability';
import {
  AVAILABILITY_COLUMNS,
  rowToConstraint,
  type AvailabilityRow,
} from './availabilityRows';
import type { DiagnosableMatch } from './scheduleDiagnostics';

export interface ScheduleContext {
  tournament: {
    id: string;
    name: string | null;
    startDate: string | null;
    endDate: string | null;
    timezone: string;
  };
  matches: DiagnosableMatch[];
  constraints: AvailabilityConstraint[];
  /** Nom d'équipe par id — pour nommer une anomalie sans re-requêter. */
  teamNames: Record<string, string>;
}

type MatchRow = {
  id: string;
  stage_id: string | null;
  round_name: string | null;
  round_number: number | null;
  match_format: string | null;
  status: string | null;
  is_bye: boolean | null;
  scheduled_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1: { name: string | null } | { name: string | null }[] | null;
  team2: { name: string | null } | { name: string | null }[] | null;
};

/** PostgREST rend un embed en objet OU en tableau selon la relation résolue. */
function embedName(v: MatchRow['team1']): string | null {
  const t = Array.isArray(v) ? v[0] : v;
  return t?.name ?? null;
}

/**
 * Charge le contexte, ou `null` si le tournoi n'existe pas dans ce tenant.
 *
 * Les matchs SANS date sont inclus : « ce match n'a pas de date » est une
 * anomalie de planning à part entière, et l'exclure la rendrait invisible.
 */
export async function loadScheduleContext(
  tenantId: string,
  tournamentId: string
): Promise<ScheduleContext | null> {
  const { data: tournament, error: tErr } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, start_date, end_date, timezone')
    .eq('id', tournamentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (tErr) throw tErr;
  if (!tournament) return null;

  const [matchesRes, entrantsRes] = await Promise.all([
    supabaseAdmin
      .from('matches')
      .select(
        `id, stage_id, round_name, round_number, match_format, status, is_bye,
         scheduled_at, team1_id, team2_id,
         team1:teams!matches_team1_fk(name),
         team2:teams!matches_team2_fk(name)`
      )
      .eq('tournament_id', tournamentId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
    supabaseAdmin
      .from('tournament_teams')
      .select('team_id')
      .eq('tournament_id', tournamentId)
      .eq('tenant_id', tenantId),
  ]);

  if (matchesRes.error) throw matchesRes.error;
  if (entrantsRes.error) throw entrantsRes.error;

  const rows = (matchesRes.data ?? []) as MatchRow[];
  const teamNames: Record<string, string> = {};
  const matches: DiagnosableMatch[] = rows.map((m) => {
    const n1 = embedName(m.team1);
    const n2 = embedName(m.team2);
    if (m.team1_id && n1) teamNames[m.team1_id] = n1;
    if (m.team2_id && n2) teamNames[m.team2_id] = n2;
    return {
      id: m.id,
      tournamentId,
      scheduledAt: m.scheduled_at,
      team1Id: m.team1_id,
      team2Id: m.team2_id,
      team1Name: n1,
      team2Name: n2,
      isBye: m.is_bye,
      status: m.status,
      format: m.match_format,
      roundName: m.round_name ?? (m.round_number ? `J${m.round_number}` : null),
    };
  });

  // Les contraintes des équipes ENGAGÉES, plus celles des équipes qui
  // apparaissent seulement dans les matchs : un tournoi peut porter une équipe
  // non inscrite dans `tournament_teams` (import, showmatch), et l'oublier
  // rendrait sa contrainte muette.
  const teamIds = [
    ...new Set([
      ...(entrantsRes.data ?? []).map((r) => r.team_id as string),
      ...Object.keys(teamNames),
    ]),
  ];

  let constraints: AvailabilityConstraint[] = [];
  if (teamIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('team_availability_constraints')
      .select(AVAILABILITY_COLUMNS)
      .eq('tenant_id', tenantId)
      .in('team_id', teamIds)
      .or(`tournament_id.eq.${tournamentId},tournament_id.is.null`);
    if (error) throw error;
    constraints = ((data ?? []) as AvailabilityRow[]).map(rowToConstraint);
  }

  return {
    tournament: {
      id: tournament.id as string,
      name: (tournament.name as string | null) ?? null,
      startDate: (tournament.start_date as string | null) ?? null,
      endDate: (tournament.end_date as string | null) ?? null,
      timezone: (tournament.timezone as string | null) || 'Europe/Paris',
    },
    matches,
    constraints,
    teamNames,
  };
}
