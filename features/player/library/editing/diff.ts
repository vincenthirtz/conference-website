// features/player/library/editing/diff.ts — ce qui a changé entre l'état
// enregistré et l'état édité, et le corps du `PUT …/apartment/items`
// (lot 4, phase B). Pur.
//
// L'API reçoit l'ÉTAT COMPLET (un meuble absent est rangé) et la version lue :
// le diff ne sert qu'à l'écran (« 3 changements », bouton « Enregistrer »
// actif, confirmation avant de quitter), jamais à construire la requête.

import type { SaveApartmentItemsInput } from '../schemas';
import type { EditItem } from './layout';

export type LayoutDiff = {
  /** Sortis de l'inventaire et posés. */
  placed: string[];
  /** Déplacés (case d'origine changée). */
  moved: string[];
  /** Pivotés sans bouger. */
  rotated: string[];
  /** Rangés (posés avant, absents maintenant). */
  stored: string[];
};

export function layoutDiff(
  before: readonly EditItem[],
  after: readonly EditItem[]
): LayoutDiff {
  const prev = new Map(before.map((i) => [i.inventoryId, i]));
  const next = new Map(after.map((i) => [i.inventoryId, i]));
  const diff: LayoutDiff = { placed: [], moved: [], rotated: [], stored: [] };
  for (const item of after) {
    const old = prev.get(item.inventoryId);
    if (!old) diff.placed.push(item.inventoryId);
    else if (old.gx !== item.gx || old.gy !== item.gy)
      diff.moved.push(item.inventoryId);
    else if (old.rotation !== item.rotation)
      diff.rotated.push(item.inventoryId);
  }
  for (const item of before)
    if (!next.has(item.inventoryId)) diff.stored.push(item.inventoryId);
  return diff;
}

export function changeCount(diff: LayoutDiff): number {
  return (
    diff.placed.length +
    diff.moved.length +
    diff.rotated.length +
    diff.stored.length
  );
}

export function isDirty(
  before: readonly EditItem[],
  after: readonly EditItem[]
): boolean {
  return changeCount(layoutDiff(before, after)) > 0;
}

/** Le corps du PUT : la version lue et TOUS les meubles posés. */
export function toSavePayload(
  version: number,
  items: readonly EditItem[]
): SaveApartmentItemsInput {
  return {
    version,
    items: items.map((i) => ({
      inventoryId: i.inventoryId,
      gx: i.gx,
      gy: i.gy,
      rotation: i.rotation,
    })),
  };
}
