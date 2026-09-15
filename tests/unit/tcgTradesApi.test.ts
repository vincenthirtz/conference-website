// tests/unit/tcgTradesApi.test.ts
//
// Échanges de cartes TCG — routes joueuse, expiration et cron.
// Cibles : pages/api/player/tcg/trades/*, pages/api/cron/tcg-trades-expire.ts,
// utils/tcg/trades.ts, utils/tcg/tradeRules.ts.
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. CARTE CONTRE CARTE, RIEN D'AUTRE. Aucun champ pour des pièces, un paquet
//      ou un message ; parité exigée ; jamais une ligne de porte-monnaie écrite.
//   2. L'ACCEPTATION EST LA FONCTION SQL. Le mock n'exécute pas de SQL : la
//      route est testée contre `setRpcResult` (ce qu'elle FAIT de chaque
//      verdict), et `tcgTradesMigration.test.ts` lit le SQL pour vérifier
//      verrous et revérification de possession.
//   3. UNE ANNONCE PAR TRANSITION, JAMAIS SUR UN REJEU : double clic, retry,
//      deux déclencheurs d'expiration.
//   4. OPT-IN ET CLOISONNEMENT : pas de ligne = pas de propositions ; un autre
//      tenant ne voit rien ; on ne voit que les DOUBLES ÉCHANGEABLES d'une
//      partenaire, jamais sa collection ; aucun email ne sort.
//   5. LES FACES SONT RELUES PAR LE LECTEUR DE CONSENTEMENT : une photo
//      révoquée ne ressort pas, même sur une carte d'une proposition.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  rpcCalls,
  resetSupabaseMock,
  setAuthUser,
  setRpcResult,
  store,
} from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  TRADE_MAX_ACCEPTED_PER_DAY,
  TRADE_MAX_CARDS_PER_SIDE,
  TRADE_MIN_ACCOUNT_AGE_DAYS,
  TRADE_MIN_COLLECTION_AGE_DAYS,
  TRADE_TTL_HOURS,
} from '../../utils/tcg/tradeRules';

import tradesHandler from '../../pages/api/player/tcg/trades/index';
import actionHandler from '../../pages/api/player/tcg/trades/[tradeId]';
import settingsHandler from '../../pages/api/player/tcg/trades/settings';
import partnersHandler from '../../pages/api/player/tcg/trades/partners';
import cardsHandler from '../../pages/api/player/tcg/trades/cards';
import cronHandler from '../../pages/api/cron/tcg-trades-expire';

const TENANT = DEFAULT_TENANT_ID;
const OTHER_TENANT = '5b8e2f14-7c3a-4d9e-8f1b-2a6c4e8d0f13';
const ALICE = '3f6c2a1e-8b4d-4c7e-9a2b-1d5e6f7a8b9c';
const BRUNE = '9d4b7e21-3a6c-4f8d-b2e5-7c1a9f3d6e40';
const CLARA = 'c2a7e5d1-6b3f-4a8e-9d2c-5f1b8e3a7d64';
const TRADE = '7a1e4c2b-9d3f-4b6a-8e5c-2f7d1a9b3c80';
const TRADE_2 = '8b2f5d3c-0e4a-4c7b-9f6d-3a8e2b0c4d91';
const PLAYER_X = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const PLAYER_Y = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const PLAYER_Z = 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f';
const PACK_VICTORY = 'd4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f80';
const PACK_WELCOME = 'e5f6a7b8-c9d0-4e1f-8a3b-4c5d6e7f8091';

let _token = 0;
function req(over: Record<string, unknown> = {}): any {
  _token += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_token}` },
    cookies: {},
    query: {},
    body: undefined,
    ...over,
  };
}

function res(): any {
  const r: any = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c: number) => ((r.statusCode = c), r);
  r.json = (b: unknown) => ((r.body = b), r);
  r.end = () => r;
  r.setHeader = (k: string, v: unknown) => {
    r.headers[k] = v;
  };
  return r;
}

const events = (name: string) =>
  ((store.bot_event_outbox ?? []) as Array<Record<string, any>>)
    .filter((row) => row.event_name === name || row.payload?.event === name)
    .map((row) => row.payload?.data as Record<string, unknown>);

const trades = () => (store.tcg_trades ?? []) as Array<Record<string, any>>;

const future = () => new Date(Date.now() + 3600_000).toISOString();
const past = () => new Date(Date.now() - 3600_000).toISOString();

function seedTrade(over: Record<string, unknown> = {}) {
  (store.tcg_trades ||= []).push({
    id: TRADE,
    tenant_id: TENANT,
    proposer_id: ALICE,
    recipient_id: BRUNE,
    status: 'pending',
    resolution_reason: null,
    created_at: '2026-09-15T10:00:00.000Z',
    expires_at: future(),
    resolved_at: null,
    ...over,
  });
}

function optIn(userId: string, tenantId = TENANT, on = true) {
  (store.tcg_trade_settings ||= []).push({
    tenant_id: tenantId,
    user_id: userId,
    accepts_proposals: on,
  });
}

const validBody = () => ({
  recipientId: BRUNE,
  offered: [{ kind: 'player', id: PLAYER_X }],
  requested: [{ kind: 'map', id: 'kings-row' }],
});

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: ALICE });
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

/* -------------------------------------------------------------------------- */
/* Proposer                                                                    */
/* -------------------------------------------------------------------------- */

describe('POST /api/player/tcg/trades — validation', () => {
  const cases: Array<[string, unknown]> = [
    ['corps vide', {}],
    ['aucune carte offerte (don unilatéral)', { ...validBody(), offered: [] }],
    [
      'aucune carte demandée (don unilatéral)',
      { ...validBody(), requested: [] },
    ],
    [
      'parité non respectée',
      {
        ...validBody(),
        offered: [
          { kind: 'player', id: PLAYER_X },
          { kind: 'player', id: PLAYER_Y },
        ],
      },
    ],
    ['des pièces glissées dans la proposition', { ...validBody(), coins: 50 }],
    [
      'un message libre (canal de harcèlement)',
      { ...validBody(), message: 'coucou' },
    ],
    ['un paquet fermé', { ...validBody(), packId: PACK_VICTORY }],
    [
      'une carte offerte deux fois',
      {
        recipientId: BRUNE,
        offered: [
          { kind: 'player', id: PLAYER_X },
          { kind: 'player', id: PLAYER_X },
        ],
        requested: [
          { kind: 'map', id: 'kings-row' },
          { kind: 'map', id: 'ilios' },
        ],
      },
    ],
    [
      'la même carte offerte et demandée',
      {
        recipientId: BRUNE,
        offered: [{ kind: 'player', id: PLAYER_X }],
        requested: [{ kind: 'player', id: PLAYER_X }],
      },
    ],
    [
      'plus que le plafond de cartes',
      {
        recipientId: BRUNE,
        offered: Array.from(
          { length: TRADE_MAX_CARDS_PER_SIDE + 1 },
          (_, i) => ({
            kind: 'map',
            id: `map-${i}`,
          })
        ),
        requested: Array.from(
          { length: TRADE_MAX_CARDS_PER_SIDE + 1 },
          (_, i) => ({ kind: 'map', id: `autre-${i}` })
        ),
      },
    ],
    [
      'un sujet mal formé',
      { ...validBody(), offered: [{ kind: 'player', id: 'pas-un-uuid' }] },
    ],
  ];

  it.each(cases)('refuse %s — 400, sans appeler la base', async (_l, body) => {
    const r = res();
    await tradesHandler(req({ method: 'POST', body }), r);
    expect(r.statusCode).toBe(400);
    expect(r.body.code).toBe('invalid_body');
    expect(rpcCalls.filter((c) => c.fn === 'tcg_propose_trade')).toHaveLength(
      0
    );
    expect(events('tcg.trade_proposed')).toHaveLength(0);
  });

  it('refuse l’échange avec soi-même avant toute écriture', async () => {
    const r = res();
    await tradesHandler(
      req({ method: 'POST', body: { ...validBody(), recipientId: ALICE } }),
      r
    );
    expect(r.statusCode).toBe(400);
    expect(r.body.code).toBe('self_trade');
    expect(rpcCalls.filter((c) => c.fn === 'tcg_propose_trade')).toHaveLength(
      0
    );
  });
});

describe('POST /api/player/tcg/trades — verdicts de la fonction SQL', () => {
  it('propose : 201, plafonds passés depuis tradeRules, UNE annonce à la destinataire', async () => {
    const expiresAt = '2026-09-18T10:00:00.000Z';
    setRpcResult('tcg_propose_trade', {
      data: { status: 'proposed', tradeId: TRADE, expiresAt },
    });
    store.user_discord_links = [
      {
        auth_user_id: BRUNE,
        discord_user_id: '123456789012345678',
        discord_username: 'brune',
      },
    ];
    store.player_ratings = [
      {
        tenant_id: TENANT,
        user_id: ALICE,
        display_name: null,
        battle_tag: 'Alice#1234',
      },
    ];

    const r = res();
    await tradesHandler(req({ method: 'POST', body: validBody() }), r);

    expect(r.statusCode).toBe(201);
    expect(r.body.trade).toEqual({ id: TRADE, expiresAt });

    const call = rpcCalls.find((c) => c.fn === 'tcg_propose_trade');
    expect(call?.params).toMatchObject({
      p_tenant_id: TENANT,
      p_proposer_id: ALICE,
      p_recipient_id: BRUNE,
      p_ttl_hours: TRADE_TTL_HOURS,
      p_max_cards: TRADE_MAX_CARDS_PER_SIDE,
      p_min_account_age_days: TRADE_MIN_ACCOUNT_AGE_DAYS,
      p_min_collection_age_days: TRADE_MIN_COLLECTION_AGE_DAYS,
    });

    const proposed = events('tcg.trade_proposed');
    expect(proposed).toHaveLength(1);
    // Contrat FIXE, champ par champ — le bot le consomme en parallèle.
    expect(proposed[0]).toEqual({
      tradeId: TRADE,
      recipientUserId: BRUNE,
      recipientDiscordUserId: '123456789012345678',
      // BattleTag MASQUÉ : jamais le discriminant dans un DM.
      proposerDisplayName: 'Alice',
      offeredCount: 1,
      requestedCount: 1,
      expiresAt,
      ctaUrl: expect.stringMatching(/^https?:\/\/.+\/player\/tcg\/echanges$/),
    });
    expect(Object.keys(proposed[0]).sort()).toEqual(
      [
        'tradeId',
        'recipientUserId',
        'recipientDiscordUserId',
        'proposerDisplayName',
        'offeredCount',
        'requestedCount',
        'expiresAt',
        'ctaUrl',
      ].sort()
    );
    // Aucune pièce ne bouge.
    expect(store.tcg_wallet_entries ?? []).toHaveLength(0);
    expect(store.tcg_wallets ?? []).toHaveLength(0);
  });

  const refusals: Array<[string, number]> = [
    ['recipient_unavailable', 409],
    ['recipient_inbox_full', 409],
    ['too_many_pending', 409],
    ['already_pending', 409],
    ['recently_declined', 409],
    ['offered_not_owned', 409],
    ['requested_not_available', 409],
    ['trading_disabled', 403],
    ['collection_too_recent', 403],
  ];

  it.each(refusals)(
    '%s → %d avec code stable, sans annonce',
    async (code, status) => {
      setRpcResult('tcg_propose_trade', { data: { status: code } });
      const r = res();
      await tradesHandler(req({ method: 'POST', body: validBody() }), r);
      expect(r.statusCode).toBe(status);
      expect(r.body.code).toBe(code);
      expect(events('tcg.trade_proposed')).toHaveLength(0);
    }
  );

  it('une violation de l’index « une en attente par paire » (23505) se lit already_pending', async () => {
    setRpcResult('tcg_propose_trade', {
      error: { code: '23505', message: 'duplicate key' },
    });
    const r = res();
    await tradesHandler(req({ method: 'POST', body: validBody() }), r);
    expect(r.statusCode).toBe(409);
    expect(r.body.code).toBe('already_pending');
    expect(events('tcg.trade_proposed')).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Accepter                                                                    */
/* -------------------------------------------------------------------------- */

describe('POST /api/player/tcg/trades/{id} — accepter', () => {
  beforeEach(() => setAuthUser({ id: BRUNE }));

  const accept = async () => {
    const r = res();
    await actionHandler(
      req({
        method: 'POST',
        query: { tradeId: TRADE },
        body: { action: 'accept' },
      }),
      r
    );
    return r;
  };

  it('accepte : paramètres anti-abus passés, annonce à la proposante ET aux propositions devenues caduques', async () => {
    setRpcResult('tcg_accept_trade', {
      data: {
        status: 'accepted',
        tradeId: TRADE,
        proposerId: ALICE,
        recipientId: BRUNE,
        cancelled: [
          { tradeId: TRADE_2, proposerId: CLARA, recipientId: BRUNE },
        ],
      },
    });
    const r = await accept();
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({
      trade: { id: TRADE, status: 'accepted' },
      replayed: false,
    });
    expect(
      rpcCalls.find((c) => c.fn === 'tcg_accept_trade')?.params
    ).toMatchObject({
      p_tenant_id: TENANT,
      p_trade_id: TRADE,
      p_user_id: BRUNE,
      p_max_accepted_per_day: TRADE_MAX_ACCEPTED_PER_DAY,
    });

    const resolved = events('tcg.trade_resolved');
    expect(resolved.map((e) => [e.tradeId, e.outcome]).sort()).toEqual(
      [
        [TRADE, 'accepted'],
        [TRADE_2, 'cancelled'],
      ].sort()
    );
    const mine = resolved.find((e) => e.tradeId === TRADE)!;
    expect(Object.keys(mine).sort()).toEqual(
      [
        'tradeId',
        'proposerUserId',
        'proposerDiscordUserId',
        'outcome',
        'counterpartDisplayName',
        'ctaUrl',
      ].sort()
    );
    expect(mine.proposerUserId).toBe(ALICE);
    expect(mine.proposerDiscordUserId).toBeNull();
    // Aucune pièce ne bouge dans un échange.
    expect(store.tcg_wallet_entries ?? []).toHaveLength(0);
  });

  it('IDEMPOTENT : un rejeu (double clic, retry) rend 200 replayed, SANS seconde annonce', async () => {
    setRpcResult('tcg_accept_trade', {
      data: {
        status: 'accepted',
        tradeId: TRADE,
        proposerId: ALICE,
        recipientId: BRUNE,
        cancelled: [],
      },
    });
    await accept();
    setRpcResult('tcg_accept_trade', {
      data: {
        status: 'already_accepted',
        tradeId: TRADE,
        proposerId: ALICE,
        recipientId: BRUNE,
      },
    });
    const r = await accept();
    expect(r.statusCode).toBe(200);
    expect(r.body.replayed).toBe(true);
    expect(events('tcg.trade_resolved')).toHaveLength(1);
  });

  it('carte offerte recyclée ou engagée entre-temps (stale) : 409 + annonce `cancelled` à la proposante', async () => {
    setRpcResult('tcg_accept_trade', {
      data: {
        status: 'stale',
        tradeId: TRADE,
        proposerId: ALICE,
        recipientId: BRUNE,
      },
    });
    const r = await accept();
    expect(r.statusCode).toBe(409);
    expect(r.body.code).toBe('stale');
    const resolved = events('tcg.trade_resolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0].outcome).toBe('cancelled');
  });

  it('carte demandée plus possédée : 409, et RIEN n’est annoncé (on ne révèle pas sa collection)', async () => {
    setRpcResult('tcg_accept_trade', {
      data: { status: 'requested_unavailable' },
    });
    const r = await accept();
    expect(r.statusCode).toBe(409);
    expect(r.body.code).toBe('requested_unavailable');
    expect(events('tcg.trade_resolved')).toHaveLength(0);
  });

  it('expirée au moment d’accepter : 409 + UNE annonce `expired`', async () => {
    setRpcResult('tcg_accept_trade', {
      data: {
        status: 'expired',
        tradeId: TRADE,
        proposerId: ALICE,
        recipientId: BRUNE,
      },
    });
    const r = await accept();
    expect(r.statusCode).toBe(409);
    expect(r.body.code).toBe('expired');
    expect(events('tcg.trade_resolved').map((e) => e.outcome)).toEqual([
      'expired',
    ]);
  });

  it.each([
    ['not_found', 404],
    ['not_pending', 409],
    ['daily_limit', 429],
    ['partner_daily_limit', 409],
    ['not_eligible', 403],
  ])('%s → %d, sans annonce', async (code, status) => {
    setRpcResult('tcg_accept_trade', { data: { status: code } });
    const r = await accept();
    expect(r.statusCode).toBe(status);
    expect(r.body.code).toBe(code);
    expect(events('tcg.trade_resolved')).toHaveLength(0);
  });

  it('une erreur SQL (transaction annulée) rend 500 sans rien annoncer', async () => {
    setRpcResult('tcg_accept_trade', {
      error: { code: '40P01', message: 'deadlock detected' },
    });
    const r = await accept();
    expect(r.statusCode).toBe(500);
    expect(events('tcg.trade_resolved')).toHaveLength(0);
  });

  it('identifiant mal formé : 400 avant la base', async () => {
    const r = res();
    await actionHandler(
      req({
        method: 'POST',
        query: { tradeId: '1111-1111' },
        body: { action: 'accept' },
      }),
      r
    );
    expect(r.statusCode).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Refuser / annuler                                                           */
/* -------------------------------------------------------------------------- */

describe('POST /api/player/tcg/trades/{id} — refuser, annuler', () => {
  const act = async (action: string, tradeId = TRADE) => {
    const r = res();
    await actionHandler(
      req({ method: 'POST', query: { tradeId }, body: { action } }),
      r
    );
    return r;
  };

  it('la destinataire refuse : une annonce `declined`, et un second refus est un rejeu muet', async () => {
    seedTrade();
    setAuthUser({ id: BRUNE });
    const first = await act('decline');
    expect(first.statusCode).toBe(200);
    expect(trades()[0].status).toBe('declined');
    expect(trades()[0].resolved_at).toBeTruthy();

    const second = await act('decline');
    expect(second.statusCode).toBe(200);
    expect(second.body.replayed).toBe(true);

    const resolved = events('tcg.trade_resolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      tradeId: TRADE,
      proposerUserId: ALICE,
      outcome: 'declined',
    });
  });

  it('la proposante ne peut pas « refuser » sa propre proposition : 404', async () => {
    seedTrade();
    setAuthUser({ id: ALICE });
    const r = await act('decline');
    expect(r.statusCode).toBe(404);
    expect(trades()[0].status).toBe('pending');
  });

  it('une tierce personne ne voit pas la proposition : 404', async () => {
    seedTrade();
    setAuthUser({ id: CLARA });
    expect((await act('decline')).statusCode).toBe(404);
    expect((await act('cancel')).statusCode).toBe(404);
    expect(trades()[0].status).toBe('pending');
  });

  it('une proposition d’un AUTRE tenant est introuvable', async () => {
    seedTrade({ tenant_id: OTHER_TENANT });
    setAuthUser({ id: BRUNE });
    const r = await act('decline');
    expect(r.statusCode).toBe(404);
    expect(trades()[0].status).toBe('pending');
  });

  it('la proposante annule : motif `proposer_cancelled`, AUCUNE annonce (c’est son geste)', async () => {
    seedTrade();
    setAuthUser({ id: ALICE });
    const r = await act('cancel');
    expect(r.statusCode).toBe(200);
    expect(trades()[0]).toMatchObject({
      status: 'cancelled',
      resolution_reason: 'proposer_cancelled',
    });
    expect(events('tcg.trade_resolved')).toHaveLength(0);
  });

  it('refuser une proposition échue : elle EXPIRE (annoncée comme telle), le refus rend 409', async () => {
    seedTrade({ expires_at: past() });
    setAuthUser({ id: BRUNE });
    const r = await act('decline');
    expect(r.statusCode).toBe(409);
    expect(r.body.code).toBe('expired');
    expect(trades()[0].status).toBe('expired');
    expect(events('tcg.trade_resolved').map((e) => e.outcome)).toEqual([
      'expired',
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Expiration                                                                  */
/* -------------------------------------------------------------------------- */

describe('expiration — paresseuse et planifiée, une seule annonce', () => {
  it('la lecture des boîtes expire ce qui est échu, une fois', async () => {
    seedTrade({ expires_at: past() });
    setAuthUser({ id: BRUNE });

    for (let i = 0; i < 2; i += 1) {
      const r = res();
      await tradesHandler(req({ query: { box: 'received' } }), r);
      expect(r.statusCode).toBe(200);
      // Une proposition échue ne s'affiche jamais comme acceptable.
      expect(r.body.trades).toEqual([]);
    }
    expect(trades()[0].status).toBe('expired');
    expect(events('tcg.trade_resolved')).toHaveLength(1);
  });

  it('le cron exige CRON_SECRET, balaie tous les tenants et n’annonce qu’une fois', async () => {
    process.env.CRON_SECRET = 'cron-test-secret';
    seedTrade({ expires_at: past() });
    (store.tcg_trades as any[]).push({
      ...trades()[0],
      id: TRADE_2,
      tenant_id: OTHER_TENANT,
      proposer_id: CLARA,
    });
    // Une proposition encore valide ne bouge pas.
    (store.tcg_trades as any[]).push({
      ...trades()[0],
      id: '9c3a6e4d-1f5b-4d8c-a0e7-4b9f3c1d5e02',
      expires_at: future(),
    });

    const denied = res();
    await cronHandler(req({ method: 'POST', headers: {} }), denied);
    expect(denied.statusCode).toBe(401);

    for (let i = 0; i < 2; i += 1) {
      const r = res();
      await cronHandler(
        req({
          method: 'POST',
          headers: { authorization: 'Bearer cron-test-secret' },
        }),
        r
      );
      expect(r.statusCode).toBe(200);
      expect(r.body.expired).toBe(i === 0 ? 2 : 0);
    }
    expect(
      trades()
        .map((t) => t.status)
        .sort()
    ).toEqual(['expired', 'expired', 'pending'].sort());
    const resolved = events('tcg.trade_resolved');
    expect(resolved).toHaveLength(2);
    expect(resolved.every((e) => e.outcome === 'expired')).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Préférence                                                                  */
/* -------------------------------------------------------------------------- */

describe('/api/player/tcg/trades/settings — opt-in', () => {
  it('sans ligne, les échanges sont DÉSACTIVÉS', async () => {
    setRpcResult('tcg_trade_eligibility', {
      data: {
        eligible: true,
        eligibleAt: '2026-09-01T00:00:00Z',
        reason: null,
      },
    });
    const r = res();
    await settingsHandler(req(), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.acceptsProposals).toBe(false);
    expect(r.body.limits.maxCardsPerSide).toBe(TRADE_MAX_CARDS_PER_SIDE);
  });

  it('activer exige l’ancienneté du compte ET de la collection', async () => {
    setRpcResult('tcg_trade_eligibility', {
      data: {
        eligible: false,
        eligibleAt: '2026-09-29T00:00:00.000Z',
        reason: 'too_recent',
      },
    });
    const r = res();
    await settingsHandler(
      req({ method: 'PUT', body: { acceptsProposals: true } }),
      r
    );
    expect(r.statusCode).toBe(409);
    expect(r.body.code).toBe('collection_too_recent');
    expect(r.body.eligibleAt).toBe('2026-09-29T00:00:00.000Z');
    expect(store.tcg_trade_settings ?? []).toHaveLength(0);
    expect(
      rpcCalls.find((c) => c.fn === 'tcg_trade_eligibility')?.params
    ).toMatchObject({
      p_min_account_age_days: TRADE_MIN_ACCOUNT_AGE_DAYS,
      p_min_collection_age_days: TRADE_MIN_COLLECTION_AGE_DAYS,
    });
  });

  it('activer quand éligible écrit la préférence', async () => {
    setRpcResult('tcg_trade_eligibility', {
      data: {
        eligible: true,
        eligibleAt: '2026-09-01T00:00:00Z',
        reason: null,
      },
    });
    const r = res();
    await settingsHandler(
      req({ method: 'PUT', body: { acceptsProposals: true } }),
      r
    );
    expect(r.statusCode).toBe(200);
    expect(store.tcg_trade_settings).toEqual([
      expect.objectContaining({
        tenant_id: TENANT,
        user_id: ALICE,
        accepts_proposals: true,
      }),
    ]);
  });

  it('désactiver annule tout ce qui est en attente : reçues ANNONCÉES, envoyées muettes', async () => {
    optIn(BRUNE);
    setAuthUser({ id: BRUNE });
    seedTrade(); // Alice → Brune (reçue par Brune)
    seedTrade({ id: TRADE_2, proposer_id: BRUNE, recipient_id: CLARA }); // envoyée

    const r = res();
    await settingsHandler(
      req({ method: 'PUT', body: { acceptsProposals: false } }),
      r
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.cancelled).toEqual({ received: 1, sent: 1 });

    const byId = new Map(trades().map((t) => [t.id, t]));
    expect(byId.get(TRADE)).toMatchObject({
      status: 'cancelled',
      resolution_reason: 'trading_disabled',
    });
    expect(byId.get(TRADE_2)).toMatchObject({
      status: 'cancelled',
      resolution_reason: 'proposer_cancelled',
    });
    const resolved = events('tcg.trade_resolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      tradeId: TRADE,
      proposerUserId: ALICE,
      outcome: 'cancelled',
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Partenaires et doubles                                                      */
/* -------------------------------------------------------------------------- */

describe('/api/player/tcg/trades/partners — borné au tenant, sans email', () => {
  it('réciprocité : 403 si l’appelante n’a pas activé les échanges', async () => {
    optIn(BRUNE);
    const r = res();
    await partnersHandler(req(), r);
    expect(r.statusCode).toBe(403);
    expect(r.body.code).toBe('trading_disabled');
  });

  it('ne liste que les volontaires de CET espace, jamais soi-même, jamais un email', async () => {
    optIn(ALICE);
    optIn(BRUNE);
    optIn(CLARA, OTHER_TENANT);
    optIn(PLAYER_Z, TENANT, false);
    setRpcResult('admin_get_user_profiles', {
      data: [
        {
          id: BRUNE,
          email: 'brune@example.test',
          display_name: 'Brune',
          full_name: 'Brune Nom Complet',
          battle_tag: 'Brune#9999',
        },
      ],
    });
    const r = res();
    await partnersHandler(req(), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.partners).toEqual([{ userId: BRUNE, displayName: 'Brune' }]);
    const json = JSON.stringify(r.body);
    expect(json).not.toContain('@example.test');
    expect(json).not.toContain('Nom Complet');
  });
});

describe('/api/player/tcg/trades/cards — on ne voit que les doubles échangeables', () => {
  function seedCollection(owner: string) {
    store.tcg_packs = [
      {
        id: PACK_VICTORY,
        tenant_id: TENANT,
        user_id: owner,
        source_kind: 'victory',
        opened_at: '2026-08-01T00:00:00.000Z',
      },
      {
        id: PACK_WELCOME,
        tenant_id: TENANT,
        user_id: owner,
        source_kind: 'welcome',
        opened_at: '2026-08-01T00:00:00.000Z',
      },
    ] as any;
    const card = (
      pack: string,
      position: number,
      userId: string,
      over = {}
    ) => ({
      pack_id: pack,
      position,
      subject_kind: 'player',
      card_user_id: userId,
      card_team_id: null,
      card_map_slug: null,
      rarity: 'common',
      is_foil: false,
      recycled_at: null,
      ...over,
    });
    store.tcg_pack_cards = [
      // X : deux exemplaires échangeables → montré.
      card(PACK_VICTORY, 0, PLAYER_X, { rarity: 'epic' }),
      card(PACK_VICTORY, 1, PLAYER_X),
      // Y : deux exemplaires, tous deux d'un paquet CADEAU → jamais montré.
      card(PACK_WELCOME, 0, PLAYER_Y),
      card(PACK_WELCOME, 1, PLAYER_Y),
      // Z : un seul exemplaire → sa collection, pas un double.
      card(PACK_VICTORY, 2, PLAYER_Z, { rarity: 'legendary' }),
      // X recyclé : ne compte pas.
      card(PACK_VICTORY, 3, PLAYER_X, { recycled_at: '2026-08-02T00:00:00Z' }),
    ] as any;
  }

  it('partenaire qui n’a pas activé les échanges : 404 (même réponse qu’inexistante)', async () => {
    optIn(ALICE);
    seedCollection(BRUNE);
    const r = res();
    await cardsHandler(req({ query: { userId: BRUNE } }), r);
    expect(r.statusCode).toBe(404);
  });

  it('montre ses doubles échangeables seulement, à la rareté de l’exemplaire qui partirait', async () => {
    optIn(ALICE);
    optIn(BRUNE);
    seedCollection(BRUNE);
    const r = res();
    await cardsHandler(req({ query: { userId: BRUNE } }), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.cards).toHaveLength(1);
    expect(r.body.cards[0]).toMatchObject({
      kind: 'player',
      userId: PLAYER_X,
      // La commune part, jamais l'épique.
      rarity: 'common',
    });
    // Aucun compte d'exemplaires chez une autre.
    expect(r.body.cards[0]).not.toHaveProperty('copies');
  });

  it('mes cartes : les cartes de paquet cadeau sont marquées non échangeables', async () => {
    seedCollection(ALICE);
    const r = res();
    await cardsHandler(req(), r);
    expect(r.statusCode).toBe(200);
    const byUser = new Map((r.body.cards as any[]).map((c) => [c.userId, c]));
    expect(byUser.get(PLAYER_X)).toMatchObject({
      copies: 2,
      tradeableCopies: 2,
      available: 2,
    });
    expect(byUser.get(PLAYER_Y)).toMatchObject({
      copies: 2,
      tradeableCopies: 0,
      available: 0,
    });
    expect(byUser.get(PLAYER_Z)).toMatchObject({ copies: 1, available: 1 });
  });

  it('les faces passent par le filtre de consentement : une photo RÉVOQUÉE ne ressort pas', async () => {
    optIn(ALICE);
    optIn(BRUNE);
    seedCollection(BRUNE);
    store.tcg_player_cards = [
      {
        tenant_id: TENANT,
        user_id: PLAYER_X,
        photo_path: 'tcg/x.png',
        photo_status: 'approved',
        revoked_at: '2026-09-10T00:00:00Z',
      },
    ] as any;
    const r = res();
    await cardsHandler(req({ query: { userId: BRUNE } }), r);
    expect(r.statusCode).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain('tcg/x.png');

    // Et une photo approuvée, non révoquée, ressort bien — la même lecture.
    (store.tcg_player_cards as any[])[0].revoked_at = null;
    const again = res();
    await cardsHandler(req({ query: { userId: BRUNE } }), again);
    expect(again.body.cards[0].imageUrl).toContain('tcg/x.png');
  });
});

/* -------------------------------------------------------------------------- */
/* Lecture d'une proposition                                                   */
/* -------------------------------------------------------------------------- */

describe('GET /api/player/tcg/trades — une proposition reçue', () => {
  it('rend les deux côtés, mes exemplaires des cartes demandées, et relit les faces', async () => {
    seedTrade();
    setAuthUser({ id: BRUNE });
    store.tcg_trade_items = [
      {
        trade_id: TRADE,
        side: 'offered',
        ordinal: 0,
        subject_kind: 'player',
        card_user_id: PLAYER_X,
        card_team_id: null,
        card_map_slug: null,
        rarity: 'rare',
        is_foil: true,
      },
      {
        trade_id: TRADE,
        side: 'requested',
        ordinal: 0,
        subject_kind: 'player',
        card_user_id: PLAYER_Z,
        card_team_id: null,
        card_map_slug: null,
        rarity: 'common',
        is_foil: false,
      },
    ] as any;
    store.tcg_packs = [
      {
        id: PACK_VICTORY,
        tenant_id: TENANT,
        user_id: BRUNE,
        source_kind: 'victory',
        opened_at: '2026-08-01T00:00:00.000Z',
      },
    ] as any;
    store.tcg_pack_cards = [
      {
        pack_id: PACK_VICTORY,
        position: 0,
        subject_kind: 'player',
        card_user_id: PLAYER_Z,
        card_team_id: null,
        card_map_slug: null,
        rarity: 'common',
        is_foil: false,
        recycled_at: null,
      },
    ] as any;
    store.tcg_player_cards = [
      {
        tenant_id: TENANT,
        user_id: PLAYER_X,
        photo_path: 'tcg/revoked.png',
        photo_status: 'approved',
        revoked_at: '2026-09-10T00:00:00Z',
      },
    ] as any;

    const r = res();
    await tradesHandler(req({ query: { box: 'received' } }), r);
    expect(r.statusCode).toBe(200);
    expect(r.headers['Cache-Control']).toBe('private, no-store');
    expect(r.body.trades).toHaveLength(1);
    const trade = r.body.trades[0];
    expect(trade).toMatchObject({
      id: TRADE,
      direction: 'received',
      status: 'pending',
      counterpart: { userId: ALICE },
    });
    expect(trade.offered[0]).toMatchObject({
      kind: 'player',
      userId: PLAYER_X,
      rarity: 'rare',
      isFoil: true,
    });
    // Son dernier exemplaire : l'interface doit pouvoir l'avertir.
    expect(trade.requested[0]).toMatchObject({
      userId: PLAYER_Z,
      ownedCopies: 1,
      tradeableCopies: 1,
    });
    expect(JSON.stringify(r.body)).not.toContain('tcg/revoked.png');
  });

  it('côté proposante, aucune donnée de la collection de l’autre', async () => {
    seedTrade();
    setAuthUser({ id: ALICE });
    store.tcg_trade_items = [
      {
        trade_id: TRADE,
        side: 'requested',
        ordinal: 0,
        subject_kind: 'map',
        card_user_id: null,
        card_team_id: null,
        card_map_slug: 'kings-row',
        rarity: 'common',
        is_foil: false,
      },
    ] as any;
    const r = res();
    await tradesHandler(req({ query: { box: 'sent' } }), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.trades[0].direction).toBe('sent');
    expect(r.body.trades[0].requested[0]).not.toHaveProperty('ownedCopies');
  });

  it('refuse un curseur forgé (il finit dans un filtre PostgREST)', async () => {
    const r = res();
    await tradesHandler(
      req({ query: { cursor: 'eyJnIjoiLCkiLCJpIjoiKCJ9' } }),
      r
    );
    expect(r.statusCode).toBe(400);
    expect(r.body.code).toBe('invalid_cursor');
  });
});
