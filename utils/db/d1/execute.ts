// utils/db/d1/execute.ts — l'envoi des instructions préparées à D1 (lot 3 de
// conference-website docs/D1-MIGRATION.md).
//
// Un seul aller-retour par requête de supabase-js : les données et leur comptage partent
// ensemble, les paquets d'une grosse insertion aussi, dans un `batch` (atomique : tout ou
// rien, comme la transaction de PostgREST). Les erreurs de D1 sont redites comme PostgREST
// (errors.ts).

import type { TableInfo } from './catalog';
import { translateD1Error, type Operation } from './errors';
import { decodeRealtime, REALTIME_DRAIN_SQL, type RealtimeEvent } from './realtime';
import type { CompiledSelect } from './select';
import type { SqlValue } from './values';
import type { CompiledWrite } from './write';

/** Ce que la façade emploie de l'API D1 (le dépôt n'a pas @cloudflare/workers-types). */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; meta?: Record<string, unknown> }>;
}
export interface D1Database {
  prepare(sql: string): D1Statement;
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<Array<{ results: T[]; meta?: Record<string, unknown> }>>;
}

type Row = Record<string, unknown>;

const prepared = (db: D1Database, sql: string, params: SqlValue[]) => db.prepare(sql).bind(...params);

export async function runSelect(
  db: D1Database,
  compiled: CompiledSelect,
  table: TableInfo,
  options: { count: boolean; head: boolean }
): Promise<{ rows: Row[]; count: number | null }> {
  try {
    const statements = [];
    if (!options.head) statements.push(prepared(db, compiled.sql, compiled.params));
    if (options.count) statements.push(prepared(db, compiled.countSql, compiled.countParams));
    const results = await db.batch<Row>(statements);
    const rows = options.head ? [] : (results[0]?.results ?? []).map(compiled.decode);
    const countRow = options.count ? results[results.length - 1]?.results[0] : undefined;
    return { rows, count: options.count ? Number(countRow?.n ?? 0) : null };
  } catch (err) {
    throw translateD1Error(err, table, 'select');
  }
}

export async function runWrite(
  db: D1Database,
  compiled: CompiledWrite,
  table: TableInfo,
  operation: Operation,
  options: { drainRealtime?: boolean } = {}
): Promise<{ rows: Row[]; changes: number; realtime: RealtimeEvent[] }> {
  if (compiled.statements.length === 0) return { rows: [], changes: 0, realtime: [] };
  try {
    const statements = compiled.statements.map((s) => prepared(db, s.sql, s.params));
    // Lot 4c : la boîte d'envoi du temps réel, vidée dans le même envoi (atomique).
    if (options.drainRealtime) statements.push(db.prepare(REALTIME_DRAIN_SQL));
    const results = await db.batch<Row>(statements);
    const drained = options.drainRealtime ? (results.pop()?.results ?? []) : [];
    const raw = results.flatMap((r) => r.results ?? []);
    // Lignes touchées = lignes rendues par RETURNING (meta.changes compterait les cascades).
    return { rows: compiled.returns ? raw.map(compiled.decode) : [], changes: raw.length, realtime: decodeRealtime(drained) };
  } catch (err) {
    throw translateD1Error(err, table, operation);
  }
}
