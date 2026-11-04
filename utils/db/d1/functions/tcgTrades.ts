// utils/db/d1/functions/tcgTrades.ts — les échanges de cartes du TCG (lot 4f-1 de
// conference-website docs/D1-MIGRATION.md), réécrits depuis les fonctions plpgsql de Postgres
// (database/schema-prod.sql) : tcg_trade_eligibility, tcg_propose_trade, tcg_accept_trade.
//
// Trop riches pour un seul envoi (boucles carte par carte, une douzaine de réponses) : chacune
// lit tout D'UN COUP (une photo cohérente), décide en TypeScript dans l'ordre exact de la
// fonction plpgsql, puis écrit en un envoi qui revérifie d'abord que rien n'a bougé
// (`optimistic`, context.ts) :
//   * le verrou consultatif des deux joueuses (tcg_trade_lock_key) → leur compteur `_d1_locks`,
//     pris (incrémenté) par chaque écriture et inchangé depuis la photo ;
//   * le FOR UPDATE des exemplaires → chaque exemplaire choisi toujours valable ;
//   * le FOR UPDATE de la proposition → toujours en attente.
// Si quelque chose a bougé, la fonction recommence depuis la photo ; Postgres faisait attendre.
// `v_now` (l'heure de la transaction) : une seule valeur, lue dans la photo et réutilisée.

import { SQL_NOW } from '../now';
import { toUuid, type SqlValue } from '../values';
import {
  bumpLock,
  CLEAR_VARS,
  conflictGuard,
  intArg,
  lockUnchanged,
  optimistic,
  readArgs,
  readLock,
  REQUIRED,
  runBatch,
  setVar,
  uuidArg,
  varOf,
  type D1Function,
  type D1FunctionContext,
  type Statement,
} from './context';

type Row = Record<string, unknown>;

const NOW = varOf('now');
const PHOTO: Statement[] = [CLEAR_VARS, setVar('now', SQL_NOW), { sql: `SELECT ${NOW} AS "now"`, params: [] }];

/** tcg_rarity_rank : du moins au plus précieux. */
const rank = (r: unknown) => ({ common: 0, rare: 1, epic: 2, legendary: 3 })[String(r)] ?? 4;
/** tcg_pack_source_tradeable. */
const TRADEABLE = `('victory', 'placement', 'purchase', 'trade')`;
/** tcg_trade_lock_key : le sujet du verrou consultatif d'une joueuse. */
const lockKey = (tenant: string | null, user: string | null) => `tcg_trade:${tenant}:${user}`;

/** Un horodatage stocké, décalé de jours ou d'heures sans toucher aux microsecondes. */
function shift(ts: string, ms: number): string {
  const d = new Date(`${ts.slice(0, 19)}Z`);
  return `${new Date(d.getTime() + ms).toISOString().slice(0, 19)}${ts.slice(19)}`;
}
const addDays = (ts: string | null, days: number | null) => (ts === null || days === null ? null : shift(ts, days * 86_400_000));
const addHours = (ts: string | null, hours: number | null) => (ts === null || hours === null ? null : shift(ts, hours * 3_600_000));

// ---------------------------------------------------------------------------
// tcg_trade_eligibility
// ---------------------------------------------------------------------------

/** La date de création du compte et du premier paquet hors échange. */
const eligibilityData = (tenant: string | null, user: string | null): Statement => ({
  sql: `SELECT (SELECT "created_at" FROM "auth_user" WHERE "id" = ?1) AS "account", (SELECT min("granted_at") FROM "tcg_packs" WHERE "tenant_id" = ?2 AND "user_id" = ?1 AND "source_kind" <> 'trade') AS "first_pack"`,
  params: [user, tenant],
});

function eligibility(data: Row | undefined, minAccount: number | null, minCollection: number | null, now: string) {
  const account = (data?.account as string | null) ?? null;
  const firstPack = (data?.first_pack as string | null) ?? null;
  if (account === null) return { eligible: false, eligibleAt: null, reason: 'no_account' };
  if (firstPack === null) return { eligible: false, eligibleAt: null, reason: 'no_collection' };
  // GREATEST ignore les NULL (un délai NULL).
  const candidates = [addDays(account, minAccount), addDays(firstPack, minCollection)].filter((x): x is string => x !== null);
  const at = candidates.length ? candidates.reduce((m, x) => (x > m ? x : m)) : null;
  const eligible = at === null ? null : at <= now;
  return { eligible, eligibleAt: at, reason: eligible === true ? null : 'too_recent' };
}

const isEligible = (e: ReturnType<typeof eligibility>) => e.eligible === true;

export const tcgTradeEligibility: D1Function = async (ctx, raw) => {
  const a = readArgs('tcg_trade_eligibility', raw, { p_tenant_id: REQUIRED, p_user_id: REQUIRED, p_min_account_age_days: REQUIRED, p_min_collection_age_days: REQUIRED });
  const [tenant, user] = [uuidArg(a.p_tenant_id), uuidArg(a.p_user_id)];
  const results = await runBatch(ctx, [...PHOTO, eligibilityData(tenant, user), CLEAR_VARS], { table: 'tcg_packs', operation: 'select' });
  return eligibility(results[3]?.[0], intArg(a.p_min_account_age_days), intArg(a.p_min_collection_age_days), String(results[2]?.[0]?.now));
};

// ---------------------------------------------------------------------------
// Les sujets des cartes
// ---------------------------------------------------------------------------

const SUBJECT_COLUMNS = ['card_user_id', 'card_team_id', 'card_map_slug', 'card_fanart_id', 'card_mascot_slug', 'card_hero_slug'] as const;
type Subject = { kind: string; raw: string | null } & Record<(typeof SUBJECT_COLUMNS)[number], string | null>;

/** `->>` de Postgres. */
const field = (v: unknown, key: string): string | null => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const x = (v as Row)[key];
  return x === null || x === undefined ? null : typeof x === 'string' ? x : JSON.stringify(x);
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,64}$/;

/** Un élément `{ kind, id }` d'une proposition, lu comme la boucle plpgsql ; null = invalid_items. */
function parseItem(v: unknown): Subject | null {
  const kind = field(v, 'kind');
  const raw = field(v, 'id');
  const s: Subject = { kind: kind ?? '', raw, card_user_id: null, card_team_id: null, card_map_slug: null, card_fanart_id: null, card_mascot_slug: null, card_hero_slug: null };
  if ((kind === 'player' || kind === 'team' || kind === 'fanart') && raw !== null && UUID.test(raw)) {
    s[kind === 'player' ? 'card_user_id' : kind === 'team' ? 'card_team_id' : 'card_fanart_id'] = toUuid(raw);
  } else if ((kind === 'map' || kind === 'mascot' || kind === 'hero') && raw !== null && SLUG.test(raw)) {
    s[kind === 'map' ? 'card_map_slug' : kind === 'mascot' ? 'card_mascot_slug' : 'card_hero_slug'] = raw;
  } else {
    return null;
  }
  return s;
}

/** La proposition filtre seulement sur la colonne du sujet (`v_user IS NULL OR …`). */
const matchesLoose = (card: Row, s: Subject) =>
  card.subject_kind === s.kind && SUBJECT_COLUMNS.every((c) => s[c] === null || card[c] === s[c]);
/** L'acceptation compare chaque colonne (IS NOT DISTINCT FROM). */
const matchesExact = (card: Row, s: Row) => card.subject_kind === s.subject_kind && SUBJECT_COLUMNS.every((c) => (card[c] ?? null) === (s[c] ?? null));

/** Ordre « le moins précieux d'abord » : rareté, brillance, paquet, position. */
const leastPrecious = (x: Row, y: Row) =>
  rank(x.rarity) - rank(y.rarity) || Number(x.is_foil) - Number(y.is_foil) || String(x.pack_id).localeCompare(String(y.pack_id)) || Number(x.position) - Number(y.position);

/** L'égalité de jsonb (ordre des clés indifférent). */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v as Row)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Row)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

const CARD_COLUMNS = `pc."pack_id", pc."position", pc."rarity", pc."is_foil", pc."subject_kind", ${SUBJECT_COLUMNS.map((c) => `pc."${c}"`).join(', ')}`;

/** Un exemplaire toujours valable pour un échange (le FOR UPDATE de Postgres, rejoué à l'écriture). */
const stillTradeable = (owner: string | null, tenant: string | null, card: Row, extra = ''): Statement => ({
  sql: `NOT EXISTS (SELECT 1 FROM "tcg_pack_cards" AS pc JOIN "tcg_packs" AS p ON p."id" = pc."pack_id" WHERE pc."pack_id" = ? AND pc."position" = ? AND p."tenant_id" = ? AND p."user_id" = ? AND p."opened_at" IS NOT NULL AND p."source_kind" IN ${TRADEABLE} AND pc."recycled_at" IS NULL AND pc."subject_kind" = ? ${SUBJECT_COLUMNS.map((c) => `AND pc."${c}" IS ?`).join(' ')}${extra})`,
  params: [card.pack_id as string, card.position as number, tenant, owner, card.subject_kind as string, ...SUBJECT_COLUMNS.map((c) => (card[c] as string | null) ?? null)],
});

// ---------------------------------------------------------------------------
// tcg_propose_trade
// ---------------------------------------------------------------------------

export const tcgProposeTrade: D1Function = async (ctx, raw) => {
  const a = readArgs('tcg_propose_trade', raw, {
    p_tenant_id: REQUIRED,
    p_proposer_id: REQUIRED,
    p_recipient_id: REQUIRED,
    p_offered: REQUIRED,
    p_requested: REQUIRED,
    p_ttl_hours: REQUIRED,
    p_max_cards: REQUIRED,
    p_max_pending_sent: REQUIRED,
    p_max_pending_received: REQUIRED,
    p_decline_cooldown_hours: REQUIRED,
    p_min_account_age_days: REQUIRED,
    p_min_collection_age_days: REQUIRED,
  });
  const [tenant, proposer, recipient] = [uuidArg(a.p_tenant_id), uuidArg(a.p_proposer_id), uuidArg(a.p_recipient_id)];
  const [ttl, maxCards, maxSent, maxReceived, cooldown, minAccount, minCollection] = [
    a.p_ttl_hours,
    a.p_max_cards,
    a.p_max_pending_sent,
    a.p_max_pending_received,
    a.p_decline_cooldown_hours,
    a.p_min_account_age_days,
    a.p_min_collection_age_days,
  ].map(intArg) as Array<number | null>;
  const offered = a.p_offered;
  const requested = a.p_requested;

  // 0) Forme : carte contre carte, à parité, sujets distincts, aucun des deux côtés à la fois.
  if (!Array.isArray(offered) || !Array.isArray(requested)) return { status: 'invalid_items' };
  const limit = maxCards === null ? 10 : Math.min(maxCards, 10);
  if (offered.length < 1 || offered.length > limit || offered.length !== requested.length) return { status: 'invalid_items' };
  const [o, r] = [offered.map(canonical), requested.map(canonical)];
  if (new Set(o).size !== o.length || new Set(r).size !== r.length || o.some((x) => r.includes(x))) return { status: 'invalid_items' };
  if (proposer !== null && proposer === recipient) return { status: 'self_trade' };

  const [kP, kR] = [lockKey(tenant, proposer), lockKey(tenant, recipient)];
  return optimistic(async () => {
    const pending = (who: 'proposer_id' | 'recipient_id', id: string | null): Statement => ({
      sql: `SELECT count(*) AS "n" FROM "tcg_trades" WHERE "tenant_id" = ? AND "${who}" = ? AND "status" = 'pending' AND "expires_at" > ${NOW}`,
      params: [tenant, id],
    });
    const photo = await runBatch(
      ctx,
      [
        ...PHOTO,
        readLock(kP),
        readLock(kR),
        { sql: 'SELECT "user_id", "accepts_proposals" FROM "tcg_trade_settings" WHERE "tenant_id" = ? AND "user_id" IN (?, ?)', params: [tenant, proposer, recipient] },
        { sql: 'SELECT EXISTS (SELECT 1 FROM "tcg_trade_blocks" WHERE "tenant_id" = ? AND "user_id" = ? AND "blocked_user_id" = ?) AS "b"', params: [tenant, recipient, proposer] },
        eligibilityData(tenant, proposer),
        eligibilityData(tenant, recipient),
        pending('proposer_id', proposer),
        pending('recipient_id', recipient),
        {
          sql: `SELECT EXISTS (SELECT 1 FROM "tcg_trades" WHERE "tenant_id" = ? AND "proposer_id" = ? AND "recipient_id" = ? AND "status" = 'pending') AS "b"`,
          params: [tenant, proposer, recipient],
        },
        {
          sql: `SELECT EXISTS (SELECT 1 FROM "tcg_trades" WHERE "tenant_id" = ? AND "proposer_id" = ? AND "recipient_id" = ? AND "status" = 'declined' AND "resolved_at" > (strftime('%Y-%m-%dT%H:%M:%f', ${NOW}, '-' || ? || ' hours') || '000+00:00')) AS "b"`,
          params: [tenant, proposer, recipient, cooldown],
        },
        // Les exemplaires échangeables de la proposante, et s'ils sont déjà promis ailleurs.
        {
          sql:
            `SELECT ${CARD_COLUMNS}, EXISTS (SELECT 1 FROM "tcg_trade_items" AS i JOIN "tcg_trades" AS t ON t."id" = i."trade_id" WHERE i."side" = 'offered' AND i."from_pack_id" = pc."pack_id" AND i."from_position" = pc."position" AND t."status" = 'pending' AND t."expires_at" > ${NOW}) AS "engaged" ` +
            `FROM "tcg_pack_cards" AS pc JOIN "tcg_packs" AS p ON p."id" = pc."pack_id" WHERE p."tenant_id" = ? AND p."user_id" = ? AND p."opened_at" IS NOT NULL AND p."source_kind" IN ${TRADEABLE} AND pc."recycled_at" IS NULL`,
          params: [tenant, proposer],
        },
        // Toute la collection ouverte de la destinataire (ce qu'elle montre en double).
        {
          sql: `SELECT ${CARD_COLUMNS}, p."source_kind" IN ${TRADEABLE} AS "tradeable" FROM "tcg_pack_cards" AS pc JOIN "tcg_packs" AS p ON p."id" = pc."pack_id" WHERE p."tenant_id" = ? AND p."user_id" = ? AND p."opened_at" IS NOT NULL AND pc."recycled_at" IS NULL`,
          params: [tenant, recipient],
        },
        CLEAR_VARS,
      ],
      { table: 'tcg_trades', operation: 'select' }
    );
    const one = (i: number) => photo[i]?.[0] ?? {};
    const now = String(one(2).now);
    const [nP, nR] = [Number(one(3).n), Number(one(4).n)];
    const settings = photo[5] ?? [];
    const accepts = (id: string | null) => settings.some((s) => s.user_id === id && Number(s.accepts_proposals) === 1);

    // 2) Consentements, blocage (même réponse qu'une destinataire indisponible).
    if (!accepts(proposer)) return { status: 'trading_disabled' };
    if (!accepts(recipient)) return { status: 'recipient_unavailable' };
    if (Number(one(6).b) === 1) return { status: 'recipient_unavailable' };
    // 3) Ancienneté des deux comptes et collections.
    if (!isEligible(eligibility(photo[7]?.[0], minAccount, minCollection, now))) return { status: 'collection_too_recent' };
    if (!isEligible(eligibility(photo[8]?.[0], minAccount, minCollection, now))) return { status: 'recipient_unavailable' };
    // 4) Plafonds d'attente, paire déjà en cours, refus récent.
    if (maxSent !== null && Number(one(9).n) >= maxSent) return { status: 'too_many_pending' };
    if (maxReceived !== null && Number(one(10).n) >= maxReceived) return { status: 'recipient_inbox_full' };
    if (Number(one(11).b) === 1) return { status: 'already_pending' };
    if (Number(one(12).b) === 1) return { status: 'recently_declined' };

    // 5) Offertes : pour chaque sujet, l'exemplaire le moins précieux, libre.
    const mine = (photo[13] ?? []).filter((c) => Number(c.engaged) !== 1);
    const chosen: Array<{ s: Subject; card: Row }> = [];
    for (const item of offered) {
      const s = parseItem(item);
      if (!s) return { status: 'invalid_items' };
      const card = mine.filter((c) => matchesLoose(c, s)).sort(leastPrecious)[0];
      if (!card) return { status: 'offered_not_owned', kind: s.kind, id: s.raw };
      chosen.push({ s, card });
    }
    // 6) Demandées : au moins deux exemplaires chez elle, dont un échangeable.
    const theirs = photo[14] ?? [];
    const wanted: Array<{ s: Subject; rarity: unknown; foil: unknown }> = [];
    for (const item of requested) {
      const s = parseItem(item);
      if (!s) return { status: 'invalid_items' };
      const copies = theirs.filter((c) => matchesLoose(c, s));
      const tradeable = copies.filter((c) => Number(c.tradeable) === 1).sort((x, y) => rank(x.rarity) - rank(y.rarity) || Number(x.is_foil) - Number(y.is_foil));
      if (copies.length < 2 || tradeable.length < 1) return { status: 'requested_not_available', kind: s.kind, id: s.raw };
      wanted.push({ s, rarity: tradeable[0]?.rarity, foil: tradeable[0]?.is_foil });
    }

    // 7) Écriture, si rien n'a bougé depuis la photo.
    const expires = addHours(now, ttl);
    const tradeId = crypto.randomUUID();
    const itemColumns = `"trade_id", "side", "ordinal", "subject_kind", ${SUBJECT_COLUMNS.map((c) => `"${c}"`).join(', ')}, "rarity", "is_foil"`;
    const subjectValues = (s: Subject) => SUBJECT_COLUMNS.map((c) => s[c]);
    await runBatch(
      ctx,
      [
        lockUnchanged(kP, nP),
        lockUnchanged(kR, nR),
        ...chosen.map(({ card }) => {
          const g = stillTradeable(
            proposer,
            tenant,
            card,
            ` AND NOT EXISTS (SELECT 1 FROM "tcg_trade_items" AS i JOIN "tcg_trades" AS t ON t."id" = i."trade_id" WHERE i."side" = 'offered' AND i."from_pack_id" = pc."pack_id" AND i."from_position" = pc."position" AND t."status" = 'pending' AND t."expires_at" > ?)`
          );
          return conflictGuard(g.sql, [...g.params, now]);
        }),
        {
          sql: 'INSERT INTO "tcg_trades" ("id", "tenant_id", "proposer_id", "recipient_id", "status", "created_at", "expires_at") VALUES (?, ?, ?, ?, \'pending\', ?, ?)',
          params: [tradeId, tenant, proposer, recipient, now, expires],
        },
        ...chosen.map(({ s, card }, i) => ({
          sql: `INSERT INTO "tcg_trade_items" (${itemColumns}, "from_pack_id", "from_position") VALUES (?, 'offered', ?, ?, ${SUBJECT_COLUMNS.map(() => '?').join(', ')}, ?, ?, ?, ?)`,
          params: [tradeId, i, s.kind, ...subjectValues(s), card.rarity as string, Number(card.is_foil), card.pack_id as string, card.position as number] as SqlValue[],
        })),
        ...wanted.map(({ s, rarity, foil }, i) => ({
          sql: `INSERT INTO "tcg_trade_items" (${itemColumns}) VALUES (?, 'requested', ?, ?, ${SUBJECT_COLUMNS.map(() => '?').join(', ')}, ?, ?)`,
          params: [tradeId, i, s.kind, ...subjectValues(s), (rarity as string) ?? null, foil === null || foil === undefined ? null : Number(foil)] as SqlValue[],
        })),
        bumpLock(kP),
        bumpLock(kR),
      ],
      { table: 'tcg_trades', operation: 'insert' }
    );
    return { status: 'proposed', tradeId, expiresAt: expires };
  });
};

// ---------------------------------------------------------------------------
// tcg_accept_trade
// ---------------------------------------------------------------------------

export const tcgAcceptTrade: D1Function = async (ctx, raw) => {
  const a = readArgs('tcg_accept_trade', raw, {
    p_tenant_id: REQUIRED,
    p_trade_id: REQUIRED,
    p_user_id: REQUIRED,
    p_max_accepted_per_day: REQUIRED,
    p_min_account_age_days: REQUIRED,
    p_min_collection_age_days: REQUIRED,
  });
  const [tenant, tradeId, user] = [uuidArg(a.p_tenant_id), uuidArg(a.p_trade_id), uuidArg(a.p_user_id)];
  const [maxPerDay, minAccount, minCollection] = [a.p_max_accepted_per_day, a.p_min_account_age_days, a.p_min_collection_age_days].map(intArg) as Array<number | null>;
  return optimistic(() => acceptOnce(ctx, tenant, tradeId, user, maxPerDay, minAccount, minCollection));
};

async function acceptOnce(
  ctx: D1FunctionContext,
  tenant: string | null,
  tradeId: string | null,
  user: string | null,
  maxPerDay: number | null,
  minAccount: number | null,
  minCollection: number | null
) {
  const T = (column: 'proposer_id' | 'recipient_id') => `(SELECT "${column}" FROM "tcg_trades" WHERE "id" = ?1 AND "tenant_id" = ?2)`;
  const lockOf = (column: 'proposer_id' | 'recipient_id') => ({
    sql: `SELECT coalesce((SELECT "n" FROM "_d1_locks" WHERE "k" = 'tcg_trade:' || ?2 || ':' || ${T(column)}), 0) AS "n"`,
    params: [tradeId, tenant],
  });
  const accepted24h = (column: 'proposer_id' | 'recipient_id') => ({
    sql: `SELECT count(*) AS "n" FROM "tcg_trades" WHERE "tenant_id" = ?2 AND "status" = 'accepted' AND "resolved_at" > (strftime('%Y-%m-%dT%H:%M:%f', ${NOW}, '-24 hours') || '000+00:00') AND ("proposer_id" = ${T(column)} OR "recipient_id" = ${T(column)})`,
    params: [tradeId, tenant],
  });
  const eligibilityOf = (column: 'proposer_id' | 'recipient_id') => ({
    sql: `SELECT (SELECT "created_at" FROM "auth_user" WHERE "id" = ${T(column)}) AS "account", (SELECT min("granted_at") FROM "tcg_packs" WHERE "tenant_id" = ?2 AND "user_id" = ${T(column)} AND "source_kind" <> 'trade') AS "first_pack"`,
    params: [tradeId, tenant],
  });
  // Les offertes toujours au paquet ouvert de la proposante, échangeables, non recyclées, même sujet.
  // Paramètres simples, dans l'ordre : elle sert aussi de garde, où `?` numéro 1 est le message.
  const offeredValid = `SELECT count(*) AS "n" FROM "tcg_trade_items" AS i JOIN "tcg_pack_cards" AS pc ON pc."pack_id" = i."from_pack_id" AND pc."position" = i."from_position" JOIN "tcg_packs" AS p ON p."id" = pc."pack_id" WHERE i."trade_id" = ? AND i."side" = 'offered' AND p."tenant_id" = ? AND p."user_id" = (SELECT "proposer_id" FROM "tcg_trades" WHERE "id" = ? AND "tenant_id" = ?) AND p."opened_at" IS NOT NULL AND p."source_kind" IN ${TRADEABLE} AND pc."recycled_at" IS NULL AND pc."subject_kind" = i."subject_kind" ${SUBJECT_COLUMNS.map((c) => `AND pc."${c}" IS i."${c}"`).join(' ')}`;
  const offeredValidParams = [tradeId, tenant, tradeId, tenant];
  const photo = await runBatch(
    ctx,
    [
      ...PHOTO,
      { sql: 'SELECT * FROM "tcg_trades" WHERE "id" = ? AND "tenant_id" = ?', params: [tradeId, tenant] },
      lockOf('proposer_id'),
      lockOf('recipient_id'),
      accepted24h('recipient_id'),
      accepted24h('proposer_id'),
      eligibilityOf('recipient_id'),
      eligibilityOf('proposer_id'),
      { sql: `SELECT count(*) AS "n" FROM "tcg_trade_items" WHERE "trade_id" = ?1 AND "side" = 'offered'`, params: [tradeId] },
      { sql: offeredValid, params: offeredValidParams },
      { sql: `SELECT * FROM "tcg_trade_items" WHERE "trade_id" = ? AND "side" = 'requested' ORDER BY "ordinal"`, params: [tradeId] },
      { sql: `SELECT "ordinal", "from_pack_id", "from_position" FROM "tcg_trade_items" WHERE "trade_id" = ? AND "side" = 'offered' ORDER BY "ordinal"`, params: [tradeId] },
      // Les exemplaires échangeables de la destinataire, et s'ils sont promis dans ses propres propositions.
      {
        sql:
          `SELECT ${CARD_COLUMNS}, EXISTS (SELECT 1 FROM "tcg_trade_items" AS oi JOIN "tcg_trades" AS ot ON ot."id" = oi."trade_id" WHERE oi."side" = 'offered' AND oi."from_pack_id" = pc."pack_id" AND oi."from_position" = pc."position" AND ot."status" = 'pending') AS "engaged" ` +
          `FROM "tcg_pack_cards" AS pc JOIN "tcg_packs" AS p ON p."id" = pc."pack_id" WHERE p."tenant_id" = ?2 AND p."user_id" = ${T('recipient_id')} AND p."opened_at" IS NOT NULL AND p."source_kind" IN ${TRADEABLE} AND pc."recycled_at" IS NULL`,
        params: [tradeId, tenant],
      },
      CLEAR_VARS,
    ],
    { table: 'tcg_trades', operation: 'select' }
  );
  const one = (i: number) => photo[i]?.[0] ?? {};
  const now = String(one(2).now);
  const trade = photo[3]?.[0];
  // a) La paire : rien à dire d'une proposition qui n'est pas adressée à l'appelante.
  if (!trade || (user !== null && trade.recipient_id !== user)) return { status: 'not_found' };
  const ids = { tradeId: trade.id, proposerId: trade.proposer_id, recipientId: trade.recipient_id };
  const [kP, kR] = [lockKey(tenant, trade.proposer_id as string), lockKey(tenant, trade.recipient_id as string)];
  const [nP, nR] = [Number(one(4).n), Number(one(5).n)];
  /** L'écriture, si rien n'a bougé : mêmes verrous, proposition toujours en attente. */
  const commit = (statements: Statement[]) =>
    runBatch(
      ctx,
      [
        lockUnchanged(kP, nP),
        lockUnchanged(kR, nR),
        conflictGuard(`NOT EXISTS (SELECT 1 FROM "tcg_trades" WHERE "id" = ? AND "status" = 'pending')`, [trade.id as string]),
        ...statements,
        bumpLock(kP),
        bumpLock(kR),
      ],
      { table: 'tcg_trades', operation: 'update' }
    );

  // c) L'état de la proposition.
  if (trade.status === 'accepted') return { status: 'already_accepted', ...ids };
  if (trade.status !== 'pending') return { status: 'not_pending', current: trade.status };
  if (String(trade.expires_at) <= now) {
    await commit([{ sql: `UPDATE "tcg_trades" SET "status" = 'expired', "resolved_at" = ? WHERE "id" = ?`, params: [now, trade.id as string] }]);
    return { status: 'expired', ...ids };
  }
  // d) Plafond d'échanges acceptés par 24 h, pour chacune.
  if (maxPerDay !== null && Number(one(6).n) >= maxPerDay) return { status: 'daily_limit' };
  if (maxPerDay !== null && Number(one(7).n) >= maxPerDay) return { status: 'partner_daily_limit' };
  if (!isEligible(eligibility(photo[8]?.[0], minAccount, minCollection, now)) || !isEligible(eligibility(photo[9]?.[0], minAccount, minCollection, now))) {
    return { status: 'not_eligible' };
  }
  // e) Les offertes : toujours là ? Sinon la proposition devient caduque.
  const expected = Number(one(10).n);
  if (Number(one(11).n) < expected) {
    await commit([
      { sql: `UPDATE "tcg_trades" SET "status" = 'cancelled', "resolution_reason" = 'offered_unavailable', "resolved_at" = ? WHERE "id" = ?`, params: [now, trade.id as string] },
    ]);
    return { status: 'stale', ...ids };
  }
  // f) Les demandées : l'exemplaire le moins précieux, de préférence pas promis ailleurs.
  const candidates = photo[14] ?? [];
  const picks: Array<{ item: Row; card: Row }> = [];
  for (const item of photo[12] ?? []) {
    const card = candidates
      .filter((c) => matchesExact(c, item))
      .sort((x, y) => Number(x.engaged) - Number(y.engaged) || leastPrecious(x, y))[0];
    if (!card) return { status: 'requested_unavailable' };
    picks.push({ item, card });
  }

  // g) Écriture : deux paquets « trade » ouverts, les cartes changent de paquet, la proposition
  //    est acceptée, et les autres propositions qui promettaient une carte déplacée tombent.
  const [recipientPack, proposerPack] = [crypto.randomUUID(), crypto.randomUUID()];
  const newPack = (id: string, owner: unknown): Statement => ({
    sql: `INSERT INTO "tcg_packs" ("id", "tenant_id", "user_id", "source_kind", "source_match_id", "granted_at", "opened_at") VALUES (?, ?, ?, 'trade', NULL, ?, ?)`,
    params: [id, tenant, owner as string, now, now],
  });
  const move = (fromPack: unknown, fromPosition: unknown, toPack: string, toPosition: number): Statement => ({
    sql: 'UPDATE "tcg_pack_cards" SET "pack_id" = ?, "position" = ? WHERE "pack_id" = ? AND "position" = ?',
    params: [toPack, toPosition, fromPack as string, fromPosition as number],
  });
  const offeredItems = photo[13] ?? [];
  const results = await commit([
    conflictGuard(`(${offeredValid}) <> ?`, [...offeredValidParams, expected]),
    ...picks.map(({ card }) => {
      const g = stillTradeable(trade.recipient_id as string, tenant, card);
      return conflictGuard(g.sql, g.params);
    }),
    newPack(recipientPack, trade.recipient_id),
    newPack(proposerPack, trade.proposer_id),
    ...offeredItems.flatMap((it, i) => [
      move(it.from_pack_id, it.from_position, recipientPack, i),
      {
        sql: `UPDATE "tcg_trade_items" SET "to_pack_id" = ?, "to_position" = ? WHERE "trade_id" = ? AND "side" = 'offered' AND "ordinal" = ?`,
        params: [recipientPack, i, trade.id as string, it.ordinal as number],
      },
    ]),
    ...picks.flatMap(({ item, card }, i) => [
      move(card.pack_id, card.position, proposerPack, i),
      {
        sql: `UPDATE "tcg_trade_items" SET "from_pack_id" = ?, "from_position" = ?, "rarity" = ?, "is_foil" = ?, "to_pack_id" = ?, "to_position" = ? WHERE "trade_id" = ? AND "side" = 'requested' AND "ordinal" = ?`,
        params: [card.pack_id as string, card.position as number, card.rarity as string, Number(card.is_foil), proposerPack, i, trade.id as string, item.ordinal as number],
      },
    ]),
    {
      sql: `UPDATE "tcg_trades" SET "status" = 'accepted', "resolved_at" = ?, "proposer_pack_id" = ?, "recipient_pack_id" = ? WHERE "id" = ?`,
      params: [now, proposerPack, recipientPack, trade.id as string],
    },
    {
      sql:
        `UPDATE "tcg_trades" AS t SET "status" = 'cancelled', "resolution_reason" = 'card_unavailable', "resolved_at" = ? WHERE t."tenant_id" = ? AND t."status" = 'pending' AND t."id" <> ? ` +
        `AND EXISTS (SELECT 1 FROM "tcg_trade_items" AS i WHERE i."trade_id" = t."id" AND i."side" = 'offered' AND (i."from_pack_id", i."from_position") IN (SELECT m."from_pack_id", m."from_position" FROM "tcg_trade_items" AS m WHERE m."trade_id" = ? AND m."from_pack_id" IS NOT NULL)) ` +
        // SQLite refuse l'alias de table dans RETURNING.
        'RETURNING "id", "proposer_id", "recipient_id"',
      params: [now, tenant, trade.id as string, trade.id as string],
    },
  ]);
  // La dernière instruction avant les deux verrous : les propositions tombées.
  const cancelled = (results[results.length - 3] ?? []).map((c) => ({ tradeId: c.id, proposerId: c.proposer_id, recipientId: c.recipient_id }));
  return { status: 'accepted', ...ids, proposerPackId: proposerPack, recipientPackId: recipientPack, cancelled };
}
