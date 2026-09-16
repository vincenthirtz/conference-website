// utils/matches/scoreReports.ts
//
// Règles partagées des REPORTS DE SCORE capitaines (matchs et scrims) :
//   * purge des reports quand le staff rouvre un résultat sans fixer de score ;
//   * « le coup d'envoi est-il passé ? » ;
//   * cohérence d'un couple de scores avec le best-of du match ;
//   * état du report vu par une équipe (fil du match).
//
// Pourquoi un module à part : ces règles sont appelées depuis la route web de
// report, les routes staff (admin + bot) qui tranchent une dispute, la route
// admin des scrims et la vue « fil du match ». Une règle dupliquée dans cinq
// handlers finit toujours par diverger — c'est exactement comme ça qu'un report
// adverse resté en base a pu rétablir un résultat annulé par le staff.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/* -----------------------------------------------------------
 * Purge des reports
 * ---------------------------------------------------------*/

export type ScoreReportKind = 'match' | 'scrim';

/** Un report supprimé, tel qu'il est versé au journal staff (trace d'audit). */
export type PurgedScoreReport = {
  /** match_id ou scrim_id : distingue les lignes d'une purge en masse. */
  subject_id: string | null;
  team_side: number;
  team1_score: number;
  team2_score: number;
  reported_by_auth_user_id: string | null;
  updated_at: string | null;
};

export type PurgeScoreReportsResult =
  | { ok: true; purged: PurgedScoreReport[] }
  | { ok: false; error: string };

const PURGE_TARGET: Record<
  ScoreReportKind,
  { table: 'match_score_reports' | 'scrim_score_reports'; fk: string }
> = {
  match: { table: 'match_score_reports', fk: 'match_id' },
  scrim: { table: 'scrim_score_reports', fk: 'scrim_id' },
};

/**
 * Supprime les reports de score des DEUX camps d'un match ou d'un scrim.
 *
 * POURQUOI. Rien d'autre ne supprime jamais ces lignes : elles survivent à
 * toute décision du staff. Or la route de report compte le report adverse
 * resté en base comme un vote valable. Scénario réel : match `finished` 3-0,
 * dispute, le staff la tranche « à rejouer » (statut `pending`, sans score) →
 * la capitaine gagnante renvoie 3-0 → son report « concorde » avec l'ancien
 * report adverse → le match repasse `finished` sur le score annulé, bracket et
 * rating compris. Purger à la réouverture remet les compteurs à zéro : il faut
 * de nouveau DEUX reports postérieurs à la décision du staff.
 *
 * QUAND L'APPELER. Chaque fois que le staff fait passer un match (ou un scrim)
 * d'un statut clos ou `disputed` à un statut où l'on peut de nouveau rapporter
 * (cf. matchTransitionPurgesReports / scrimTransitionPurgesReports). Jamais
 * quand la décision fixe un score FINAL : le score staff fait foi, et le statut
 * qui en résulte est terminal (les reports y sont refusés de toute façon).
 *
 * ORDRE. À appeler AVANT l'écriture du statut rouvert : dans l'ordre inverse,
 * une capitaine qui renvoie son report dans l'intervalle finaliserait encore
 * sur l'ancien report adverse. Un échec est rendu (pas levé) pour que
 * l'appelant n'ouvre pas le report sur des reports périmés.
 *
 * Les lignes supprimées sont rendues pour être versées au journal staff : la
 * purge efface une donnée, la trace d'audit doit la garder.
 */
export async function purgeScoreReports(
  kind: ScoreReportKind,
  tenantId: string,
  idOrIds: string | readonly string[]
): Promise<PurgeScoreReportsResult> {
  const { table, fk } = PURGE_TARGET[kind];
  // Plusieurs ids (édition en masse) : UNE requête `IN (…)`, jamais une par
  // match — un lot de 30 matchs ne doit pas coûter 30 allers-retours.
  const ids = typeof idOrIds === 'string' ? [idOrIds] : [...idOrIds];
  if (ids.length === 0) return { ok: true, purged: [] };

  let query = supabaseAdmin.from(table).delete().eq('tenant_id', tenantId);
  query = ids.length === 1 ? query.eq(fk, ids[0]) : query.in(fk, ids);
  const { data, error } = await query.select(
    `${fk}, team_side, team1_score, team2_score, reported_by_auth_user_id, updated_at`
  );

  if (error) {
    logger.error('[scoreReports] purge error', { kind, ids, error });
    return { ok: false, error: 'Purge des reports de score impossible.' };
  }

  // Colonnes composées dynamiquement (fk variable) : le parseur de types de
  // supabase-js ne sait pas les lire, d'où le passage par `unknown`.
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const purged = rows.map((r) => ({
    subject_id: (r[fk] as string | undefined) ?? null,
    team_side: r.team_side as number,
    team1_score: r.team1_score as number,
    team2_score: r.team2_score as number,
    reported_by_auth_user_id:
      (r.reported_by_auth_user_id as string | null | undefined) ?? null,
    updated_at: (r.updated_at as string | null | undefined) ?? null,
  }));
  if (purged.length > 0) {
    logger.info('[scoreReports] reports purgés (réouverture staff)', {
      kind,
      ids,
      count: purged.length,
    });
  }
  return { ok: true, purged };
}

/**
 * Statuts de MATCH dont la sortie invalide les reports déjà posés : un résultat
 * clos (fini, forfait, annulé) ou un litige.
 */
const MATCH_SETTLED_STATUSES: ReadonlySet<string> = new Set([
  'finished',
  'walkover',
  'cancelled',
  'disputed',
]);

/**
 * Statuts de MATCH où un report de capitaine redevient un vote. Miroir de
 * `TERMINAL_STATUSES` des routes de report (web et bot) : tout ce qui n'est ni
 * `finished`, ni `walkover`, ni `cancelled`. `disputed` en fait partie : un
 * report concordant y referme la dispute et FINALISE le match.
 */
const MATCH_REPORTABLE_STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'ongoing',
  'postponed',
  'disputed',
]);

/**
 * Une écriture staff du statut d'un MATCH doit-elle purger les reports ?
 *
 * Oui quand le match quitte un état clos ou en litige POUR un état où les
 * capitaines peuvent de nouveau rapporter. Couvre `finished → pending`
 * (« à rejouer » sans passer par la dispute), `cancelled → pending`
 * (réinstauration) et `finished → disputed` (le report d'une capitaine
 * referme une dispute : sans purge, la gagnante referme seule, sur l'ancien
 * report adverse, le litige que le staff vient d'ouvrir).
 *
 * Même quand l'écriture pose AUSSI un score : si le statut obtenu est
 * reportable, ce score n'est pas un résultat final (score en direct, remise à
 * zéro) et deux anciens reports concordants l'écraseraient au prochain renvoi.
 * Seul un score posé AVEC un statut clos fait foi — et alors cette fonction
 * rend `false`, puisque le statut d'arrivée n'est pas reportable.
 */
export function matchTransitionPurgesReports(
  beforeStatus: string | null | undefined,
  afterStatus: string | null | undefined
): boolean {
  if (!beforeStatus || !afterStatus || beforeStatus === afterStatus) {
    return false;
  }
  return (
    MATCH_SETTLED_STATUSES.has(beforeStatus) &&
    MATCH_REPORTABLE_STATUSES.has(afterStatus)
  );
}

/**
 * Finalisation concurrente perdue (`MatchFinalizationConflictError`) : où en
 * est le match maintenant ? Partagé par les routes de report web et bot, qui
 * en tirent chacune leur réponse.
 *   * `finalized` : déjà `finished` sur CE score (l'autre capitaine vient de
 *                   finaliser le même résultat) ;
 *   * `closed`    : clos autrement (le staff a tranché entre-temps) ;
 *   * `in_progress` : la finalisation concurrente n'a pas encore écrit.
 */
export type FinalizationConflictState =
  | { kind: 'finalized'; winnerTeamId: string | null }
  | { kind: 'closed'; status: string }
  | { kind: 'in_progress'; status: string | null };

export async function readFinalizationConflict(
  tenantId: string,
  matchId: string,
  team1Score: unknown,
  team2Score: unknown
): Promise<FinalizationConflictState> {
  const { data } = await supabaseAdmin
    .from('matches')
    .select('status, team1_score, team2_score, winner_team_id')
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .maybeSingle();
  const row = data as {
    status: string;
    team1_score: number | null;
    team2_score: number | null;
    winner_team_id: string | null;
  } | null;

  if (
    row?.status === 'finished' &&
    row.team1_score === team1Score &&
    row.team2_score === team2Score
  ) {
    return { kind: 'finalized', winnerTeamId: row.winner_team_id ?? null };
  }
  if (row && ['finished', 'walkover', 'cancelled'].includes(row.status)) {
    return { kind: 'closed', status: row.status };
  }
  return { kind: 'in_progress', status: row?.status ?? null };
}

/**
 * Statuts de scrim où un report est de nouveau accepté. Miroir de
 * `SCRIM_REPORT_TERMINAL_STATUSES` (route de report) : tout ce qui n'est ni
 * `completed` ni `cancelled`.
 */
const SCRIM_REPORTABLE_STATUSES: ReadonlySet<string> = new Set([
  'draft',
  'scheduled',
  'running',
  'disputed',
]);

/** Statuts de scrim dont la sortie invalide les reports déjà posés. */
const SCRIM_SETTLED_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  'cancelled',
  'disputed',
]);

/**
 * Une transition de statut de scrim (PATCH staff) doit-elle purger les
 * reports ? Oui quand le scrim quitte un état clos ou en litige POUR un état où
 * les capitaines peuvent de nouveau rapporter : c'est exactement le moment où
 * un report resté en base redeviendrait un vote. Le PATCH admin ne fixe jamais
 * de score, donc aucune de ces transitions ne « décide » d'un résultat.
 */
export function scrimTransitionPurgesReports(
  beforeStatus: string | null | undefined,
  afterStatus: string | null | undefined
): boolean {
  if (!beforeStatus || !afterStatus || beforeStatus === afterStatus) {
    return false;
  }
  return (
    SCRIM_SETTLED_STATUSES.has(beforeStatus) &&
    SCRIM_REPORTABLE_STATUSES.has(afterStatus)
  );
}

/* -----------------------------------------------------------
 * Coup d'envoi
 * ---------------------------------------------------------*/

/**
 * Le report est-il prématuré ? Vrai quand l'heure planifiée est dans le futur
 * ET que le match n'est pas déjà lancé.
 *
 * Sans cette garde, deux reports concordants sur un match de dimanche le
 * finalisaient vendredi et propageaient le bracket sur un match non joué.
 *
 * Tolérant par construction : pas d'heure, heure illisible ou statut « lancé »
 * (`ongoing` pour un match, `running` pour un scrim) → jamais prématuré. Un
 * match lancé en avance par le staff reste donc reportable ; un match joué en
 * avance SANS que le staff l'ait lancé demande au staff de le passer en cours.
 */
export function isReportBeforeKickoff(params: {
  status: string | null | undefined;
  scheduledAt: string | null | undefined;
  startedStatus: string;
  nowMs?: number;
}): boolean {
  const { status, scheduledAt, startedStatus } = params;
  if (status === startedStatus) return false;
  if (!scheduledAt) return false;
  const kickoff = Date.parse(scheduledAt);
  if (Number.isNaN(kickoff)) return false;
  return kickoff > (params.nowMs ?? Date.now());
}

/* -----------------------------------------------------------
 * Format de série
 * ---------------------------------------------------------*/

/**
 * Best-of d'un match, ou `null` s'il n'est pas connu AVEC CERTITUDE.
 *
 * Représentation réelle en base : `matches.match_format` est un texte
 * (`'bo1'`, `'bo3'`, `'bo5'`… posé par le générateur de bracket en `bo${n}`,
 * plus les alias `'single_map'` / `'map_decider'` reconnus par
 * computeRequiredWins) ; `matches.best_of` est un entier optionnel qui le
 * surcharge (migration add_best_of_and_started_at_to_matches.sql).
 *
 * Contrairement aux helpers d'affichage (BO5 par défaut), on ne suppose rien :
 * un format absent, inconnu, ou des deux colonnes qui se contredisent → `null`,
 * et aucune borne n'est appliquée. Refuser un report légitime un soir de
 * tournoi coûte plus cher que laisser passer un score que le staff corrigera.
 */
export function resolveSeriesBestOf(
  bestOf: unknown,
  matchFormat: unknown
): number | null {
  const fromColumn =
    typeof bestOf === 'number' && Number.isInteger(bestOf) && bestOf >= 1
      ? bestOf
      : null;

  let fromFormat: number | null = null;
  if (typeof matchFormat === 'string') {
    const f = matchFormat.trim().toLowerCase();
    if (f === 'single_map' || f === 'map_decider') {
      fromFormat = 1;
    } else {
      const m = /^bo(\d{1,2})$/.exec(f);
      const n = m ? Number.parseInt(m[1], 10) : Number.NaN;
      if (Number.isInteger(n) && n >= 1) fromFormat = n;
    }
  }

  if (fromColumn !== null && fromFormat !== null && fromColumn !== fromFormat) {
    return null;
  }
  return fromColumn ?? fromFormat;
}

/**
 * Un couple de scores est-il un résultat FINAL possible pour ce best-of ?
 *
 *   * BO impair (1, 3, 5…) : le vainqueur a exactement ceil(N/2) manches, le
 *     perdant strictement moins. Pas de nul : 3-3 en BO3 finaliserait un match
 *     sans vainqueur et casserait la propagation du bracket.
 *   * BO pair (2, 4…) : la série peut légitimement finir à égalité (BO2 de
 *     phase de poules : 1-1). On accepte donc soit un vainqueur à N/2 + 1
 *     manches avec un perdant qui ne dépasse pas le total, soit un nul N/2 -
 *     N/2. Refuser ce nul bloquerait un report légitime.
 *   * best-of inconnu (`null`) : aucune borne.
 */
export function isScoreValidForBestOf(
  team1Score: number,
  team2Score: number,
  bestOf: number | null
): boolean {
  if (bestOf === null) return true;
  const hi = Math.max(team1Score, team2Score);
  const lo = Math.min(team1Score, team2Score);

  if (bestOf % 2 === 1) {
    const required = (bestOf + 1) / 2;
    return hi === required && lo < required;
  }

  const half = bestOf / 2;
  if (hi === lo) return hi === half;
  return hi === half + 1 && lo <= half - 1;
}

/** Message d'erreur lisible pour `INVALID_SCORE_FOR_FORMAT`. */
export function invalidScoreForFormatMessage(bestOf: number): string {
  if (bestOf % 2 === 1) {
    const required = (bestOf + 1) / 2;
    return `Score impossible en BO${bestOf} : l'équipe gagnante doit avoir exactement ${required} manche(s) et l'autre moins.`;
  }
  const half = bestOf / 2;
  return `Score impossible en BO${bestOf} : ${half + 1} manche(s) pour l'équipe gagnante et l'autre au plus ${half - 1}, ou égalité ${half}-${half}.`;
}

/* -----------------------------------------------------------
 * État du report (fil du match)
 * ---------------------------------------------------------*/

/** État du rapport de score, du point de vue d'UNE équipe. */
export type ScoreReportState =
  | 'none'
  | 'awaiting_opponent'
  | 'awaiting_me'
  | 'agreed'
  | 'disputed';

type ReportScores = { team1_score: number; team2_score: number };

/**
 * « D'accord » se lit sur l'ÉGALITÉ des deux reports, pas sur leur existence.
 * La route de report écrit le report PUIS bascule le match en dispute : si
 * cette seconde écriture échoue (500 renvoyé à la capitaine), les deux reports
 * divergent alors que le statut n'a pas bougé — l'ancien calcul annonçait
 * « d'accord ». Deux reports divergents valent `disputed`, quel que soit le
 * statut (y compris un match que le staff a clos sur un autre score : il y a
 * bien eu désaccord, l'écran affiche le score final à côté).
 */
export function computeScoreReportState(
  matchStatus: string,
  myReport: ReportScores | null,
  oppReport: ReportScores | null
): ScoreReportState {
  if (matchStatus === 'disputed') return 'disputed';
  if (myReport && oppReport) {
    return myReport.team1_score === oppReport.team1_score &&
      myReport.team2_score === oppReport.team2_score
      ? 'agreed'
      : 'disputed';
  }
  if (myReport) return 'awaiting_opponent';
  if (oppReport) return 'awaiting_me';
  return 'none';
}

/**
 * Code renvoyé quand l'accord des capitaines ne peut pas refermer une dispute.
 */
export const DISPUTE_UNDER_STAFF_REVIEW = 'DISPUTE_UNDER_STAFF_REVIEW';

/**
 * Cette dispute a-t-elle été ouverte par le STAFF ?
 *
 * Deux sortes de disputes partagent le statut `disputed` :
 *   - AUTOMATIQUE : les deux reports divergeaient. `dispute_opened_by` reste
 *     NULL. L'accord des capitaines la résout légitimement — c'était leur
 *     désaccord ;
 *   - STAFF : ouverte depuis l'admin, `dispute_opened_by` porte l'id du staff
 *     (`AuthenticatedStaffContext.staff` n'est jamais absent). Elle instruit
 *     souvent autre chose que le score — une joueuse inéligible, une triche —
 *     et les deux équipes peuvent très bien s'entendre sur le score tout en
 *     étant en cause.
 *
 * La fermeture automatique ignorait cette distinction : deux capitaines qui
 * renvoyaient le même score refermaient l'enquête du staff et finalisaient le
 * match. Purger les reports à l'ouverture n'y suffisait pas (les deux peuvent
 * renvoyer) et aurait effacé ce que le staff a besoin de lire. D'où la règle :
 * une dispute staff ne se referme QUE par une décision staff.
 */
export function isStaffOpenedDispute(match: {
  status: string | null | undefined;
  dispute_opened_by?: string | null;
}): boolean {
  return match.status === 'disputed' && !!match.dispute_opened_by;
}

/** Message lisible tel quel, sur le site comme sur Discord. */
export const DISPUTE_UNDER_STAFF_REVIEW_MESSAGE =
  "Ce match est en cours d'examen par le staff : ton report est enregistré, mais c'est le staff qui fixera le résultat.";
