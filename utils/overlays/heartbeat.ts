// utils/overlays/heartbeat.ts
//
// Règles pures du signal de présence des overlays (cf. la migration
// `overlay_heartbeats.sql`) : le nom d'une source, la cadence, et quand une
// source est considérée comme affichée.

/** Motif d'un nom de source — le même que le CHECK de la table. */
export const OVERLAY_SOURCE_RE = /^[A-Za-z0-9:_-]{1,80}$/;

/** Cadence du signal envoyé par chaque overlay. */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Au-delà, la source n'est plus « affichée » : deux signaux et demi manqués.
 * Une seule absence (un réseau qui tousse) ne doit pas la faire passer pour
 * éteinte ; une OBS fermée doit l'être en moins d'une minute et demie.
 */
export const HEARTBEAT_STALE_MS = 75_000;

export function isOverlaySource(value: unknown): value is string {
  return typeof value === 'string' && OVERLAY_SOURCE_RE.test(value);
}

/** Une source vue il y a moins de `HEARTBEAT_STALE_MS` est affichée. */
export function isOverlayLive(
  lastSeenAt: string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!lastSeenAt) return false;
  const t = Date.parse(lastSeenAt);
  return Number.isFinite(t) && now - t < HEARTBEAT_STALE_MS;
}
