// config/library/decor.ts — le DÉCOR qu'une joueuse peut choisir pour son
// appartement, et le gabarit de l'appartement (lot 4 de
// docs/PLAN-womens-library.md, conference-website).
//
// LA LISTE EST ICI, ET NULLE PART AILLEURS. `PATCH /api/player/library/
// apartment` refuse une valeur absente d'ici (400 `decor_invalid`), et le site
// lit cette même liste (copie synchronisée) pour proposer ses choix. Les noms
// sont ceux des sprites du pipeline graphique (`tools/library-assets/`, section
// `decor` du manifeste) : un sol renommé là-bas se renomme ici, en même temps.
// Une valeur déjà enregistrée qui sortirait de la liste est lue comme la
// valeur par défaut (`resolveApartmentDecor`) : jamais une salle sans sol.
//
//   - `floor` : le motif du sol (sprites `floor_<nom>`).
//   - `wall`  : l'habillage des deux murs du fond. `plain` = murs pleins ;
//     `window` = des fenêtres posées sur les murs. Le site traduit ce choix en
//     variantes de mur du manifeste ; la base n'en garde que le nom.
//
// Module PUR (aucun import) : il est recopié tel quel dans le site.

export const LIBRARY_FLOORS = ['parquet', 'carpet', 'marble', 'tiles'] as const;
export type LibraryFloor = (typeof LIBRARY_FLOORS)[number];

export const LIBRARY_WALLS = ['plain', 'window'] as const;
export type LibraryWall = (typeof LIBRARY_WALLS)[number];

export type LibraryApartmentDecor = { floor: LibraryFloor; wall: LibraryWall };

/** Le décor d'un appartement neuf. */
export const DEFAULT_APARTMENT_DECOR: LibraryApartmentDecor = {
  floor: 'parquet',
  wall: 'plain',
};

/**
 * Le gabarit d'un appartement, en cases de 0,5 m : 14 × 12 cases = 7 × 6 m.
 * Fixé à la création ; un agrandissement se fera par une migration de taille,
 * jamais en silence (les meubles posés y tiennent toujours).
 */
export const LIBRARY_APARTMENT_SIZE = { width: 14, depth: 12 } as const;

const FLOORS: ReadonlySet<string> = new Set(LIBRARY_FLOORS);
const WALLS: ReadonlySet<string> = new Set(LIBRARY_WALLS);

export function isLibraryFloor(value: unknown): value is LibraryFloor {
  return typeof value === 'string' && FLOORS.has(value);
}

export function isLibraryWall(value: unknown): value is LibraryWall {
  return typeof value === 'string' && WALLS.has(value);
}

/**
 * Le décor ENREGISTRÉ (un objet jsonb libre) lu comme un décor valable : chaque
 * valeur inconnue (absente, d'un autre type, sortie de la liste) retombe sur
 * celle par défaut.
 */
export function resolveApartmentDecor(raw: unknown): LibraryApartmentDecor {
  const obj =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    floor: isLibraryFloor(obj.floor)
      ? obj.floor
      : DEFAULT_APARTMENT_DECOR.floor,
    wall: isLibraryWall(obj.wall) ? obj.wall : DEFAULT_APARTMENT_DECOR.wall,
  };
}
