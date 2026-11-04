// utils/db/d1/write.ts — les écritures de supabase-js, traduites en SQL pour D1 (lot 3d de
// conference-website docs/D1-MIGRATION.md).
//
// insert, update, delete, upsert, comme PostgREST les fait :
//   * insert d'un objet : ses clés seulement, les autres colonnes prennent leur défaut ;
//     d'un tableau : l'union des clés (supabase-js envoie `columns`), une clé absente d'une
//     ligne y vaut NULL ;
//   * une clé inconnue → PGRST204 ; une cible d'upsert sans index unique → 42P10 ;
//   * upsert : ON CONFLICT sur la clé primaire ou `onConflict`, mise à jour de toutes les
//     colonnes envoyées, ou rien avec `ignoreDuplicates` (seules les lignes insérées
//     reviennent alors) ;
//   * `.select(…)` après l'écriture : RETURNING, tables embarquées comprises (SQLite accepte
//     les sous-requêtes dans RETURNING).
// Les lignes partent en UN paramètre JSON (`json_each`), sous la limite de 100 paramètres
// de D1 ; au-delà de ~400 Ko, elles sont coupées en plusieurs instructions du même envoi
// (atomique : `batch`).

import { DB_ERROR_CODES as C } from '../errors';
import type { DbCatalog, TableInfo } from './catalog';
import { dbError } from './errors';
import type { Condition } from './filters';
import { compileFields, tableOf, whereSql, type SelectField } from './select';
import { SQL_NOW, toDb, type SqlValue } from './values';

export type WriteOperation = 'insert' | 'update' | 'delete' | 'upsert';

export interface WriteSpec {
  table: string;
  operation: WriteOperation;
  values?: Record<string, unknown> | Array<Record<string, unknown>>;
  conditions: Condition[];
  onConflict?: string;
  ignoreDuplicates?: boolean;
  /** Les champs de `.select(…)` après l'écriture ; `null` sans `.select()`. */
  returning: SelectField[] | null;
}

export interface CompiledWrite {
  statements: Array<{ sql: string; params: SqlValue[] }>;
  /** `false` sans `.select()` : les lignes rendues ne servent qu'à compter. */
  returns: boolean;
  decode(row: Record<string, unknown>): Record<string, unknown>;
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
const CHUNK_BYTES = 400_000;

function unknownColumn(table: TableInfo, column: string) {
  return dbError(C.unknownColumn, `Could not find the '${column}' column of '${table.name}' in the schema cache`);
}

/** Les colonnes écrites : clés de l'objet, ou union des clés du tableau (ordre d'apparition). */
function columnsOf(table: TableInfo, rows: Array<Record<string, unknown>>, single: boolean): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      // JSON.stringify d'un objet seul omet `undefined` : la colonne prend alors son défaut.
      if (single && value === undefined) continue;
      seen.add(key);
    }
  }
  for (const c of seen) if (!table.column.has(c)) throw unknownColumn(table, c);
  return [...seen];
}

/** La cible ON CONFLICT : la clé primaire, ou l'index unique dont les colonnes sont `onConflict`. */
function conflictTarget(table: TableInfo, onConflict: string | undefined): string {
  const wanted = onConflict
    ? onConflict
        .split(',')
        .map((c) => c.trim().replace(/^"|"$/g, ''))
        .filter(Boolean)
    : table.primaryKey;
  const key = [...wanted].sort().join(',');
  if ([...table.primaryKey].sort().join(',') === key) return table.primaryKey.map(q).join(', ');
  const unique = table.uniques.find((u) => u.where === null && u.columns.length > 0 && [...u.columns].sort().join(',') === key);
  if (unique) return (unique.expressions ?? unique.columns.map(q)).join(', ');
  throw dbError(C.invalidColumnReference, 'there is no unique or exclusion constraint matching the ON CONFLICT specification');
}

/**
 * RETURNING : les champs de `.select()`, ou une seule valeur pour compter. Le nombre de
 * lignes touchées se lit toujours ainsi, jamais dans `meta.changes` de D1, qui compte aussi
 * les lignes effacées en cascade (PostgREST ne compte que la table visée).
 */
function returningSql(spec: WriteSpec, table: TableInfo, catalog: DbCatalog) {
  if (!spec.returning) return { sql: ' RETURNING 1 AS "c0"', params: [] as SqlValue[], decode: (row: Record<string, unknown>) => row };
  // Dans RETURNING, la ligne écrite se nomme par sa table.
  const fields = compileFields(spec.returning, table, table.name, [], catalog);
  return { sql: ` RETURNING ${fields.columns.join(', ')}`, params: fields.params, decode: fields.decode };
}

export function compileWrite(spec: WriteSpec, catalog: DbCatalog): CompiledWrite {
  const table = tableOf(catalog, spec.table);
  const returning = returningSql(spec, table, catalog);
  const { decode } = returning;
  const returns = spec.returning !== null;
  const tail = (sql: string, params: SqlValue[]) => ({
    sql: `${sql}${returning.sql}`,
    params: [...params, ...returning.params],
  });

  if (spec.operation === 'delete' || spec.operation === 'update') {
    const own = spec.conditions;
    if (own.some((c) => c.kind === 'op' && c.ref.relation.length > 0)) {
      throw dbError(C.invalidQuery, '"filtre sur une table embarquée dans une écriture : non pris en charge"');
    }
    const where = whereSql({ own, innerExists: [] }, table, table.name);
    if (spec.operation === 'delete') {
      return { statements: [tail(`DELETE FROM ${q(table.name)}${where.sql}`, where.params)], returns, decode };
    }
    const values = spec.values;
    if (!values || Array.isArray(values)) throw dbError(C.invalidQuery, '"update attend un objet"');
    // Date de modification (lot 4a) : « maintenant », même si le code en envoie une — le
    // déclencheur BEFORE UPDATE de Postgres l'écrasait aussi.
    const columns = columnsOf(table, [values], true).filter((c) => c !== table.touch);
    if (columns.length === 0 && !table.touch) throw dbError(C.invalidQuery, '"update sans colonne"');
    const encoded: Record<string, SqlValue> = {};
    for (const c of columns) encoded[c] = toDb(table.column.get(c) as never, values[c]);
    // `?1` porte toutes les valeurs ; les `?` des filtres prennent les numéros suivants.
    const set = [
      ...columns.map((c) => `${q(c)} = json_extract(?1, '$.${JSON.stringify(c)}')`),
      ...(table.touch ? [`${q(table.touch)} = ${SQL_NOW}`] : []),
    ].join(', ');
    return {
      // Sans colonne (date de modification seule), pas de `?1` à lier.
      statements: [
        tail(`UPDATE ${q(table.name)} SET ${set}${where.sql}`, columns.length ? [JSON.stringify(encoded), ...where.params] : where.params),
      ],
      returns,
      decode,
    };
  }

  // insert / upsert
  const single = !Array.isArray(spec.values);
  const rows = (Array.isArray(spec.values) ? spec.values : [spec.values ?? {}]) as Array<Record<string, unknown>>;
  if (rows.length === 0) return { statements: [], returns, decode };
  const columns = columnsOf(table, rows, single);
  let conflict = '';
  if (spec.operation === 'upsert') {
    const target = conflictTarget(table, spec.onConflict);
    // La branche « mise à jour » d'un upsert pose aussi la date de modification (lot 4a).
    const updates = [
      ...columns.filter((c) => c !== table.touch).map((c) => `${q(c)} = excluded.${q(c)}`),
      ...(table.touch && columns.length ? [`${q(table.touch)} = ${SQL_NOW}`] : []),
    ];
    conflict = spec.ignoreDuplicates
      ? ` ON CONFLICT (${target}) DO NOTHING`
      : ` ON CONFLICT (${target}) DO ${updates.length ? `UPDATE SET ${updates.join(', ')}` : 'NOTHING'}`;
  }

  if (columns.length === 0) {
    // Objets vides : une ligne par défaut chacun.
    return {
      statements: rows.map(() => tail(`INSERT INTO ${q(table.name)} DEFAULT VALUES${conflict}`, [])),
      returns,
      decode,
    };
  }

  // Chaque ligne en tableau positionnel, valeurs déjà au format de stockage.
  const encoded = rows.map((row) => columns.map((c) => toDb(table.column.get(c) as never, row[c] ?? null)));
  const chunks: SqlValue[][][] = [];
  let current: SqlValue[][] = [];
  let size = 0;
  for (const row of encoded) {
    const bytes = JSON.stringify(row).length;
    if (current.length && size + bytes > CHUNK_BYTES) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(row);
    size += bytes;
  }
  chunks.push(current);

  const extract = columns.map((_, i) => `json_extract(r.value, '$[${i}]')`).join(', ');
  // `WHERE true` : sans lui, SQLite lirait ON CONFLICT comme une jointure du SELECT.
  const sql = `INSERT INTO ${q(table.name)} (${columns.map(q).join(', ')}) SELECT ${extract} FROM json_each(?) AS r WHERE true${conflict}`;
  return { statements: chunks.map((chunk) => tail(sql, [JSON.stringify(chunk)])), returns, decode };
}
