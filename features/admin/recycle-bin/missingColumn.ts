// features/admin/recycle-bin/missingColumn.ts — tolérance « colonne absente ».
//
// `news.deleted_at` arrive par database/migrations/add_news_soft_delete.sql,
// appliquée À LA MAIN. Entre le déploiement du code et l'application de la
// migration, toute requête qui cite la colonne échoue : sans tolérance, la
// liste admin des actualités et la corbeille entière tomberaient en 500.
// Les lectures retentent donc SANS le filtre, la suppression retombe sur
// l'effacement d'avant, et la corbeille compte 0 actualité.

type MaybePgError = { code?: unknown; message?: unknown } | null | undefined;

/**
 * Vrai si l'erreur dit qu'une colonne n'existe pas : `42703` (Postgres,
 * filtre / select) ou `PGRST204` (PostgREST, colonne absente du cache de
 * schéma lors d'un update). Restreint à `column` quand il est fourni, pour
 * ne pas avaler une autre colonne réellement fautive.
 */
export function isMissingColumnError(error: unknown, column?: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as MaybePgError;
  const code = typeof e?.code === 'string' ? e.code : '';
  if (code !== '42703' && code !== 'PGRST204') return false;
  if (!column) return true;
  const message = typeof e?.message === 'string' ? e.message : '';
  return message.includes(column);
}

/**
 * Exécute une requête avec le filtre `deleted_at IS NULL`, et la rejoue sans
 * lui si la colonne n'existe pas encore (migration non appliquée).
 */
export async function withDeletedAtFallback<T extends { error: unknown }>(
  run: (filterDeleted: boolean) => PromiseLike<T>
): Promise<T> {
  const first = await run(true);
  if (isMissingColumnError(first.error, 'deleted_at')) return run(false);
  return first;
}
