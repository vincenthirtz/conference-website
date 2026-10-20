// features/player/library/readingRoom/spotRequests.ts — le pont VUE →
// PANNEAUX de la Grande salle de lecture (lot 8 de
// docs/PLAN-womens-library.md).
//
// Un appui dans la vue sur un rayonnage ou sur le guichet (points déclarés
// dans `./hotspots.ts`, rendus par le moteur du lot 7) appelle
// `requestReadingRoomSpot(id)` ; l'écran de la salle
// (`ui/readingRoom/ReadingRoomExtras`) s'y abonne et ouvre le MÊME panneau
// que le bouton sous la scène.
//
// Séparé de `./hotspots.ts` pour que l'écran n'embarque ni le décor ni le
// catalogue. Rien ne part sur le réseau : ouvrir un rayonnage ne se voit pas
// et ne se compte pas.

import type { ReadingRoomShelfId } from './shelves';

export type ReadingRoomSpotId = ReadingRoomShelfId | 'guichet';

type SpotListener = (id: ReadingRoomSpotId) => void;
const listeners = new Set<SpotListener>();

/**
 * Demande l'ouverture d'un point. Vrai si un écran l'a reçue ; faux hors de
 * la salle de lecture (personne n'écoute).
 */
export function requestReadingRoomSpot(id: ReadingRoomSpotId): boolean {
  if (listeners.size === 0) return false;
  for (const listener of [...listeners]) listener(id);
  return true;
}

/** S'abonne aux demandes ; rend la fonction de désabonnement. */
export function subscribeReadingRoomSpots(listener: SpotListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
