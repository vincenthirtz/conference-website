// utils/db/d1/functions/accounts.ts — les 6 lectures de comptes (lot 4d de
// conference-website docs/D1-MIGRATION.md), réécrites depuis les fonctions SQL de Postgres
// (database/schema-prod.sql) : mêmes filtres, mêmes colonnes, même ordre.
//
// `lower(x)` de Postgres → foldCase (casse d'ICU pour les lettres latines, collation.ts) ; un
// `LIKE '%' || q || '%'` dont q n'a pas de joker → instr(), sinon LIKE … ESCAPE '\' (l'échappement
// par défaut de Postgres). Les foldCase sont calculés dans des tables dérivées (plafond de
// profondeur de D1, context.ts). `DISTINCT ON (user_id) … ORDER BY user_id, id` → row_number().

import { DB_ERROR_CODES as C } from '../../errors';
import { foldCase, foldCaseJs, icuOrderSql } from '../collation';
import { dbError } from '../errors';
import { SQL_NOW } from '../now';
import { parsePgArrayLiteral, toInteger, toTimestamp, toUuid, type SqlValue } from '../values';
import { decodeRows, pgTrim, readArgs, REQUIRED, runRead, type D1Function } from './context';

type Row = Record<string, unknown>;

const meta = (alias: string, key: string) => `json_extract(${alias}."metadata", '$.${key}')`;

const text = (v: unknown): string | null => (v === null || v === undefined ? null : typeof v === 'string' ? v : String(v));

/** `lower(trim(x))` de Postgres, en JavaScript (pour un paramètre). */
const lowerTrim = (v: unknown): string | null => {
  const s = text(v);
  return s === null ? null : foldCaseJs(pgTrim(s));
};

/** `col LIKE '%' || needle || '%'` de Postgres sur une colonne déjà en minuscules. */
function contains(column: string, needle: string, params: SqlValue[]): string {
  if (!/[%_\\]/.test(needle)) {
    params.push(needle);
    return `instr(${column}, ?) > 0`;
  }
  params.push(`%${needle}%`);
  return `${column} LIKE ? ESCAPE '\\'`;
}

/** « maintenant − 6 mois » comme Postgres : le jour est ramené au dernier du mois (31 août → 28 février). */
export function sixMonthsAgo(now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() - 6;
  const target = new Date(Date.UTC(y, m, 1, now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(now.getUTCDate(), lastDay));
  return toTimestamp(target.toISOString());
}

/** Le premier rattachement de chaque compte (DISTINCT ON (user_id) … ORDER BY user_id, id). */
const firstMembership = (where: string) =>
  `SELECT "user_id", "battle_tag", "display_name", "team_id" FROM (SELECT tm."user_id", tm."battle_tag", tm."display_name", tm."team_id", row_number() OVER (PARTITION BY tm."user_id" ORDER BY tm."id") AS "rn" FROM "team_members" AS tm WHERE ${where}) WHERE "rn" = 1`;

const LIST_SORTS = new Set(['display_name', 'email', 'role', 'last_sign_in_at']);

export const adminListUsers: D1Function = async (ctx, raw) => {
  const a = readArgs('admin_list_users', raw, {
    p_query: null,
    p_role: null,
    p_limit: 20,
    p_offset: 0,
    p_sort: 'created_at',
    p_dir: 'desc',
    p_filters: null,
  });
  const q = lowerTrim(a.p_query) || null;
  const r = lowerTrim(a.p_role) || null;
  const filters = Array.isArray(a.p_filters) ? a.p_filters.map(text) : [];
  const sortArg = (text(a.p_sort) ?? 'created_at').toLowerCase();
  const sort = LIST_SORTS.has(sortArg) ? sortArg : 'created_at';
  const asc = (text(a.p_dir) ?? 'desc').toLowerCase() === 'asc';
  const params: SqlValue[] = [];

  const base = `SELECT u."id", u."email", u."created_at", u."last_sign_in_at", u."banned_until", ${meta('u', 'display_name')} AS "display_name", ${foldCase(meta('u', 'role'))} AS "role", ${foldCase('u."email"')} AS "l_email", ${foldCase(meta('u', 'display_name'))} AS "l_display_name" FROM "auth_user" AS u`;
  const where: string[] = [];
  if (r !== null) {
    params.push(r);
    where.push('b."role" = ?');
  }
  if (q !== null) {
    const any = [contains('b."l_email"', q, params), contains('b."l_display_name"', q, params), contains('b."role"', q, params)];
    any.push(
      `EXISTS (SELECT 1 FROM (SELECT tm."user_id", ${foldCase('tm."battle_tag"')} AS "b" FROM "team_members" AS tm) AS x WHERE x."user_id" = b."id" AND ${contains('x."b"', q, params)})`
    );
    where.push(`(${any.join(' OR ')})`);
  }
  const STAFF = `('caster', 'admin', 'owner')`;
  if (filters.includes('staff')) where.push(`b."role" IN ${STAFF}`);
  if (filters.includes('community')) where.push(`coalesce(b."role", 'member') NOT IN ${STAFF}`);
  if (filters.includes('no_team')) where.push('NOT EXISTS (SELECT 1 FROM "team_members" AS tm WHERE tm."user_id" = b."id")');
  if (filters.includes('never_signed_in')) where.push('b."last_sign_in_at" IS NULL');
  if (filters.includes('inactive_6m')) {
    params.push(sixMonthsAgo(new Date()));
    where.push('(b."last_sign_in_at" IS NULL OR b."last_sign_in_at" < ?)');
  }
  if (filters.includes('suspended')) where.push(`(b."banned_until" IS NOT NULL AND b."banned_until" > ${SQL_NOW})`);
  if (filters.includes('no_discord')) where.push('NOT EXISTS (SELECT 1 FROM "user_discord_links" AS dl WHERE dl."auth_user_id" = b."id")');
  if (filters.includes('battletag_mismatch')) {
    where.push(
      `EXISTS (SELECT 1 FROM (SELECT tm."user_id", tm."verified_battle_net_id" AS "v", tm."battle_tag_verified_at" AS "va", ${foldCase('trim(tm."battle_tag")')} AS "t", ${foldCase('trim(bl."battle_tag")')} AS "l" FROM "team_members" AS tm LEFT JOIN "user_battlenet_links" AS bl ON bl."auth_user_id" = tm."user_id") AS x WHERE x."user_id" = b."id" AND ((x."v" IS NOT NULL AND x."va" IS NULL) OR (nullif(x."l", '') IS NOT NULL AND nullif(x."t", '') IS NOT NULL AND x."l" <> x."t")))`
    );
  }

  const key =
    sort === 'display_name'
      ? icuOrderSql('f."l_display_name"', asc, 'NULLS LAST')
      : sort === 'email'
        ? icuOrderSql('f."l_email"', asc, 'NULLS LAST')
        : sort === 'role'
          ? icuOrderSql('f."role"', asc, 'NULLS LAST')
          : `f."${sort}" ${asc ? 'ASC' : 'DESC'} NULLS LAST`;
  const limit = a.p_limit === null ? -1 : toInteger(a.p_limit, 'integer');
  const offset = a.p_offset === null ? 0 : toInteger(a.p_offset, 'integer');
  params.push(limit, offset);
  const sql =
    `SELECT f."id", f."email", f."role", f."display_name", f."created_at", f."last_sign_in_at", f."banned_until", count(*) OVER () AS "total_count" ` +
    `FROM (SELECT * FROM (${base}) AS b${where.length ? ` WHERE ${where.join(' AND ')}` : ''}) AS f ` +
    `ORDER BY ${key}, f."created_at" DESC, f."id" LIMIT ? OFFSET ?`;
  return decodeRows(await runRead(ctx, sql, params, 'auth_user'), {
    id: 'uuid',
    email: 'text',
    role: 'text',
    display_name: 'text',
    created_at: 'timestamptz',
    last_sign_in_at: 'timestamptz',
    banned_until: 'timestamptz',
    total_count: 'bigint',
  });
};

export const adminSearchUsers: D1Function = async (ctx, raw) => {
  const a = readArgs('admin_search_users', raw, { p_query: REQUIRED });
  const q = lowerTrim(a.p_query);
  if (q === null || [...q].length < 2) return [];
  const params: SqlValue[] = [];
  const fromUsers = `SELECT u."id" AS "user_id" FROM (SELECT "id", ${foldCase('"email"')} AS "e", ${foldCase(meta('auth_user', 'display_name'))} AS "d" FROM "auth_user") AS u WHERE ${contains('u."e"', q, params)} OR ${contains('u."d"', q, params)}`;
  const fromMembers = `SELECT tm."user_id" FROM (SELECT "user_id", ${foldCase('"battle_tag"')} AS "b", ${foldCase('"display_name"')} AS "d" FROM "team_members" WHERE "user_id" IS NOT NULL) AS tm WHERE ${contains('tm."b"', q, params)} OR ${contains('tm."d"', q, params)}`;
  const sql =
    `SELECT l."user_id" AS "id", u."email" AS "email", COALESCE(m."display_name", ${meta('u', 'display_name')}) AS "display_name", m."battle_tag" AS "battle_tag", m."team_id" AS "team_id", t."name" AS "team_name" ` +
    `FROM (SELECT DISTINCT c."user_id" FROM (${fromUsers} UNION ${fromMembers}) AS c LIMIT 30) AS l ` +
    `LEFT JOIN "auth_user" AS u ON u."id" = l."user_id" ` +
    `LEFT JOIN (${firstMembership('tm."user_id" IS NOT NULL')}) AS m ON m."user_id" = l."user_id" ` +
    `LEFT JOIN "teams" AS t ON t."id" = m."team_id"`;
  return decodeRows(await runRead(ctx, sql, params, 'auth_user'), {
    id: 'uuid',
    email: 'text',
    display_name: 'text',
    battle_tag: 'text',
    team_id: 'uuid',
    team_name: 'text',
  });
};

export const adminGetUserProfiles: D1Function = async (ctx, raw) => {
  const a = readArgs('admin_get_user_profiles', raw, { p_ids: REQUIRED });
  if (a.p_ids === null) return [];
  // uuid[] : un tableau JSON, ou un littéral Postgres « {…} » ; sinon l'erreur de Postgres.
  const list: unknown[] = Array.isArray(a.p_ids)
    ? a.p_ids
    : typeof a.p_ids === 'string'
      ? parsePgArrayLiteral(a.p_ids)
      : (() => {
          throw dbError(C.invalidTextRepresentation, `malformed array literal: "${String(a.p_ids)}"`);
        })();
  const ids = list.filter((v) => v !== null).map(toUuid);
  const keys = ['display_name', 'full_name', 'avatar_url', 'battle_tag', 'discord'];
  const sql = `SELECT u."id", u."email", ${keys.map((k) => `${meta('u', k)} AS "${k}"`).join(', ')} FROM "auth_user" AS u WHERE u."id" IN (SELECT "value" FROM json_each(?))`;
  return decodeRows(await runRead(ctx, sql, [JSON.stringify(ids)], 'auth_user'), {
    id: 'uuid',
    email: 'text',
    ...Object.fromEntries(keys.map((k) => [k, 'text' as const])),
  });
};

export const adminSearchTcgPlayers: D1Function = async (ctx, raw) => {
  const a = readArgs('admin_search_tcg_players', raw, { p_tenant_id: REQUIRED, p_query: REQUIRED });
  const tenant = a.p_tenant_id === null ? null : toUuid(a.p_tenant_id);
  const q = lowerTrim(a.p_query);
  if (tenant === null || q === null || [...q].length < 2) return [];
  // Postgres échappe \, % et _ : la recherche est littérale, donc instr().
  const sql =
    `SELECT r.* FROM (SELECT x."user_id" AS "id", COALESCE(m."display_name", ${meta('u', 'display_name')}, ${meta('u', 'full_name')}) AS "display_name", m."battle_tag" AS "battle_tag", t."name" AS "team_name" ` +
    `FROM (SELECT DISTINCT a."user_id" FROM (` +
    `SELECT tm."user_id" FROM "team_members" AS tm WHERE tm."tenant_id" = ?1 AND tm."user_id" IS NOT NULL AND tm."accepted_at" IS NOT NULL ` +
    `UNION SELECT e."user_id" FROM "tcg_wallet_entries" AS e WHERE e."tenant_id" = ?1 AND e."source_kind" IN ('twitch_drop', 'supporter_welcome', 'battlenet_verified', 'collection_set')` +
    `) AS a LEFT JOIN (SELECT "id", ${foldCase(meta('auth_user', 'display_name'))} AS "d", ${foldCase(meta('auth_user', 'full_name'))} AS "f" FROM "auth_user") AS uu ON uu."id" = a."user_id" ` +
    `WHERE instr(uu."d", ?2) > 0 OR instr(uu."f", ?2) > 0 OR EXISTS (SELECT 1 FROM (SELECT "user_id", "tenant_id", ${foldCase('"battle_tag"')} AS "b", ${foldCase('"display_name"')} AS "d" FROM "team_members") AS y WHERE y."tenant_id" = ?1 AND y."user_id" = a."user_id" AND (instr(y."b", ?2) > 0 OR instr(y."d", ?2) > 0))` +
    `) AS x LEFT JOIN "auth_user" AS u ON u."id" = x."user_id" ` +
    `LEFT JOIN (${firstMembership('tm."tenant_id" = ?1 AND tm."user_id" IS NOT NULL')}) AS m ON m."user_id" = x."user_id" ` +
    `LEFT JOIN "teams" AS t ON t."id" = m."team_id" AND t."tenant_id" = ?1) AS r ` +
    `ORDER BY ${icuOrderSql('r."display_name"', true, 'NULLS LAST')}, r."id" LIMIT 20`;
  return decodeRows(await runRead(ctx, sql, [tenant, q], 'auth_user'), {
    id: 'uuid',
    display_name: 'text',
    battle_tag: 'text',
    team_name: 'text',
  });
};

export const getUserIdByEmail: D1Function = async (ctx, raw) => {
  const a = readArgs('get_user_id_by_email', raw, { p_email: REQUIRED });
  const email = lowerTrim(a.p_email);
  if (!email) return null;
  // Même expression que l'index unique auth_user_email_key : SQLite s'en sert.
  const rows: Row[] = await runRead(ctx, `SELECT "id" FROM "auth_user" WHERE ${foldCase('"email"')} = ? LIMIT 1`, [email], 'auth_user');
  return rows[0] ? String(rows[0].id) : null;
};

export const countConfirmedAuthUsers: D1Function = async (ctx, raw) => {
  readArgs('count_confirmed_auth_users', raw, {});
  const rows = await runRead(ctx, 'SELECT count(*) AS "n" FROM "auth_user" WHERE "email_verified" = 1', [], 'auth_user');
  return Number(rows[0]?.n ?? 0);
};
