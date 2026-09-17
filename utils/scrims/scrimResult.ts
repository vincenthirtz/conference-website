// utils/scrims/scrimResult.ts
//
// Résultat d'un scrim : décision (pur) + application (I/O).
//
// Modèle décalqué des matchs de tournoi (`match_score_reports`) : ce sont les
// DEUX équipes qui valident, pas le staff.
//   * un seul report      -> on attend l'adversaire ;
//   * deux concordants    -> le scrim est clos ('completed') ;
//   * deux divergents     -> 'disputed', arbitrage humain.
//
// Recours staff : `applyStaffScrimResult` (route
// `POST /api/admin/scrims/[scrimId]/result`) fixe le score sans reports — scrim
// contre une équipe extérieure sans capitaine, litige tranché, correction.
//
// Pourquoi ne pas réutiliser `applyMatchScore` : un scrim n'a pas de bracket à
// propager, pas de tournoi, pas de check-in — la moitié de ce que fait
// applyMatchScore n'a pas de sens ici, et l'autre moitié tient en 20 lignes.
// On garde donc deux chemins courts plutôt qu'un chemin long paramétré.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { syncScrimRatedMatch } from './ratedMatch';

export type ScrimReport = {
  team_side: 1 | 2;
  team1_score: number;
  team2_score: number;
};

/** Deux reports décrivent-ils le même résultat ? */
export function reportsAgree(a: ScrimReport, b: ScrimReport): boolean {
  return a.team1_score === b.team1_score && a.team2_score === b.team2_score;
}

/**
 * Vainqueur déduit des scores. `null` = match nul — un scrim nul est un
 * résultat parfaitement valide (et vaut 1 point au classement), à ne pas
 * confondre avec « pas encore rapporté » (scores NULL en base).
 */
export function winnerFromScores(
  team1Id: string | null,
  team2Id: string | null,
  team1Score: number,
  team2Score: number
): string | null {
  if (team1Score > team2Score) return team1Id;
  if (team2Score > team1Score) return team2Id;
  return null;
}

export type ApplyResult =
  | { ok: true; status: 'completed'; winnerTeamId: string | null }
  | { ok: false; error: string; status: number; code?: 'SCRIM_CLOSED' };

/**
 * Statuts qu'un report de capitaine ne peut plus faire basculer — ni en litige,
 * ni en clôture : un scrim clos ne se re-clôt pas, un scrim annulé non plus.
 */
const CLOSED_FOR_DISPUTE = ['completed', 'cancelled'] as const;

/**
 * Clôt un scrim sur un score validé par les deux camps.
 * Idempotent au sens où réappliquer le même score ne change rien d'observable.
 */
export async function applyScrimResult(
  tenantId: string,
  scrim: { id: string; team1_id: string | null; team2_id: string | null },
  team1Score: number,
  team2Score: number
): Promise<ApplyResult> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service indisponible.', status: 503 };
  }

  const winnerTeamId = winnerFromScores(
    scrim.team1_id,
    scrim.team2_id,
    team1Score,
    team2Score
  );

  // CONDITIONNELLE, comme `markScrimDisputed` : un scrim déjà clos ou ANNULÉ
  // ne se clôt pas. La route relit le statut avant d'appeler, mais entre sa
  // lecture et cette écriture le staff peut avoir annulé le scrim ; sans la
  // condition, l'accord des capitaines le re-clôturait — et le miroir noté
  // (rating Glicko, points de saison) comptait un scrim que le staff venait
  // d'écarter. `.select()` rend les lignes réellement modifiées : zéro = refus.
  const { data: closedRows, error } = await supabaseAdmin
    .from('scrims')
    .update({
      status: 'completed',
      team1_score: team1Score,
      team2_score: team2Score,
      winner_team_id: winnerTeamId,
      completed_at: new Date().toISOString(),
      // Une clôture par accord efface une éventuelle dispute précédente : les
      // deux équipes viennent de se mettre d'accord, la raison n'a plus lieu
      // d'être affichée.
      dispute_reason: null,
    })
    .eq('id', scrim.id)
    .eq('tenant_id', tenantId)
    .not('status', 'in', `(${CLOSED_FOR_DISPUTE.join(',')})`)
    .select('id');

  if (error) {
    logger.error('[scrimResult] apply error', error);
    return {
      ok: false,
      error: 'Enregistrement du résultat impossible.',
      status: 500,
    };
  }

  if (!Array.isArray(closedRows) || closedRows.length === 0) {
    // Rien d'écrit : le miroir n'est PAS resynchronisé — c'est tout l'objet.
    return {
      ok: false,
      error: 'Scrim clos : contacte le staff pour le modifier.',
      status: 409,
      code: 'SCRIM_CLOSED',
    };
  }

  // Un scrim classé compte pour le classement des joueuses : on aligne son
  // miroir `matches` (cf. utils/scrims/ratedMatch.ts). Best-effort et attendu
  // — le rating doit être là quand la réponse revient, mais un échec ne remet
  // pas en cause un résultat déjà persisté.
  await syncScrimRatedMatch(tenantId, scrim.id);

  return { ok: true, status: 'completed', winnerTeamId };
}

/**
 * Bascule un scrim en litige quand les deux reports divergent.
 *
 * CONDITIONNELLE : un scrim déjà clos (`completed`) ou annulé ne bascule pas.
 * La route relit le statut avant d'appeler, mais entre sa lecture et cette
 * écriture l'adversaire peut avoir clos le scrim ; sans la condition, un report
 * tardif rouvrirait un résultat validé — c'est la gâchette de la boucle de
 * récompenses infinies corrigée le 2026-09-15 (cf. la route de report).
 *
 * Rend `'disputed'` si la bascule a eu lieu (ou si le scrim était déjà en
 * litige), `'closed'` si le scrim était clos, `'error'` sur échec d'écriture.
 */
export async function markScrimDisputed(
  tenantId: string,
  scrimId: string,
  reason: string
): Promise<'disputed' | 'closed' | 'error'> {
  if (!supabaseAdmin) return 'error';
  const { data, error } = await supabaseAdmin
    .from('scrims')
    .update({ status: 'disputed', dispute_reason: reason })
    .eq('id', scrimId)
    .eq('tenant_id', tenantId)
    .not('status', 'in', `(${CLOSED_FOR_DISPUTE.join(',')})`)
    .select('id');
  if (error) {
    logger.error('[scrimResult] dispute error', error);
    return 'error';
  }
  if (!Array.isArray(data) || data.length === 0) return 'closed';
  // Un scrim en litige n'est plus un résultat : son miroir noté est retiré du
  // classement, sinon le classement garderait les points d'une partie contestée.
  await syncScrimRatedMatch(tenantId, scrimId);
  return 'disputed';
}

export type StaffApplyResult =
  | {
      ok: true;
      status: 'completed';
      winnerTeamId: string | null;
      /** La ligne `scrims` telle qu'écrite (sert à l'event et à la réponse). */
      scrim: Record<string, unknown>;
    }
  | { ok: false; error: string; status: number; code?: 'SCRIM_CHANGED' };

/**
 * Statuts depuis lesquels le STAFF peut fixer un score. Différence assumée avec
 * `applyScrimResult` : `completed` en fait partie — c'est une correction, et le
 * staff est précisément le recours prévu contre un résultat validé à tort
 * (cf. l'en-tête de la route de report). `cancelled` n'en fait pas partie : un
 * scrim annulé se réinstaure d'abord (PATCH de statut), il ne ressuscite pas
 * par la bande d'un score.
 */
export const STAFF_SCRIM_RESULT_STATUSES: ReadonlySet<string> = new Set([
  'draft',
  'scheduled',
  'running',
  'disputed',
  'completed',
]);

/**
 * Le staff fixe (ou corrige) le score final d'un scrim, sans reports de
 * capitaines : c'est le seul chemin pour un scrim contre une équipe EXTÉRIEURE
 * (sans capitaine, cf. utils/teams/externalScrimTeam.ts) et pour trancher un
 * litige avec un score.
 *
 * CONCURRENCE OPTIMISTE, comme le PATCH admin : l'écriture n'a lieu que si le
 * scrim est TOUJOURS dans le statut lu par la route (`expectedStatus`) et hors
 * corbeille. Sinon un accord des capitaines, une annulation ou une suppression
 * arrivés entre-temps seraient écrasés par une décision prise sur un état
 * périmé → 409 `SCRIM_CHANGED`, rien d'écrit, miroir noté non touché.
 *
 * RÉCOMPENSES : rien à faire ici, et c'est voulu. Le paiement passe par
 * `syncScrimRatedMatch` → `applyMatchRatingIncremental` → `grantVictoryRewards`,
 * clé `scrim:<scrimId>` (correctif du 2026-09-15) : une correction rejoue la
 * synchro sans rien verser deux fois. Et un miroir déjà noté (historique de
 * rating présent) n'est pas re-noté — une correction qui CHANGE le vainqueur ne
 * réattribue donc ni points ni récompenses : le classement se répare par le
 * rebuild (`/api/admin/ratings/rebuild`), les gains déjà versés ne sont pas
 * repris.
 */
export async function applyStaffScrimResult(
  tenantId: string,
  scrim: { id: string; team1_id: string | null; team2_id: string | null },
  expectedStatus: string,
  team1Score: number,
  team2Score: number
): Promise<StaffApplyResult> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service indisponible.', status: 503 };
  }

  const winnerTeamId = winnerFromScores(
    scrim.team1_id,
    scrim.team2_id,
    team1Score,
    team2Score
  );

  const { data: written, error } = await supabaseAdmin
    .from('scrims')
    .update({
      status: 'completed',
      team1_score: team1Score,
      team2_score: team2Score,
      winner_team_id: winnerTeamId,
      completed_at: new Date().toISOString(),
      // Le score staff tranche : la raison d'un litige n'a plus lieu d'être
      // affichée (elle reste au journal staff, dans le `before` de la route).
      dispute_reason: null,
    })
    .eq('id', scrim.id)
    .eq('tenant_id', tenantId)
    .eq('status', expectedStatus)
    .is('deleted_at', null)
    .select('*');

  if (error) {
    logger.error('[scrimResult] staff apply error', error);
    return {
      ok: false,
      error: 'Enregistrement du résultat impossible.',
      status: 500,
    };
  }

  const rows = Array.isArray(written) ? written : [];
  if (rows.length === 0) {
    return {
      ok: false,
      error:
        'Le scrim a changé entre-temps (résultat déclaré ou statut modifié) : recharge-le avant de saisir le résultat.',
      status: 409,
      code: 'SCRIM_CHANGED',
    };
  }

  // Même alignement du miroir noté qu'une clôture par accord (idempotent).
  await syncScrimRatedMatch(tenantId, scrim.id);

  return {
    ok: true,
    status: 'completed',
    winnerTeamId,
    scrim: rows[0] as Record<string, unknown>,
  };
}
