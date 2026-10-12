// utils/cronSingleFlight.ts
//
// Un seul passage à la fois par cron, DANS CE PROCESSUS.
//
// POURQUOI. Les fonctions planifiées Netlify appellent `/api/cron/*` avec un
// délai de 20 s, puis abandonnent. Sur un serveur Node PERSISTANT (le service
// conference-api), le handler, lui, continue : abandonner la requête ne
// l'arrête pas. Un passage lent peut donc encore tourner quand le suivant
// arrive (cron à la minute, au quart d'heure), ou quand quelqu'un relance à la
// main — deux passages qui lisent le même curseur émettent deux fois.
//
// CE QUE ÇA COUVRE, ET PAS PLUS. Un verrou en mémoire : il protège un
// processus unique (un conteneur), pas plusieurs répliques. Sur Netlify, une
// instance de fonction ne traite qu'une requête à la fois : le verrou n'y
// bloque jamais rien, le comportement est inchangé. Plusieurs répliques
// demanderaient un verrou en base (advisory lock), donc une migration.
//
// UN PASSAGE BLOQUÉ NE DOIT PAS ÉTEINDRE LE CRON POUR DE BON. Un appel réseau
// sans délai qui ne rend jamais la main garderait le verrou jusqu'au prochain
// redémarrage. Passé `staleAfterMs`, le verrou est considéré abandonné : le
// passage suivant le reprend, en le signalant fort.
//
// Placé APRÈS l'authentification dans chaque handler : une requête non
// authentifiée ne doit ni prendre le verrou, ni apprendre qu'un passage tourne.

import type { NextApiResponse } from 'next';
import { logger } from '@/utils/logger';

/** Au-delà, un verrou est présumé abandonné par un passage bloqué. */
export const DEFAULT_CRON_STALE_AFTER_MS = 15 * 60_000;

/** Corps renvoyé quand un passage précédent tourne encore (200 : rien à réessayer). */
export const CRON_IN_FLIGHT_BODY = {
  success: true,
  skipped: 'in_flight',
} as const;

const running = new Map<string, number>();

/**
 * Prend le verrou du cron `name`. Rend la fonction de libération, ou `null`
 * si un passage tourne déjà (et n'est pas périmé).
 */
export function tryEnterCron(
  name: string,
  staleAfterMs: number = DEFAULT_CRON_STALE_AFTER_MS
): (() => void) | null {
  const now = Date.now();
  const startedAt = running.get(name);
  if (startedAt !== undefined) {
    if (now - startedAt < staleAfterMs) return null;
    logger.error(
      '[cron/%s] verrou tenu depuis %d s — présumé abandonné, repris',
      name,
      Math.round((now - startedAt) / 1000)
    );
  }
  running.set(name, now);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    // Ne libère que SON verrou : un passage périmé qui finit enfin ne doit
    // pas ouvrir la porte pendant que son successeur tourne.
    if (running.get(name) === now) running.delete(name);
  };
}

/**
 * Exécute `run` sous le verrou du cron `name`, ou répond 200 `in_flight`
 * sans rien faire si un passage tourne déjà.
 */
export async function runCronSingleFlight(
  name: string,
  res: NextApiResponse,
  run: () => Promise<unknown>,
  staleAfterMs: number = DEFAULT_CRON_STALE_AFTER_MS
): Promise<void> {
  const release = tryEnterCron(name, staleAfterMs);
  if (!release) {
    logger.warn('[cron/%s] passage précédent encore en cours — ignoré', name);
    res.status(200).json(CRON_IN_FLIGHT_BODY);
    return;
  }
  try {
    await run();
  } finally {
    release();
  }
}

/** Réservé aux tests : vide tous les verrous. */
export function __resetCronSingleFlightForTests(): void {
  running.clear();
}
