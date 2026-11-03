// utils/db/errors.ts — la seule lecture des erreurs de la base (lot 1b de
// conference-website docs/D1-MIGRATION.md).
//
// Postgres nomme ses refus par un code SQLSTATE (`23505`…), PostgREST par les siens
// (`PGRST204`…), et l'un comme l'autre les disent aussi en anglais. Ailleurs, le code pose sa
// question (« doublon ? colonne absente ? ») à ces prédicats, sans lire ni code ni phrase
// (garde-fou : tests/unit/dbErrorsGuard.test.ts). Le jour du moteur suivant, ses erreurs se
// traduisent ICI seul.
//
// Chaque prédicat prend n'importe quoi (`null`, une chaîne, une exception) et rend `false` sur
// ce qu'il ne reconnaît pas. Aucun import : le site recopie ce fichier.

/** Les codes lus par l'API : Postgres (SQLSTATE), puis PostgREST. */
export const DB_ERROR_CODES = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  checkViolation: '23514',
  // Rendus aussi par la façade D1 (utils/db/d1/errors.ts), qui parle comme Postgres.
  notNullViolation: '23502',
  invalidTextRepresentation: '22P02',
  invalidDatetimeFormat: '22007',
  numericOutOfRange: '22003',
  connectionFailure: '08006',
  undefinedColumn: '42703',
  undefinedTable: '42P01',
  undefinedFunction: '42883',
  lockNotAvailable: '55P03',
  serializationFailure: '40001',
  deadlockDetected: '40P01',
  noDataFound: 'P0002',
  // PostgREST : l'objet manque à son cache de schéma (migration pas appliquée, ou cache pas
  // encore rechargé).
  singleRowExpected: 'PGRST116',
  unknownRelationship: 'PGRST200',
  ambiguousRelationship: 'PGRST201',
  unknownFunction: 'PGRST202',
  unknownColumn: 'PGRST204',
  unknownTable: 'PGRST205',
} as const;

const C = DB_ERROR_CODES;

function codeOf(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

function hasCode(error: unknown, ...codes: string[]): boolean {
  const code = codeOf(error);
  return code !== '' && codes.includes(code);
}

/**
 * Le message de l'erreur, '' sans message. Pour y chercher un NOM du schéma (colonne,
 * contrainte) : les phrases de la base, elles, se lisent ici (`says…`).
 */
export function dbErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
}

/* -------------------------------------------------------------------------- */
/* Contraintes                                                                 */
/* -------------------------------------------------------------------------- */

/** Doublon : un index unique a refusé l'écriture (souvent une course perdue). */
export function isUniqueViolation(error: unknown): boolean {
  return hasCode(error, C.uniqueViolation);
}

/** La ligne référencée n'existe pas (clé étrangère). */
export function isForeignKeyViolation(error: unknown): boolean {
  return hasCode(error, C.foreignKeyViolation);
}

/** Une contrainte CHECK a refusé la ligne : valeur pas encore migrée, limite d'un trigger… */
export function isCheckViolation(error: unknown): boolean {
  return hasCode(error, C.checkViolation);
}

/** `no_data_found` : une fonction SQL n'a pas trouvé sa ligne (`SELECT … INTO STRICT`). */
export function isNoDataFound(error: unknown): boolean {
  return hasCode(error, C.noDataFound);
}

/** Verrou non obtenu, transaction sérialisée perdue ou interblocage : réessayer est sûr. */
export function isLockContention(error: unknown): boolean {
  return hasCode(
    error,
    C.lockNotAvailable,
    C.serializationFailure,
    C.deadlockDetected
  );
}

/* -------------------------------------------------------------------------- */
/* Schéma absent (migration pas appliquée)                                     */
/* -------------------------------------------------------------------------- */

/** Fonction SQL inconnue : PostgREST ne la connaît pas, ou Postgres n'en trouve pas la signature. */
export function isMissingFunction(error: unknown): boolean {
  return hasCode(error, C.unknownFunction, C.undefinedFunction);
}

/** Table inconnue, de Postgres ou du cache de PostgREST. */
export function isMissingTable(error: unknown): boolean {
  return hasCode(error, C.undefinedTable, C.unknownTable);
}

/** Relation d'un `select` imbriqué inconnue du cache de PostgREST. */
export function isMissingRelationship(error: unknown): boolean {
  return hasCode(error, C.unknownRelationship);
}

/**
 * Colonne inconnue : Postgres le dit en lecture et en filtre, PostgREST pour la colonne d'une
 * écriture absente de son cache. Avec `column`, le message doit la nommer : une AUTRE colonne
 * fautive n'est pas notre migration qui manque.
 */
export function isMissingColumn(error: unknown, column?: string): boolean {
  if (!hasCode(error, C.undefinedColumn, C.unknownColumn)) return false;
  return !column || dbErrorMessage(error).includes(column);
}

/**
 * Colonne inconnue, dite par Postgres SEUL (pas par le cache de PostgREST). Les replis qui
 * ne lisaient que ce code le gardent : leur ajouter celui de PostgREST changerait ce qu'ils
 * avalent.
 */
export function isUndefinedColumn(error: unknown): boolean {
  return hasCode(error, C.undefinedColumn);
}

/* -------------------------------------------------------------------------- */
/* Ce que dit le message (quand le code manque ou ne suffit pas)               */
/* -------------------------------------------------------------------------- */

/** Le message parle d'un doublon (« duplicate key value violates unique constraint »). */
export function saysDuplicate(error: unknown): boolean {
  const message = dbErrorMessage(error).toLowerCase();
  return message.includes('duplicate') || message.includes('unique');
}

/**
 * Le message dit qu'un objet du schéma manque : Postgres « … does not exist », PostgREST
 * « Could not find … in the schema cache ».
 */
export function saysMissing(error: unknown): boolean {
  return /(does not exist|could not find|schema cache)/i.test(
    dbErrorMessage(error)
  );
}

/** Le message est celui de Postgres pour une colonne inconnue (« column … does not exist »). */
export function saysColumnMissing(error: unknown): boolean {
  const message = dbErrorMessage(error).toLowerCase();
  return message.includes('column') && message.includes('does not exist');
}
