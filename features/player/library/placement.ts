// features/player/library/placement.ts — LA GÉOMÉTRIE du placement des
// meubles (lot 4 de docs/PLAN-womens-library.md, conference-website).
//
// Module PUR (aucun import), recopié tel quel dans le site : l'API s'en sert
// pour REFUSER un placement (`PUT /api/player/library/apartment/items`), le
// site pour MONTRER, avant l'envoi, si un meuble tient là où on le pose. Les
// deux disent donc la même chose, à la case près.
//
// CONVENTIONS — celles du moteur du site (`engine/room.ts`) :
//   - une case fait 0,5 m ; `gx` court le long de la largeur de la salle
//     (`width`), `gy` le long de sa profondeur (`depth`) ;
//   - un meuble posé a une ORIGINE (gx, gy) = le coin minimal de son
//     empreinte une fois tournée ; il couvre [gx, gx + w[ × [gy, gy + d[ ;
//   - `rotation` = quart de tour horaire, 0 à 3 ; aux rotations IMPAIRES,
//     l'empreinte {w, d} devient {w: d, d: w}.
//
// CALQUES. Un tapis (`floor`) se glisse sous un fauteuil ; un cadre (`wall`)
// s'accroche au-dessus d'une commode. Les chevauchements ne se comptent donc
// qu'ENTRE meubles d'un même calque, comme dans le moteur. Un meuble mural
// doit en plus avoir le dos contre un mur du fond (rotation 0 le long du mur
// `gy = 0`, rotation 1 le long du mur `gx = 0`) : ailleurs, il est hors de la
// zone où il peut aller — `out_of_bounds`.
//
// PAS D'EMPILEMENT EN V1 : `stackable` (un vase sur une table) n'ouvre encore
// aucun chevauchement entre objets.

export type PlacementRotation = 0 | 1 | 2 | 3;

export type PlacementLayer = 'object' | 'floor' | 'wall';

/** Empreinte au sol à la rotation 0, en cases. */
export type PlacementFootprint = { w: number; d: number };

/** Ce que la géométrie doit savoir d'un meuble. */
export type PlacementSpec = {
  footprint: PlacementFootprint;
  layer: PlacementLayer;
};

/** Dimensions d'une salle, en cases. */
export type PlacementRoom = { width: number; depth: number };

/** Un meuble posé : `id` = sa ligne d'inventaire. */
export type Placement = {
  id: string;
  gx: number;
  gy: number;
  rotation: number;
};

/** Rectangle couvert, en cases ; bornes max EXCLUES. */
export type PlacementRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type GeometryReason = 'out_of_bounds' | 'overlap';

export type GeometryIssue = { id: string; reason: GeometryReason };

export const PLACEMENT_ROTATIONS: readonly PlacementRotation[] = [0, 1, 2, 3];

export function isPlacementRotation(
  value: unknown
): value is PlacementRotation {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

/** Empreinte une fois tournée : les rotations impaires échangent w et d. */
export function rotatedFootprint(
  footprint: PlacementFootprint,
  rotation: number
): PlacementFootprint {
  return rotation % 2 === 1
    ? { w: footprint.d, d: footprint.w }
    : { w: footprint.w, d: footprint.d };
}

/** Le quart de tour suivant (sens horaire). */
export function nextRotation(rotation: number): PlacementRotation {
  return (((rotation % 4) + 5) % 4) as PlacementRotation;
}

export function placementRect(
  placement: Pick<Placement, 'gx' | 'gy' | 'rotation'>,
  spec: Pick<PlacementSpec, 'footprint'>
): PlacementRect {
  const fp = rotatedFootprint(spec.footprint, placement.rotation);
  return {
    minX: placement.gx,
    minY: placement.gy,
    maxX: placement.gx + fp.w,
    maxY: placement.gy + fp.d,
  };
}

export function rectInsideRoom(
  rect: PlacementRect,
  room: PlacementRoom
): boolean {
  return (
    rect.minX >= 0 &&
    rect.minY >= 0 &&
    rect.maxX <= room.width &&
    rect.maxY <= room.depth
  );
}

/** Deux rectangles partagent-ils au moins une case ? (bord commun : non) */
export function rectsOverlap(a: PlacementRect, b: PlacementRect): boolean {
  return (
    a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
  );
}

/**
 * Le calque d'un meuble du catalogue : celui qu'il déclare (`layer`), sinon
 * `floor` pour un tapis, sinon `object`.
 */
export function placementLayerOf(item: {
  category: string;
  layer?: unknown;
}): PlacementLayer {
  if (item.layer === 'floor' || item.layer === 'wall') return item.layer;
  return item.category === 'rug' ? 'floor' : 'object';
}

/** Dos contre un mur du fond : rotation 0 en `gy = 0`, rotation 1 en `gx = 0`. */
export function isAgainstBackWall(
  placement: Pick<Placement, 'gx' | 'gy' | 'rotation'>
): boolean {
  return (
    (placement.rotation === 0 && placement.gy === 0) ||
    (placement.rotation === 1 && placement.gx === 0)
  );
}

/**
 * Le meuble tient-il dans la salle ? Coordonnées entières, rotation 0 à 3,
 * empreinte dans la salle et, pour un meuble mural, dos au mur.
 */
export function isPlacementInBounds(
  placement: Pick<Placement, 'gx' | 'gy' | 'rotation'>,
  spec: PlacementSpec,
  room: PlacementRoom
): boolean {
  if (!Number.isInteger(placement.gx) || !Number.isInteger(placement.gy))
    return false;
  if (!isPlacementRotation(placement.rotation)) return false;
  if (!rectInsideRoom(placementRect(placement, spec), room)) return false;
  return spec.layer !== 'wall' || isAgainstBackWall(placement);
}

/** Les cases couvertes par un meuble posé. */
export function placementTiles(
  placement: Pick<Placement, 'gx' | 'gy' | 'rotation'>,
  spec: Pick<PlacementSpec, 'footprint'>
): Array<{ i: number; j: number }> {
  const r = placementRect(placement, spec);
  const out: Array<{ i: number; j: number }> = [];
  for (let j = r.minY; j < r.maxY; j++)
    for (let i = r.minX; i < r.maxX; i++) out.push({ i, j });
  return out;
}

/**
 * Les problèmes géométriques d'une disposition : un meuble hors de la salle
 * (`out_of_bounds`), deux meubles d'un même calque qui partagent une case
 * (`overlap`, les DEUX sont signalés). Un meuble sans spec (`specOf` → null)
 * est ignoré ici : l'appelant le signale avec sa propre raison. Une entrée
 * par (meuble, raison), dans l'ordre de la disposition. Vide = valable.
 */
export function placementIssues(
  room: PlacementRoom,
  placements: readonly Placement[],
  specOf: (placement: Placement) => PlacementSpec | null
): GeometryIssue[] {
  const placed = placements
    .map((p) => ({ p, spec: specOf(p) }))
    .filter((x): x is { p: Placement; spec: PlacementSpec } => x.spec !== null);
  const outside = new Set<string>();
  const overlapping = new Set<string>();
  const rects = placed.map(({ p, spec }) => {
    if (!isPlacementInBounds(p, spec, room)) outside.add(p.id);
    return placementRect(p, spec);
  });
  for (let a = 0; a < placed.length; a++) {
    for (let b = a + 1; b < placed.length; b++) {
      if (placed[a].spec.layer !== placed[b].spec.layer) continue;
      if (placed[a].p.id === placed[b].p.id) continue;
      if (!rectsOverlap(rects[a], rects[b])) continue;
      overlapping.add(placed[a].p.id);
      overlapping.add(placed[b].p.id);
    }
  }
  const issues: GeometryIssue[] = [];
  const seen = new Set<string>();
  for (const { p } of placed) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    if (outside.has(p.id)) issues.push({ id: p.id, reason: 'out_of_bounds' });
    if (overlapping.has(p.id)) issues.push({ id: p.id, reason: 'overlap' });
  }
  return issues;
}
