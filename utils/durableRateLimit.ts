// utils/durableRateLimit.ts
//
// Limiteur de débit DURABLE (cross-instance) adossé à Postgres, en complément
// du limiteur en mémoire de `utils/rateLimit.ts`.
//
// Pourquoi : le `Map` en mémoire de `applyRateLimit` est per-process. En
// multi-instance (fonctions Netlify), chaque instance a son propre compteur →
// un client peut dépasser N fois la limite (N = nb d'instances). Ce module
// pousse le comptage dans Postgres via un RPC atomique partagé par toutes les
// instances.
//
// Posture : FAIL-OPEN. Le limiteur durable est une défense en profondeur, pas
// un point de défaillance. Si le RPC est absent (migration pas encore appliquée)
// ou erre (DB indisponible), on AUTORISE la requête — jamais on ne casse un
// endpoint public à cause du limiteur. Le limiteur mémoire reste en L1.
//
// Ne l'appliquer QUE sur les chemins anonymes cachés à l'edge (s-maxage), où
// l'origine est rarement touchée : le round-trip DB y est acceptable.

import type { NextApiRequest } from 'next';
import { supabaseAdmin } from './supabase';
import { getClientIp } from './rateLimit';
import { logger } from './logger';

/**
 * Clé client stable pour le bucket durable. Réutilise l'extraction d'IP
 * existante (`getClientIp`, qui privilégie les headers des proxies de confiance
 * puis valide le format). Le résultat est destiné à composer un bucket de la
 * forme `"<scope>:<clientKey>"`.
 */
export function clientKeyFromReq(req: NextApiRequest): string {
  return getClientIp(req);
}

/**
 * Consomme un jeton du bucket durable. Retourne `true` si la requête est
 * autorisée, `false` si elle doit être bloquée.
 *
 * Contrat RPC (créé côté database) :
 *   supabaseAdmin.rpc('consume_rate_limit', {
 *     p_bucket: string, p_window_seconds: number, p_max: number
 *   }) → boolean  (true = autorisé, false = bloqué)
 *
 * FAIL-OPEN : toute erreur RPC (absent, DB down, réseau) → `true`. On ne
 * bloque QUE sur un `false` explicite renvoyé par le RPC.
 *
 * @param bucket        clé complète du bucket, ex. `"publicv1:tournaments:1.2.3.4"`
 * @param windowSeconds fenêtre glissante en secondes
 * @param max           nombre max de requêtes autorisées dans la fenêtre
 */
export async function consumeDurableRateLimit(
  bucket: string,
  windowSeconds: number,
  max: number
): Promise<boolean> {
  // Si le client admin n'est pas configuré (env sans service role), on ne peut
  // pas parler à la DB : fail-open silencieux.
  if (!supabaseAdmin) return true;

  try {
    const { data, error } = await supabaseAdmin.rpc('consume_rate_limit', {
      p_bucket: bucket,
      p_window_seconds: windowSeconds,
      p_max: max,
    });

    if (error) {
      // RPC absent (migration non appliquée) ou erreur DB → fail-open.
      logger.warn(
        `[durableRateLimit] RPC consume_rate_limit failed for bucket "${bucket}" — fail-open`,
        error.message ?? error
      );
      return true;
    }

    // On ne bloque que sur un `false` explicite. `null`/`undefined` (RPC non
    // encore déployé mais sans erreur, ou résultat inattendu) → fail-open.
    return data === false ? false : true;
  } catch (err) {
    logger.warn(
      `[durableRateLimit] unexpected error for bucket "${bucket}" — fail-open`,
      err
    );
    return true;
  }
}
