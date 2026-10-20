// config/library/decor.ts — le DÉCOR qu'une joueuse peut choisir pour son
// appartement, et le gabarit de l'appartement (lots 4 et 12 de
// docs/PLAN-womens-library.md, conference-website).
//
// LA LISTE EST ICI, ET NULLE PART AILLEURS. `PATCH /api/player/library/
// apartment` refuse une valeur absente d'ici (400 `decor_invalid`), et le site
// lit cette même liste (copie synchronisée) pour proposer ses choix. Les noms
// sont ceux des sprites du pipeline graphique (`tools/library-assets/`, section
// `decor` du manifeste) : un sol renommé là-bas se renomme ici, en même temps.
// Une valeur déjà enregistrée qui sortirait de la liste est lue comme la
// valeur par défaut (`resolveApartmentDecor`) : jamais une salle sans sol.
// On AJOUTE des valeurs, on n'en renomme ni n'en retire jamais une : des
// appartements enregistrés, le hall et la salle de lecture s'en servent.
//
//   - `floor`  : le motif du sol (sprites `floor_<nom>`).
//   - `finish` : l'habillage des deux murs du fond (lot 12) — peinture,
//     lambris, boiseries, briques, béton, papiers peints. C'est le nom d'un
//     STYLE de mur du manifeste (`walls.<nom>`) ; `library` est celui du lot 3.
//   - `window` : le style des fenêtres, `none` = aucune. Variante de mur
//     `window` (classique, lot 3) ou `window_<style>` (`libraryWindowVariant`).
//   - `door`   : le style de la porte, `none` = aucune. Variante `door`
//     (classique) ou `door_<style>` (`libraryDoorVariant`).
//   - `wall`   : HISTORIQUE (lot 4) — `window` dès qu'il y a des fenêtres,
//     `plain` sinon. Toujours DÉDUIT de `window` à la lecture comme à
//     l'écriture ; un client du lot 4 qui n'envoie que `wall` marche encore
//     (`window` = fenêtres classiques, `plain` = aucune fenêtre).
//
// COMPATIBILITÉ : un décor enregistré au lot 4 (`{ floor, wall }`) se lit à
// l'identique — murs `library`, fenêtres classiques si `wall: 'window'`, pas
// de porte. Les nouveaux champs sont FACULTATIFS dans `LibraryApartmentDecor`
// (un décor écrit en code, comme celui des QG, peut n'en donner que deux) ;
// `resolveApartmentDecor` rend toujours le décor COMPLET.
//
// GRATUIT (v1) : ni prix ni possession ici. Un décor payant demanderait une
// table de possession (plan, lot 12) ; rien ne la prépare encore.
//
// OÙ SE POSENT PORTE ET FENÊTRES (`apartmentOpenings`) : sur les deux murs du
// fond, dans leur ÉPAISSEUR (derrière les plans gx = 0 et gy = 0). Elles
// n'occupent aucune case du sol : la pose des meubles (bornes, collisions,
// décor mural) ne change pas, et un meuble déjà posé reste valable.
//   - La porte (2 cases) va sur le mur GAUCHE (le long de gy), une case avant
//     son bout avant : l'entrée naturelle de la pièce.
//   - Les fenêtres (2 cases) gardent le rythme du lot 4 sur les deux murs :
//     à partir de la case 1, tous les 4 cases, sans toucher le bout du mur.
//     Une fenêtre qui chevaucherait la porte est retirée.
//
// Module PUR (aucun import) : il est recopié tel quel dans le site.

export const LIBRARY_FLOORS = [
  // Lot 4.
  'parquet',
  'carpet',
  'marble',
  'tiles',
  // Lot 12.
  'oak',
  'dark_planks',
  'parquet_diagonal',
  'parquet_strip',
  'terrazzo',
  'slate',
  'concrete',
  'tatami',
  'brick',
  'carpet_blue',
  'carpet_rose',
] as const;
export type LibraryFloor = (typeof LIBRARY_FLOORS)[number];

/** Historique (lot 4) : déduit de `window`. */
export const LIBRARY_WALLS = ['plain', 'window'] as const;
export type LibraryWall = (typeof LIBRARY_WALLS)[number];

export const LIBRARY_WALL_FINISHES = [
  'library',
  'plaster',
  'sage',
  'blush',
  'navy',
  'oak_panels',
  'walnut_panels',
  'boards',
  'brick',
  'brick_white',
  'concrete',
  'paper_stripes',
  'paper_trellis',
  'paper_floral',
  'paper_deco',
  'esport',
] as const;
export type LibraryWallFinish = (typeof LIBRARY_WALL_FINISHES)[number];

export const LIBRARY_WINDOWS = [
  'none',
  'classic',
  'arched',
  'round',
  'loft',
  'greenhouse',
] as const;
export type LibraryWindow = (typeof LIBRARY_WINDOWS)[number];

export const LIBRARY_DOORS = [
  'none',
  'classic',
  'glazed',
  'modern',
  'arched',
] as const;
export type LibraryDoor = (typeof LIBRARY_DOORS)[number];

/** Le décor tel qu'il s'enregistre et voyage (les champs du lot 12 sont facultatifs). */
export type LibraryApartmentDecor = {
  floor: LibraryFloor;
  wall: LibraryWall;
  finish?: LibraryWallFinish;
  window?: LibraryWindow;
  door?: LibraryDoor;
};

/** Le décor COMPLET, celui que rend `resolveApartmentDecor`. */
export type LibraryResolvedDecor = Required<LibraryApartmentDecor>;

/** Les champs qu'une joueuse choisit (`wall` en est déduit). */
export type LibraryDecorChoice = Omit<LibraryResolvedDecor, 'wall'>;

/** Le décor d'un appartement neuf : celui du lot 4, sans fenêtre ni porte. */
export const DEFAULT_APARTMENT_DECOR: LibraryResolvedDecor = {
  floor: 'parquet',
  wall: 'plain',
  finish: 'library',
  window: 'none',
  door: 'none',
};

/** Les fenêtres d'un décor du lot 4 enregistré avec `wall: 'window'`. */
export const LEGACY_WINDOW: LibraryWindow = 'classic';

/**
 * Ambiances : un décor complet par set du grand catalogue (lot 11). Un
 * raccourci de l'interface, pas un paquet : chaque champ reste libre.
 */
export const LIBRARY_DECOR_THEMES = {
  library: {
    floor: 'parquet',
    finish: 'walnut_panels',
    window: 'arched',
    door: 'classic',
  },
  cosy: {
    floor: 'oak',
    finish: 'paper_floral',
    window: 'classic',
    door: 'glazed',
  },
  esport: {
    floor: 'concrete',
    finish: 'esport',
    window: 'loft',
    door: 'modern',
  },
  winter_garden: {
    floor: 'slate',
    finish: 'paper_trellis',
    window: 'greenhouse',
    door: 'glazed',
  },
} as const satisfies Record<string, LibraryDecorChoice>;
export type LibraryDecorTheme = keyof typeof LIBRARY_DECOR_THEMES;
export const LIBRARY_DECOR_THEME_KEYS = Object.keys(
  LIBRARY_DECOR_THEMES
) as LibraryDecorTheme[];

/**
 * Le gabarit d'un appartement, en cases de 0,5 m : 14 × 12 cases = 7 × 6 m.
 * Fixé à la création ; un agrandissement se fera par une migration de taille,
 * jamais en silence (les meubles posés y tiennent toujours).
 */
export const LIBRARY_APARTMENT_SIZE = { width: 14, depth: 12 } as const;

const FLOORS: ReadonlySet<string> = new Set(LIBRARY_FLOORS);
const WALLS: ReadonlySet<string> = new Set(LIBRARY_WALLS);
const FINISHES: ReadonlySet<string> = new Set(LIBRARY_WALL_FINISHES);
const WINDOWS: ReadonlySet<string> = new Set(LIBRARY_WINDOWS);
const DOORS: ReadonlySet<string> = new Set(LIBRARY_DOORS);

export function isLibraryFloor(value: unknown): value is LibraryFloor {
  return typeof value === 'string' && FLOORS.has(value);
}

export function isLibraryWall(value: unknown): value is LibraryWall {
  return typeof value === 'string' && WALLS.has(value);
}

export function isLibraryWallFinish(
  value: unknown
): value is LibraryWallFinish {
  return typeof value === 'string' && FINISHES.has(value);
}

export function isLibraryWindow(value: unknown): value is LibraryWindow {
  return typeof value === 'string' && WINDOWS.has(value);
}

export function isLibraryDoor(value: unknown): value is LibraryDoor {
  return typeof value === 'string' && DOORS.has(value);
}

/** `wall` (lot 4) déduit des fenêtres. */
export function libraryWallOf(window: LibraryWindow): LibraryWall {
  return window === 'none' ? 'plain' : 'window';
}

/** Variante de mur du manifeste d'un style de fenêtres (null = aucune). */
export function libraryWindowVariant(window: LibraryWindow): string | null {
  if (window === 'none') return null;
  return window === 'classic' ? 'window' : `window_${window}`;
}

/** Variante de mur du manifeste d'un style de porte (null = aucune). */
export function libraryDoorVariant(door: LibraryDoor): string | null {
  if (door === 'none') return null;
  return door === 'classic' ? 'door' : `door_${door}`;
}

/** Toutes les variantes de mur dont un style a besoin (sprites du manifeste). */
export function libraryWallVariants(): string[] {
  const out = ['plain'];
  for (const w of LIBRARY_WINDOWS) {
    const v = libraryWindowVariant(w);
    if (v) out.push(v);
  }
  for (const d of LIBRARY_DOORS) {
    const v = libraryDoorVariant(d);
    if (v) out.push(v);
  }
  return out;
}

/**
 * Le décor ENREGISTRÉ (un objet jsonb libre) lu comme un décor valable : chaque
 * valeur inconnue (absente, d'un autre type, sortie de la liste) retombe sur
 * celle par défaut. Les fenêtres viennent de `window`, sinon du `wall` du
 * lot 4 ; `wall` en est toujours déduit.
 */
export function resolveApartmentDecor(raw: unknown): LibraryResolvedDecor {
  const obj =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  let window: LibraryWindow = DEFAULT_APARTMENT_DECOR.window;
  if (isLibraryWindow(obj.window)) window = obj.window;
  else if (obj.wall === 'window') window = LEGACY_WINDOW;
  return {
    floor: isLibraryFloor(obj.floor)
      ? obj.floor
      : DEFAULT_APARTMENT_DECOR.floor,
    wall: libraryWallOf(window),
    finish: isLibraryWallFinish(obj.finish)
      ? obj.finish
      : DEFAULT_APARTMENT_DECOR.finish,
    window,
    door: isLibraryDoor(obj.door) ? obj.door : DEFAULT_APARTMENT_DECOR.door,
  };
}

/** Un décor demandé (`PATCH apartment`) : chaque champ est facultatif. */
export type LibraryDecorInput = {
  floor?: string;
  wall?: string;
  finish?: string;
  window?: string;
  door?: string;
};

/** Ce qui fait refuser un décor demandé : un champ hors liste, ou `wall` et `window` qui se contredisent. */
export type LibraryDecorProblem =
  | 'floor'
  | 'wall'
  | 'finish'
  | 'window'
  | 'door'
  | 'wall_window';

/** Le premier problème d'un décor demandé, ou null s'il est valable. */
export function libraryDecorProblem(
  input: LibraryDecorInput
): LibraryDecorProblem | null {
  if (input.floor !== undefined && !isLibraryFloor(input.floor)) return 'floor';
  if (input.wall !== undefined && !isLibraryWall(input.wall)) return 'wall';
  if (input.finish !== undefined && !isLibraryWallFinish(input.finish))
    return 'finish';
  if (input.window !== undefined && !isLibraryWindow(input.window))
    return 'window';
  if (input.door !== undefined && !isLibraryDoor(input.door)) return 'door';
  if (
    input.wall !== undefined &&
    input.window !== undefined &&
    input.wall !== libraryWallOf(input.window as LibraryWindow)
  )
    return 'wall_window';
  return null;
}

/**
 * Le décor après une demande VALABLE (`libraryDecorProblem` === null) : un
 * champ absent garde sa valeur. `wall` seul (client du lot 4) : `plain`
 * retire les fenêtres, `window` en pose (classiques) s'il n'y en avait pas.
 */
export function mergeApartmentDecor(
  current: LibraryResolvedDecor,
  input: LibraryDecorInput
): LibraryResolvedDecor {
  let window = current.window;
  if (isLibraryWindow(input.window)) window = input.window;
  else if (input.wall === 'plain') window = 'none';
  else if (input.wall === 'window' && current.window === 'none')
    window = LEGACY_WINDOW;
  return {
    floor: isLibraryFloor(input.floor) ? input.floor : current.floor,
    wall: libraryWallOf(window),
    finish: isLibraryWallFinish(input.finish) ? input.finish : current.finish,
    window,
    door: isLibraryDoor(input.door) ? input.door : current.door,
  };
}

export function sameApartmentDecor(
  a: LibraryResolvedDecor,
  b: LibraryResolvedDecor
): boolean {
  return (
    a.floor === b.floor &&
    a.wall === b.wall &&
    a.finish === b.finish &&
    a.window === b.window &&
    a.door === b.door
  );
}

/** Largeur (cases) d'une fenêtre ou d'une porte, et pas entre deux fenêtres. */
export const LIBRARY_OPENING_SPAN = 2;
export const LIBRARY_WINDOW_STEP = 4;

/** Une variante posée sur un mur, à partir de la case `at`. */
export type LibraryWallSlot = { at: number; variant: string };

/**
 * Porte et fenêtres d'une salle de `width` × `depth` cases (règle en tête de
 * fichier). `right` : le mur le long de gx (`at` = gx) ; `left` : le mur le
 * long de gy (`at` = gy).
 */
export function apartmentOpenings(
  width: number,
  depth: number,
  decor: Pick<LibraryResolvedDecor, 'window' | 'door'>
): { right: LibraryWallSlot[]; left: LibraryWallSlot[] } {
  const span = LIBRARY_OPENING_SPAN;
  const doorVariant = libraryDoorVariant(decor.door);
  const doorAt = depth - 1 - span;
  const door =
    doorVariant && doorAt >= 1 ? { at: doorAt, variant: doorVariant } : null;
  const windowVariant = libraryWindowVariant(decor.window);
  const windows = (length: number, blocked: LibraryWallSlot | null) => {
    const out: LibraryWallSlot[] = [];
    if (!windowVariant) return out;
    for (let at = 1; at + span <= length - 1; at += LIBRARY_WINDOW_STEP) {
      if (blocked && at < blocked.at + span && blocked.at < at + span) continue;
      out.push({ at, variant: windowVariant });
    }
    return out;
  };
  const left = windows(depth, door);
  if (door) {
    left.push(door);
    left.sort((a, b) => a.at - b.at);
  }
  return { right: windows(width, null), left };
}
