// utils/db/d1/functions/context.ts — le socle des fonctions de la base réécrites en TypeScript
// (lot 4 de conference-website docs/D1-MIGRATION.md, à partir de 4d).
//
// `client.rpc(nom, arguments)` de la façade appelle la fonction TypeScript du même nom
// (functions/index.ts) et rend ce que PostgREST rendait : `data` (une valeur, ou un tableau de
// lignes pour un `RETURNS TABLE`), ou l'erreur de Postgres. Chaque fonction :
//   * lit ses arguments comme PostgREST : noms connus seulement, défauts posés, valeurs
//     converties au type Postgres (une uuid illisible → 22P02, comme avant) ;
//   * lit par `runRead`, écrit par `runBatch` : UN envoi, atomique comme la transaction d'une
//     fonction plpgsql ; la boîte du temps réel y est vidée (lot 4c) ;
//   * garde ses expressions sous le plafond de D1 (profondeur 100, une sous-requête « valeur »
//     ou EXISTS compte double) : foldCase / sortKey dans des tables dérivées (FROM), qui ne
//     comptent pas.

import { DB_ERROR_CODES as C } from '../../errors';
import type { ColumnKind, DbCatalog } from '../catalog';
import { DbError, dbError, translateD1Error, type Operation } from '../errors';
import type { D1Database } from '../execute';
import { SQL_NOW } from '../now';
import { decodeRealtime, REALTIME_DRAIN_SQL, type RealtimeEvent } from '../realtime';
import { fromDb, toInteger, toUuid, type SqlValue } from '../values';

export interface D1FunctionContext {
  db: D1Database;
  catalog: DbCatalog;
  /** Variables du Worker (secrets compris) que certaines fonctions lisent à la place de Vault. */
  env: Readonly<Record<string, string | undefined>>;
  /** Remet au temps réel les salons notés pendant l'envoi (client.ts). */
  announce(events: RealtimeEvent[]): void;
}

export type D1Function = (ctx: D1FunctionContext, args: Record<string, unknown>) => Promise<unknown>;

type Row = Record<string, unknown>;

/** Un argument sans défaut (obligatoire). */
export const REQUIRED = Symbol('required');

/**
 * Les arguments, comme PostgREST les résout : un nom inconnu ou un argument obligatoire absent
 * → PGRST202 (aucune fonction de cette signature) ; `undefined` vaut absent (JSON l'omet).
 */
export function readArgs(name: string, args: Record<string, unknown>, params: Record<string, unknown>): Record<string, unknown> {
  const given = Object.entries(args).filter(([, v]) => v !== undefined);
  const unknown = given.map(([k]) => k).filter((k) => !(k in params));
  const missing = Object.entries(params)
    .filter(([k, d]) => d === REQUIRED && !given.some(([g]) => g === k))
    .map(([k]) => k);
  if (unknown.length || missing.length) {
    throw dbError(
      C.unknownFunction,
      `Could not find the function public.${name}(${given.map(([k]) => k).join(', ')}) in the schema cache`,
      null,
      'Perhaps you meant to call the function with other arguments'
    );
  }
  const out: Record<string, unknown> = {};
  for (const [k, d] of Object.entries(params)) {
    const v = given.find(([g]) => g === k)?.[1];
    out[k] = v !== undefined ? v : d === REQUIRED ? null : d;
  }
  return out;
}

/** Une lecture. */
export async function runRead(ctx: D1FunctionContext, sql: string, params: SqlValue[], table: string): Promise<Row[]> {
  try {
    return (await ctx.db.prepare(sql).bind(...params).all<Row>()).results;
  } catch (err) {
    throw err instanceof DbError ? err : translateD1Error(err, ctx.catalog.table(table), 'select');
  }
}

/**
 * Un envoi d'écritures (et de lectures), atomique : tout ou rien, comme la transaction d'une
 * fonction plpgsql. Rend les lignes de chaque instruction, dans l'ordre.
 */
export async function runBatch(
  ctx: D1FunctionContext,
  statements: Array<{ sql: string; params: SqlValue[] }>,
  at: { table: string; operation: Operation }
): Promise<Row[][]> {
  const prepared = statements.map((s) => ctx.db.prepare(s.sql).bind(...s.params));
  if (ctx.catalog.realtime) prepared.push(ctx.db.prepare(REALTIME_DRAIN_SQL));
  try {
    const results = await ctx.db.batch<Row>(prepared);
    const drained = ctx.catalog.realtime ? (results.pop()?.results ?? []) : [];
    const events = decodeRealtime(drained);
    if (events.length) ctx.announce(events);
    return results.map((r) => r.results ?? []);
  } catch (err) {
    throw err instanceof DbError ? err : translateD1Error(err, ctx.catalog.table(at.table), at.operation);
  }
}

/** Les colonnes d'un `RETURNS TABLE`, décodées comme la façade décode une lecture. */
export function decodeRows(rows: Row[], columns: Record<string, ColumnKind>): Row[] {
  return rows.map((r) => Object.fromEntries(Object.entries(columns).map(([k, kind]) => [k, fromDb(kind, r[k])])));
}

/** `trim()` de Postgres : les espaces seulement (pas les tabulations ni les retours). */
export const pgTrim = (s: string) => s.replace(/^ +| +$/g, '');

// ---------------------------------------------------------------------------
// Lot 4e : les fonctions qui écrivent dans plusieurs tables, en UN envoi
// ---------------------------------------------------------------------------
//
// En production, ces fonctions posaient des verrous (FOR UPDATE, verrou consultatif par
// tournoi) pour que deux appels simultanés ne se mêlent pas. D1 exécute un envoi à la fois, en
// entier ou pas du tout : la fonction tient donc en un seul envoi, dans l'ordre de Postgres.
// Chaque refus y est une garde (`guard`), chaque variable plpgsql une ligne de `_d1_vars`.

export type Statement = { sql: string; params: SqlValue[] };

/**
 * `RAISE EXCEPTION '<message>' USING ERRCODE = '<code>', HINT = '<indice>'` quand `condition`
 * est vraie : l'écriture dans `_d1_guard` annule l'envoi entier (database/d1/schema.sql).
 * `condition` n'emploie que des `?` simples : le message occupe le paramètre numéro 1, un `?1`
 * le relirait.
 */
export function guard(code: string, message: string, condition: string, params: SqlValue[] = [], hint?: string): Statement {
  return { sql: `INSERT INTO "_d1_guard" ("code") SELECT ? WHERE ${condition}`, params: [`pg:${code}:${message}${hint ? `|hint=${hint}` : ''}`, ...params] };
}

/** Une variable plpgsql : la valeur de `expr` (une sous-requête scalaire), NULL si elle ne rend rien. */
export function setVar(name: string, expr: string, params: SqlValue[] = []): Statement {
  return { sql: `INSERT OR REPLACE INTO "_d1_vars" ("k", "v") SELECT '${name}', (${expr})`, params };
}

/**
 * La valeur d'une variable, dans une instruction suivante du même envoi. TOUJOURS du texte
 * (`_d1_vars."v"` est TEXT) : la convertir avant de la comparer à un nombre ('1' <> 1).
 */
export const varOf = (name: string) => `(SELECT "v" FROM "_d1_vars" WHERE "k" = '${name}')`;

/** En première et dernière instruction : les variables ne survivent pas à l'envoi. */
export const CLEAR_VARS: Statement = { sql: 'DELETE FROM "_d1_vars"', params: [] };

/**
 * `, "updated_at" = maintenant` si la table a une date de modification (lot 4a) : un UPDATE
 * écrit à la main ne passe pas par la façade, mais Postgres la posait par déclencheur.
 */
export function touchSql(ctx: D1FunctionContext, table: string): string {
  const column = ctx.catalog.table(table)?.touch;
  return column ? `, "${column}" = ${SQL_NOW}` : '';
}

/** Une ligne entière (`to_jsonb(ligne)` de Postgres), décodée selon la carte. */
export function decodeTableRow(ctx: D1FunctionContext, table: string, row: Row | undefined): Row | null {
  const info = ctx.catalog.table(table);
  if (!row || !info) return null;
  return Object.fromEntries(info.columns.map((c) => [c.name, fromDb(c.type, row[c.name])]));
}

// ---------------------------------------------------------------------------
// Lot 4f : lire, décider, écrire en vérifiant (fonctions trop riches pour un seul envoi)
// ---------------------------------------------------------------------------
//
// Les échanges du TCG décident carte par carte, avec une douzaine de réponses possibles. Ils
// lisent donc tout D'UN COUP (un envoi = une photo cohérente), décident en TypeScript comme la
// fonction plpgsql, puis écrivent en un envoi qui REVÉRIFIE d'abord que rien n'a bougé : mêmes
// lignes encore valables (le FOR UPDATE de Postgres), même compteur des verrous consultatifs
// (`_d1_locks`). Si quelque chose a bougé, tout recommence : là où Postgres faisait attendre le
// second appel, D1 le fait rejouer.

const CONFLICT = 'd1_conflict';

/** Une garde de conflit : vraie → l'écriture est refusée, et `optimistic` rejoue la fonction. */
export function conflictGuard(condition: string, params: SqlValue[] = []): Statement {
  return guard(C.serializationFailure, CONFLICT, condition, params);
}

/** Rejoue `attempt` tant qu'une garde de conflit l'arrête (5 fois au plus, puis l'erreur 40001). */
export async function optimistic<T>(attempt: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await attempt();
    } catch (err) {
      const conflict = err instanceof DbError && err.error.code === C.serializationFailure && err.error.message === CONFLICT;
      if (!conflict || i >= tries) throw err;
    }
  }
}

/** Le compteur d'un verrou consultatif, lu dans la photo. */
export const readLock = (key: string): Statement => ({ sql: 'SELECT coalesce((SELECT "n" FROM "_d1_locks" WHERE "k" = ?), 0) AS "n"', params: [key] });
/** À l'écriture : le compteur n'a pas bougé depuis la photo (sinon, conflit). */
export const lockUnchanged = (key: string, n: number): Statement => conflictGuard('coalesce((SELECT "n" FROM "_d1_locks" WHERE "k" = ?), 0) <> ?', [key, n]);
/** À l'écriture : le verrou est « pris » (le compteur avance). */
export const bumpLock = (key: string): Statement => ({
  sql: 'INSERT INTO "_d1_locks" ("k", "n") VALUES (?, 1) ON CONFLICT ("k") DO UPDATE SET "n" = "n" + 1',
  params: [key],
});

/** Un argument uuid : NULL, ou converti comme Postgres (22P02 sinon). */
export const uuidArg = (v: unknown): string | null => (v === null || v === undefined ? null : toUuid(v));
/** Un argument entier. */
export const intArg = (v: unknown): number | null => (v === null || v === undefined ? null : toInteger(v, 'integer'));
/** Un argument texte. */
export const textArg = (v: unknown): string | null => (v === null || v === undefined ? null : typeof v === 'string' ? v : String(v));
