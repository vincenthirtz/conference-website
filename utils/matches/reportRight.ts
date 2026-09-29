// utils/matches/reportRight.ts — QUI peut déclarer le score
// d'un match, en UN seul endroit (lot P12, constat S4 du plan).
//
// RÈGLE (décision produit du 2026-09-29, J3 tranchée) : peut déclarer pour une
// équipe sa capitaine (`teams.captain_id`) OU une MANAGER de l'équipe
// (`team_members.role = 'manager'`, rôle d'ÉQUIPE — sans rapport avec le rôle
// staff). Les coachs ne déclarent pas, ni une permission déléguée (J3) : le
// droit n'entre PAS au catalogue `utils/teamRoles.ts`, où il serait accordé
// silencieusement à tout rôle configuré avec « toutes les permissions ».
//
// GARDE-FOU : la réconciliation anti-triche compte UNE voix par CÔTÉ. Une
// personne qui tient les DEUX équipes du match (manager d'une organisation qui
// encadre les deux, capitaine d'une + manager de l'autre…) pourrait déclarer
// les deux côtés seule et finaliser : elle est refusée (`REPORT_BOTH_SIDES`),
// quelle que soit l'équipe qu'elle demande à représenter.
//
// Vit sous utils/ (et non features/player/) parce que la route bot la lit
// aussi : une route pages/api qui importe `@/features/player/` est tenue pour
// une route « sujet » par les gardes de contrat. Réexportée par
// features/player/matches/service/reportRight.ts.
//
// Lecteurs : la déclaration web (reportScore.ts), la liste des matchs
// (list.ts), le fil du match (detail.ts) ET la route bot
// `/api/bot/v1/matches/{matchId}/report` — tous passent par
// `loadReportableTeamIds` + `decideReportingSide`, jamais par `captain_id`.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminDb } from '@/utils/admin/serviceContext';

/** Rôle d'équipe (team_members.role) qui porte le droit de déclarer. */
export const REPORTING_TEAM_ROLE = 'manager';

/** Code d'erreur : l'appelante tient les deux équipes du match. */
export const REPORT_BOTH_SIDES = 'REPORT_BOTH_SIDES';

export type ReportDecision =
  | { side: 1 | 2 }
  | { side: null; code: 'NOT_A_REPORTER' | typeof REPORT_BOTH_SIDES };

/** Lecture impossible : on ne transforme JAMAIS une erreur en « pas le droit ». */
export class ReportRightLookupError extends Error {
  constructor(override readonly cause: unknown) {
    super('report right lookup failed');
    this.name = 'ReportRightLookupError';
  }
}

/**
 * Décision PURE : le côté (1 ou 2) que déclare la titulaire des équipes
 * `reportable`, ou le motif du refus.
 */
export function decideReportingSide(
  reportable: ReadonlySet<string>,
  team1Id: string | null | undefined,
  team2Id: string | null | undefined
): ReportDecision {
  const holds1 = !!team1Id && reportable.has(team1Id);
  const holds2 = !!team2Id && reportable.has(team2Id);
  if (holds1 && holds2) return { side: null, code: REPORT_BOTH_SIDES };
  if (holds1) return { side: 1 };
  if (holds2) return { side: 2 };
  return { side: null, code: 'NOT_A_REPORTER' };
}

/**
 * L'appelante peut-elle déclarer pour `teamId` face à `opponentId` ? Faux sans
 * adversaire assigné (la déclaration répondrait 400 « match incomplet »).
 */
export function mayReportFor(
  reportable: ReadonlySet<string>,
  teamId: string | null | undefined,
  opponentId: string | null | undefined
): boolean {
  if (!teamId || !opponentId) return false;
  return decideReportingSide(reportable, teamId, opponentId).side === 1;
}

const loose = (db: AdminDb) => db as unknown as SupabaseClient;

/**
 * Équipes du tenant pour lesquelles `userId` peut déclarer : capitanat ∪ rôle
 * d'équipe `manager`. Deux lectures, scopées au tenant de l'équipe (celui du
 * match). `knownTeams` : équipes dont l'appelant a DÉJÀ lu la capitaine (les
 * deux du match, jointes à sa lecture) — comptées sans relecture. Erreur de
 * lecture → `ReportRightLookupError` (l'appelant répond 500).
 */
export async function loadReportableTeamIds(
  db: AdminDb,
  tenantId: string,
  userId: string,
  knownTeams: readonly (
    | { id?: string | null; captain_id?: string | null }
    | null
    | undefined
  )[] = []
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!userId) return out;
  for (const t of knownTeams) {
    if (t?.id && t.captain_id === userId) out.add(t.id);
  }

  const [captainRes, memberRes] = await Promise.all([
    loose(db)
      .from('teams')
      .select('id')
      .eq('captain_id', userId)
      .eq('tenant_id', tenantId),
    loose(db)
      .from('team_members')
      .select('team_id, role')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId),
  ]);
  if (captainRes.error) throw new ReportRightLookupError(captainRes.error);
  if (memberRes.error) throw new ReportRightLookupError(memberRes.error);

  for (const row of (captainRes.data as { id?: string | null }[] | null) ??
    []) {
    if (row?.id) out.add(row.id);
  }
  for (const row of (memberRes.data as
    | { team_id?: string | null; role?: string | null }[]
    | null) ?? []) {
    const role = row?.role?.trim().toLowerCase() ?? '';
    if (row?.team_id && role === REPORTING_TEAM_ROLE) out.add(row.team_id);
  }
  return out;
}

/** Statuts où plus aucun report n'est accepté (409 MATCH_FINALIZED). */
export const REPORT_CLOSED_STATUSES: ReadonlySet<string> = new Set([
  'finished',
  'walkover',
  'cancelled',
]);
