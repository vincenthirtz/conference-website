// Récompense TCG de la vérification d'un compte Battle.net.
// Target: utils/tcg/grantBattlenetVerified.ts (+ son branchement dans
// `GET /api/auth/battlenet/callback`, + `grantCoinsThenPacks` sans paquet).
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. UNE FOIS À VIE. Rejeu, retrait puis nouvelle vérification, second compte
//      Blizzard, second tenant : jamais un second crédit.
//   2. UNE FOIS PAR COMPTE BLIZZARD. Le même compte sur une seconde joueuse ne
//      crédite rien.
//   3. LA RÉCOMPENSE NE CASSE JAMAIS LA VÉRIFICATION. Écriture refusée (CHECK
//      23514 d'une migration non passée) ou écrivain qui lève : la redirection
//      reste `?battlenet=verified`, le lien est écrit, rien n'est crédité.
//
// ⚠️ LE MOCK N'ÉVALUE NI CHECK NI INDEX PARTIEL. Les règles « une fois par
// personne » et « une fois par compte Blizzard » vivent dans deux index uniques
// partiels (`tcg_battlenet_verified.sql`) ; le mock ne connaît que la clé
// passée en `onConflict`. Les cas qui en dépendent SIMULENT donc le refus de la
// base (23505) : ils testent ce que le code FAIT du refus.
//
// Le refus est posé par `rejectWalletUpserts`, pas par `setTableWriteError` :
// le mock applique un `upsert` dès l'appel et le rend comme une lecture, si
// bien que ce levier n'atteint pas les upserts — l'écriture passerait au vert.
//
// Que la migration porte bien ces index est vérifié à part, en lisant le
// fichier SQL.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetSupabaseMock,
  setCookieUser,
  store,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { signBattlenetState } from '../../utils/battlenet';
import { logger } from '../../utils/logger';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { BATTLENET_VERIFIED_COINS } from '../../utils/tcg/earnSources';
import {
  battlenetRewardSourceRef,
  grantBattlenetVerifiedReward,
} from '../../utils/tcg/grantBattlenetVerified';
import { grantCoinsThenPacks } from '../../utils/tcg/grantCoinsThenPacks';
import callbackHandler from '../../pages/api/auth/battlenet/callback';

const TENANT = DEFAULT_TENANT_ID;
const OTHER_TENANT = '5b8e2f14-7c3a-4d9e-8f1b-2a6c4e8d0f13';
const ALICE = '3f6c2a1e-8b4d-4c7e-9a2b-1d5e6f7a8b9c';
const BRUNE = '9d4b7e21-3a6c-4f8d-b2e5-7c1a9f3d6e40';
const BNET_A = '1234567890';
const BNET_B = '2233445566';
const BTAG = 'Tracer#2100';

const entries = () =>
  (store.tcg_wallet_entries ?? []) as Array<Record<string, unknown>>;
const rewardEvents = () =>
  ((store.bot_event_outbox ?? []) as Array<Record<string, any>>)
    .filter(
      (row) =>
        row.event_name === 'tcg.reward_granted' ||
        row.payload?.event === 'tcg.reward_granted'
    )
    .map((row) => row.payload?.data as Record<string, unknown>);

/** Un refus de la base tel que PostgREST le rend : message + code SQLSTATE. */
function dbError(code: string, message: string) {
  const error = { message, code };
  return error;
}

/**
 * Fait refuser par la « base » tout upsert sur `tcg_wallet_entries`, les
 * autres tables et les lectures restant servies par le mock.
 */
function rejectWalletUpserts(error: { message: string; code: string }) {
  const original = supabaseAdmin.from.bind(supabaseAdmin);
  vi.spyOn(supabaseAdmin, 'from').mockImplementation(((table: string) => {
    if (table !== 'tcg_wallet_entries') return original(table);
    const builder = original(table) as any;
    builder.upsert = () => ({
      select: async () => ({ data: null, error }),
    });
    return builder;
  }) as any);
}

function makeRes() {
  const res: any = { statusCode: 200, headers: {} as Record<string, unknown> };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.getHeader = (k: string) => res.headers[k];
  return res;
}

function makeReq(
  query: Record<string, string>,
  cookies: Record<string, string>
): any {
  return {
    method: 'GET',
    headers: { host: 'localhost:3000' },
    url: '/api/auth/battlenet/callback',
    query,
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    cookies,
  };
}

/** Un aller-retour OAuth complet pour `userId`, Blizzard rendant `bnetId`. */
async function verifyVia(
  userId: string,
  bnetId: string,
  handler = callbackHandler
) {
  setCookieUser({ id: userId });
  vi.spyOn(global, 'fetch' as any)
    .mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
    )
    .mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ sub: bnetId, battletag: BTAG }), {
          status: 200,
        })
    );
  const nonce = `nonce-${userId.slice(0, 8)}-${bnetId}`;
  const state = signBattlenetState({
    nonce,
    authUserId: userId,
    returnTo: '/player/profile',
  });
  const res = makeRes();
  await handler(
    makeReq({ code: 'auth-code', state }, { bn_oauth_state: nonce }),
    res
  );
  return res;
}

const OLD_ENV = { ...process.env };

beforeEach(() => {
  resetSupabaseMock();
  process.env.BLIZZARD_CLIENT_ID = 'test-client-id';
  process.env.BLIZZARD_CLIENT_SECRET = 'test-client-secret';
  process.env.BLIZZARD_REDIRECT_URI =
    'http://localhost:3000/api/auth/battlenet/callback';
  // Pas de push HTTP vers le bot : l'outbox suffit à observer l'annonce.
  delete process.env.BOT_WEBHOOK_URL;
});

afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.restoreAllMocks();
});

describe('grantBattlenetVerifiedReward', () => {
  it('crédite la première vérification, sans paquet, et l’annonce', async () => {
    const outcome = await grantBattlenetVerifiedReward({
      tenantId: TENANT,
      userId: ALICE,
      battleNetId: BNET_A,
    });

    expect(outcome).toEqual({
      status: 'granted',
      coins: BATTLENET_VERIFIED_COINS,
    });
    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({
      tenant_id: TENANT,
      user_id: ALICE,
      amount: BATTLENET_VERIFIED_COINS,
      source_kind: 'battlenet_verified',
      source_ref: battlenetRewardSourceRef(BNET_A),
    });
    // Aucun paquet : la source n'en donne pas.
    expect(store.tcg_packs ?? []).toHaveLength(0);
    // Le solde est recalculé depuis le registre.
    expect(
      (store.tcg_wallets ?? []).find((w: any) => w.user_id === ALICE)
    ).toMatchObject({ balance: BATTLENET_VERIFIED_COINS });

    const events = rewardEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      userId: ALICE,
      reason: 'battlenet_verified',
      coins: BATTLENET_VERIFIED_COINS,
      packs: 0,
      tournamentId: null,
      tournamentName: null,
      rank: null,
      streak: null,
      sourceRef: battlenetRewardSourceRef(BNET_A),
    });
  });

  it('ne met jamais l’identifiant Blizzard en clair dans la référence', () => {
    const ref = battlenetRewardSourceRef(BNET_A);
    expect(ref).toMatch(/^bnet:[0-9a-f]{64}$/);
    expect(ref).not.toContain(BNET_A);
    // Stable (sinon la règle « une fois par compte » ne tiendrait pas) et
    // insensible aux espaces parasites.
    expect(battlenetRewardSourceRef(` ${BNET_A} `)).toBe(ref);
    expect(battlenetRewardSourceRef(BNET_B)).not.toBe(ref);
  });

  it('un rejeu exact ne crédite rien et ne renotifie personne', async () => {
    const input = { tenantId: TENANT, userId: ALICE, battleNetId: BNET_A };
    await grantBattlenetVerifiedReward(input);
    const replay = await grantBattlenetVerifiedReward(input);

    expect(replay).toEqual({ status: 'already' });
    expect(entries()).toHaveLength(1);
    expect(rewardEvents()).toHaveLength(1);
  });

  it('un second compte Blizzard sur la même joueuse → « déjà », rien écrit', async () => {
    await grantBattlenetVerifiedReward({
      tenantId: TENANT,
      userId: ALICE,
      battleNetId: BNET_A,
    });
    // Autre `source_ref` : la clé du registre laisserait passer. C'est l'index
    // partiel « une fois par personne » qui refuse — simulé ici.
    rejectWalletUpserts(
      dbError('23505', 'tcg_wallet_entries_battlenet_once_per_user')
    );

    const outcome = await grantBattlenetVerifiedReward({
      tenantId: TENANT,
      userId: ALICE,
      battleNetId: BNET_B,
    });

    expect(outcome).toEqual({ status: 'already' });
    expect(entries()).toHaveLength(1);
    expect(rewardEvents()).toHaveLength(1);
  });

  it('le même compte Blizzard sur une seconde joueuse → « déjà », rien écrit', async () => {
    await grantBattlenetVerifiedReward({
      tenantId: TENANT,
      userId: ALICE,
      battleNetId: BNET_A,
    });
    rejectWalletUpserts(
      dbError('23505', 'tcg_wallet_entries_battlenet_once_per_account')
    );

    const outcome = await grantBattlenetVerifiedReward({
      tenantId: TENANT,
      userId: BRUNE,
      battleNetId: BNET_A,
    });

    expect(outcome).toEqual({ status: 'already' });
    expect(entries().filter((e) => e.user_id === BRUNE)).toHaveLength(0);
  });

  it('un second tenant ne recrédite pas', async () => {
    await grantBattlenetVerifiedReward({
      tenantId: TENANT,
      userId: ALICE,
      battleNetId: BNET_A,
    });
    rejectWalletUpserts(
      dbError('23505', 'tcg_wallet_entries_battlenet_once_per_user')
    );

    const outcome = await grantBattlenetVerifiedReward({
      tenantId: OTHER_TENANT,
      userId: ALICE,
      battleNetId: BNET_A,
    });

    expect(outcome).toEqual({ status: 'already' });
    expect(entries().filter((e) => e.tenant_id === OTHER_TENANT)).toHaveLength(
      0
    );
  });

  it('migration non passée (23514) → erreur rendue et journalisée, rien crédité', async () => {
    const errorSpy = vi.spyOn(logger, 'error');
    rejectWalletUpserts(
      dbError(
        '23514',
        'violates check constraint "tcg_wallet_entries_source_kind_check"'
      )
    );

    const outcome = await grantBattlenetVerifiedReward({
      tenantId: TENANT,
      userId: ALICE,
      battleNetId: BNET_A,
    });

    expect(outcome).toEqual({ status: 'error', reason: 'rejected' });
    expect(entries()).toHaveLength(0);
    expect(rewardEvents()).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('une panne ordinaire n’est pas lue comme « déjà récompensée »', async () => {
    // Une erreur de lecture/écriture n'est pas une absence : sans code 23505,
    // on ne conclut surtout pas « déjà reçue ».
    rejectWalletUpserts(dbError('', 'upstream timeout'));

    const outcome = await grantBattlenetVerifiedReward({
      tenantId: TENANT,
      userId: ALICE,
      battleNetId: BNET_A,
    });

    expect(outcome).toEqual({ status: 'error', reason: 'failed' });
  });

  it('refuse une entrée incomplète sans rien écrire', async () => {
    const outcome = await grantBattlenetVerifiedReward({
      tenantId: TENANT,
      userId: ALICE,
      battleNetId: '   ',
    });
    expect(outcome).toEqual({ status: 'error', reason: 'invalid_input' });
    expect(entries()).toHaveLength(0);
  });
});

describe('grantCoinsThenPacks — source sans paquet', () => {
  it('écarte une ligne qui demanderait un paquet sans origine de paquet', async () => {
    const result = await grantCoinsThenPacks({
      tenantId: TENANT,
      walletSourceKind: 'battlenet_verified',
      packSourceKind: null,
      grants: [{ userId: ALICE, sourceRef: 'bnet:x', coins: 10, packs: 1 }],
    });
    expect(result).toEqual({
      ok: true,
      credited: [],
      packsExpected: 0,
      packsGranted: 0,
    });
    expect(entries()).toHaveLength(0);
  });
});

describe('GET /api/auth/battlenet/callback — récompense', () => {
  it('première vérification : 302, lien écrit, pièces créditées, paramètre de retour posé', async () => {
    const res = await verifyVia(ALICE, BNET_A);

    expect(res.statusCode).toBe(302);
    // Pas de roster : succès neutre — la récompense ne dépend pas du roster.
    // `tcg=battlenet_reward` s'AJOUTE : `battlenet=` reste intact.
    expect(res.headers.Location).toBe(
      '/player/profile?battlenet=linked&tcg=battlenet_reward'
    );
    expect(store.user_battlenet_links).toHaveLength(1);
    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({
      user_id: ALICE,
      tenant_id: TENANT,
      source_kind: 'battlenet_verified',
    });
  });

  it('retrait du lien puis nouvelle vérification : pas de second crédit', async () => {
    await verifyVia(ALICE, BNET_A);
    // Le lien disparaît (aucune route ne le retire aujourd'hui ; suppression
    // en base) — le registre, lui, garde la trace.
    store.user_battlenet_links = [];

    const res = await verifyVia(ALICE, BNET_A);

    // Rien crédité par cet appel : pas de « +N pièces » au retour.
    expect(res.headers.Location).toBe('/player/profile?battlenet=linked');
    expect(store.user_battlenet_links).toHaveLength(1);
    expect(entries()).toHaveLength(1);
    expect(rewardEvents()).toHaveLength(1);
  });

  it('garde le paramètre additif derrière un returnTo qui porte déjà une query', async () => {
    setCookieUser({ id: ALICE });
    vi.spyOn(global, 'fetch' as any)
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ access_token: 'tok' }), {
            status: 200,
          })
      )
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ sub: BNET_A, battletag: BTAG }), {
            status: 200,
          })
      );
    const nonce = 'nonce-welcome';
    const state = signBattlenetState({
      nonce,
      authUserId: ALICE,
      returnTo: '/player/manage-team?welcome=1',
    });
    const res = makeRes();
    await callbackHandler(
      makeReq({ code: 'c', state }, { bn_oauth_state: nonce }),
      res
    );

    expect(res.headers.Location).toBe(
      '/player/manage-team?welcome=1&battlenet=linked&tcg=battlenet_reward'
    );
  });

  it('même compte Blizzard tenté par une seconde joueuse : bloqué, rien crédité', async () => {
    await verifyVia(ALICE, BNET_A);

    const res = await verifyVia(BRUNE, BNET_A);

    // Tant que le lien existe, l'anti-smurf refuse AVANT la récompense.
    expect(res.headers.Location).toBe(
      '/player/profile?battlenet=already_linked'
    );
    expect(entries().filter((e) => e.user_id === BRUNE)).toHaveLength(0);
  });

  it('migration non passée (23514) : la vérification réussit, rien crédité, erreur journalisée', async () => {
    const errorSpy = vi.spyOn(logger, 'error');
    rejectWalletUpserts(
      dbError(
        '23514',
        'violates check constraint "tcg_wallet_entries_source_kind_check"'
      )
    );

    const res = await verifyVia(ALICE, BNET_A);

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe('/player/profile?battlenet=linked');
    expect(store.user_battlenet_links).toHaveLength(1);
    expect(entries()).toHaveLength(0);
    expect(rewardEvents()).toHaveLength(0);
    expect(
      errorSpy.mock.calls.some((call) =>
        String(call[0]).includes('battlenet-verified')
      )
    ).toBe(true);
  });

  it('un écrivain qui lève ne fait pas échouer la vérification', async () => {
    const thrower = vi.fn(async () => {
      throw new Error('boom');
    });
    vi.resetModules();
    vi.doMock('@/utils/tcg/grantBattlenetVerified', () => ({
      grantBattlenetVerifiedReward: thrower,
    }));
    try {
      const fresh = (await import('../../pages/api/auth/battlenet/callback'))
        .default;
      const res = await verifyVia(ALICE, BNET_A, fresh);

      // Sans cette assertion, un mock non appliqué laisserait tourner le vrai
      // écrivain et le test passerait sans rien prouver.
      expect(thrower).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(302);
      expect(res.headers.Location).toBe('/player/profile?battlenet=linked');
    } finally {
      vi.doUnmock('@/utils/tcg/grantBattlenetVerified');
      vi.resetModules();
    }
  });
});

describe('la migration porte bien les règles que le mock ne voit pas', () => {
  const sql = readFileSync(
    path.resolve(
      __dirname,
      '../../database/migrations/tcg_battlenet_verified.sql'
    ),
    'utf8'
  )
    // Les commentaires citent volontiers ce qu'on cherche : on les retire.
    .replace(/--.*$/gm, '');

  it('recopie la liste ENTIÈRE du CHECK, plus la nouvelle source', () => {
    const block = sql.match(
      /ADD CONSTRAINT tcg_wallet_entries_source_kind_check\s+CHECK \(\s*source_kind IN \(([^)]*)\)/
    );
    expect(block).not.toBeNull();
    const values = [...(block?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(
      (m) => m[1]
    );
    expect(values.sort()).toEqual(
      [
        'match_win',
        'scrim_win',
        'booster_purchase',
        'admin_grant',
        'card_recycled',
        'twitch_drop',
        'welcome_gift',
        'supporter_welcome',
        'checkin_streak',
        'tournament_placement',
        'battlenet_verified',
      ].sort()
    );
  });

  it('pose « une fois par personne » et « une fois par compte Blizzard », sans tenant', () => {
    const normalized = sql.replace(/\s+/g, ' ');
    expect(normalized).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS tcg_wallet_entries_battlenet_once_per_user ON public.tcg_wallet_entries (user_id) WHERE source_kind = 'battlenet_verified'"
    );
    expect(normalized).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS tcg_wallet_entries_battlenet_once_per_account ON public.tcg_wallet_entries (source_ref) WHERE source_kind = 'battlenet_verified'"
    );
  });

  it('ne touche pas aux paquets : la source n’en donne pas', () => {
    expect(sql).not.toMatch(/tcg_packs/);
  });
});
