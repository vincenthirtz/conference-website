// utils/home/matchdayToday.ts
//
// UN JOUR DE MATCH, VU PAR LA PAGE D'ACCUEIL : la journée annoncée se joue-t-
// elle aujourd'hui, est-ce une journée de finales, quel coup d'envoi viser.
//
// POURQUOI UN MODULE À PART. `pages/index.tsx` s'en sert AU RENDU, donc côté
// client : ces règles ne peuvent pas vivre dans `loadNextMatchday`, qui tire
// `supabaseAdmin` — un module serveur dans le bundle de l'accueil (garde-fou
// `scripts/bundle-budget.mjs`, rouge le 23/10/2026). Ici, rien que l'horloge
// de Paris et un type.

import type { HomeMatchday } from '@/utils/home/loadNextMatchday';
import { getWallClockParts, SITE_TIMEZONE } from '@/utils/timezone';

/**
 * La journée annoncée, si elle se joue AUJOURD'HUI (heure de Paris) ; `null`
 * sinon. Un jour de match, l'accueil le dit avant tout le reste : les affiches
 * passent devant l'encart d'événement, le hero vise le prochain coup d'envoi.
 * Dès que la journée est jouée, `selectNextMatchdays` ne l'annonce plus et
 * l'accueil reprend son ordre habituel, sans qu'il faille y penser. PURE.
 */
export function matchdayToday(
  matchdays: HomeMatchday[],
  now: Date
): HomeMatchday | null {
  const day = matchdays[0];
  if (!day) return null;
  return day.date === getWallClockParts(now, SITE_TIMEZONE).date ? day : null;
}

/** Journée de finales : toutes ses affiches sont hors phase. PURE. */
export function isFinalsDay(day: HomeMatchday): boolean {
  return day.matches.length > 0 && day.matches.every((m) => m.outOfStage);
}

/**
 * Le prochain coup d'envoi encore à venir de la journée (ISO), ou `null` quand
 * tout a commencé. Un match en retard sur son horaire ne compte plus : le
 * décompte viserait une heure passée. PURE.
 */
export function nextKickoff(day: HomeMatchday, now: Date): string | null {
  const at = now.getTime();
  return (
    day.matches.find(
      (m) => m.status === 'pending' && new Date(m.scheduledAt).getTime() > at
    )?.scheduledAt ?? null
  );
}
