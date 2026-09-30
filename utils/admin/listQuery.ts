// utils/admin/listQuery.ts — le contrat d'une LISTE admin paginée côté serveur
// (lot L13, docs/PLAN-industrialisation-admin.md).
//
// Chaque liste réinventait ses paramètres (`search`/`q`, `orderBy`/`sort`,
// `offset`/`page`, `includeTotal`…) et sa forme de réponse. Un seul contrat,
// avec les MÊMES noms que l'état d'URL de la table (`useTableQueryState`) :
//
//   ?q=…&sort=<colonne autorisée>&dir=asc|desc&page=1&pageSize=25&<filtres>
//   → { items, total, …extras }
//
// Le tri n'accepte QUE les colonnes déclarées (`sortable`) : trier sur une
// colonne arbitraire, c'est laisser le client choisir un `order by` — et
// découvrir en prod une colonne sans index sur une grosse table.
//
// Zod seul (référencé par la spec via lib/apiContracts).

import * as z from 'zod';

export const LIST_MAX_PAGE_SIZE = 100;

export function adminListQuery<
  const S extends readonly [string, ...string[]],
  F extends z.ZodRawShape = Record<never, never>,
>(opts: { sortable: S; pageSize?: number; filters?: F }) {
  return z.object({
    q: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((v) => v || undefined)
      .meta({
        description: 'Recherche texte (colonnes choisies par la route).',
      }),
    sort: z
      .enum(opts.sortable)
      .optional()
      .meta({ description: 'Colonne de tri (liste fermée).' }),
    dir: z.enum(['asc', 'desc']).default('asc'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(LIST_MAX_PAGE_SIZE)
      .default(opts.pageSize ?? 25),
    ...(opts.filters ?? ({} as F)),
  });
}

/** Réponse d'une liste : la page, et le total qui permet de paginer. */
export type AdminListResult<T> = { items: T[]; total: number };

/** Bornes `range()` Supabase (inclusives) de la page demandée. */
export function listRange(query: {
  page: number;
  pageSize: number;
}): [number, number] {
  const from = (query.page - 1) * query.pageSize;
  return [from, from + query.pageSize - 1];
}

/**
 * Filtre `.or()` PostgREST « contient `q` » sur plusieurs colonnes.
 *
 * La valeur est CITÉE (`col.ilike."%…%"`) : points et virgules y sont permis
 * — l'ancienne recherche des adhérents supprimait les points, et un email ne
 * pouvait donc jamais être trouvé. Les jokers `%` `_` `*` saisis sont retirés
 * (on cherche un texte, pas un motif), guillemets et antislashs aussi.
 */
export function searchOrFilter(q: string, columns: readonly string[]): string {
  const clean = q.replace(/["\\%_*]/g, '').trim();
  return columns.map((c) => `${c}.ilike."%${clean}%"`).join(',');
}
