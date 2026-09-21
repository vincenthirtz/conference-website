// utils/supabase/relation.ts
//
// Dénouer une relation PostgREST : elle arrive en OBJET ou en TABLEAU.
//
// POURQUOI CE N'EST PAS UNE PRÉCAUTION SUPERFLUE. Quand une requête embarque
// une relation (`team1:team1_id (id, name)`), PostgREST rend un objet si la
// jointure est unique et un tableau si elle ne l'est pas — et ce qu'il juge
// « unique » dépend des clés étrangères et des contraintes, pas du souhait de
// l'appelant. Le même `select` peut donc changer de forme après une migration
// qui touche un index. Les routes du bot portaient toutes leur propre
// `Array.isArray(x) ? x[0] : x`, recopié à chaque relation.
//
// CE QUE CE MODULE REMPLACE. Ces copies vivaient derrière des `as any` : le
// cast éteignait le compilateur, et le mock Supabase des tests ne valide pas
// les noms de colonnes. Une colonne mal orthographiée traversait donc les
// tests au vert et ne cassait qu'en production — sur des routes consommées par
// le bot Discord, c'est-à-dire depuis un autre dépôt.
//
// PUR, SANS ENTRÉE-SORTIE : il n'interroge rien, il interprète une réponse
// déjà reçue.

/**
 * La relation, ramenée à un seul élément — ou `null`.
 *
 * `null` pour un tableau vide comme pour une absence : les deux disent « pas
 * de ligne liée », et les distinguer n'apporterait rien à l'appelant, qui
 * retombe de toute façon sur la même valeur par défaut.
 */
export function oneRelation<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel ?? null;
}

/**
 * Une relation telle que PostgREST peut la rendre.
 *
 * À utiliser dans les types de ligne, pour que la forme déclarée corresponde à
 * la réponse RÉELLE plutôt qu'à celle qu'on espère.
 */
export type Relation<T> = T | T[] | null;
