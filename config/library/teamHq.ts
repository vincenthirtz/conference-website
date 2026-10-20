// config/library/teamHq.ts — le gabarit des QG d'équipe de la Women's Library
// (lot 9 de docs/PLAN-womens-library.md, conference-website).
//
// UN QG PAR ÉQUIPE, CRÉÉ À LA PREMIÈRE VISITE (`POST /api/player/library/
// team-hq`) : ses dimensions et son décor viennent d'ici, et nulle part
// ailleurs. Plus grand qu'un appartement (14 × 12) : toute l'équipe y tient,
// avec les meubles que chacune prête.
//
// Module PUR (un seul import, de type) : il est recopié tel quel dans le site,
// qui y lit les bornes de ses formulaires (déplacer un meuble prêté).

import type { LibraryApartmentDecor } from './decor';

/**
 * Le gabarit d'un QG, en cases de 0,5 m : 20 × 16 cases = 10 × 8 m. Fixé à la
 * création ; un agrandissement se fera par une migration de taille, jamais en
 * silence (les meubles posés y tiennent toujours).
 */
export const LIBRARY_TEAM_HQ_SIZE = { width: 20, depth: 16 } as const;

/** Le décor d'un QG neuf : moquette et fenêtres, une salle commune. */
export const DEFAULT_TEAM_HQ_DECOR: LibraryApartmentDecor = {
  floor: 'carpet',
  wall: 'window',
};

/**
 * Meubles posés au plus dans un QG, toutes prêteuses confondues. La même borne
 * que l'enregistrement d'un appartement (`LIBRARY_ROOM_ITEMS_MAX`) : l'entrée
 * dans une salle en lit 500 au plus, un QG n'en dépasse jamais la lecture.
 */
export const LIBRARY_TEAM_HQ_ITEMS_MAX = 300;

/** Équipes listées au plus par `GET /api/player/library/team-hq`. */
export const LIBRARY_TEAM_HQ_LIST_MAX = 20;
