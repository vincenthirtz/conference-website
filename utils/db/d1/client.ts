// utils/db/d1/client.ts — le client de la façade D1, à la forme de supabase-js (lot 3e de
// conference-website docs/D1-MIGRATION.md).
//
// `createD1Client(env.DB, catalog).from('teams').select('…').eq('slug', s).maybeSingle()`
// rend `{ data, error, count, status, statusText }` comme supabase-js : mêmes méthodes
// (celles du contrat figé au lot 1c, database/db-contract.json), même réponse, mêmes erreurs
// (codes de Postgres et de PostgREST). Comme supabase-js, rien n'est levé : l'erreur revient
// dans la réponse, et la requête part au premier `await`.
//
// `rpc()` : les fonctions de la base réécrites en TypeScript (functions/, lot 4) ; une fonction
// pas encore réécrite rend PGRST202.

import { runInBackground } from '@/utils/background';
import { DB_ERROR_CODES as C } from '../errors';
import type { DbCatalog, TableInfo } from './catalog';
import { DbError, dbError, statusText, type PostgrestErrorLike } from './errors';
import { runSelect, runWrite, type D1Database } from './execute';
import { parseColumnRef, parseLogic, parseOpCondition, type Condition, type FilterOp } from './filters';
import { compileSelect, parseSelect, tableOf, type OrderSpec, type SelectField } from './select';
import type { DbFunctionName } from '../rpc';
import { D1_FUNCTIONS } from './functions';
import type { RealtimeEvent } from './realtime';
import { compileWrite, type WriteOperation } from './write';

export interface D1Response<T = unknown> {
  data: T | null;
  error: PostgrestErrorLike | null;
  count: number | null;
  status: number;
  statusText: string;
}

type CountOption = { count?: 'exact' | 'planned' | 'estimated' | null };
type Row = Record<string, unknown>;

export interface D1ClientOptions {
  /**
   * Lecture publique (lot 3g) : pour les lectures dont les lignes partent telles quelles vers
   * le navigateur. Les colonnes sensibles de la carte (celles que la clé publique ne lisait pas
   * en production) et toute écriture sont refusées, avec le code de Postgres (42501).
   */
  publicRead?: boolean;
  /** …sauf ces colonnes (`table.colonne`), publiées à dessein — la raison écrite chez l'appelant. */
  allow?: string[];
  /**
   * Temps réel (lot 4c) : reçoit, après chaque écriture réussie, les salons que ses
   * déclencheurs ont notés (cascades comprises) ; typiquement `createRealtimeNotifier(…)`
   * (realtime.ts). Lancé par runInBackground : une erreur est journalisée, jamais rendue.
   */
  notify?: (events: RealtimeEvent[]) => void | Promise<void>;
  /** Variables du Worker que des fonctions de la base lisent à la place de Vault (lot 4d : REALTIME_TICKET_SECRET). */
  env?: Readonly<Record<string, string | undefined>>;
}

class D1QueryBuilder {
  constructor(
    private readonly db: D1Database,
    private readonly catalog: DbCatalog,
    private readonly table: string,
    private readonly options: D1ClientOptions = {}
  ) {}

  select(columns = '*', options: CountOption & { head?: boolean } = {}): D1FilterBuilder {
    return new D1FilterBuilder(this.db, this.catalog, this.table, 'select', {
      publicRead: this.options.publicRead,
      allow: this.options.allow,
      fields: columns,
      count: Boolean(options.count),
      head: Boolean(options.head),
    });
  }

  insert(values: Row | Row[], options: CountOption = {}): D1FilterBuilder {
    return this.writer('insert', { values, count: Boolean(options.count) });
  }

  upsert(
    values: Row | Row[],
    options: CountOption & { onConflict?: string; ignoreDuplicates?: boolean } = {}
  ): D1FilterBuilder {
    return this.writer('upsert', {
      values,
      count: Boolean(options.count),
      onConflict: options.onConflict,
      ignoreDuplicates: options.ignoreDuplicates,
    });
  }

  update(values: Row, options: CountOption = {}): D1FilterBuilder {
    return this.writer('update', { values, count: Boolean(options.count) });
  }

  delete(options: CountOption = {}): D1FilterBuilder {
    return this.writer('delete', { count: Boolean(options.count) });
  }

  private writer(operation: WriteOperation, state: State): D1FilterBuilder {
    const builder = new D1FilterBuilder(this.db, this.catalog, this.table, operation, { ...state, notify: this.options.notify });
    if (this.options.publicRead) builder.refuse(dbError(C.insufficientPrivilege, `permission denied for table ${this.table}`));
    return builder;
  }
}

interface State {
  publicRead?: boolean;
  allow?: string[];
  fields?: string;
  values?: Row | Row[];
  count: boolean;
  head?: boolean;
  onConflict?: string;
  ignoreDuplicates?: boolean;
  notify?: D1ClientOptions['notify'];
}

/** Les filtres, le tri, les pages et `single` — et la réponse au premier `await`. */
export class D1FilterBuilder implements PromiseLike<D1Response> {
  private readonly conditions: Condition[] = [];
  private readonly orders: OrderSpec[] = [];
  private limitValue: number | null = null;
  private offsetValue: number | null = null;
  private returning: string | null = null;
  private mode: 'many' | 'single' | 'maybeSingle' = 'many';
  /** Erreur de construction (filtre illisible…) : rendue au premier `await`, comme PostgREST. */
  private pending: DbError | null = null;

  constructor(
    private readonly db: D1Database,
    private readonly catalog: DbCatalog,
    private readonly table: string,
    private readonly operation: 'select' | WriteOperation,
    private readonly state: State
  ) {}

  /** Refuser la requête au premier `await` (lecture publique : écriture interdite). */
  refuse(error: DbError): this {
    this.pending ??= error;
    return this;
  }

  private add(build: () => Condition): this {
    try {
      this.conditions.push(build());
    } catch (err) {
      this.pending ??= err instanceof DbError ? err : dbError(C.invalidQuery, String(err));
    }
    return this;
  }

  private op(column: string, op: FilterOp, js: unknown, negate = false): this {
    return this.add(() => ({ kind: 'op', ref: parseColumnRef(column), op, negate, value: { js } }));
  }

  eq(column: string, value: unknown) {
    return this.op(column, 'eq', value);
  }
  neq(column: string, value: unknown) {
    return this.op(column, 'neq', value);
  }
  gt(column: string, value: unknown) {
    return this.op(column, 'gt', value);
  }
  gte(column: string, value: unknown) {
    return this.op(column, 'gte', value);
  }
  lt(column: string, value: unknown) {
    return this.op(column, 'lt', value);
  }
  lte(column: string, value: unknown) {
    return this.op(column, 'lte', value);
  }
  like(column: string, pattern: string) {
    return this.op(column, 'like', pattern);
  }
  ilike(column: string, pattern: string) {
    return this.op(column, 'ilike', pattern);
  }
  is(column: string, value: boolean | null) {
    return this.op(column, 'is', value);
  }
  in(column: string, values: readonly unknown[]) {
    return this.op(column, 'in', [...values]);
  }
  contains(column: string, value: unknown) {
    return this.op(column, 'cs', value);
  }
  overlaps(column: string, value: unknown) {
    return this.op(column, 'ov', value);
  }
  textSearch(column: string, query: string, options: { type?: 'plain' | 'phrase' | 'websearch'; config?: string } = {}) {
    const op: FilterOp = options.type === 'plain' ? 'plfts' : options.type === 'phrase' ? 'phfts' : options.type === 'websearch' ? 'wfts' : 'fts';
    return this.op(column, op, query);
  }
  not(column: string, operator: string, value: unknown) {
    return this.add(() => parseOpCondition(column, operator, value, true));
  }
  filter(column: string, operator: string, value: unknown) {
    return this.add(() => parseOpCondition(column, operator, value));
  }
  or(filters: string, options: { referencedTable?: string; foreignTable?: string } = {}) {
    if (options.referencedTable || options.foreignTable) {
      this.pending ??= dbError(C.invalidQuery, '"or sur une table embarquée (referencedTable) : non pris en charge"');
      return this;
    }
    return this.add(() => ({ kind: 'group', logic: 'or', negate: false, items: parseLogic(filters) }));
  }

  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string; foreignTable?: string } = {}) {
    if (options.referencedTable || options.foreignTable) {
      this.pending ??= dbError(C.invalidQuery, '"order sur une table embarquée : non pris en charge"');
      return this;
    }
    this.orders.push({ column, ascending: options.ascending ?? true, nullsFirst: options.nullsFirst });
    return this;
  }
  limit(count: number) {
    this.limitValue = count;
    return this;
  }
  range(from: number, to: number) {
    this.offsetValue = from;
    this.limitValue = to - from + 1;
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybeSingle';
    return this;
  }
  /** Après une écriture : les lignes écrites reviennent (RETURNING). */
  select(columns = '*') {
    this.returning = columns;
    return this;
  }

  then<R1 = D1Response, R2 = never>(
    onfulfilled?: ((value: D1Response) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): Promise<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<D1Response> {
    try {
      if (this.pending) throw this.pending;
      return this.operation === 'select' ? await this.read() : await this.write();
    } catch (err) {
      const error = err instanceof DbError ? err : dbError('', err instanceof Error ? err.message : String(err));
      return { data: null, error: error.error, count: null, status: error.status, statusText: statusText(error.status) };
    }
  }

  private async read(): Promise<D1Response> {
    const table = tableOf(this.catalog, this.table);
    const compiled = compileSelect(
      {
        table: this.table,
        fields: parseSelect(this.state.fields ?? '*'),
        conditions: this.conditions,
        orders: this.orders,
        limit: this.limitValue,
        offset: this.offsetValue,
      },
      this.catalog,
      { publicRead: this.state.publicRead === true, allow: this.state.allow }
    );
    const { rows, count } = await runSelect(this.db, compiled, table, { count: this.state.count, head: Boolean(this.state.head) });
    if (this.state.head) return { data: null, error: null, count, status: 200, statusText: statusText(200) };
    return this.shape(rows, count, 200);
  }

  private async write(): Promise<D1Response> {
    const table = tableOf(this.catalog, this.table);
    const operation = this.operation as WriteOperation;
    const returning: SelectField[] | null = this.returning === null ? null : parseSelect(this.returning);
    // Lot 4b : une colonne posée par un déclencheur après l'écriture échappe à RETURNING ;
    // l'écriture rend alors la clé, et les lignes sont relues.
    const reread = returning !== null && operation !== 'delete' && Boolean(table.computed?.length);
    const compiled = compileWrite(
      {
        table: this.table,
        operation,
        values: this.state.values,
        conditions: this.conditions,
        onConflict: this.state.onConflict,
        ignoreDuplicates: this.state.ignoreDuplicates,
        returning: reread ? parseSelect(table.primaryKey.join(',')) : returning,
      },
      this.catalog
    );
    const written = await runWrite(this.db, compiled, table, operation, { drainRealtime: this.catalog.realtime });
    if (written.realtime.length) this.announce(written.realtime);
    const { changes } = written;
    const rows = reread && returning ? await this.reread(table, written.rows, returning) : written.rows;
    const count = this.state.count ? changes : null;
    const created = operation === 'insert' || operation === 'upsert';
    if (returning === null) {
      const status = created ? 201 : 204;
      return { data: null, error: null, count, status, statusText: statusText(status) };
    }
    return this.shape(rows, count, created ? 201 : 200);
  }

  /** Remet les changements au temps réel ; une erreur ne remonte jamais à l'écriture (pg_net non plus). */
  private announce(events: RealtimeEvent[]): void {
    announceRealtime(this.state.notify, events);
  }

  /**
   * Les lignes que l'écriture vient de toucher, relues par leur clé, dans l'ordre de
   * l'écriture. Pas dans le même envoi (la clé d'une insertion n'est connue qu'après) : une
   * modification glissée entre les deux se verrait, ce que PostgREST n'aurait pas montré.
   */
  private async reread(table: TableInfo, written: Row[], fields: SelectField[]): Promise<Row[]> {
    if (written.length === 0) return [];
    const [pk] = table.primaryKey as [string];
    const key = '__d1_key';
    const compiled = compileSelect(
      {
        table: table.name,
        fields: [...fields, ...parseSelect(`${key}:${pk}`)],
        conditions: [{ kind: 'op', ref: { relation: [], column: pk, json: [] }, op: 'in', negate: false, value: { js: written.map((r) => r[pk]) } }],
        orders: [],
        limit: null,
        offset: null,
      },
      this.catalog
    );
    const { rows } = await runSelect(this.db, compiled, table, { count: false, head: false });
    const byKey = new Map(rows.map((r) => [r[key], r]));
    return written.flatMap((w) => {
      const row = byKey.get(w[pk]);
      if (!row) return [];
      const { [key]: _key, ...rest } = row;
      return [rest];
    });
  }

  /** `single` / `maybeSingle` : un objet, ou PGRST116, comme supabase-js. */
  private shape(rows: Row[], count: number | null, status: number): D1Response {
    if (this.mode === 'many') return { data: rows, error: null, count, status, statusText: statusText(status) };
    if (rows.length === 1) return { data: rows[0], error: null, count, status, statusText: statusText(status) };
    if (this.mode === 'maybeSingle' && rows.length === 0) {
      return { data: null, error: null, count, status, statusText: statusText(status) };
    }
    const error = dbError(
      C.singleRowExpected,
      'JSON object requested, multiple (or no) rows returned',
      this.mode === 'single'
        ? `The result contains ${rows.length} rows`
        : `Results contain ${rows.length} rows, application/vnd.pgrst.object+json requires 1 row`
    );
    return { data: null, error: error.error, count: null, status: error.status, statusText: statusText(error.status) };
  }
}

export interface D1Client {
  from(table: string): D1QueryBuilder;
  rpc(name: string, args?: Record<string, unknown>): Promise<D1Response>;
}

export function createD1Client(db: D1Database, catalog: DbCatalog, options: D1ClientOptions = {}): D1Client {
  return {
    from: (table) => new D1QueryBuilder(db, catalog, table, options),
    // Lot 4 : les fonctions de la base réécrites en TypeScript (functions/index.ts) ; les autres
    // rendent encore PGRST202, comme une fonction inconnue de PostgREST.
    rpc: async (name, args = {}) => {
      try {
        if (options.publicRead) throw dbError(C.insufficientPrivilege, `permission denied for function ${name}`);
        const fn = D1_FUNCTIONS[name as DbFunctionName];
        if (!fn) throw dbError(C.unknownFunction, `Could not find the function public.${name} in the schema cache`);
        const data = await fn({ db, catalog, env: options.env ?? {}, announce: (events) => announceRealtime(options.notify, events) }, args);
        return { data, error: null, count: null, status: 200, statusText: statusText(200) };
      } catch (err) {
        const error = err instanceof DbError ? err : dbError('', err instanceof Error ? err.message : String(err));
        return { data: null, error: error.error, count: null, status: error.status, statusText: statusText(error.status) };
      }
    },
  };
}

/** Remet les changements au temps réel, en fond (`waitUntil` sur le Worker) ; une erreur est journalisée, jamais rendue. */
function announceRealtime(notify: D1ClientOptions['notify'], events: RealtimeEvent[]): void {
  if (notify && events.length) runInBackground(() => Promise.resolve(notify(events)), 'd1/realtime');
}
