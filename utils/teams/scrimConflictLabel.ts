// utils/teams/scrimConflictLabel.ts
//
// Mise en forme d'un conflit de créneau pour l'affichage.
//
// POURQUOI : `findScrimConflicts` calcule et renvoie le détail — quel scrim ou
// quel match occupe déjà le créneau, et quand. L'agenda recevait cette liste et
// affichait « Créneau en conflit avec une équipe déjà prise. » : l'information
// utile était calculée, transmise, puis perdue à l'affichage. Un avertissement
// qui ne dit pas ce qui bloque n'aide personne à décider.
//
// Module séparé de `scrimConflicts.ts` (qui porte la requête base) pour qu'un
// composant client puisse l'importer sans tirer un client Supabase dans le
// bundle. Pur : aucune dépendance, horloge et localisation injectées.

/** Sous-ensemble de SlotConflict nécessaire à l'affichage. */
export type ConflictLike = {
  type: 'scrim' | 'match' | string;
  name: string | null;
  when: string;
};

export type ConflictSummary = {
  /** Nom de l'élément en conflit, ou repli lisible. */
  name: string;
  /** Date/heure formatée par l'appelant. */
  when: string;
  /** Conflits supplémentaires au-delà du premier. */
  others: number;
};

/**
 * Résume une liste de conflits : le premier est nommé, les suivants comptés.
 * Retourne null s'il n'y a rien à signaler.
 *
 * `formatWhen` reçoit la date ISO du conflit ; l'appelant décide du fuseau et
 * de la locale. `fallbackName` sert quand l'élément en conflit n'a pas de nom
 * (un match n'en porte pas toujours).
 */
export function summarizeConflicts(
  conflicts: ConflictLike[] | null | undefined,
  formatWhen: (iso: string) => string,
  fallbackName: string
): ConflictSummary | null {
  if (!conflicts || conflicts.length === 0) return null;

  // Le plus proche dans le temps d'abord : c'est celui qu'on veut nommer.
  const sorted = [...conflicts].sort((a, b) => {
    const ta = Date.parse(a.when);
    const tb = Date.parse(b.when);
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return ta - tb;
  });

  const first = sorted[0];
  const name = first.name?.trim() ? first.name.trim() : fallbackName;
  const when = Number.isNaN(Date.parse(first.when))
    ? first.when
    : formatWhen(first.when);

  return { name, when, others: sorted.length - 1 };
}
