// utils/db/d1/select.ts — les lectures de supabase-js, traduites en SQL pour D1 (lot 3c de
// conference-website docs/D1-MIGRATION.md).
//
// `select('id, name, team:teams!matches_team1_id_fkey(name, players!inner(name))')` :
//   * colonnes, alias (`alias:col`), chemins JSON (`col->>clé`), `*` ;
//   * tables embarquées, résolues comme PostgREST par les clés étrangères de la carte :
//     plusieurs-vers-un et un-vers-un → objet ou null, un-vers-plusieurs et plusieurs-vers-
//     plusieurs (table de liaison) → tableau ; précision `!lien` ou `!colonne` ; `!inner`
//     garde seulement les lignes qui ont une ligne embarquée ; ambiguïté → PGRST201,
//     relation inconnue → PGRST200 ;
//   * filtres sur une table embarquée (`.eq('team.status', …)`) : ils filtrent l'embarqué,
//     et la ligne parente aussi avec `!inner` ;
//   * tri : ordre du texte d'ICU (collation.ts), NULL en dernier en montant et en premier en
//     descendant (défaut de Postgres) ; pages (limit, range) ; comptage `exact`.
// Les tables embarquées sont construites en JSON par SQLite (sous-requêtes corrélées) ; les
// colonnes du premier niveau sont décodées en JavaScript (values.ts).

import { DB_ERROR_CODES as C } from '../errors';
import type { D1ForeignKey, DbCatalog, TableInfo } from './catalog';
import { icuOrderSql } from './collation';
import { dbError } from './errors';
import { compileCondition, parseColumnRef, type Condition, type FilterScope, type PublicRead } from './filters';
import { fromDb, type SqlValue } from './values';

// ---------------------------------------------------------------------------
// Lecture de la chaîne de select
// ---------------------------------------------------------------------------

type JsonStep = { arrow: '->' | '->>'; key: string };

export type SelectField =
  | { kind: 'star' }
  | { kind: 'column'; alias: string | null; column: string; json: JsonStep[] }
  | { kind: 'embed'; alias: string | null; relation: string; hint: string | null; inner: boolean; fields: SelectField[] };

const invalid = (message: string) => dbError(C.invalidQuery, `"failed to parse select parameter (${message})"`);

/** Comme supabase-js : les blancs hors guillemets ne comptent pas. */
function stripSpaces(text: string): string {
  let quoted = false;
  let out = '';
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    if (!quoted && /\s/.test(c)) continue;
    out += c;
  }
  return out;
}

function splitFields(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.filter((s) => s !== '');
}

export function parseSelect(text: string): SelectField[] {
  return splitFields(stripSpaces(text || '*')).map(parseField);
}

function parseField(item: string): SelectField {
  if (item === '*') return { kind: 'star' };
  const embed = /^(?:([\w$]+):)?(\.\.\.)?([\w$]+)((?:![\w$]+)*)\(([\s\S]*)\)$/.exec(item);
  if (embed) {
    if (embed[2]) throw invalid(`déploiement « ... » non pris en charge : ${item}`);
    const modifiers = (embed[4] as string).split('!').filter(Boolean);
    const inner = modifiers.includes('inner');
    const hints = modifiers.filter((m) => m !== 'inner' && m !== 'left');
    if (hints.length > 1) throw invalid(item);
    if ((embed[3] as string) === 'count' && embed[5] === '') throw invalid(`agrégat non pris en charge : ${item}`);
    return {
      kind: 'embed',
      alias: embed[1] ?? null,
      relation: embed[3] as string,
      hint: hints[0] ?? null,
      inner,
      fields: parseSelect((embed[5] as string) || '*'),
    };
  }
  const col = /^(?:([\w$]+):)?([\w$]+)((?:->>?[\w$]+)*)(::[\w]+)?$/.exec(item);
  if (!col) throw invalid(item);
  if (col[4]) throw invalid(`conversion « :: » non prise en charge : ${item}`);
  const ref = parseColumnRef(`${col[2]}${col[3] ?? ''}`);
  return { kind: 'column', alias: col[1] ?? null, column: ref.column, json: ref.json };
}


// ---------------------------------------------------------------------------
// Relations (comme PostgREST : par les clés étrangères)
// ---------------------------------------------------------------------------

export interface Relation {
  /** `true` : objet ou null ; `false` : tableau. */
  toOne: boolean;
  target: TableInfo;
  /** Condition entre la ligne parente et l'embarquée (ou la table de liaison). */
  join(parent: string, child: string, link: string | null): string;
  /** Plusieurs-vers-plusieurs : la table de liaison et sa jointure avec l'embarquée. */
  link?: { table: TableInfo; on(child: string, link: string): string };
  label: string;
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
/** `"a"."x" = "b"."y" AND …` */
const equal = (a: string, aCols: string[], b: string, bCols: string[]) =>
  aCols.map((c, i) => `${q(a)}.${q(c)} = ${q(b)}.${q(bCols[i] as string)}`).join(' AND ');

const isUniqueKey = (table: TableInfo, columns: string[]) => {
  const key = [...columns].sort().join(',');
  return (
    [...table.primaryKey].sort().join(',') === key ||
    table.uniques.some((u) => u.expressions === null && u.where === null && [...u.columns].sort().join(',') === key)
  );
};

interface Candidate {
  relation: Relation;
  /** Ce que la précision `!…` peut nommer : contrainte, colonne, table de liaison. */
  names: string[];
}

/** La clé étrangère est sur la table parente : objet. */
function manyToOne(fk: D1ForeignKey, target: TableInfo): Candidate {
  return {
    relation: { toOne: true, target, join: (p, c) => equal(c, fk.references, p, fk.columns), label: fk.name },
    names: [fk.name, ...(fk.columns.length === 1 ? [fk.columns[0] as string] : [])],
  };
}

/** La clé étrangère est sur l'embarquée : tableau, ou objet si elle y est unique (un-vers-un). */
function oneToMany(fk: D1ForeignKey, target: TableInfo): Candidate {
  return {
    relation: {
      toOne: isUniqueKey(target, fk.columns),
      target,
      join: (p, c) => equal(c, fk.columns, p, fk.references),
      label: fk.name,
    },
    names: [fk.name, ...(fk.columns.length === 1 ? [fk.columns[0] as string] : [])],
  };
}

export function resolveRelation(catalog: DbCatalog, parent: TableInfo, name: string, hint: string | null): Relation {
  const candidates: Candidate[] = [];
  const target = catalog.table(name);
  if (target) {
    for (const fk of parent.foreignKeys) if (fk.table === target.name) candidates.push(manyToOne(fk, target));
    for (const fk of parent.incoming) if (fk.from === target.name) candidates.push(oneToMany(fk, target));
    // Plusieurs-vers-plusieurs : une table de liaison dont une clé couvre ses deux clés étrangères.
    for (const [, link] of catalog.tables) {
      if (link.name === parent.name || link.name === target.name) continue;
      for (const toParent of link.foreignKeys.filter((f) => f.table === parent.name)) {
        for (const toTarget of link.foreignKeys.filter((f) => f.table === target.name)) {
          const covered = [...toParent.columns, ...toTarget.columns];
          const keyed =
            covered.every((c) => link.primaryKey.includes(c)) ||
            link.uniques.some((u) => u.expressions === null && covered.every((c) => u.columns.includes(c)));
          if (!keyed) continue;
          candidates.push({
            relation: {
              toOne: false,
              target,
              join: (p, _c, l) => equal(l as string, toParent.columns, p, toParent.references),
              link: { table: link, on: (c, l) => equal(l, toTarget.columns, c, toTarget.references) },
              label: `${toParent.name}, ${toTarget.name}`,
            },
            names: [link.name, toParent.name, toTarget.name],
          });
        }
      }
    }
  } else {
    // Embarquer par le nom d'une colonne à clé étrangère, ou par le nom de la contrainte.
    for (const fk of parent.foreignKeys) {
      if ((fk.columns.length === 1 && fk.columns[0] === name) || fk.name === name) {
        const t = catalog.table(fk.table);
        if (t) candidates.push(manyToOne(fk, t));
      }
    }
    for (const fk of parent.incoming) {
      const t = catalog.table(fk.from);
      if (fk.name === name && t) candidates.push(oneToMany(fk, t));
    }
  }
  const chosen = hint ? candidates.filter((c) => c.names.includes(hint)) : candidates;
  if (chosen.length === 0) {
    throw dbError(
      C.unknownRelationship,
      `Could not find a relationship between '${parent.name}' and '${name}' in the schema cache`,
      `Searched for a foreign key relationship between '${parent.name}' and '${name}'${hint ? ` using the hint '${hint}'` : ''} in the schema 'public', but no matches were found.`
    );
  }
  if (chosen.length > 1) {
    throw dbError(
      C.ambiguousRelationship,
      `Could not embed because more than one relationship was found for '${parent.name}' and '${name}'`,
      chosen.map((c) => c.relation.label).join(' | '),
      `Try changing '${name}' to one of the following: ${chosen.map((c) => `'${name}!${c.names[0]}'`).join(', ')}. Find the desired relationship in the 'details' key.`
    );
  }
  return (chosen[0] as Candidate).relation;
}

// ---------------------------------------------------------------------------
// Traduction en SQL
// ---------------------------------------------------------------------------

/** Un bout de SQL et ses paramètres, dans l'ordre de ses `?`. */
interface Sql {
  sql: string;
  params: SqlValue[];
}

export interface OrderSpec {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

export interface SelectSpec {
  table: string;
  fields: SelectField[];
  conditions: Condition[];
  orders: OrderSpec[];
  limit: number | null;
  offset: number | null;
}

/** Un champ du premier niveau : comment le décoder. */
type OutField =
  | { key: string; kind: 'column'; type: Parameters<typeof fromDb>[0] }
  | { key: string; kind: 'json' }
  | { key: string; kind: 'embed'; toOne: boolean };

export interface CompiledSelect {
  sql: string;
  params: SqlValue[];
  countSql: string;
  countParams: SqlValue[];
  decode(row: Record<string, unknown>): Record<string, unknown>;
}

interface Ctx {
  catalog: DbCatalog;
  seq: number;
  /** Mode « lecture publique » (lot 3g) : refuser ce que la clé publique ne lisait pas. */
  publicRead: PublicRead;
}

const nextAlias = (ctx: Ctx) => `t${ctx.seq++}`;

/**
 * Lecture publique : `*` sur une table à colonnes sensibles, ou une colonne sensible nommée,
 * refusés comme Postgres refusait la clé publique (42501) — sauf les colonnes autorisées
 * nommément (`table.colonne`, avec leur raison chez l'appelant).
 */
function guardPublic(publicRead: PublicRead, table: TableInfo, fields: SelectField[]): void {
  if (!publicRead || table.sensitiveSet.size === 0) return;
  const denied = (column: string) => table.sensitiveSet.has(column) && !publicRead.allow.has(`${table.name}.${column}`);
  for (const f of fields) {
    if (f.kind === 'star' && [...table.sensitiveSet].some(denied)) {
      throw dbError(C.insufficientPrivilege, `permission denied for table ${table.name}`);
    }
    if (f.kind === 'column' && denied(f.column)) {
      throw dbError(C.insufficientPrivilege, `permission denied for column ${f.column} of relation ${table.name}`);
    }
  }
}

type Field = Exclude<SelectField, { kind: 'star' }>;

/** Clé de sortie d'un champ (alias, sinon la colonne, la dernière clé JSON, ou la relation). */
function keyOf(field: Field): string {
  if (field.alias) return field.alias;
  if (field.kind === 'embed') return field.relation;
  return field.json.length ? (field.json[field.json.length - 1] as JsonStep).key : field.column;
}

/** Les champs d'un niveau, développés (`*` → colonnes dans l'ordre de la table). */
function expand(fields: SelectField[], table: TableInfo): Field[] {
  return fields.flatMap((f) =>
    f.kind === 'star' ? table.columns.map((c) => ({ kind: 'column' as const, alias: null, column: c.name, json: [] })) : [f]
  );
}

/** Les conditions qui visent une table embarquée (`team.status`), rangées par alias ou relation. */
function splitConditions(conditions: Condition[]): { own: Condition[]; nested: Map<string, Condition[]> } {
  const own: Condition[] = [];
  const nested = new Map<string, Condition[]>();
  const mentionsRelation = (c: Condition): boolean =>
    c.kind === 'op' ? c.ref.relation.length > 0 : c.items.some(mentionsRelation);
  for (const cond of conditions) {
    if (cond.kind === 'op' && cond.ref.relation.length > 0) {
      const [head, ...rest] = cond.ref.relation as [string, ...string[]];
      nested.set(head, [...(nested.get(head) ?? []), { ...cond, ref: { ...cond.ref, relation: rest } }]);
    } else if (mentionsRelation(cond)) {
      throw dbError(C.invalidQuery, '"or/and sur une table embarquée non pris en charge (referencedTable)"');
    } else {
      own.push(cond);
    }
  }
  return { own, nested };
}

const conditionsFor = (nested: Map<string, Condition[]>, f: Extract<Field, { kind: 'embed' }>) =>
  nested.get(keyOf(f)) ?? nested.get(f.relation) ?? [];

function jsonPathValue(ref: string, kind: string, steps: JsonStep[], insideJson: boolean): string {
  if (kind !== 'json') throw dbError(C.undefinedFunction, `operator does not exist: ${kind} -> unknown`);
  const path = `$${steps.map((s) => `."${s.key.replace(/"/g, '\\"')}"`).join('')}`;
  const last = steps[steps.length - 1] as JsonStep;
  if (last.arrow === '->') return insideJson ? `json_extract(${ref}, '${path}')` : `json(json_extract(${ref}, '${path}'))`;
  return (
    `(CASE json_type(${ref}, '${path}') WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' WHEN 'null' THEN NULL ` +
    `ELSE CAST(json_extract(${ref}, '${path}') AS TEXT) END)`
  );
}

/** La valeur d'une colonne dans un objet JSON construit par SQLite. */
function jsonValue(table: TableInfo, alias: string, field: Extract<Field, { kind: 'column' }>): string {
  const column = table.column.get(field.column);
  if (!column) throw dbError(C.undefinedColumn, `column ${table.name}.${field.column} does not exist`);
  const ref = `${q(alias)}.${q(field.column)}`;
  if (field.json.length) return jsonPathValue(ref, column.type, field.json, true);
  if (column.type === 'boolean') return `(CASE ${ref} WHEN 1 THEN json('true') WHEN 0 THEN json('false') END)`;
  if (column.type === 'json' || column.type === 'array') return `json(${ref})`;
  return ref;
}

/**
 * Objet JSON d'une ligne embarquée. json_object est coupé par paquets de 50 colonnes (limite
 * d'arguments des fonctions SQLite), puis les paquets sont recollés en texte : json_patch
 * effacerait les clés à null.
 */
function jsonObject(entries: Array<[string, string]>): string {
  if (entries.length === 0) return "json('{}')";
  const chunks: string[] = [];
  for (let i = 0; i < entries.length; i += 50) {
    chunks.push(`json_object(${entries.slice(i, i + 50).map(([k, v]) => `'${k.replace(/'/g, "''")}', ${v}`).join(', ')})`);
  }
  if (chunks.length === 1) return chunks[0] as string;
  return `json('{' || ${chunks.map((c) => `substr(${c}, 2, length(${c}) - 2)`).join(" || ',' || ")} || '}')`;
}

interface Embedded {
  /** Valeur JSON (texte) de l'embarqué pour la ligne parente. */
  value: Sql;
  /** `!inner` : la condition d'existence à poser sur la ligne parente. */
  exists: Sql | null;
  toOne: boolean;
}

function embed(field: Extract<Field, { kind: 'embed' }>, parent: TableInfo, parentAlias: string, conditions: Condition[], ctx: Ctx): Embedded {
  const relation = resolveRelation(ctx.catalog, parent, field.relation, field.hint);
  const target = relation.target;
  const alias = nextAlias(ctx);
  const linkAlias = relation.link ? nextAlias(ctx) : null;
  const { own, nested } = splitConditions(conditions);
  for (const name of nested.keys()) {
    const known = expand(field.fields, target).some((f) => f.kind === 'embed' && (keyOf(f) === name || f.relation === name));
    if (!known) throw dbError(C.invalidQuery, `"'${name}' is not an embedded resource in this request"`);
  }

  // `relation(count)` sans colonne `count` : le nombre de lignes liées, comme PostgREST
  // (`[{ "count": N }]` pour un tableau).
  const only = field.fields.length === 1 ? field.fields[0] : null;
  if (only?.kind === 'column' && only.column === 'count' && only.json.length === 0 && !target.column.has('count')) {
    const whereParams: SqlValue[] = [];
    const scope: FilterScope = { table: target, alias, publicRead: ctx.publicRead };
    const parts = [relation.join(parentAlias, alias, linkAlias), ...own.map((c) => compileCondition(c, scope, whereParams))];
    const from =
      relation.link && linkAlias
        ? `${q(target.name)} AS ${q(alias)} JOIN ${q(relation.link.table.name)} AS ${q(linkAlias)} ON ${relation.link.on(alias, linkAlias)}`
        : `${q(target.name)} AS ${q(alias)}`;
    const counted = `json_object('${only.alias ?? 'count'}', (SELECT count(*) FROM ${from} WHERE ${parts.join(' AND ')}))`;
    return {
      value: { sql: relation.toOne ? counted : `json_array(${counted})`, params: whereParams },
      exists: null,
      toOne: relation.toOne,
    };
  }

  guardPublic(ctx.publicRead, target, field.fields);

  // Le contenu : colonnes et embarqués imbriqués, dans l'ordre du select.
  const entries: Array<[string, string]> = [];
  const objectParams: SqlValue[] = [];
  const innerExists: Sql[] = [];
  for (const f of expand(field.fields, target)) {
    if (f.kind === 'column') {
      entries.push([keyOf(f), jsonValue(target, alias, f)]);
      continue;
    }
    const sub = embed(f, target, alias, conditionsFor(nested, f), ctx);
    entries.push([keyOf(f), `json(${sub.value.sql})`]);
    objectParams.push(...sub.value.params);
    if (sub.exists) innerExists.push(sub.exists);
  }

  // Les lignes retenues : jointure, filtres de l'embarqué, `!inner` de ses propres embarqués.
  const whereParams: SqlValue[] = [];
  const scope: FilterScope = { table: target, alias };
  const whereParts = [relation.join(parentAlias, alias, linkAlias), ...own.map((c) => compileCondition(c, scope, whereParams))];
  for (const e of innerExists) {
    whereParts.push(e.sql);
    whereParams.push(...e.params);
  }
  const where = whereParts.join(' AND ');
  const from =
    relation.link && linkAlias
      ? `${q(target.name)} AS ${q(alias)} JOIN ${q(relation.link.table.name)} AS ${q(linkAlias)} ON ${relation.link.on(alias, linkAlias)}`
      : `${q(target.name)} AS ${q(alias)}`;
  const object = jsonObject(entries);

  // Filtres et contenu toujours dans une table dérivée (FROM) : D1 plafonne la profondeur d'une
  // expression à 100, une sous-requête « valeur » ou EXISTS compte double, une table dérivée
  // pas du tout — et `ilike` (foldCase) pèse ~46 niveaux à lui seul.
  const value = relation.toOne
    ? `(SELECT x.j FROM (SELECT ${object} AS j FROM ${from} WHERE ${where} LIMIT 1) AS x)`
    : `(SELECT json_group_array(json(x.j)) FROM (SELECT ${object} AS j FROM ${from} WHERE ${where} ORDER BY ${q(alias)}.rowid) AS x)`;
  return {
    value: { sql: value, params: [...objectParams, ...whereParams] },
    exists: field.inner ? { sql: `EXISTS (SELECT 1 FROM (SELECT 1 FROM ${from} WHERE ${where}) AS e)`, params: [...whereParams] } : null,
    toOne: relation.toOne,
  };
}

function orderSql(order: OrderSpec, table: TableInfo, alias: string, publicRead: PublicRead): string {
  const ref = parseColumnRef(order.column);
  if (ref.relation.length) throw dbError(C.invalidQuery, `"tri sur une table embarquée non pris en charge : ${order.column}"`);
  const column = table.column.get(ref.column);
  if (!column) throw dbError(C.undefinedColumn, `column ${table.name}.${ref.column} does not exist`);
  guardPublic(publicRead, table, [{ kind: 'column', alias: null, column: ref.column, json: [] }]);
  const base = `${q(alias)}.${q(ref.column)}`;
  const expr = ref.json.length ? jsonPathValue(base, column.type, ref.json, false) : base;
  const textual = ref.json.length ? ref.json[ref.json.length - 1]?.arrow === '->>' : column.type === 'text';
  const dir = order.ascending ? 'ASC' : 'DESC';
  // Défaut de Postgres : NULL en dernier en montant, en premier en descendant.
  const nulls = (order.nullsFirst ?? !order.ascending) ? 'NULLS FIRST' : 'NULLS LAST';
  if (!textual) return `${expr} ${dir} ${nulls}`;
  return icuOrderSql(expr, order.ascending, nulls);
}

/** Les colonnes rendues (select, ou RETURNING d'une écriture) et leur décodage. */
export interface CompiledFields {
  /** `expr AS "cN"`, dans l'ordre du select. */
  columns: string[];
  params: SqlValue[];
  /** `!inner` : conditions d'existence à poser sur la ligne parente. */
  innerExists: Sql[];
  /** Conditions qui restent sur la table elle-même. */
  own: Condition[];
  publicRead: PublicRead;
  decode(row: Record<string, unknown>): Record<string, unknown>;
}

export interface CompileOptions {
  /** Mode « lecture publique » (lot 3g) : les colonnes sensibles de la carte sont refusées. */
  publicRead?: boolean;
  /** …sauf celles-ci (`table.colonne`), publiées à dessein. */
  allow?: string[];
}

const publicReadOf = (options: CompileOptions): PublicRead =>
  options.publicRead ? { allow: new Set(options.allow ?? []) } : null;

/**
 * Les champs d'un select sur `table` vue sous `alias` (`t0` pour une lecture, le nom de la
 * table pour le RETURNING d'une écriture, où SQLite accepte aussi les sous-requêtes).
 */
export function compileFields(
  selectFields: SelectField[],
  table: TableInfo,
  alias: string,
  conditions: Condition[],
  catalog: DbCatalog,
  options: CompileOptions = {}
): CompiledFields {
  const ctx: Ctx = { catalog, seq: 1, publicRead: publicReadOf(options) };
  guardPublic(ctx.publicRead, table, selectFields);
  const fields = expand(selectFields, table);
  const { own, nested } = splitConditions(conditions);
  for (const name of nested.keys()) {
    const known = fields.some((f) => f.kind === 'embed' && (keyOf(f) === name || f.relation === name));
    if (!known) throw dbError(C.invalidQuery, `"'${name}' is not an embedded resource in this request"`);
  }

  const out: OutField[] = [];
  const columns: string[] = [];
  const columnParams: SqlValue[] = [];
  const innerExists: Sql[] = [];
  fields.forEach((f, i) => {
    const as = q(`c${i}`);
    if (f.kind === 'column') {
      const column = table.column.get(f.column);
      if (!column) throw dbError(C.undefinedColumn, `column ${table.name}.${f.column} does not exist`);
      const ref = `${q(alias)}.${q(f.column)}`;
      if (f.json.length) {
        columns.push(`${jsonPathValue(ref, column.type, f.json, false)} AS ${as}`);
        const last = f.json[f.json.length - 1] as JsonStep;
        out.push(last.arrow === '->' ? { key: keyOf(f), kind: 'json' } : { key: keyOf(f), kind: 'column', type: 'text' });
      } else {
        columns.push(`${ref} AS ${as}`);
        out.push({ key: keyOf(f), kind: 'column', type: column.type });
      }
      return;
    }
    const sub = embed(f, table, alias, conditionsFor(nested, f), ctx);
    columns.push(`${sub.value.sql} AS ${as}`);
    columnParams.push(...sub.value.params);
    out.push({ key: keyOf(f), kind: 'embed', toOne: sub.toOne });
    if (sub.exists) innerExists.push(sub.exists);
  });

  return {
    columns,
    params: columnParams,
    innerExists,
    own,
    publicRead: ctx.publicRead,
    decode(row) {
      const result: Record<string, unknown> = {};
      out.forEach((f, i) => {
        const raw = row[`c${i}`];
        if (f.kind === 'column') result[f.key] = fromDb(f.type, raw);
        else if (f.kind === 'json') result[f.key] = raw === null || raw === undefined ? null : JSON.parse(String(raw));
        else result[f.key] = raw === null || raw === undefined ? (f.toOne ? null : []) : JSON.parse(String(raw));
      });
      return result;
    },
  };
}

/** Le WHERE d'une table : ses propres conditions, puis les `!inner` de ses embarqués. */
export function whereSql(
  fields: Pick<CompiledFields, 'own' | 'innerExists'> & { publicRead?: PublicRead },
  table: TableInfo,
  alias: string
): Sql {
  const params: SqlValue[] = [];
  const scope: FilterScope = { table, alias, publicRead: fields.publicRead ?? null };
  const parts = fields.own.map((c) => compileCondition(c, scope, params));
  for (const e of fields.innerExists) {
    parts.push(e.sql);
    params.push(...e.params);
  }
  return { sql: parts.length ? ` WHERE ${parts.join(' AND ')}` : '', params };
}

export function tableOf(catalog: DbCatalog, name: string): TableInfo {
  const table = catalog.table(name);
  if (!table) throw dbError(C.unknownTable, `Could not find the table 'public.${name}' in the schema cache`);
  return table;
}

export function compileSelect(spec: SelectSpec, catalog: DbCatalog, options: CompileOptions = {}): CompiledSelect {
  const table = tableOf(catalog, spec.table);
  const alias = 't0';
  const fields = compileFields(spec.fields, table, alias, spec.conditions, catalog, options);
  const dataWhere = whereSql(fields, table, alias);
  let sql = `SELECT ${fields.columns.join(', ')} FROM ${q(table.name)} AS ${q(alias)}${dataWhere.sql}`;
  if (spec.orders.length) sql += ` ORDER BY ${spec.orders.map((o) => orderSql(o, table, alias, fields.publicRead)).join(', ')}`;
  if (spec.limit !== null || spec.offset !== null) {
    sql += ` LIMIT ${spec.limit === null ? -1 : Math.max(0, Math.trunc(spec.limit))}`;
    if (spec.offset) sql += ` OFFSET ${Math.max(0, Math.trunc(spec.offset))}`;
  }
  const countWhere = whereSql(fields, table, alias);
  return {
    sql,
    params: [...fields.params, ...dataWhere.params],
    countSql: `SELECT count(*) AS n FROM ${q(table.name)} AS ${q(alias)}${countWhere.sql}`,
    countParams: countWhere.params,
    decode: fields.decode,
  };
}
