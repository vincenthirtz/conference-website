// utils/db/d1/values.ts — les valeurs entre le code et D1 (lot 3 de
// conference-website docs/D1-MIGRATION.md).
//
// Conventions de stockage du lot 2 (database/d1/schema.sql) : uuid en minuscules ;
// timestamptz en texte UTC de largeur fixe à la microseconde
// (`2026-11-03T10:00:00.123456+00:00`) ; date `AAAA-MM-JJ` ; heure `HH:MM:SS` ; booléens
// 0/1 ; jsonb et tableaux en texte JSON ; numeric en nombre à virgule.
//
// `toDb` accepte ce que Postgres acceptait sous ce type (via PostgREST) et le range au
// format ; ce que Postgres refusait est refusé avec le même code (22P02, 22007, 22003).
// `fromDb` rend ce que PostgREST rendait : booléens, objets JSON, tableaux, nombres.

import type { ColumnKind, D1Column } from './catalog';
import { DB_ERROR_CODES as C } from '../errors';
import { dbError } from './errors';

export type SqlValue = string | number | null;

export { SQL_NOW } from './now';

const invalid = (type: string, value: unknown) =>
  dbError(C.invalidTextRepresentation, `invalid input syntax for type ${type}: "${String(value)}"`);
const invalidDate = (type: string, value: unknown) =>
  dbError(C.invalidDatetimeFormat, `invalid input syntax for type ${type}: "${String(value)}"`);

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const validDate = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= ((m === 2 && isLeap(y) ? 29 : DAYS[m - 1]) as number);

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Microsecondes depuis 1970 → format de stockage. */
function formatMicros(micros: bigint): string {
  const ms = Number(micros / 1000n) - (micros % 1000n < 0n ? 1 : 0);
  const sub = Number(((micros % 1000n) + 1000n) % 1000n);
  const iso = new Date(ms).toISOString(); // AAAA-MM-JJTHH:MM:SS.mmmZ
  return `${iso.slice(0, 23)}${pad(sub, 3)}+00:00`;
}

const TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** Un timestamptz au format de stockage (UTC, microseconde, largeur fixe). */
export function toTimestamp(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw invalidDate('timestamp with time zone', value);
    return formatMicros(BigInt(value.getTime()) * 1000n);
  }
  if (typeof value !== 'string') throw invalidDate('timestamp with time zone', value);
  const m = TIMESTAMP.exec(value.trim());
  if (!m) throw invalidDate('timestamp with time zone', value);
  const [y, mo, d, h = 0, mi = 0, s = 0] = [m[1], m[2], m[3], m[4], m[5], m[6]].map((x) => (x === undefined ? undefined : Number(x))) as number[];
  if (!validDate(y as number, mo as number, d as number) || h > 24 || mi > 59 || s > 59 || (h === 24 && (mi > 0 || s > 0))) {
    throw invalidDate('timestamp with time zone', value);
  }
  // Postgres arrondit au-delà de 6 décimales.
  const fraction = m[7] ?? '';
  let micros = BigInt(Math.round(Number(`0.${fraction || '0'}`) * 1e6));
  let offsetMinutes = 0;
  const zone = m[8];
  if (zone && zone.toUpperCase() !== 'Z') {
    const sign = zone.startsWith('-') ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    offsetMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || '0'));
  }
  const base = Date.UTC(y as number, (mo as number) - 1, d as number, h, mi, s) - offsetMinutes * 60_000;
  micros += BigInt(base) * 1000n;
  return formatMicros(micros);
}

export function toDate(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw invalidDate('date', value);
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string') throw invalidDate('date', value);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(value.trim());
  if (!m || !validDate(Number(m[1]), Number(m[2]), Number(m[3]))) throw invalidDate('date', value);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function toTime(value: unknown): string {
  if (typeof value !== 'string') throw invalidDate('time without time zone', value);
  const m = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/.exec(value.trim());
  if (!m || Number(m[1]) > 24 || Number(m[2]) > 59 || Number(m[3] ?? 0) > 59) throw invalidDate('time without time zone', value);
  // Le stockage s'arrête à la seconde (aucune heure de la base n'en porte davantage).
  if (m[4] && /[1-9]/.test(m[4])) throw invalidDate('time without time zone', value);
  return `${m[1]}:${m[2]}:${m[3] ?? '00'}`;
}

export function toUuid(value: unknown): string {
  if (typeof value !== 'string') throw invalid('uuid', value);
  const hex = value.trim().replace(/^\{|\}$/g, '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw invalid('uuid', value);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const BOOLEAN_TEXT: Record<string, number> = {
  t: 1, true: 1, y: 1, yes: 1, on: 1, '1': 1,
  f: 0, false: 0, n: 0, no: 0, off: 0, '0': 0,
};

export function toBoolean(value: unknown): number {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === 1 || value === 0) return value;
  if (typeof value === 'string' && value.trim().toLowerCase() in BOOLEAN_TEXT) {
    return BOOLEAN_TEXT[value.trim().toLowerCase()] as number;
  }
  throw invalid('boolean', value);
}

const INT_RANGE: Record<string, [number, number]> = {
  smallint: [-32768, 32767],
  integer: [-2147483648, 2147483647],
  bigint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
};

export function toInteger(value: unknown, kind: 'smallint' | 'integer' | 'bigint'): number {
  const n = typeof value === 'string' && /^\s*[+-]?\d+\s*$/.test(value) ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n)) throw invalid(kind, value);
  const [min, max] = INT_RANGE[kind] as [number, number];
  if (n < min || n > max) throw dbError(C.numericOutOfRange, `value "${String(value)}" is out of range for type ${kind}`);
  return n;
}

export function toNumber(value: unknown, column: Pick<D1Column, 'pg'>): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw invalid(column.pg, value);
  const scale = /^numeric\(\d+,(\d+)\)$/.exec(column.pg);
  // numeric(p, s) : Postgres arrondit à s décimales en écrivant, en décimal exact (1.005 → 1.01,
  // là où toFixed donnerait 1.00) : on décale par la notation scientifique, pas par un produit.
  if (!scale) return n;
  const s = Number(scale[1]);
  return Number(`${Math.round(Number(`${n}e${s}`))}e-${s}`);
}

/** Les éléments d'un littéral de tableau Postgres (`{a,"b c",NULL}`), si le code en écrit un. */
export function parsePgArrayLiteral(literal: string): Array<string | null> {
  const body = literal.trim();
  if (!body.startsWith('{') || !body.endsWith('}')) throw invalid('array', literal);
  const inner = body.slice(1, -1);
  const out: Array<string | null> = [];
  let i = 0;
  while (i < inner.length) {
    if (inner[i] === '"') {
      let v = '';
      i++;
      while (i < inner.length && inner[i] !== '"') {
        if (inner[i] === '\\') i++;
        v += inner[i++];
      }
      i++;
      out.push(v);
    } else {
      const end = inner.indexOf(',', i);
      const raw = inner.slice(i, end < 0 ? inner.length : end).trim();
      i = end < 0 ? inner.length : end;
      out.push(raw.toUpperCase() === 'NULL' ? null : raw);
    }
    if (inner[i] === ',') i++;
  }
  return out;
}

/** Élément d'un tableau, selon le type des éléments (`text[]`, `uuid[]`, `smallint[]`…). */
function toElement(value: unknown, pg: string): string | number | null {
  if (value === null || value === undefined) return null;
  if (pg.startsWith('uuid')) return toUuid(value);
  if (pg.startsWith('smallint')) return toInteger(value, 'smallint');
  if (pg.startsWith('integer')) return toInteger(value, 'integer');
  return typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Valeur du code → valeur rangée dans D1 (pour une colonne connue). */
export function toDb(column: D1Column, input: unknown): SqlValue {
  if (input === null || input === undefined) return null;
  // supabase-js envoyait du JSON : une Date partait en texte ISO, quelle que soit la colonne.
  const value = input instanceof Date && column.type !== 'timestamptz' && column.type !== 'date' ? input.toISOString() : input;
  switch (column.type) {
    case 'text':
    case 'inet':
      return typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
    case 'uuid':
      return toUuid(value);
    case 'timestamptz':
      return toTimestamp(value);
    case 'date':
      return toDate(value);
    case 'time':
      return toTime(value);
    case 'boolean':
      return toBoolean(value);
    case 'integer':
    case 'smallint':
    case 'bigint':
      return toInteger(value, column.type);
    case 'double':
    case 'numeric':
      return toNumber(value, column);
    case 'json':
      return JSON.stringify(value);
    case 'array': {
      const items = Array.isArray(value)
        ? value
        : typeof value === 'string'
          ? parsePgArrayLiteral(value)
          : (() => {
              throw invalid(column.pg, value);
            })();
      return JSON.stringify(items.map((v) => toElement(v, column.pg)));
    }
    default:
      return assertNever(column.type);
  }
}

function assertNever(kind: never): never {
  throw new Error(`genre de colonne inconnu : ${String(kind)}`);
}

/** Valeur rangée dans D1 → valeur rendue au code, comme PostgREST. */
export function fromDb(kind: ColumnKind, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  switch (kind) {
    case 'boolean':
      return value === 1 || value === true;
    case 'json':
    case 'array':
      return typeof value === 'string' ? JSON.parse(value) : value;
    default:
      return value;
  }
}
