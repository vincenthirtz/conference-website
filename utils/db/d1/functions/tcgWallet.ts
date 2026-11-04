// utils/db/d1/functions/tcgWallet.ts — l'argent virtuel du TCG (lot 4f-1 de
// conference-website docs/D1-MIGRATION.md), réécrit depuis les fonctions plpgsql de Postgres
// (database/schema-prod.sql) : tcg_purchase_booster, tcg_admin_debit,
// tcg_refresh_wallet_balance, tcg_buy_cosmetic, tcg_forge_card.
//
// Le registre `tcg_wallet_entries` fait foi : le solde est la somme de ses lignes, `tcg_wallets`
// n'en est que le cache (borné à [0, 2^31-1] comme Postgres). En production, chaque fonction
// verrouillait la ligne du porte-monnaie avant de relire la somme ; ici, chacune tient en un
// envoi atomique (D1 en exécute un à la fois), ou relit puis écrit en vérifiant que la somme n'a
// pas bougé (`optimistic`, context.ts) quand sa réponse dépend d'une lecture préalable.
// `now()` de Postgres (l'heure de la transaction) : une seule valeur par envoi, `varOf('now')`.

import { DB_ERROR_CODES as C } from '../../errors';
import { dbError } from '../errors';
import { SQL_NOW } from '../now';
import { toInteger, toUuid } from '../values';
import {
  CLEAR_VARS,
  conflictGuard,
  guard,
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

export const NOW = varOf('now');
const INT_MAX = 2147483647;
export const clamp = (n: number) => Math.min(Math.max(n, 0), INT_MAX);
export const clampSql = (expr: string) => `min(max(${expr}, 0), ${INT_MAX})`;

/** La somme du registre d'une joueuse (le solde qui fait foi). Lot 4f-2 : aussi les meubles. */
export const SUM = '(SELECT coalesce(sum("amount"), 0) FROM "tcg_wallet_entries" WHERE "tenant_id" = ? AND "user_id" = ?)';

/** Le porte-monnaie existe (Postgres le créait pour pouvoir le verrouiller). */
const ensureWallet = (tenant: string | null, user: string | null): Statement => ({
  sql: `INSERT INTO "tcg_wallets" ("tenant_id", "user_id", "balance", "created_at", "updated_at") VALUES (?, ?, 0, ${NOW}, ${NOW}) ON CONFLICT ("tenant_id", "user_id") DO NOTHING`,
  params: [tenant, user],
});

/** Le cache suit le registre. */
const refreshCache = (tenant: string | null, user: string | null): Statement => ({
  sql: `UPDATE "tcg_wallets" SET "balance" = ${clampSql(SUM)}, "updated_at" = ${NOW} WHERE "tenant_id" = ? AND "user_id" = ?`,
  params: [tenant, user, tenant, user],
});

export const begin: Statement[] = [CLEAR_VARS, setVar('now', SQL_NOW)];

async function readSum(ctx: Parameters<D1Function>[0], tenant: string | null, user: string | null): Promise<number> {
  const rows = await runRead(ctx, `SELECT ${SUM} AS "s"`, [tenant, user], 'tcg_wallet_entries');
  return Number(rows[0]?.s ?? 0);
}

export const tcgPurchaseBooster: D1Function = async (ctx, raw) => {
  const a = readArgs('tcg_purchase_booster', raw, { p_tenant_id: REQUIRED, p_user_id: REQUIRED, p_price: REQUIRED });
  const [tenant, user, price] = [uuidArg(a.p_tenant_id), uuidArg(a.p_user_id), intArg(a.p_price)];
  if (tenant === null || user === null || price === null || price <= 0) throw dbError(C.invalidParameterValue, 'invalid_purchase');
  return optimistic(async () => {
    const sum = await readSum(ctx, tenant, user);
    if (sum < price) return { status: 'insufficient_funds', balance: Math.max(sum, 0), price };
    const packId = crypto.randomUUID();
    await runBatch(
      ctx,
      [
        ...begin,
        conflictGuard(`${SUM} <> ?`, [tenant, user, sum]),
        ensureWallet(tenant, user),
        {
          sql: `INSERT INTO "tcg_packs" ("id", "tenant_id", "user_id", "source_kind", "source_match_id", "granted_at") VALUES (?, ?, ?, 'purchase', NULL, ${NOW})`,
          params: [packId, tenant, user],
        },
        {
          sql: `INSERT INTO "tcg_wallet_entries" ("tenant_id", "user_id", "amount", "source_kind", "source_ref", "created_at") VALUES (?, ?, ?, 'booster_purchase', ?, ${NOW})`,
          params: [tenant, user, -price, packId],
        },
        refreshCache(tenant, user),
        CLEAR_VARS,
      ],
      { table: 'tcg_wallet_entries', operation: 'insert' }
    );
    return { status: 'ok', pack_id: packId, balance: clamp(sum - price), price };
  });
};

export const tcgAdminDebit: D1Function = async (ctx, raw) => {
  const a = readArgs('tcg_admin_debit', raw, { p_tenant_id: REQUIRED, p_user_id: REQUIRED, p_cost: REQUIRED, p_source_ref: REQUIRED, p_note: REQUIRED });
  const [tenant, user, cost, ref, note] = [uuidArg(a.p_tenant_id), uuidArg(a.p_user_id), intArg(a.p_cost), textArg(a.p_source_ref), textArg(a.p_note)];
  if (tenant === null || user === null || cost === null || cost <= 0 || ref === null || ref.length === 0) {
    throw dbError(C.invalidParameterValue, 'invalid_debit');
  }
  return optimistic(async () => {
    const sum = await readSum(ctx, tenant, user);
    // Le porte-monnaie est créé et son cache rafraîchi dans les deux cas, comme Postgres.
    const head = [...begin, conflictGuard(`${SUM} <> ?`, [tenant, user, sum]), ensureWallet(tenant, user)];
    if (sum < cost) {
      await runBatch(ctx, [...head, refreshCache(tenant, user), CLEAR_VARS], { table: 'tcg_wallets', operation: 'update' });
      return { status: 'insufficient', balance: clamp(sum) };
    }
    const entryId = crypto.randomUUID();
    await runBatch(
      ctx,
      [
        ...head,
        {
          sql: `INSERT INTO "tcg_wallet_entries" ("id", "tenant_id", "user_id", "amount", "source_kind", "source_ref", "note", "created_at") VALUES (?, ?, ?, ?, 'admin_grant', ?, ?, ${NOW})`,
          params: [entryId, tenant, user, -cost, ref, note],
        },
        refreshCache(tenant, user),
        CLEAR_VARS,
      ],
      { table: 'tcg_wallet_entries', operation: 'insert' }
    );
    return { status: 'ok', entry_id: entryId, balance: clamp(sum - cost) };
  });
};

export const tcgRefreshWalletBalance: D1Function = async (ctx, raw) => {
  const a = readArgs('tcg_refresh_wallet_balance', raw, { p_tenant_id: REQUIRED, p_user_id: REQUIRED });
  const [tenant, user] = [uuidArg(a.p_tenant_id), uuidArg(a.p_user_id)];
  if (tenant === null || user === null) throw dbError(C.invalidParameterValue, 'invalid_wallet');
  const results = await runBatch(
    ctx,
    [
      ...begin,
      ensureWallet(tenant, user),
      refreshCache(tenant, user),
      { sql: 'SELECT "balance" FROM "tcg_wallets" WHERE "tenant_id" = ? AND "user_id" = ?', params: [tenant, user] },
      CLEAR_VARS,
    ],
    { table: 'tcg_wallets', operation: 'update' }
  );
  return Number(results[results.length - 2]?.[0]?.balance);
};

/** Le solde relu avant le débit, gardé pour la réponse (v_balance de plpgsql). */
const saveBalance = (tenant: string | null, user: string | null) => setVar('bal', SUM, [tenant, user]);

/** Le cache, posé à « solde lu − prix » (INSERT … ON CONFLICT DO UPDATE de Postgres). */
const setCache = (tenant: string | null, user: string | null, debit: number | null): Statement => ({
  sql:
    `INSERT INTO "tcg_wallets" ("tenant_id", "user_id", "balance", "created_at", "updated_at") VALUES (?, ?, ${varOf('bal')} - ?, ${NOW}, ${NOW}) ` +
    'ON CONFLICT ("tenant_id", "user_id") DO UPDATE SET "balance" = excluded."balance", "updated_at" = excluded."updated_at"',
  params: [tenant, user, debit],
});

export const tcgBuyCosmetic: D1Function = async (ctx, raw) => {
  const a = readArgs('tcg_buy_cosmetic', raw, { p_tenant_id: REQUIRED, p_user_id: REQUIRED, p_key: REQUIRED, p_price: REQUIRED });
  const [tenant, user, key, price] = [uuidArg(a.p_tenant_id), uuidArg(a.p_user_id), textArg(a.p_key), intArg(a.p_price)];
  if (price !== null && price < 0) throw dbError(C.raiseException, 'cosmetic_invalid_price');
  const results = await runBatch(
    ctx,
    [
      ...begin,
      ensureWallet(tenant, user),
      {
        sql: `INSERT INTO "tcg_showcases" ("tenant_id", "user_id", "created_at", "updated_at") VALUES (?, ?, ${NOW}, ${NOW}) ON CONFLICT ("tenant_id", "user_id") DO NOTHING`,
        params: [tenant, user],
      },
      guard(
        C.raiseException,
        'cosmetic_already_owned',
        `EXISTS (SELECT 1 FROM "tcg_showcases" AS s, json_each(coalesce(s."unlocked_cosmetics", '[]')) AS j WHERE s."tenant_id" = ? AND s."user_id" = ? AND j."value" = ?)`,
        [tenant, user, key]
      ),
      guard(C.raiseException, 'cosmetic_insufficient_funds', `${SUM} < ?`, [tenant, user, price]),
      saveBalance(tenant, user),
      {
        sql: `INSERT INTO "tcg_wallet_entries" ("tenant_id", "user_id", "amount", "source_kind", "source_ref", "created_at") VALUES (?, ?, -?, 'showcase_cosmetic', 'cosmetic:' || ?, ${NOW})`,
        params: [tenant, user, price, key],
      },
      {
        sql: `UPDATE "tcg_showcases" SET "unlocked_cosmetics" = json_insert(coalesce("unlocked_cosmetics", '[]'), '$[#]', ?), "updated_at" = ${NOW} WHERE "tenant_id" = ? AND "user_id" = ?`,
        params: [key, tenant, user],
      },
      setCache(tenant, user, price),
      { sql: `SELECT ${varOf('bal')} - ? AS "b"`, params: [price] },
      CLEAR_VARS,
    ],
    { table: 'tcg_wallet_entries', operation: 'insert' }
  );
  return { ok: true, balance: Number(results[results.length - 2]?.[0]?.b) };
};

/** Une carte de `p_cards` : `{ packId, position }`, convertie comme `(e->>'packId')::uuid`, `::smallint`. */
function cardKey(e: unknown): [string | null, number | null] {
  const o = e !== null && typeof e === 'object' && !Array.isArray(e) ? (e as Record<string, unknown>) : {};
  const pack = o.packId === null || o.packId === undefined ? null : toUuid(typeof o.packId === 'string' ? o.packId : JSON.stringify(o.packId));
  const position = o.position === null || o.position === undefined ? null : toInteger(typeof o.position === 'string' ? o.position : String(o.position), 'smallint');
  return [pack, position];
}

/** `->>` de Postgres sur un champ JSON : le texte, ou le JSON d'une valeur qui n'est pas une chaîne. */
const jsonText = (v: unknown): string | null => (v === null || v === undefined ? null : typeof v === 'string' ? v : JSON.stringify(v));

export const tcgForgeCard: D1Function = async (ctx, raw) => {
  const a = readArgs('tcg_forge_card', raw, {
    p_tenant_id: REQUIRED,
    p_user_id: REQUIRED,
    p_cards: REQUIRED,
    p_fee: REQUIRED,
    p_rarity: REQUIRED,
    p_subject_kind: REQUIRED,
    p_card_user_id: null,
    p_card_team_id: null,
    p_card_map_slug: null,
    p_card_mascot_slug: null,
    p_card_fanart_id: null,
  });
  const [tenant, user, fee] = [uuidArg(a.p_tenant_id), uuidArg(a.p_user_id), intArg(a.p_fee)];
  const cards = a.p_cards;
  if (cards !== null && !Array.isArray(cards)) {
    throw dbError(C.invalidParameterValue, typeof cards === 'object' ? 'cannot get array length of a non-array' : 'cannot get array length of a scalar');
  }
  const expected = cards === null ? null : cards.length;
  if (expected !== null && expected < 1) return { ok: false, reason: 'not_enough' };
  if (fee !== null && fee < 0) return { ok: false, reason: 'invalid_fee' };
  const wanted = JSON.stringify((cards ?? []).map(cardKey));
  // 'forge:' || (p_cards->0->>'packId') || ':' || (p_cards->0->>'position') : NULL si l'un manque.
  const first = Array.isArray(cards) && cards[0] && typeof cards[0] === 'object' ? (cards[0] as Record<string, unknown>) : {};
  const [refPack, refPosition] = [jsonText(first.packId), jsonText(first.position)];
  const ref = refPack !== null && refPosition !== null ? `forge:${refPack}:${refPosition}` : null;
  const packId = crypto.randomUUID();
  const subjectKey = (alias: string) =>
    `coalesce(${alias}."card_user_id", ${alias}."card_team_id", ${alias}."card_map_slug", ${alias}."card_mascot_slug", ${alias}."card_fanart_id", ${alias}."card_hero_slug")`;
  const isWanted = (alias: string) => `(${alias}."pack_id", ${alias}."position") IN (SELECT json_extract(w."value", '$[0]'), json_extract(w."value", '$[1]') FROM json_each(?) AS w)`;
  const ownedOpen = 'SELECT "id" FROM "tcg_packs" WHERE "tenant_id" = ? AND "user_id" = ? AND "opened_at" IS NOT NULL';
  const results = await runBatch(
    ctx,
    [
      ...begin,
      ensureWallet(tenant, user),
      // 1) Réservation atomique : seules les cartes à elle, de paquets ouverts, pas déjà recyclées.
      //    Dans un envoi D1, les lignes que l'UPDATE va marquer sont exactement celles comptées
      //    juste avant (le `GET DIAGNOSTICS` de plpgsql ; changes() n'y survit pas).
      setVar('marked', `SELECT count(*) FROM "tcg_pack_cards" AS c WHERE c."recycled_at" IS NULL AND ${isWanted('c')} AND c."pack_id" IN (${ownedOpen})`, [
        wanted,
        tenant,
        user,
      ]),
      {
        sql: `UPDATE "tcg_pack_cards" AS c SET "recycled_at" = ${NOW} WHERE c."recycled_at" IS NULL AND ${isWanted('c')} AND c."pack_id" IN (${ownedOpen})`,
        params: [wanted, tenant, user],
      },
      // `_d1_vars` range du texte : '1' <> 1 pour SQLite, d'où la conversion.
      guard(C.raiseException, 'forge_cards_unavailable', `CAST(${varOf('marked')} AS INTEGER) <> ?`, [expected]),
      // 2) Aucun sujet consommé ne reste sans exemplaire vivant.
      guard(
        C.raiseException,
        'forge_would_empty_subject',
        `(SELECT count(*) FROM (SELECT DISTINCT ${subjectKey('c')} AS "k" FROM "tcg_pack_cards" AS c WHERE ${isWanted('c')}) AS consumed ` +
          `WHERE NOT EXISTS (SELECT 1 FROM "tcg_pack_cards" AS c2 JOIN "tcg_packs" AS p2 ON p2."id" = c2."pack_id" WHERE p2."tenant_id" = ? AND p2."user_id" = ? AND p2."opened_at" IS NOT NULL AND c2."recycled_at" IS NULL AND ${subjectKey('c2')} = consumed."k")) > 0`,
        [wanted, tenant, user]
      ),
      // 3) Le solde, lu dans le registre.
      guard(C.raiseException, 'forge_insufficient_funds', `${SUM} < ?`, [tenant, user, fee]),
      saveBalance(tenant, user),
      // 4) Le débit, 5) le paquet d'accueil déjà ouvert et sa carte, 6) le cache.
      {
        sql: `INSERT INTO "tcg_wallet_entries" ("tenant_id", "user_id", "amount", "source_kind", "source_ref", "created_at") VALUES (?, ?, -?, 'card_forged', ?, ${NOW})`,
        params: [tenant, user, fee, ref],
      },
      {
        sql: `INSERT INTO "tcg_packs" ("id", "tenant_id", "user_id", "source_kind", "source_match_id", "granted_at", "opened_at") VALUES (?, ?, ?, 'forge', NULL, ${NOW}, ${NOW})`,
        params: [packId, tenant, user],
      },
      {
        sql: 'INSERT INTO "tcg_pack_cards" ("pack_id", "position", "subject_kind", "card_user_id", "card_team_id", "card_map_slug", "card_mascot_slug", "card_fanart_id", "rarity", "is_foil") VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, 0)',
        params: [
          packId,
          textArg(a.p_subject_kind),
          uuidArg(a.p_card_user_id),
          uuidArg(a.p_card_team_id),
          textArg(a.p_card_map_slug),
          textArg(a.p_card_mascot_slug),
          uuidArg(a.p_card_fanart_id),
          textArg(a.p_rarity),
        ],
      },
      setCache(tenant, user, fee),
      { sql: `SELECT ${varOf('bal')} - ? AS "b"`, params: [fee] },
      CLEAR_VARS,
    ],
    { table: 'tcg_pack_cards', operation: 'update' }
  );
  return { ok: true, packId, rarity: textArg(a.p_rarity), balance: Number(results[results.length - 2]?.[0]?.b) };
};
