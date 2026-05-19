// utils/stages/stageLockStatus.ts
//
// Détection de l'état "verrouillé" d'un stage : dès qu'au moins un de ses
// matches a quitté le statut `pending`, certaines mutations (notamment
// settings.match_format) ne devraient plus être autorisées — sinon on peut
// changer le format d'un match déjà joué/en cours, ce qui rendrait
// l'historique incohérent (un BO3 finished re-passé en BO5, etc.).
//
// "Locked statuses" couvre tout sauf `pending` et `cancelled` : un match
// annulé peut être réactivé en pending, mais un match ongoing/finished/
// walkover/disputed/postponed représente un engagement.

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';

const LOCKED_MATCH_STATUSES = [
  'ongoing',
  'finished',
  'walkover',
  'disputed',
  'postponed',
] as const;

export type StageLockSnapshot = {
  /** Au moins un match du stage a quitté pending/cancelled. */
  locked: boolean;
  /** Nombre exact de matches "engageants" (utile pour message d'erreur). */
  lockedMatchCount: number;
};

/**
 * Lit le compte de matches engagés d'un stage. Best-effort : en cas
 * d'erreur DB, retourne `locked: false` pour ne pas bloquer une mutation
 * légitime à cause d'un hiccup réseau (le caller doit gérer l'erreur
 * primaire séparément).
 */
export async function getStageLockSnapshot(
  stageId: string
): Promise<StageLockSnapshot> {
  if (!supabaseAdmin) {
    return { locked: false, lockedMatchCount: 0 };
  }
  const { count, error } = await supabaseAdmin
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('stage_id', stageId)
    .in('status', LOCKED_MATCH_STATUSES as unknown as string[]);
  if (error) {
    logger.error('[stageLockStatus] count error', error);
    return { locked: false, lockedMatchCount: 0 };
  }
  const n = count ?? 0;
  return { locked: n > 0, lockedMatchCount: n };
}
