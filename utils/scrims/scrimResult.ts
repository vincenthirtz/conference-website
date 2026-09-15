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
  | { ok: false; error: string; status: number };

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

  const { error } = await supabaseAdmin
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
    .eq('tenant_id', tenantId);

  if (error) {
    logger.error('[scrimResult] apply error', error);
    return {
      ok: false,
      error: 'Enregistrement du résultat impossible.',
      status: 500,
    };
  }

  // Un scrim classé compte pour le classement des joueuses : on aligne son
  // miroir `matches` (cf. utils/scrims/ratedMatch.ts). Best-effort et attendu
  // — le rating doit être là quand la réponse revient, mais un échec ne remet
  // pas en cause un résultat déjà persisté.
  await syncScrimRatedMatch(tenantId, scrim.id);

  return { ok: true, status: 'completed', winnerTeamId };
}

/** Statuts qu'un report de capitaine ne peut plus faire basculer en litige. */
const CLOSED_FOR_DISPUTE = ['completed', 'cancelled'] as const;

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
