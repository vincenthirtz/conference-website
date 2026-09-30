// utils/admin/pathParams.ts — paramètres de chemin des routes admin
// déclaratives (`[id]`, `[key]`…), avec le message d'erreur historique de la
// route.
//
// SANS IMPORT `@/` : ces schémas sont référencés par la spec OpenAPI
// (`x-zod-query`, lib/apiContracts/admin/features.ts), que `prebuild`
// assemble avec Node seul — l'alias `@/` n'y existe pas. Et un `.regex()`
// plutôt qu'un `.refine()` : il se traduit en `pattern` dans la spec.

import * as z from 'zod';

/** Même motif que `isValidUUID` (utils/apiHelpers). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UUID de chemin : absent, tableau ou mal formé → 400 avec `message`.
 * (Next livre un segment de chemin en chaîne unique.)
 */
export function uuidPathParam(message: string) {
  return z.string({ error: message }).regex(UUID_RE, { error: message });
}

/* ---------------------------------------------------------------------------
 * Paramètres et corps « historiques » (ex-features/admin/_shared/params.ts)
 * ------------------------------------------------------------------------ */

/** `?a=1&a=2` → `'1'` : ce que faisaient les routes (`Array.isArray ? [0]`). */
export function firstParam(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/** Première valeur d'un paramètre de requête, si c'est une chaîne. */
export function firstString(value: unknown): string | undefined {
  const v = firstParam(value);
  return typeof v === 'string' ? v : undefined;
}

function openKeys<K extends string>(keys: readonly K[]) {
  return Object.fromEntries(
    keys.map((k) => [k, z.unknown().optional()])
  ) as Record<K, z.ZodOptional<z.ZodUnknown>>;
}

/**
 * Query d'une route qui lit et normalise elle-même ses filtres (service) :
 * les clés sont NOMMÉES pour la spec (`x-zod-query`), aucune n'est validée
 * ici, toutes les autres passent telles quelles.
 */
export function looseQuery<K extends string>(keys: readonly K[]) {
  return z.looseObject(openKeys(keys));
}

/**
 * Corps lu tel quel par une route historique (`(req.body ?? {}) as X`) : tout
 * ce qui n'est pas un objet devient `{}`, et la validation champ par champ
 * reste dans le service, dans l'ordre et avec les messages d'origine. Les
 * champs sont NOMMÉS pour la spec (`x-zod`), sans être contraints ici.
 */
export function looseBody<K extends string>(keys: readonly K[]) {
  const schema = z.looseObject(openKeys(keys));
  // Toutes les clés sont facultatives : `{}` est une valeur valide du schéma.
  return schema.catch({} as z.output<typeof schema>);
}
