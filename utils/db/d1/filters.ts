// utils/db/d1/filters.ts — les filtres de supabase-js, traduits en SQL pour D1 (lot 3b de
// conference-website docs/D1-MIGRATION.md).
//
// Deux entrées :
//   * les méthodes (`.eq(col, v)`, `.in(col, [..])`, `.contains(col, {..})`…) : la valeur
//     arrive en JavaScript ;
//   * le mini-langage de PostgREST (`.or('a.eq.1,and(b.gt.2,c.is.null)')`, `.not(col, op, v)`,
//     `.filter(col, op, v)`) : la valeur arrive en texte et se lit comme PostgREST la lit.
// Les deux donnent un même arbre (`Condition`), traduit ensuite en SQL avec ses paramètres.
//
// Ce qui est fait comme PostgREST (cf. database/db-contract.json, lot 1c) :
//   * eq, neq, gt, gte, lt, lte, like, ilike, is, in, cs (contient), ov (chevauche), fts ;
//   * `not.` devant un opérateur, groupes `and(…)`/`or(…)` imbriqués, `not.and(…)` ;
//   * chemins JSON `payload->>cle` (valeur en texte, comme Postgres) ;
//   * colonne d'une table embarquée (`team.status`), résolue par la lecture (select.ts).
// `ilike` et la recherche textuelle ignorent la casse comme ICU pour les lettres latines
// (collation.ts : É = é, e ≠ é). Écart connu : la recherche textuelle cherche les mots tels
// quels, sans racinisation.

import type { ColumnKind, D1Column, TableInfo } from './catalog';
import { foldCase } from './collation';
import { dbError } from './errors';
import { DB_ERROR_CODES as C } from '../errors';
import { parsePgArrayLiteral, toDb, type SqlValue } from './values';

export type FilterOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'ilike'
  | 'is'
  | 'in'
  | 'cs'
  | 'ov'
  | 'fts'
  | 'plfts'
  | 'phfts'
  | 'wfts';

const OPS = new Set<string>(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'cs', 'ov', 'fts', 'plfts', 'phfts', 'wfts']);

/** Une colonne visée par un filtre : `[relation.]*colonne[->clé]*[->>clé]`. */
export interface ColumnRef {
  relation: string[];
  column: string;
  json: Array<{ arrow: '->' | '->>'; key: string }>;
}

/** Valeur d'un filtre : JavaScript (méthodes) ou texte du mini-langage de PostgREST. */
export type FilterValue = { js: unknown } | { text: string };

export type Condition =
  | { kind: 'op'; ref: ColumnRef; op: FilterOp; negate: boolean; value: FilterValue }
  | { kind: 'group'; logic: 'and' | 'or'; negate: boolean; items: Condition[] };

const syntax = (message: string) => dbError(C.invalidQuery, `"failed to parse filter (${message})"`, null);

export function parseColumnRef(text: string): ColumnRef {
  const parts = text.trim().split(/(->>|->)/);
  const head = (parts[0] as string).split('.');
  const json: ColumnRef['json'] = [];
  for (let i = 1; i < parts.length; i += 2) {
    json.push({ arrow: parts[i] as '->' | '->>', key: (parts[i + 1] as string).replace(/^"|"$/g, '') });
  }
  if (json.slice(0, -1).some((j) => j.arrow === '->>')) throw syntax(`chemin JSON : ${text}`);
  return { relation: head.slice(0, -1), column: head[head.length - 1] as string, json };
}

/** Coupe aux virgules de premier niveau (hors guillemets et parenthèses). */
function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' && quoted) i++;
    else if (c === '"') quoted = !quoted;
    else if (!quoted && (c === '(' || c === '{' || c === '[')) depth++;
    else if (!quoted && (c === ')' || c === '}' || c === ']')) depth--;
    else if (!quoted && depth === 0 && c === ',') {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

/** `"a,b"` → `a,b` ; le reste tel quel. */
function unquote(text: string): string {
  const t = text.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/\\(.)/g, '$1') : t;
}

/** Une condition simple du mini-langage : `col.op.valeur` ou `col.not.op.valeur`. */
function parseLeaf(text: string): Condition {
  const m = /^(.+?)\.(not\.)?([a-z]+)(?:\([a-z_ ]*\))?\.([\s\S]*)$/.exec(text);
  if (!m || !OPS.has(m[3] as string)) throw syntax(text);
  return {
    kind: 'op',
    ref: parseColumnRef(m[1] as string),
    op: m[3] as FilterOp,
    negate: Boolean(m[2]),
    value: { text: m[4] as string },
  };
}

/** Le contenu de `.or('…')` ou d'un groupe `and(…)` : une liste de conditions. */
export function parseLogic(text: string): Condition[] {
  return splitTopLevel(text).map((item) => {
    const g = /^(not\.)?(and|or)\(([\s\S]*)\)$/.exec(item);
    if (g) {
      return { kind: 'group', logic: g[2] as 'and' | 'or', negate: Boolean(g[1]), items: parseLogic(g[3] as string) };
    }
    return parseLeaf(item);
  });
}

/** `.not(col, op, valeur)` et `.filter(col, op, valeur)` : `op` peut porter `not.`. */
export function parseOpCondition(column: string, op: string, value: unknown, negate = false): Condition {
  const m = /^(not\.)?([a-z]+)$/.exec(op);
  if (!m || !OPS.has(m[2] as string)) throw syntax(`opérateur ${op}`);
  const text = value === null ? 'null' : typeof value === 'string' ? value : String(value);
  return { kind: 'op', ref: parseColumnRef(column), op: m[2] as FilterOp, negate: negate !== Boolean(m[1]), value: { text } };
}

// ---------------------------------------------------------------------------
// Traduction en SQL
// ---------------------------------------------------------------------------

/** Où se résolvent les colonnes : la table, son alias, et les tables embarquées. */
/** Lecture publique (lot 3g) : les colonnes sensibles refusées, sauf celles autorisées (`table.colonne`). */
export type PublicRead = { allow: ReadonlySet<string> } | null;

export interface FilterScope {
  table: TableInfo;
  alias: string;
  /** Mode « lecture publique » : filtrer sur une colonne sensible est refusé aussi. */
  publicRead?: PublicRead;
  /** Colonne d'une table embarquée (`team.status`) : fourni par la lecture (select.ts). */
  relation?(path: string[]): FilterScope;
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
const jsonPath = (keys: string[]) => `$${keys.map((k) => `."${k.replace(/"/g, '\\"')}"`).join('')}`;

interface Target {
  /** Expression SQL de la valeur comparée. */
  sql: string;
  /** La colonne, quand la valeur est la colonne elle-même (pas un chemin JSON). */
  column: D1Column | null;
  /** Genre de la valeur comparée : celui de la colonne, ou `text` au bout d'un `->>`. */
  kind: ColumnKind;
  /** Colonne JSON entière (pour `cs`) : expression et chemin. */
  json: { base: string; path: string } | null;
}

function resolveTarget(ref: ColumnRef, scope: FilterScope): Target {
  const s = ref.relation.length ? (scope.relation ? scope.relation(ref.relation) : null) : scope;
  if (!s) throw dbError(C.invalidQuery, `"failed to parse filter (${ref.relation.join('.')}.${ref.column})"`);
  const column = s.table.column.get(ref.column);
  if (!column) throw dbError(C.undefinedColumn, `column ${s.table.name}.${ref.column} does not exist`);
  if (s.publicRead && s.table.sensitiveSet.has(ref.column) && !s.publicRead.allow.has(`${s.table.name}.${ref.column}`)) {
    throw dbError(C.insufficientPrivilege, `permission denied for column ${ref.column} of relation ${s.table.name}`);
  }
  const base = `${q(s.alias)}.${q(ref.column)}`;
  if (ref.json.length === 0) return { sql: base, column, kind: column.type, json: { base, path: '$' } };
  if (column.type !== 'json') throw dbError(C.undefinedFunction, `operator does not exist: ${column.pg} -> unknown`);
  const keys = ref.json.map((j) => j.key);
  const path = jsonPath(keys);
  const last = ref.json[ref.json.length - 1] as { arrow: string };
  if (last.arrow === '->') return { sql: `json_extract(${base}, '${path}')`, column: null, kind: 'json', json: { base, path } };
  // `->>` : le texte de la valeur, comme Postgres (true/false en toutes lettres, null → NULL).
  const text =
    `(CASE json_type(${base}, '${path}') WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' WHEN 'null' THEN NULL ` +
    `ELSE CAST(json_extract(${base}, '${path}') AS TEXT) END)`;
  return { sql: text, column: null, kind: 'text', json: null };
}

/** Une valeur du filtre, convertie pour la colonne visée. */
function scalar(target: Target, value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (target.column) return toDb(target.column, value);
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Les éléments d'une liste `in` : tableau JavaScript, ou `(a,"b,c")` du mini-langage. */
function listOf(value: FilterValue): unknown[] {
  if ('js' in value) {
    if (!Array.isArray(value.js)) throw syntax('in attend une liste');
    return value.js;
  }
  const t = value.text.trim();
  if (!t.startsWith('(') || !t.endsWith(')')) throw syntax(`in.${t}`);
  const inner = t.slice(1, -1);
  return inner.trim() === '' ? [] : splitTopLevel(inner).map(unquote);
}

/** Valeur de `cs`/`ov` : objet ou tableau JavaScript, JSON, ou tableau Postgres `{a,b}`. */
function structured(value: FilterValue): unknown {
  if ('js' in value) return typeof value.js === 'string' ? structured({ text: value.js }) : value.js;
  const t = value.text.trim();
  if (t.startsWith('[') || /^\{\s*("|\})/.test(t)) {
    try {
      return JSON.parse(t);
    } catch {
      // tableau Postgres qui commence par un guillemet : lu plus bas
    }
  }
  if (t.startsWith('{')) return parsePgArrayLiteral(t);
  if (t.startsWith('(') && t.endsWith(')')) return listOf({ text: t });
  throw syntax(`valeur ${t}`);
}

/** Les éléments d'un tableau, convertis pour une colonne `text[]`, `uuid[]`… */
function arrayElements(target: Target, items: unknown[]): unknown[] {
  if (!target.column || target.column.type !== 'array') return items;
  return JSON.parse(toDb(target.column, items) as string) as unknown[];
}

/**
 * `colonne JSON @> valeur` (contenance de Postgres), en SQL : chaque clé de l'objet cherché
 * doit exister avec une valeur contenue ; chaque élément d'un tableau cherché doit être
 * contenu dans un élément du tableau de la ligne.
 */
function jsonContains(base: string, path: string, value: unknown, params: SqlValue[]): string {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.entries(value as Record<string, unknown>);
    const own = `json_type(${base}, '${path}') = 'object'`;
    return `(${[own, ...keys.map(([k, v]) => jsonContains(base, `${path}."${k.replace(/"/g, '\\"')}"`, v, params))].join(' AND ')})`;
  }
  if (Array.isArray(value)) {
    const own = `json_type(${base}, '${path}') = 'array'`;
    const each = value.map((item) => {
      if (item !== null && typeof item === 'object') {
        return `EXISTS (SELECT 1 FROM json_each(${base}, '${path}') AS e WHERE ${jsonContains('e.value', '$', item, params)})`;
      }
      return `EXISTS (SELECT 1 FROM json_each(${base}, '${path}') AS e WHERE ${scalarMatch('e.type', 'e.value', item, params)})`;
    });
    return `(${[own, ...each].join(' AND ')})`;
  }
  return `(${scalarMatch(`json_type(${base}, '${path}')`, `json_extract(${base}, '${path}')`, value, params)})`;
}

/** Une valeur JSON scalaire égale à `value`, type compris (1 ≠ true ≠ "1"). */
function scalarMatch(typeSql: string, valueSql: string, value: unknown, params: SqlValue[]): string {
  if (value === null) return `${typeSql} = 'null'`;
  if (typeof value === 'boolean') return `${typeSql} = '${value ? 'true' : 'false'}'`;
  if (typeof value === 'number') {
    params.push(value);
    return `${typeSql} IN ('integer', 'real') AND ${valueSql} = ?`;
  }
  params.push(String(value));
  return `${typeSql} = 'text' AND ${valueSql} = ?`;
}

/**
 * `like`/`ilike` : `*` vaut `%` (PostgREST). Les formes courantes (`%mot%`, `mot%`, `%mot`,
 * sans joker) passent par instr/substr, sans la limite de 50 octets de D1 ; les autres par
 * LIKE (sans casse, ASCII) ou GLOB (avec casse).
 */
function likeSql(sql: string, raw: string, ci: boolean, params: SqlValue[]): string {
  const pattern = raw.replace(/\*/g, '%');
  // Sans casse : celle d'ICU pour les lettres latines (É = é), pas seulement l'ASCII.
  const e = ci ? foldCase(sql) : sql;
  const v = ci ? foldCase('?') : '?';
  const plain = (s: string) => !/[%_\\]/.test(s);
  let m: RegExpExecArray | null;
  if (plain(pattern)) {
    params.push(pattern);
    return `${e} = ${v}`;
  }
  if ((m = /^%([^%]*)%$/.exec(pattern)) && plain(m[1] as string)) {
    params.push(m[1] as string);
    return `instr(${e}, ${v}) > 0`;
  }
  if ((m = /^([^%]*)%$/.exec(pattern)) && plain(m[1] as string)) {
    params.push(m[1] as string, m[1] as string);
    return `substr(${e}, 1, length(?)) = ${v}`;
  }
  if ((m = /^%([^%]*)$/.exec(pattern)) && plain(m[1] as string)) {
    // Plus court que le suffixe, substr rend le texte entier : il ne peut pas être égal.
    params.push(m[1] as string, m[1] as string);
    return `substr(${e}, -length(?)) = ${v}`;
  }
  if (ci) {
    if (Buffer.byteLength(pattern) > 50) throw dbError(C.programLimitExceeded, 'LIKE pattern too long for D1 (50 bytes)');
    params.push(pattern);
    return `${e} LIKE ${v} ESCAPE '\\'`;
  }
  let glob = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i] as string;
    if (c === '\\') glob += /[*?[]/.test(pattern[i + 1] ?? '') ? `[${pattern[++i]}]` : (pattern[++i] ?? '');
    else if (c === '%') glob += '*';
    else if (c === '_') glob += '?';
    else if (c === '*' || c === '?' || c === '[') glob += `[${c}]`;
    else glob += c;
  }
  if (Buffer.byteLength(glob) > 50) throw dbError(C.programLimitExceeded, 'LIKE pattern too long for D1 (50 bytes)');
  params.push(glob);
  return `${sql} GLOB ?`;
}

function textOf(value: FilterValue): string {
  if ('text' in value) return unquote(value.text);
  if (typeof value.js !== 'string') throw syntax('motif attendu');
  return value.js;
}

/** Une condition → SQL ; les valeurs vont dans `params`, dans l'ordre des `?`. */
export function compileCondition(cond: Condition, scope: FilterScope, params: SqlValue[]): string {
  if (cond.kind === 'group') {
    const parts = cond.items.map((c) => compileCondition(c, scope, params));
    const sql = parts.length ? `(${parts.join(cond.logic === 'and' ? ' AND ' : ' OR ')})` : cond.logic === 'and' ? '1' : '0';
    return cond.negate ? `(NOT ${sql})` : sql;
  }
  const target = resolveTarget(cond.ref, scope);
  const sql = compileOp(cond, target, params);
  return cond.negate ? `(NOT ${sql})` : `(${sql})`;
}

const COMPARE: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };

function compileOp(cond: Extract<Condition, { kind: 'op' }>, target: Target, params: SqlValue[]): string {
  const { op, value } = cond;
  switch (op) {
    case 'eq':
    case 'neq':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const raw = 'js' in value ? value.js : unquote(value.text);
      params.push(scalar(target, raw));
      return `${target.sql} ${COMPARE[op]} ?`;
    }
    case 'like':
    case 'ilike':
      return likeSql(target.sql, textOf(value), op === 'ilike', params);
    case 'is': {
      const raw = 'js' in value ? value.js : unquote(value.text).toLowerCase();
      if (raw === null || raw === 'null' || raw === 'unknown') return `${target.sql} IS NULL`;
      if (raw === true || raw === 'true') return `${target.sql} IS TRUE`;
      if (raw === false || raw === 'false') return `${target.sql} IS FALSE`;
      throw syntax(`is.${String(raw)}`);
    }
    case 'in': {
      const items = listOf(value).map((v) => scalar(target, v));
      params.push(JSON.stringify(items));
      return `${target.sql} IN (SELECT value FROM json_each(?))`;
    }
    case 'cs': {
      if (!target.json || (target.kind !== 'json' && target.kind !== 'array')) {
        throw dbError(C.undefinedFunction, `operator does not exist: ${target.column?.pg ?? 'text'} @> unknown`);
      }
      const wanted = structured(value);
      const items = Array.isArray(wanted) ? arrayElements(target, wanted) : wanted;
      return `${target.sql} IS NOT NULL AND ${jsonContains(target.json.base, target.json.path, items, params)}`;
    }
    case 'ov': {
      if (target.kind !== 'array') throw dbError(C.undefinedFunction, `operator does not exist: ${target.column?.pg ?? 'text'} && unknown`);
      const wanted = structured(value);
      if (!Array.isArray(wanted)) throw syntax('ov attend un tableau');
      params.push(JSON.stringify(arrayElements(target, wanted)));
      return `EXISTS (SELECT 1 FROM json_each(${target.sql}) AS e WHERE e.value IN (SELECT value FROM json_each(?)))`;
    }
    case 'fts':
    case 'plfts':
    case 'phfts':
    case 'wfts': {
      // Chaque mot présent, sans casse (ASCII) : approche de to_tsvector/plainto_tsquery.
      const words = textOf(value)
        .split(/[\s&|!():*'"]+/)
        .filter((w) => w !== '');
      if (words.length === 0) return '0';
      return words
        .map((w) => {
          params.push(w);
          return `instr(${foldCase(`CAST(${target.sql} AS TEXT)`)}, ${foldCase('?')}) > 0`;
        })
        .join(' AND ');
    }
    default:
      throw syntax(`opérateur ${String(op)}`);
  }
}
