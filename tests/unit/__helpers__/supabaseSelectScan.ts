// tests/unit/__helpers__/supabaseSelectScan.ts
//
// Analyse statique des `.from('table').select('…')` du dépôt.
//
// POURQUOI : le mock Supabase de cette suite ne valide pas les noms de colonnes
// (cf. supabaseMock.ts). Un `.select()` citant une colonne inexistante passe
// donc au vert en test et ne casse qu'en production, où PostgREST rejette la
// requête ENTIÈRE (42703 undefined_column) : l'endpoint répond 500 et l'écran
// qui en dépend n'affiche plus rien. Deux occurrences à ce jour —
// mvp-leaderboard, puis matches.best_of / matches.started_at qui empêchaient
// /admin/scrims/[id] de se charger.
//
// Ce module ne fait qu'EXTRAIRE. La confrontation au schéma réel vit dans
// tests/unit/supabaseSelectSchema.test.ts, contre database/schema-snapshot.json.
//
// Il vit ici, et non sous utils/, pour que `node:fs` et `typescript` ne
// puissent jamais entrer dans le bundle client par un import distrait.
//
// Principe de prudence : tout ce qui n'est pas compris avec CERTITUDE est
// signalé comme ignoré, jamais deviné. Un faux positif ferait rougir la CI sur
// du code correct, et le garde-fou serait désactivé dans la semaine.

import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

export type ColumnRef = {
  table: string;
  column: string;
  file: string;
  line: number;
};

export type SkippedSelect = {
  file: string;
  line: number;
  reason: 'table-dynamique' | 'select-dynamique' | 'embarcation-par-cle';
};

export type ScanResult = {
  refs: ColumnRef[];
  skipped: SkippedSelect[];
  /** `.select()` dont la table ET l'argument ont été résolus. */
  analysed: number;
};

/**
 * PostgREST accepte, comme cible d'embarcation, le nom de la TABLE liée
 * (`team:teams(...)`) ou celui de la COLONNE de clé étrangère qui y mène
 * (`team:team_id(...)`). Impossible de trancher sans connaître les clés
 * étrangères : on ne descend donc pas dans les secondes, et on les compte
 * comme angle mort assumé plutôt que de les signaler comme tables inconnues.
 */
const FK_COLUMN_HINT = /_id$/;

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const IGNORED_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'test-results',
  'playwright-report',
]);

export function listSourceFiles(roots: string[], cwd: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) walk(full);
      else if (SOURCE_EXTENSIONS.has(extname(entry)) && !entry.endsWith('.d.ts')) {
        out.push(full);
      }
    }
  };
  for (const root of roots) walk(join(cwd, root));
  return out.sort();
}

/**
 * Découpe une liste PostgREST au premier niveau : les virgules imbriquées dans
 * des parenthèses (ressources embarquées) ne coupent pas.
 */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * Nom de ressource d'une embarcation : `alias:table!contrainte` → `table`,
 * `...table` → `table`. Retourne null si la forme n'est pas un identifiant
 * simple : PostgREST accepte aussi une colonne de clé étrangère comme indice,
 * et on préfère alors ne rien analyser plutôt qu'inventer une table.
 */
function embeddedTableName(head: string): string | null {
  let name = head.trim();
  if (name.startsWith('...')) name = name.slice(3); // embed « spread »
  const colon = name.indexOf(':');
  if (colon !== -1) name = name.slice(colon + 1);
  const bang = name.indexOf('!');
  if (bang !== -1) name = name.slice(0, bang);
  name = name.trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : null;
}

/**
 * Nom de colonne d'une référence simple : `alias:col`, `col::cast`,
 * `col->>chemin`. `*` et `count` sont toujours valides et ne sont pas
 * retournés. Null si la forme n'est pas un identifiant simple.
 */
function plainColumnName(item: string): string | null {
  let name = item.trim();
  const colon = name.indexOf(':');
  // `::` est un cast, `:` seul est un alias — et l'alias précède la colonne.
  if (colon !== -1 && name[colon + 1] !== ':') name = name.slice(colon + 1);
  name = name.split('::')[0];
  name = name.split('->')[0]; // chemin JSON, couvre -> et ->>
  name = name.trim();
  if (!name || name === '*' || name === 'count') return null;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : null;
}

/** Parcourt une liste de colonnes PostgREST et collecte les références. */
export function collectColumnRefs(
  select: string,
  table: string,
  file: string,
  line: number,
  out: ColumnRef[]
): void {
  for (const item of splitTopLevel(select)) {
    const open = item.indexOf('(');
    if (open !== -1 && item.endsWith(')')) {
      const embedded = embeddedTableName(item.slice(0, open));
      // Embarcation dont on ne sait pas nommer la table, ou dont la cible est
      // une clé étrangère : contenu non analysé (cf. FK_COLUMN_HINT).
      if (embedded && !FK_COLUMN_HINT.test(embedded)) {
        collectColumnRefs(item.slice(open + 1, -1), embedded, file, line, out);
      }
      continue;
    }
    const column = plainColumnName(item);
    if (column) out.push({ table, column, file, line });
  }
}

/** Remonte une chaîne d'appels jusqu'au `.from('table')`. */
function tableFromChain(
  expr: ts.Expression,
  localTables: Map<string, string>
): string | null {
  let node: ts.Node = expr;
  for (;;) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'from' &&
        node.arguments.length > 0
      ) {
        const arg = node.arguments[0];
        return ts.isStringLiteralLike(arg) ? arg.text : null;
      }
      node = callee;
      continue;
    }
    if (ts.isPropertyAccessExpression(node)) {
      node = node.expression;
      continue;
    }
    if (ts.isNonNullExpression(node) || ts.isParenthesizedExpression(node)) {
      node = node.expression;
      continue;
    }
    // `query.select(...)` où `query` a été affecté plus haut dans le fichier.
    if (ts.isIdentifier(node)) return localTables.get(node.text) ?? null;
    return null;
  }
}

/** Index des `const x = supabase.from('t')…` d'un fichier. */
function indexLocalTables(source: ts.SourceFile): Map<string, string> {
  const map = new Map<string, string>();
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const table = tableFromChain(node.initializer, new Map());
      if (table) map.set(node.name.text, table);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return map;
}

/** Une liste qui « ressemble » à du PostgREST, pour ne pas confondre avec
 *  d'autres `.select()` (DOM, bibliothèques tierces). */
const LOOKS_LIKE_POSTGREST = /^[\w\s,*():!.>-]+$/;

export function scanFile(file: string, text: string, relative: string): ScanResult {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const localTables = indexLocalTables(source);
  const refs: ColumnRef[] = [];
  const skipped: SkippedSelect[] = [];
  let analysed = 0;

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'select'
    ) {
      const line =
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const table = tableFromChain(node.expression.expression, localTables);
      const arg = node.arguments[0];

      if (table) {
        if (!arg) {
          analysed++; // `.select()` sans argument : toutes les colonnes.
        } else if (ts.isStringLiteralLike(arg)) {
          analysed++;
          collectColumnRefs(arg.text, table, relative, line, refs);
        } else {
          skipped.push({ file: relative, line, reason: 'select-dynamique' });
        }
      } else if (arg && ts.isStringLiteralLike(arg) && LOOKS_LIKE_POSTGREST.test(arg.text)) {
        // Table non résolue mais argument crédible : c'est un angle mort, il
        // doit se voir plutôt que disparaître.
        skipped.push({ file: relative, line, reason: 'table-dynamique' });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return { refs, skipped, analysed };
}

export function scanRepo(roots: string[], cwd: string): ScanResult {
  const refs: ColumnRef[] = [];
  const skipped: SkippedSelect[] = [];
  let analysed = 0;
  for (const file of listSourceFiles(roots, cwd)) {
    const relative = file.slice(cwd.length + 1);
    const result = scanFile(file, readFileSync(file, 'utf8'), relative);
    refs.push(...result.refs);
    skipped.push(...result.skipped);
    analysed += result.analysed;
  }
  return { refs, skipped, analysed };
}
