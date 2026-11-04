// utils/db/d1/functions/library.ts — la Women's Library (lot 4f-2 de conference-website
// docs/D1-MIGRATION.md), réécrite depuis les fonctions plpgsql de Postgres
// (database/schema-prod.sql) : library_buy_furniture, library_save_room_items,
// library_lend_room_item, library_return_room_item, library_arena_claim_weekly_pack.
//
// Postgres verrouillait une ligne (le porte-monnaie, la salle, le duel), relisait l'état, puis
// répondait (introuvable, conflit de version, posé ailleurs…) ou écrivait. Ici, chaque fonction
// tient en UN envoi qui rend son VERDICT : l'état y est lu et jugé (`_d1_vars."verdict"`), les
// écritures n'ont lieu que sur « ok ». D1 exécutant un envoi à la fois, rien ne se glisse entre
// le jugement et l'écriture : rien à rejouer. Seule l'arène lit d'abord — sa semaine se calcule
// à l'heure de Paris, en TypeScript — et revérifie à l'écriture (`optimistic`, context.ts).

import { arenaWeekOf } from '../../../../features/player/library/arena/week';
import { DB_ERROR_CODES as C } from '../../errors';
import { dbError } from '../errors';
import { toInteger, toUuid } from '../values';
import {
  CLEAR_VARS,
  conflictGuard,
  intArg,
  optimistic,
  readArgs,
  REQUIRED,
  runBatch,
  runRead,
  setVar,
  textArg,
  uuidArg,
  varOf,
  type D1Function,
  type Statement,
} from './context';
import { begin, clamp, clampSql, NOW, SUM } from './tcgWallet';

const VERDICT = varOf('verdict');
const OK = `${VERDICT} = 'ok'`;

/** Le verdict, puis les écritures conditionnées à « ok » ; rend la ligne du `SELECT` final. */
async function judged(ctx: Parameters<D1Function>[0], table: string, statements: Statement[], answer: Statement) {
  const results = await runBatch(ctx, [...begin, ...statements, answer, CLEAR_VARS], { table, operation: 'update' });
  return results[results.length - 2]?.[0] ?? {};
}

const KEY_RE = /^[a-z][a-z0-9_]{1,40}$/;

export const libraryBuyFurniture: D1Function = async (ctx, raw) => {
  const a = readArgs('library_buy_furniture', raw, { p_tenant_id: REQUIRED, p_user_id: REQUIRED, p_key: REQUIRED, p_price: REQUIRED, p_source_ref: REQUIRED });
  const [tenant, user, key, price, ref] = [uuidArg(a.p_tenant_id), uuidArg(a.p_user_id), textArg(a.p_key), intArg(a.p_price), textArg(a.p_source_ref)];
  // char_length : des caractères, pas des unités UTF-16.
  const refLength = ref === null ? 0 : [...ref].length;
  if (tenant === null || user === null || key === null || !KEY_RE.test(key) || price === null || price <= 0 || refLength < 1 || refLength > 300) {
    throw dbError(C.invalidParameterValue, 'invalid_furniture_purchase');
  }
  const inventoryId = crypto.randomUUID();
  const r = await judged(
    ctx,
    'library_inventory',
    [
      // Rejeu par source_ref (la clé d'idempotence), puis le solde du registre.
      setVar('inv', 'SELECT "id" FROM "library_inventory" WHERE "tenant_id" = ? AND "user_id" = ? AND "source_ref" = ?', [tenant, user, ref]),
      setVar('bal', SUM, [tenant, user]),
      setVar('verdict', `SELECT CASE WHEN ${varOf('inv')} IS NOT NULL THEN 'duplicate' WHEN CAST(${varOf('bal')} AS INTEGER) < ? THEN 'insufficient_funds' ELSE 'ok' END`, [price]),
      {
        sql: `INSERT INTO "tcg_wallets" ("tenant_id", "user_id", "balance", "created_at", "updated_at") SELECT ?, ?, 0, ${NOW}, ${NOW} WHERE ${OK} ON CONFLICT ("tenant_id", "user_id") DO NOTHING`,
        params: [tenant, user],
      },
      {
        sql: `INSERT INTO "library_inventory" ("id", "tenant_id", "user_id", "furniture_key", "source_ref", "acquired_at") SELECT ?, ?, ?, ?, ?, ${NOW} WHERE ${OK}`,
        params: [inventoryId, tenant, user, key, ref],
      },
      {
        sql: `INSERT INTO "tcg_wallet_entries" ("tenant_id", "user_id", "amount", "source_kind", "source_ref", "created_at") SELECT ?, ?, -?, 'furniture_purchase', ?, ${NOW} WHERE ${OK}`,
        params: [tenant, user, price, ref],
      },
      {
        sql: `UPDATE "tcg_wallets" SET "balance" = ${clampSql(SUM)}, "updated_at" = ${NOW} WHERE "tenant_id" = ? AND "user_id" = ? AND ${OK}`,
        params: [tenant, user, tenant, user],
      },
    ],
    {
      sql: `SELECT ${VERDICT} AS "verdict", ${varOf('inv')} AS "inv", (SELECT "furniture_key" FROM "library_inventory" WHERE "id" = ${varOf('inv')}) AS "key", ${varOf('bal')} AS "bal"`,
      params: [],
    }
  );
  const balance = Number(r.bal);
  if (r.verdict === 'duplicate') return { status: 'duplicate', inventory_id: r.inv, furniture_key: r.key, balance: clamp(balance), price };
  if (r.verdict === 'insufficient_funds') return { status: 'insufficient_funds', balance: Math.max(balance, 0), price };
  return { status: 'ok', inventory_id: inventoryId, balance: clamp(balance - price), price };
};

/** `->>` de Postgres sur un champ JSON : le texte, ou le JSON d'une valeur qui n'est pas une chaîne. */
const jsonText = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));
const field = <T>(v: unknown, convert: (text: string) => T): T | null => (v === null || v === undefined ? null : convert(jsonText(v)));

type Placement = [string | null, number | null, number | null, number | null];

/**
 * `jsonb_to_recordset(p_items) AS x(inventory_id uuid, gx integer, gy integer, rotation smallint)` :
 * Postgres convertit TOUT le tableau (une valeur illisible → son erreur) avant que la fonction
 * ne cherche un champ manquant.
 */
function placements(items: unknown[]): Placement[] {
  return items.map((e) => {
    if (e === null || typeof e !== 'object' || Array.isArray(e)) {
      throw dbError(C.invalidParameterValue, 'argument of jsonb_to_recordset must be an array of objects');
    }
    const o = e as Record<string, unknown>;
    return [
      field(o.inventory_id, toUuid),
      field(o.gx, (t) => toInteger(t, 'integer')),
      field(o.gy, (t) => toInteger(t, 'integer')),
      field(o.rotation, (t) => toInteger(t, 'smallint')),
    ];
  });
}

/** Un champ d'un placement (`[id, gx, gy, rotation]`), dans `json_each(?) AS x`. */
const X = (i: number) => `json_extract(x."value", '$[${i}]')`;
const VERSION = '(SELECT "version" FROM "library_rooms" WHERE "id" = ? AND "tenant_id" = ?)';

export const librarySaveRoomItems: D1Function = async (ctx, raw) => {
  const a = readArgs('library_save_room_items', raw, { p_tenant_id: REQUIRED, p_room_id: REQUIRED, p_user_id: REQUIRED, p_items: REQUIRED, p_expected_version: REQUIRED });
  const [tenant, room, user, expected] = [uuidArg(a.p_tenant_id), uuidArg(a.p_room_id), uuidArg(a.p_user_id), intArg(a.p_expected_version)];
  if (tenant === null || room === null || user === null || !Array.isArray(a.p_items) || expected === null || expected < 0) {
    throw dbError(C.invalidParameterValue, 'invalid_room_items');
  }
  const rows = placements(a.p_items);
  if (rows.some((p) => p.includes(null))) throw dbError(C.invalidParameterValue, 'invalid_room_items');
  const items = JSON.stringify(rows);
  // Le premier fautif dans l'ordre de la liste (Postgres : « LIMIT 1 », sans ordre garanti).
  const first = (from: string, where: string) => `SELECT ${X(0)} FROM json_each(?) AS x ${from} WHERE ${where} ORDER BY x."key" LIMIT 1`;
  const r = await judged(
    ctx,
    'library_room_items',
    [
      setVar('dup', `SELECT ${X(0)} FROM json_each(?) AS x GROUP BY 1 HAVING count(*) > 1 ORDER BY min(x."key") LIMIT 1`, [items]),
      setVar('foreign', first('', `NOT EXISTS (SELECT 1 FROM "library_inventory" AS i WHERE i."id" = ${X(0)} AND i."tenant_id" = ? AND i."user_id" = ?)`), [items, tenant, user]),
      setVar('elsewhere', first(`JOIN "library_room_items" AS ri ON ri."inventory_id" = ${X(0)}`, 'ri."room_id" <> ?'), [items, room]),
      setVar(
        'verdict',
        'SELECT CASE ' +
          `WHEN NOT EXISTS (SELECT 1 FROM "library_rooms" WHERE "id" = ? AND "tenant_id" = ? AND "kind" = 'apartment' AND "owner_user_id" = ?) THEN 'not_found' ` +
          `WHEN ${VERSION} <> ? THEN 'conflict' ` +
          `WHEN ${varOf('dup')} IS NOT NULL THEN 'duplicate' ` +
          `WHEN ${varOf('foreign')} IS NOT NULL THEN 'not_owned' ` +
          `WHEN ${varOf('elsewhere')} IS NOT NULL THEN 'placed_elsewhere' ` +
          "ELSE 'ok' END",
        [room, tenant, user, room, tenant, expected]
      ),
      // L'état complet remplace l'ancien : un meuble absent de la liste est rangé.
      { sql: `DELETE FROM "library_room_items" WHERE "room_id" = ? AND "tenant_id" = ? AND ${OK}`, params: [room, tenant] },
      {
        sql: `INSERT INTO "library_room_items" ("inventory_id", "tenant_id", "room_id", "gx", "gy", "z", "rotation", "placed_at") SELECT ${X(0)}, ?, ?, ${X(1)}, ${X(2)}, 0, ${X(3)}, ${NOW} FROM json_each(?) AS x WHERE ${OK} ORDER BY x."key"`,
        params: [tenant, room, items],
      },
      { sql: `UPDATE "library_rooms" SET "version" = "version" + 1 WHERE "id" = ? AND "tenant_id" = ? AND ${OK}`, params: [room, tenant] },
    ],
    {
      sql: `SELECT ${VERDICT} AS "verdict", ${varOf('dup')} AS "dup", ${varOf('foreign')} AS "foreign", ${varOf('elsewhere')} AS "elsewhere", ${VERSION} AS "version"`,
      params: [room, tenant],
    }
  );
  const version = Number(r.version);
  switch (r.verdict) {
    case 'ok':
      return { status: 'ok', version };
    case 'conflict':
      return { status: 'conflict', version };
    case 'duplicate':
      return { status: 'duplicate', inventory_id: r.dup };
    case 'not_owned':
      return { status: 'not_owned', inventory_id: r.foreign };
    case 'placed_elsewhere':
      return { status: 'placed_elsewhere', inventory_id: r.elsewhere };
    default:
      return { status: 'not_found' };
  }
};

/** Un QG d'équipe de cet espace (rattaché à une équipe). */
const HQ = `EXISTS (SELECT 1 FROM "library_rooms" WHERE "id" = ? AND "tenant_id" = ? AND "kind" = 'team_hq' AND "team_id" IS NOT NULL)`;
const TEAM = '(SELECT "team_id" FROM "library_rooms" WHERE "id" = ? AND "tenant_id" = ?)';
/** Membre acceptée (d'un rôle donné, ou de tout rôle) d'une équipe non dissoute. */
const member = (role: string | null) =>
  'EXISTS (SELECT 1 FROM "team_members" AS tm JOIN "teams" AS t ON t."id" = tm."team_id" ' +
  `WHERE tm."team_id" = ${TEAM} AND tm."user_id" = ? AND tm."tenant_id" = ? AND tm."accepted_at" IS NOT NULL${role ? ` AND tm."role" = '${role}'` : ''} AND t."deleted_at" IS NULL)`;

export const libraryLendRoomItem: D1Function = async (ctx, raw) => {
  const a = readArgs('library_lend_room_item', raw, {
    p_tenant_id: REQUIRED,
    p_room_id: REQUIRED,
    p_user_id: REQUIRED,
    p_inventory_id: REQUIRED,
    p_gx: REQUIRED,
    p_gy: REQUIRED,
    p_rotation: REQUIRED,
    p_expected_version: REQUIRED,
  });
  const [tenant, room, user, inventory] = [uuidArg(a.p_tenant_id), uuidArg(a.p_room_id), uuidArg(a.p_user_id), uuidArg(a.p_inventory_id)];
  const [gx, gy, rotation, expected] = [intArg(a.p_gx), intArg(a.p_gy), intArg(a.p_rotation), intArg(a.p_expected_version)];
  if (
    tenant === null ||
    room === null ||
    user === null ||
    inventory === null ||
    gx === null ||
    gy === null ||
    gx < 0 ||
    gy < 0 ||
    rotation === null ||
    rotation < 0 ||
    rotation > 3 ||
    expected === null ||
    expected < 0
  ) {
    throw dbError(C.invalidParameterValue, 'invalid_lend');
  }
  const r = await judged(
    ctx,
    'library_room_items',
    [
      setVar(
        'verdict',
        'SELECT CASE ' +
          `WHEN NOT ${HQ} THEN 'not_found' ` +
          `WHEN NOT ${member(null)} THEN 'not_member' ` +
          `WHEN ${VERSION} <> ? THEN 'conflict' ` +
          `WHEN NOT EXISTS (SELECT 1 FROM "library_inventory" WHERE "id" = ? AND "tenant_id" = ? AND "user_id" = ?) THEN 'not_owned' ` +
          `WHEN EXISTS (SELECT 1 FROM "library_room_items" WHERE "inventory_id" = ? AND "room_id" <> ?) THEN 'placed_elsewhere' ` +
          "ELSE 'ok' END",
        [room, tenant, room, tenant, user, tenant, room, tenant, expected, inventory, tenant, user, inventory, room]
      ),
      // Déjà prêté ICI : c'est un déplacement.
      setVar('moved', 'SELECT EXISTS (SELECT 1 FROM "library_room_items" WHERE "inventory_id" = ?)', [inventory]),
      {
        sql:
          `INSERT INTO "library_room_items" AS ri ("inventory_id", "tenant_id", "room_id", "gx", "gy", "z", "rotation", "placed_at") SELECT ?, ?, ?, ?, ?, 0, ?, ${NOW} WHERE ${OK} ` +
          'ON CONFLICT ("inventory_id") DO UPDATE SET "gx" = excluded."gx", "gy" = excluded."gy", "rotation" = excluded."rotation" WHERE ri."room_id" = ?',
        params: [inventory, tenant, room, gx, gy, rotation, room],
      },
      { sql: `UPDATE "library_rooms" SET "version" = "version" + 1 WHERE "id" = ? AND "tenant_id" = ? AND ${OK}`, params: [room, tenant] },
    ],
    { sql: `SELECT ${VERDICT} AS "verdict", ${varOf('moved')} AS "moved", ${VERSION} AS "version"`, params: [room, tenant] }
  );
  if (r.verdict === 'ok') return { status: 'ok', version: Number(r.version), moved: Number(r.moved) === 1 };
  if (r.verdict === 'conflict') return { status: 'conflict', version: Number(r.version) };
  return { status: r.verdict };
};

export const libraryReturnRoomItem: D1Function = async (ctx, raw) => {
  const a = readArgs('library_return_room_item', raw, { p_tenant_id: REQUIRED, p_room_id: REQUIRED, p_user_id: REQUIRED, p_inventory_id: REQUIRED });
  const [tenant, room, user, inventory] = [uuidArg(a.p_tenant_id), uuidArg(a.p_room_id), uuidArg(a.p_user_id), uuidArg(a.p_inventory_id)];
  if (tenant === null || room === null || user === null || inventory === null) throw dbError(C.invalidParameterValue, 'invalid_return');
  const owner = varOf('owner');
  const r = await judged(
    ctx,
    'library_room_items',
    [
      setVar(
        'owner',
        'SELECT i."user_id" FROM "library_room_items" AS ri JOIN "library_inventory" AS i ON i."id" = ri."inventory_id" WHERE ri."inventory_id" = ? AND ri."room_id" = ? AND ri."tenant_id" = ?',
        [inventory, room, tenant]
      ),
      // Sa propriétaire ; sinon la capitaine, ou une manager acceptée, d'une équipe non dissoute.
      setVar(
        'verdict',
        'SELECT CASE ' +
          `WHEN NOT ${HQ} THEN 'not_found' ` +
          `WHEN ${owner} IS NULL THEN 'not_lent' ` +
          `WHEN ${owner} IS NOT ? ` +
          `AND NOT EXISTS (SELECT 1 FROM "teams" AS t WHERE t."id" = ${TEAM} AND t."tenant_id" = ? AND t."deleted_at" IS NULL AND t."captain_id" = ?) ` +
          `AND NOT ${member('manager')} THEN 'forbidden' ` +
          "ELSE 'ok' END",
        [room, tenant, user, room, tenant, tenant, user, room, tenant, user, tenant]
      ),
      // Le meuble revient : sa pose disparaît, sa ligne d'inventaire reste.
      { sql: `DELETE FROM "library_room_items" WHERE "inventory_id" = ? AND "room_id" = ? AND "tenant_id" = ? AND ${OK}`, params: [inventory, room, tenant] },
      { sql: `UPDATE "library_rooms" SET "version" = "version" + 1 WHERE "id" = ? AND "tenant_id" = ? AND ${OK}`, params: [room, tenant] },
    ],
    { sql: `SELECT ${VERDICT} AS "verdict", ${owner} AS "owner", ${VERSION} AS "version"`, params: [room, tenant] }
  );
  if (r.verdict === 'ok') return { status: 'ok', version: Number(r.version), owner_user_id: r.owner };
  return { status: r.verdict };
};

export const libraryArenaClaimWeeklyPack: D1Function = async (ctx, raw) => {
  const a = readArgs('library_arena_claim_weekly_pack', raw, { p_tenant_id: REQUIRED, p_user_id: REQUIRED, p_duel_id: REQUIRED });
  const [tenant, user, duel] = [uuidArg(a.p_tenant_id), uuidArg(a.p_user_id), uuidArg(a.p_duel_id)];
  if (tenant === null || user === null || duel === null) throw dbError(C.invalidParameterValue, 'invalid_arena_claim');
  return optimistic(async () => {
    const [d] = await runRead(
      ctx,
      'SELECT d."status", d."ended_at", d."reward_status", (SELECT r."pack_id" FROM "library_arena_rewards" AS r WHERE r."duel_id" = d."id") AS "pack_id" ' +
        'FROM "library_arena_duels" AS d WHERE d."id" = ? AND d."tenant_id" = ? AND d."user_id" = ?',
      [duel, tenant, user],
      'library_arena_duels'
    );
    if (!d) return { status: 'not_found' };
    if (d.status !== 'won' || d.ended_at === null) return { status: 'not_won' };
    // La semaine ISO de la FIN du duel, à l'heure de Paris (stockage : UTC, à la microseconde).
    const ended = String(d.ended_at);
    const week = arenaWeekOf(new Date(`${ended.slice(0, 23)}Z`));
    if (d.reward_status !== null) return { status: d.reward_status, week, pack_id: d.pack_id ?? null, replayed: true };
    // La semaine déjà payée (ou ce duel déjà récompensé) : la clé que Postgres voyait violée.
    const taken = `CAST(${varOf('taken')} AS INTEGER) = 1`;
    const packId = crypto.randomUUID();
    const r = await judged(
      ctx,
      'library_arena_rewards',
      [
        // Le duel n'a pas bougé depuis la lecture (une réclamation jumelle, sinon : on rejoue).
        conflictGuard(`NOT EXISTS (SELECT 1 FROM "library_arena_duels" WHERE "id" = ? AND "status" = 'won' AND "reward_status" IS NULL AND "ended_at" = ?)`, [duel, ended]),
        setVar(
          'taken',
          'SELECT EXISTS (SELECT 1 FROM "library_arena_rewards" WHERE ("tenant_id" = ? AND "user_id" = ? AND "iso_week" = ?) OR "duel_id" = ?)',
          [tenant, user, week, duel]
        ),
        {
          sql: `INSERT INTO "tcg_packs" ("id", "tenant_id", "user_id", "source_kind", "source_match_id", "granted_at") SELECT ?, ?, ?, 'arena', NULL, ${NOW} WHERE NOT (${taken})`,
          params: [packId, tenant, user],
        },
        {
          sql: `INSERT INTO "library_arena_rewards" ("tenant_id", "user_id", "iso_week", "duel_id", "pack_id", "granted_at") SELECT ?, ?, ?, ?, ?, ${NOW} WHERE NOT (${taken})`,
          params: [tenant, user, week, duel, packId],
        },
        {
          sql: `UPDATE "library_arena_duels" SET "reward_status" = CASE WHEN ${taken} THEN 'week_already' ELSE 'granted' END, "updated_at" = ${NOW} WHERE "id" = ?`,
          params: [duel],
        },
      ],
      { sql: `SELECT ${taken} AS "taken"`, params: [] }
    );
    return Number(r.taken) === 1
      ? { status: 'week_already', week, pack_id: null, replayed: false }
      : { status: 'granted', week, pack_id: packId, replayed: false };
  });
};
