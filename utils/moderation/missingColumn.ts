// utils/moderation/missingColumn.ts
//
// Colonne absente = migration pas encore appliquée. Les écrans et routes de
// modération lisent des colonnes récentes (`news_comments.status`,
// `news.comments_closed`, `*_blacklist.expires_at`) : avant application, ils
// se replient sur l'ancien comportement au lieu de tomber en 500.

import {
  dbErrorMessage,
  isMissingColumn,
  isMissingRelationship,
  isUndefinedColumn,
  saysMissing,
} from '@/utils/db/errors';

/**
 * Vrai si `err` signale que `column` n'existe pas (Postgres, ou PostgREST qui
 * le remonte depuis son cache de schéma).
 */
export function isMissingColumnError(err: unknown, column: string): boolean {
  if (!err || typeof err !== 'object') return false;
  const message = dbErrorMessage(err);
  if (isUndefinedColumn(err)) {
    // Le code seul suffit quand le message ne nomme rien ; s'il nomme une
    // AUTRE colonne, ce n'est pas notre migration qui manque.
    return message === '' || message.includes(column);
  }
  // Le cache de PostgREST (colonne d'une écriture, relation d'un select
  // imbriqué) : seulement s'il nomme la colonne.
  if (isMissingColumn(err) || isMissingRelationship(err)) {
    return message.includes(column);
  }
  return message.includes(column) && saysMissing(err);
}
