// Diff de persistance du réordonnancement des scènes caster (lot 7).
//
// `utils/caster/sceneCrud.ts` calcule le NOUVEL ORDRE (moveInList / dropInList) ;
// ce module calcule les ÉCRITURES minimales pour le persister. Séparé parce que
// c'est une préoccupation différente : l'ordre est de la logique de liste, le
// diff est de la logique de persistance.
//
// Pourquoi minimiser : chaque UPDATE sur `caster_scenes` est répliqué en
// Realtime vers l'app desktop ET vers chaque Browser Source OBS ouverte (le
// trigger `updated_at` fait muter la ligne, donc l'overlay se rerend). Réécrire
// les 11 lignes pour un simple « monter d'un cran » enverrait 11 events pour 2
// lignes réellement déplacées, en pleine émission.
//
// Zéro DOM, zéro réseau : `useCasterScenes.reorderScenes` applique le résultat.

/** Ligne minimale nécessaire au diff (le reste de la scène est ignoré). */
type OrderedRow = { id: string; sort_order: number };

/**
 * Écritures `sort_order` à envoyer pour que la table refléte `orderedIds`.
 *
 * `sort_order` cible = index dans `orderedIds` (0-based, dense) ; seules les
 * lignes dont la valeur CHANGE réellement sont rendues. Les ids inconnus de
 * `current` sont ignorés (une ligne supprimée en concurrence par un autre
 * caster ne doit pas produire un UPDATE fantôme).
 */
export function sortOrderUpdates(
  orderedIds: readonly string[],
  current: readonly OrderedRow[]
): OrderedRow[] {
  const bySortOrder = new Map(current.map((row) => [row.id, row.sort_order]));
  const updates: OrderedRow[] = [];
  orderedIds.forEach((id, index) => {
    if (!bySortOrder.has(id)) return;
    if (bySortOrder.get(id) === index) return;
    updates.push({ id, sort_order: index });
  });
  return updates;
}

/**
 * Ordre visé après duplication : la copie se place JUSTE APRÈS son original
 * (comme l'app desktop), pas en fin de liste — une copie créée pour être
 * modifiée dans la foulée doit être sous les yeux du caster.
 *
 * `createdId` est supposé absent de `orderedIds` (il vient d'être inséré en fin
 * de table) ; s'il y figure déjà, il est d'abord retiré pour rester idempotent.
 */
export function orderWithDuplicateAfter(
  orderedIds: readonly string[],
  sourceId: string,
  createdId: string
): string[] {
  const ids = orderedIds.filter((id) => id !== createdId);
  const sourceIndex = ids.indexOf(sourceId);
  if (sourceIndex < 0) return [...ids, createdId];
  return [
    ...ids.slice(0, sourceIndex + 1),
    createdId,
    ...ids.slice(sourceIndex + 1),
  ];
}
