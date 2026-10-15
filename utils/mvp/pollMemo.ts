// utils/mvp/pollMemo.ts
//
// Dormance des lectures POLLÉES des scrutins MVP — équipes (`match_mvp_polls`)
// et public (`match_public_mvp_polls`).
//
// POURQUOI. Quatre lecteurs interrogeaient ces tables à intervalle fixe, jour
// et nuit, pour des scrutins qui n'existent que les soirs de match :
//   - le poller de clôture du bot (`GET /api/bot/v1/matches/mvp-due`, ~10 min) ;
//   - le badge d'alertes de l'admin et le tableau de bord (« votes MVP en
//     cours », pollé chaque minute tant qu'une page /admin est ouverte) ;
//   - la source OBS du vote du public (`readPublicMvpFeed`, toutes les 10 s
//     pendant un direct) ;
//   - le cron de clôture du vote du public (`/api/cron/mvp-public-close`, 5 min).
// Les réponses ne changent qu'à une ÉCRITURE de scrutin (ouverture, ancrage,
// candidates, dépouillement, clôture, gagnante saisie par le staff) — et toutes
// passent par ce processus, qui appelle `noteMvpPollWrite` /
// `notePublicMvpPollWrite`. Entre deux écritures, une échéance connue suffit.
//
// Une voix ne modifie pas la ligne du scrutin : elle n'invalide rien. Les
// mémos ne servent d'ailleurs qu'aux états « rien à faire / rien à l'écran »,
// où il n'y a pas de décompte à rafraîchir.
//
// Cf. `utils/dormancyMemo.ts` pour la génération et la fenêtre de sûreté.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { createDormancyMemo } from '@/utils/dormancyMemo';

/** Relecture de sûreté des mémos de scrutins (écriture hors processus). */
export const MVP_POLL_MEMO_SAFETY_MS = 15 * 60_000;

/**
 * Plus court pour la source OBS : un scrutin ouvert hors de ce processus (SQL,
 * déploiement en cours) doit apparaître à l'antenne en deux minutes au plus,
 * pas en quinze. Le direct ne dure que quelques heures : l'écart de coût est
 * négligeable.
 */
export const PUBLIC_FEED_EMPTY_SAFETY_MS = 2 * 60_000;

/* ------------------------------------------------------------------ */
/* Scrutins des équipes (`match_mvp_polls`)                            */
/* ------------------------------------------------------------------ */

/** tenantId → prochain `closes_at` (ms) d'un vote posté non clos, ou `null`. */
const mvpCloseMemo = createDormancyMemo<number | null>(MVP_POLL_MEMO_SAFETY_MS);
/** `${tenantId}:${tournamentId}` → nombre de scrutins sans gagnante. */
const unresolvedCountMemo = createDormancyMemo<number>(MVP_POLL_MEMO_SAFETY_MS);

/** Une ligne de `match_mvp_polls` a été créée, modifiée ou close. */
export function noteMvpPollWrite(): void {
  mvpCloseMemo.invalidate();
  unresolvedCountMemo.invalidate();
}

/**
 * Prochaine échéance (`closes_at`, ms) d'un vote d'équipes posté et non clos ;
 * `null` s'il n'y en a aucun ; `undefined` si la lecture échoue (l'appelant
 * fait alors comme avant, sans mémo).
 */
export async function nextMvpCloseMs(
  tenantId: string,
  nowMs: number = Date.now()
): Promise<number | null | undefined> {
  if (!supabaseAdmin) return undefined;
  const hit = mvpCloseMemo.get(tenantId, nowMs);
  if (hit) return hit.value;

  const ticket = mvpCloseMemo.ticket(nowMs);
  const { data, error } = await supabaseAdmin
    .from('match_mvp_polls')
    .select('closes_at')
    .eq('tenant_id', tenantId)
    .not('posted_at', 'is', null)
    .is('closed_at', null)
    .not('closes_at', 'is', null)
    .order('closes_at', { ascending: true })
    .limit(1);
  if (error) {
    logger.error('[mvp/pollMemo] prochaine clôture illisible', error);
    return undefined;
  }
  const first = (data ?? [])[0] as { closes_at?: string | null } | undefined;
  const parsed = first?.closes_at ? Date.parse(first.closes_at) : NaN;
  const next = Number.isFinite(parsed) ? parsed : null;
  mvpCloseMemo.set(tenantId, next, ticket);
  return next;
}

/**
 * Scrutins d'équipes SANS GAGNANTE d'un tournoi — le compteur « votes MVP en
 * cours » du badge d'alertes et du tableau de bord. MÊME requête qu'avant,
 * mémorisée : les deux chemins passent ici, la parité tient.
 *
 * Une lecture en erreur rend 0, comme avant, et n'est pas mémorisée.
 */
export async function countUnresolvedMvpPolls(
  tenantId: string,
  tournamentId: string,
  nowMs: number = Date.now()
): Promise<number> {
  if (!supabaseAdmin) return 0;
  const key = `${tenantId}:${tournamentId}`;
  const hit = unresolvedCountMemo.get(key, nowMs);
  if (hit) return hit.value;

  const ticket = unresolvedCountMemo.ticket(nowMs);
  const { data, error } = await supabaseAdmin
    .from('match_mvp_polls')
    .select('match_id, matches!inner(tournament_id)')
    .eq('tenant_id', tenantId)
    .is('winner_member_id', null)
    .eq('matches.tournament_id', tournamentId);
  if (error) {
    logger.error('[mvp/pollMemo] scrutins sans gagnante illisibles', error);
    return 0;
  }
  const count = (data ?? []).length;
  unresolvedCountMemo.set(key, count, ticket);
  return count;
}

/* ------------------------------------------------------------------ */
/* Scrutins du public (`match_public_mvp_polls`)                       */
/* ------------------------------------------------------------------ */

/**
 * tenantId → « aucun scrutin à l'écran » : ni ouvert, ni clos récemment. Cet
 * état ne change qu'à une écriture (un scrutin clos ne fait que vieillir).
 */
export const publicFeedEmptyMemo = createDormancyMemo<true>(
  PUBLIC_FEED_EMPTY_SAFETY_MS
);

/**
 * `'*'` → prochaine échéance EFFECTIVE (ms) d'un scrutin du public ouvert et non
 * clos, tous espaces confondus ; `null` s'il n'y en a aucun.
 */
export const publicCloseMemo = createDormancyMemo<number | null>(
  MVP_POLL_MEMO_SAFETY_MS
);

/** Une ligne de `match_public_mvp_polls` a été créée, modifiée ou close. */
export function notePublicMvpPollWrite(): void {
  publicFeedEmptyMemo.invalidate();
  publicCloseMemo.invalidate();
}
