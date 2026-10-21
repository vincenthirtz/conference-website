// features/player/library/halloween/event.ts — LA FENÊTRE de l'événement
// d'Halloween dans la Library (lot 16 de docs/PLAN-womens-library.md).
//
// Le fantôme, la citrouille et l'inscription du hall ne sont là que tant que
// l'événement est à l'affiche (`config/homeEventSpotlight.ts`, le même encart
// que l'accueil et l'espace joueuse) : ils partent seuls après `visibleUntil`.
// Trois conditions :
//   - l'encart est à l'affiche (`isHomeEventVisible`) ;
//   - l'inscription est individuelle, regroupée en équipes (`pooledTeams`) :
//     le seul parcours que l'API accepte en un clic ;
//   - c'est bien un événement d'Halloween (slug `halloween-…`) : le jour où
//     l'encart pousse un autre événement, le fantôme ne le promeut pas.
//
// Module PUR, sans horloge (l'instant est un paramètre) et sans import du
// moteur : l'écran du hall, les zones et le décor le lisent.

import {
  type HomeEventSpotlight,
  homeEventSpotlight,
  isHomeEventVisible,
} from '@/config/homeEventSpotlight';

/** Un événement d'Halloween, inscription en un clic possible. */
export type HalloweenEvent = HomeEventSpotlight & { pooledTeams: true };

const HALLOWEEN_SLUG_RE = /^halloween-/;

/**
 * L'événement d'Halloween à l'affiche à `nowMs`, ou null (pas d'encart,
 * passé `visibleUntil`, pas regroupé, ou un autre événement).
 */
export function halloweenEventAt(
  nowMs: number,
  event: HomeEventSpotlight | null = homeEventSpotlight
): HalloweenEvent | null {
  if (!Number.isFinite(nowMs)) return null;
  if (!isHomeEventVisible(event, new Date(nowMs).toISOString())) return null;
  if (event.pooledTeams !== true) return null;
  if (!HALLOWEEN_SLUG_RE.test(event.tournamentSlug)) return null;
  return event as HalloweenEvent;
}

/** Le fantôme et la citrouille sont-ils dans le hall à `nowMs` ? */
export function isHalloweenActive(
  nowMs: number,
  event: HomeEventSpotlight | null = homeEventSpotlight
): boolean {
  return halloweenEventAt(nowMs, event) !== null;
}

/** La page d'inscription (le repli quand le clic seul ne suffit pas). */
export function halloweenSignupHref(event: HomeEventSpotlight): string {
  return `/tournament/${event.tournamentSlug}/inscription-solo`;
}

/** La fiche de l'événement. */
export function halloweenEventHref(event: HomeEventSpotlight): string {
  return `/tournament/${event.tournamentSlug}`;
}
