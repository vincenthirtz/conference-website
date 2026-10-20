// features/player/library/hall/spotRequests.ts — le pont VUE → PANNEAUX du
// hall (lot 7 de docs/PLAN-womens-library.md), comme celui de la Grande salle
// de lecture (`readingRoom/spotRequests.ts`).
//
// Un appui dans la vue sur une zone du hall (`layouts/hall.ts`,
// `HALL_HOTSPOTS`) appelle `requestHallSpot(id)` ; l'écran du hall
// (`ui/hall/HallExtras`) s'y abonne et ouvre le MÊME panneau que le bouton
// sous la scène (panneau d'annonces, appartements, QG) ou change de lieu.

import type { HallSpotId } from '../layouts/hall';

type SpotListener = (id: HallSpotId) => void;
const listeners = new Set<SpotListener>();

/** Demande l'ouverture d'une zone. Vrai si un écran l'a reçue. */
export function requestHallSpot(id: HallSpotId): boolean {
  if (listeners.size === 0) return false;
  for (const listener of [...listeners]) listener(id);
  return true;
}

/** S'abonne aux demandes ; rend la fonction de désabonnement. */
export function subscribeHallSpots(listener: SpotListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
