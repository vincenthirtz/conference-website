// utils/db/d1/errors.ts — les erreurs de D1 dites comme PostgREST les dirait (lot 3 de
// conference-website docs/D1-MIGRATION.md).
//
// Le code de l'API lit les erreurs de la base par les prédicats de utils/db/errors.ts, qui
// regardent les codes de Postgres (`23505`…) et de PostgREST (`PGRST116`…). La façade rend
// donc ces mêmes codes, avec les mêmes phrases anglaises et le même statut HTTP : rien ne
// change pour l'appelant. SQLite, lui, répond « UNIQUE constraint failed: t.a » ; la carte
// (catalog.ts) retrouve le nom de la contrainte.

import { DB_ERROR_CODES as C } from '../errors';
import type { D1Column, TableInfo } from './catalog';

/** La forme de `PostgrestError` (supabase-js). */
export interface PostgrestErrorLike {
  message: string;
  details: string | null;
  hint: string | null;
  code: string;
}

/** Statut HTTP que PostgREST associe à chaque code. */
function statusOf(code: string): number {
  if (code === C.uniqueViolation || code === C.foreignKeyViolation) return 409;
  if (code === C.singleRowExpected) return 406;
  if (code === C.undefinedTable || code === C.unknownTable) return 404;
  if (code === C.serializationFailure || code === C.connectionFailure) return 503;
  if (/^(22|23|42|PGRST)/.test(code)) return 400;
  return 500;
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  404: 'Not Found',
  406: 'Not Acceptable',
  409: 'Conflict',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export const statusText = (status: number): string => STATUS_TEXT[status] ?? '';

/** Une erreur de la façade, prête à devenir `{ data: null, error, status }`. */
export class DbError extends Error {
  readonly status: number;
  constructor(readonly error: PostgrestErrorLike) {
    super(error.message);
    this.name = 'DbError';
    this.status = statusOf(error.code);
  }
}

export function dbError(code: string, message: string, details: string | null = null, hint: string | null = null): DbError {
  return new DbError({ code, message, details, hint });
}

/** Le type Postgres d'une colonne, pour les phrases (« invalid input syntax for type uuid »). */
function pgTypeName(column: D1Column | undefined): string {
  if (!column) return 'unknown';
  return column.pg.replace(/\(.*\)$/, '');
}

export type Operation = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

/**
 * Une erreur levée par D1 (ou SQLite local) → l'erreur que PostgREST aurait rendue. Ce qui
 * n'est pas reconnu garde son texte, sous un code à part (`D1_ERROR`).
 */
export function translateD1Error(err: unknown, table: TableInfo | undefined, operation: Operation): DbError {
  if (err instanceof DbError) return err;
  const raw = err instanceof Error ? err.message : String(err);
  // « D1_ERROR: <message SQLite>: SQLITE_CONSTRAINT (extended: …) »
  const text = raw
    .replace(/^D1_ERROR:\s*/, '')
    .replace(/:\s*SQLITE_[A-Z_]+(?: \(extended: [A-Z_]+\))?$/, '')
    .replace(/\s+at offset \d+$/, '')
    .trim();
  const relation = table?.name ?? '';

  let m = /^UNIQUE constraint failed: index '([^']+)'$/.exec(text);
  if (m) {
    return dbError(C.uniqueViolation, `duplicate key value violates unique constraint "${m[1]}"`, null);
  }
  m = /^UNIQUE constraint failed: (.+)$/.exec(text);
  if (m) {
    const columns = (m[1] as string).split(', ').map((c) => c.slice(c.indexOf('.') + 1));
    const key = columns.join(',');
    const name =
      (table?.primaryKey.join(',') === key ? `${relation}_pkey` : undefined) ??
      table?.uniques.find((u) => u.columns.join(',') === key)?.name ??
      `${relation}_${columns.join('_')}_key`;
    return dbError(C.uniqueViolation, `duplicate key value violates unique constraint "${name}"`, `Key (${columns.join(', ')}) already exists.`);
  }
  if (/^FOREIGN KEY constraint failed$/.test(text)) {
    // SQLite ne nomme pas la clé fautive.
    return operation === 'delete' || operation === 'update'
      ? dbError(C.foreignKeyViolation, `update or delete on table "${relation}" violates foreign key constraint`, 'Key is still referenced from another table.')
      : dbError(C.foreignKeyViolation, `insert or update on table "${relation}" violates foreign key constraint`, 'Key is not present in the referenced table.');
  }
  // Vérification à sous-requête du lot 4a (déclencheur SQLite, RAISE 'check:<nom>').
  m = /^check:(\S+)$/.exec(text);
  if (m) return dbError(C.checkViolation, `new row for relation "${relation}" violates check constraint "${m[1]}"`, null);
  // Garde d'un envoi groupé (lot 4 : fonctions réécrites) : comme RAISE EXCEPTION '<code>' en plpgsql.
  m = /^guard:(\S+)$/.exec(text);
  if (m) return dbError(C.raiseException, m[1] as string, null);
  // Refus d'un déclencheur métier (lot 4b) ou d'une garde de fonction réécrite (lot 4e), avec le
  // code (et l'indice) que la fonction plpgsql choisissait.
  m = /^pg:([0-9A-Z]{5}):([\s\S]*?)(?:\|hint=([\s\S]*))?$/.exec(text);
  if (m) return dbError(m[1] as string, m[2] as string, null, m[3] ?? null);
  m = /^CHECK constraint failed: (\S+)$/.exec(text);
  if (m) {
    const name = m[1] as string;
    // Garde de type du lot 2 (`<table>_<colonne>_type`) : Postgres l'aurait refusée par le type.
    const guarded = table?.columns.find((c) => name === `${relation}_${c.name}_type`);
    if (guarded) {
      const dateKind = guarded.type === 'timestamptz' || guarded.type === 'date' || guarded.type === 'time';
      return dbError(dateKind ? C.invalidDatetimeFormat : C.invalidTextRepresentation, `invalid input syntax for type ${pgTypeName(guarded)}`, `Column "${guarded.name}".`);
    }
    return dbError(C.checkViolation, `new row for relation "${relation}" violates check constraint "${name}"`, null);
  }
  m = /^NOT NULL constraint failed: \w+\.(\w+)$/.exec(text);
  if (m) {
    return dbError(C.notNullViolation, `null value in column "${m[1]}" of relation "${relation}" violates not-null constraint`, null);
  }
  m = /^cannot store (\w+) value in (\w+) column \w+\.(\w+)$/.exec(text);
  if (m) {
    const column = table?.column.get(m[3] as string);
    return dbError(C.invalidTextRepresentation, `invalid input syntax for type ${pgTypeName(column)}`, `Column "${m[3]}".`);
  }
  m = /^no such table: (?:main\.)?(\S+)$/.exec(text);
  if (m) return dbError(C.undefinedTable, `relation "public.${m[1]}" does not exist`);
  m = /^no such column: (\S+)$/.exec(text);
  if (m) return dbError(C.undefinedColumn, `column ${m[1]} does not exist`);
  if (/overloaded|too many requests queued/i.test(text)) {
    // D1 n'a pas exécuté la requête (file pleine) : réessayer est sûr, comme une sérialisation perdue.
    return dbError(C.serializationFailure, `could not serialize access: D1 overloaded (${text})`);
  }
  if (/Network connection lost|D1_RESET_DO|internal error|timeout/i.test(text)) {
    return dbError(C.connectionFailure, `connection failure: ${text}`);
  }
  if (/^Expression tree is too large/.test(text)) {
    // D1 plafonne la profondeur à 100, et chaque niveau de `!inner` filtré par ilike en pèse ~50
    // (foldCase) : deux niveaux imbriqués dépassent. Un seul passe (select.ts, table dérivée).
    return dbError(
      C.programLimitExceeded,
      'requête trop profonde pour D1 (expression de plus de 100 niveaux)',
      text,
      'un seul niveau de table embarquée filtrée sans casse (ilike, textSearch) : filtrer le niveau suivant à part'
    );
  }
  return dbError('D1_ERROR', text);
}
