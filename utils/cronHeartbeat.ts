// utils/cronHeartbeat.ts
//
// Heartbeat des crons dans `site_settings`, avec un pas minimal d'écriture.
//
// POURQUOI. `draft-auto-pick` tourne chaque minute et `checkin-process` toutes
// les cinq : chacun réécrivait son heartbeat à CHAQUE passage, soit ~1 500
// upserts `site_settings` par jour pour une valeur que le dashboard ne lit
// qu'à la minute près, et dont le seuil d'alerte est de 60 minutes
// (buildTournamentDashboard : `cronMinutesSince > 60`). Une écriture toutes les
// 15 minutes garde l'affichage « il y a X min » cohérent et l'alerte juste —
// 15 < 60, un cron vivant ne peut pas passer pour mort.
//
// PORTÉE. Le throttle est en mémoire du process : une instance froide écrit
// toujours son premier passage. C'est voulu — mieux vaut une écriture de trop
// après un redéploiement qu'un heartbeat qui retarderait.

import { setSetting } from '@/utils/siteSettings';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';

/** Pas minimal entre deux écritures du même heartbeat (par instance). */
export const CRON_HEARTBEAT_MIN_INTERVAL_MS = 15 * 60_000;

const lastWriteByKey = new Map<string, number>();

/**
 * Écrit `key = now` pour le tenant par défaut si le dernier heartbeat écrit par
 * ce process a plus de `CRON_HEARTBEAT_MIN_INTERVAL_MS`. Retourne `true` si une
 * écriture a été tentée.
 *
 * `force` écrit sans regarder le throttle — pour un passage qui a réellement
 * agi, où l'horodatage exact a une valeur de diagnostic.
 */
export async function writeCronHeartbeat(
  key: string,
  description: string,
  opts: { force?: boolean; nowMs?: number } = {}
): Promise<boolean> {
  const now = opts.nowMs ?? Date.now();
  const last = lastWriteByKey.get(key);
  if (
    !opts.force &&
    last !== undefined &&
    now - last < CRON_HEARTBEAT_MIN_INTERVAL_MS
  ) {
    return false;
  }
  // Posé AVANT l'écriture : deux passages concurrents n'écrivent pas tous les
  // deux. Une écriture ratée est retentée au pas suivant (15 min), ce qui
  // reste sous le seuil d'alerte.
  lastWriteByKey.set(key, now);
  // Heartbeat rattaché au tenant par défaut (lot A8) : les crons ne sont pas
  // multi-tenant, et la clé primaire est `(tenant_id, key)`.
  await setSetting(key, new Date(now).toISOString(), {
    tenantId: DEFAULT_TENANT_ID,
    description,
  });
  return true;
}

/** Oublie les écritures mémorisées. Usage strictement test. */
export function __resetCronHeartbeatsForTests(): void {
  lastWriteByKey.clear();
}
