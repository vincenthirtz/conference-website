// utils/moderation/missingColumn.ts
//
// Colonne absente = migration pas encore appliquée. Les écrans et routes de
// modération lisent des colonnes récentes (`news_comments.status`,
// `news.comments_closed`, `*_blacklist.expires_at`) : avant application, ils
// se replient sur l'ancien comportement au lieu de tomber en 500.

const PG_UNDEFINED_COLUMN = '42703';

/**
 * Vrai si `err` signale que `column` n'existe pas (Postgres 42703, ou PostgREST
 * qui le remonte en message depuis son cache de schéma).
 */
export function isMissingColumnError(err: unknown, column: string): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  const message = typeof e.message === 'string' ? e.message : '';
  if (e.code === PG_UNDEFINED_COLUMN) {
    // Le code seul suffit quand le message ne nomme rien ; s'il nomme une
    // AUTRE colonne, ce n'est pas notre migration qui manque.
    return message === '' || message.includes(column);
  }
  if (e.code === 'PGRST204' || e.code === 'PGRST200') {
    return message.includes(column);
  }
  return (
    message.includes(column) &&
    /(does not exist|could not find|schema cache)/i.test(message)
  );
}
