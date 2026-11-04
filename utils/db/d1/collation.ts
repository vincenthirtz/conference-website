// utils/db/d1/collation.ts — casse et ordre du texte comme la base de production (lot 3 de
// conference-website docs/D1-MIGRATION.md).
//
// La base Supabase trie et compare le texte avec ICU `en-US` (relevé du 2026-11-03) :
//   Postgres : Alice_1, alpha, Bob%, bravo, charlie, éa, Eb, Élodie, zz, Zz
//   SQLite   : Alice_1, Bob%, Eb, Zz, alpha, bravo, charlie, zz, Élodie, éa
// SQLite n'a que l'ordre des octets et un lower() limité à l'ASCII, et D1 ne permet pas
// d'ajouter une collation. On approche donc ICU en SQL pur, pour les lettres latines :
//   * `foldCase` : minuscules, accents gardés (ce que fait `ilike` : É = é, mais e ≠ é) ;
//   * `sortKey`  : minuscules sans accents (le premier niveau d'ICU : é = e = E).
// Les autres écritures gardent l'ordre de leurs octets, comme avant.

/** Majuscules latines accentuées → minuscules (lower() de SQLite ne les touche pas). */
const UPPER_TO_LOWER: Array<[string, string]> = [
  ...'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ'.split('').map((c) => [c, c.toLowerCase()] as [string, string]),
  ['Ÿ', 'ÿ'],
  ['Œ', 'œ'],
  ['Š', 'š'],
  ['Ž', 'ž'],
  ['Č', 'č'],
  ['Ć', 'ć'],
  ['Ł', 'ł'],
  ['Ń', 'ń'],
  ['Ś', 'ś'],
  ['Ź', 'ź'],
  ['Ż', 'ż'],
  ['Ę', 'ę'],
  ['Ą', 'ą'],
  ['Ő', 'ő'],
  ['Ű', 'ű'],
];

/** Minuscules latines accentuées → lettre de base (premier niveau d'ICU). */
const ACCENTS: Array<[string, string]> = [
  ...[...'àáâãäå'].map((c) => [c, 'a'] as [string, string]),
  ['æ', 'ae'],
  ['ç', 'c'],
  ...[...'èéêë'].map((c) => [c, 'e'] as [string, string]),
  ...[...'ìíîï'].map((c) => [c, 'i'] as [string, string]),
  ['ð', 'd'],
  ['ñ', 'n'],
  ...[...'òóôõöø'].map((c) => [c, 'o'] as [string, string]),
  ['œ', 'oe'],
  ...[...'ùúûü'].map((c) => [c, 'u'] as [string, string]),
  ['ý', 'y'],
  ['ÿ', 'y'],
  ['þ', 'th'],
  ['ß', 'ss'],
  ['š', 's'],
  ['ž', 'z'],
  ['č', 'c'],
  ['ć', 'c'],
  ['ł', 'l'],
  ['ń', 'n'],
  ['ś', 's'],
  ['ź', 'z'],
  ['ż', 'z'],
  ['ę', 'e'],
  ['ą', 'a'],
  ['ő', 'o'],
  ['ű', 'u'],
];

const replaceAll = (expr: string, pairs: Array<[string, string]>) =>
  pairs.reduce((sql, [from, to]) => `replace(${sql}, '${from}', '${to}')`, expr);

/** Le texte en minuscules, accents gardés : la casse de `ilike` (É = é, e ≠ é). */
export function foldCase(expr: string): string {
  return `lower(${replaceAll(expr, UPPER_TO_LOWER)})`;
}

/** La clé de tri : minuscules sans accents, le premier niveau de l'ordre d'ICU. */
export function sortKey(expr: string): string {
  return replaceAll(foldCase(expr), ACCENTS);
}

/**
 * ORDER BY d'un texte dans l'ordre d'ICU : lettres sans casse ni accents, puis accents, puis
 * minuscules d'abord (d'où le dernier critère en sens inverse). `expr` doit rester simple (une
 * colonne) : sortKey pèse ~92 niveaux sur les 100 que D1 accepte.
 */
export function icuOrderSql(expr: string, ascending: boolean, nulls: 'NULLS FIRST' | 'NULLS LAST'): string {
  const dir = ascending ? 'ASC' : 'DESC';
  return `${sortKey(expr)} ${dir} ${nulls}, ${foldCase(expr)} ${dir}, ${expr} ${ascending ? 'DESC' : 'ASC'}`;
}

/** Les mêmes transformations en JavaScript (tests, et valeurs connues d'avance). */
export function foldCaseJs(text: string): string {
  return UPPER_TO_LOWER.reduce((s, [from, to]) => s.split(from).join(to), text).replace(/[A-Z]/g, (c) => c.toLowerCase());
}

export function sortKeyJs(text: string): string {
  return ACCENTS.reduce((s, [from, to]) => s.split(from).join(to), foldCaseJs(text));
}
