// tests/unit/battlenetVerification.test.ts
//
// Vérification d'identité BattleTag via Battle.net OAuth (anti-smurf Tier 1).
// Couvre :
//   - upsertBattlenetLink crée le lien
//   - anti-smurf : 2e auth user sur le même battle_net_id → ALREADY_LINKED_TO_OTHER
//   - upsert idempotent pour le même user (réactualise verified_at)
//   - stampVerifiedTeamMembers : stampe le match (case-insensitive), laisse les
//     mismatch, renvoie les bons counts
//   - callback dormant (non configuré → 503)
//   - callback happy path (userinfo mocké) → redirect ?battlenet=verified
//   - callback state/CSRF invalide → redirect ?battlenet=error
//
// Les appels réseau Blizzard (token + userinfo) sont mockés via global.fetch.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setCookieUser,
} from './__helpers__/supabaseMock';
import {
  upsertBattlenetLink,
  stampVerifiedTeamMembers,
} from '../../utils/auth/battlenetLinks';
import { signBattlenetState } from '../../utils/battlenet';

const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const BNET_ID = '1234567890';
const BTAG = 'Tracer#2100';

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
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
  query: Record<string, string> = {},
  cookies: Record<string, string> = {}
): any {
  return {
    method: 'GET',
    headers: { host: 'h' },
    query,
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    cookies,
  };
}

beforeEach(() => {
  resetSupabaseMock();
});

describe('upsertBattlenetLink', () => {
  it('crée le lien pour un nouvel utilisateur', async () => {
    const r = await upsertBattlenetLink(USER_A, {
      battleNetId: BNET_ID,
      battleTag: BTAG,
      region: 'eu',
    });
    expect(r.ok).toBe(true);
    expect(store.user_battlenet_links).toHaveLength(1);
    const row = store.user_battlenet_links[0];
    expect(row.auth_user_id).toBe(USER_A);
    expect(row.battle_net_id).toBe(BNET_ID);
    expect(row.battle_tag).toBe(BTAG);
    expect(row.verified_at).toBeTruthy();
  });

  it('est idempotent pour le même utilisateur (réactualise verified_at)', async () => {
    await upsertBattlenetLink(USER_A, {
      battleNetId: BNET_ID,
      battleTag: BTAG,
    });
    const first = store.user_battlenet_links[0].verified_at;
    // deuxième passage, même user, même compte Blizzard, tag rafraîchi
    const r = await upsertBattlenetLink(USER_A, {
      battleNetId: BNET_ID,
      battleTag: 'Tracer#0000',
    });
    expect(r.ok).toBe(true);
    expect(store.user_battlenet_links).toHaveLength(1);
    expect(store.user_battlenet_links[0].battle_tag).toBe('Tracer#0000');
    expect(store.user_battlenet_links[0].verified_at).toBeTruthy();
    expect(typeof first).toBe('string');
  });

  it('ANTI-SMURF : un 2e auth user sur le même battle_net_id → ALREADY_LINKED_TO_OTHER', async () => {
    const first = await upsertBattlenetLink(USER_A, {
      battleNetId: BNET_ID,
      battleTag: BTAG,
    });
    expect(first.ok).toBe(true);

    const second = await upsertBattlenetLink(USER_B, {
      battleNetId: BNET_ID,
      battleTag: 'Tracer#9999',
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('ALREADY_LINKED_TO_OTHER');

    // Le lien d'origine n'a pas été volé.
    expect(store.user_battlenet_links).toHaveLength(1);
    expect(store.user_battlenet_links[0].auth_user_id).toBe(USER_A);
  });
});

describe('stampVerifiedTeamMembers', () => {
  it('stampe les lignes qui matchent (case-insensitive) et laisse les mismatch', async () => {
    store.team_members = [
      { id: 'tm-1', user_id: USER_A, battle_tag: 'Tracer#2100' },
      { id: 'tm-2', user_id: USER_A, battle_tag: 'tracer#2100' }, // case diff → match
      { id: 'tm-3', user_id: USER_A, battle_tag: 'Widow#1111' }, // mismatch
      { id: 'tm-4', user_id: USER_A, battle_tag: null }, // ni l'un ni l'autre
      { id: 'tm-5', user_id: USER_B, battle_tag: 'Tracer#2100' }, // autre user
    ];

    const r = await stampVerifiedTeamMembers(USER_A, BTAG, BNET_ID);
    expect(r.verifiedCount).toBe(2);
    expect(r.mismatchCount).toBe(1);

    const byId = (id: string) => store.team_members.find((m) => m.id === id)!;
    expect(byId('tm-1').battle_tag_verified_at).toBeTruthy();
    expect(byId('tm-1').verified_battle_net_id).toBe(BNET_ID);
    expect(byId('tm-2').battle_tag_verified_at).toBeTruthy();
    // mismatch + null + autre user : non estampillés
    expect(byId('tm-3').battle_tag_verified_at).toBeUndefined();
    expect(byId('tm-4').battle_tag_verified_at).toBeUndefined();
    expect(byId('tm-5').battle_tag_verified_at).toBeUndefined();
  });

  it('renvoie 0/0 quand le user n’a aucune ligne team_members', async () => {
    store.team_members = [];
    const r = await stampVerifiedTeamMembers(USER_A, BTAG, BNET_ID);
    expect(r).toEqual({ verifiedCount: 0, mismatchCount: 0 });
  });
});

describe('GET /api/auth/battlenet/callback', () => {
  const OLD_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function configure() {
    process.env.BLIZZARD_CLIENT_ID = 'test-client-id';
    process.env.BLIZZARD_CLIENT_SECRET = 'test-client-secret';
    process.env.BLIZZARD_REGION = 'eu';
    process.env.BLIZZARD_REDIRECT_URI =
      'http://localhost:3000/api/auth/battlenet/callback';
    process.env.BLIZZARD_OAUTH_BASE = 'https://oauth.battle.net';
  }

  function unconfigure() {
    delete process.env.BLIZZARD_CLIENT_ID;
    delete process.env.BLIZZARD_CLIENT_SECRET;
  }

  it('dormant : non configuré → 503 BATTLENET_NOT_CONFIGURED', async () => {
    unconfigure();
    const handler = (await import('../../pages/api/auth/battlenet/callback'))
      .default;
    const res = makeRes();
    await handler(makeReq({ code: 'x', state: 'y' }), res);
    expect(res.statusCode).toBe(503);
    expect((res.body as any).code).toBe('BATTLENET_NOT_CONFIGURED');
  });

  it('happy path : userinfo mocké → 302 ?battlenet=verified + lien + stamp', async () => {
    configure();
    setCookieUser({ id: USER_A });
    store.team_members = [
      { id: 'tm-1', user_id: USER_A, battle_tag: 'Tracer#2100' },
    ];

    // Mock réseau Blizzard : token puis userinfo.
    const fetchMock = vi
      .spyOn(global, 'fetch' as any)
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ access_token: 'tok-123' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      )
      .mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({ sub: BNET_ID, id: BNET_ID, battletag: BTAG }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
      );

    const nonce = 'nonce-abc';
    const state = signBattlenetState({
      nonce,
      authUserId: USER_A,
      returnTo: '/player/profile',
    });

    const handler = (await import('../../pages/api/auth/battlenet/callback'))
      .default;
    const res = makeRes();
    await handler(
      makeReq({ code: 'auth-code', state }, { bn_oauth_state: nonce }),
      res
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe('/player/profile?battlenet=verified');

    expect(store.user_battlenet_links).toHaveLength(1);
    expect(store.user_battlenet_links[0].battle_net_id).toBe(BNET_ID);
    expect(store.team_members[0].battle_tag_verified_at).toBeTruthy();
    expect(store.team_members[0].verified_battle_net_id).toBe(BNET_ID);
  });

  it('lié mais aucun tag roster ne matche → ?battlenet=linked_no_match', async () => {
    configure();
    setCookieUser({ id: USER_A });
    store.team_members = [
      { id: 'tm-1', user_id: USER_A, battle_tag: 'Widow#1111' },
    ];

    vi.spyOn(global, 'fetch' as any)
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
      )
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ sub: BNET_ID, battletag: BTAG }), {
            status: 200,
          })
      );

    const nonce = 'nonce-xyz';
    const state = signBattlenetState({
      nonce,
      authUserId: USER_A,
      returnTo: '/player/profile',
    });

    const handler = (await import('../../pages/api/auth/battlenet/callback'))
      .default;
    const res = makeRes();
    await handler(
      makeReq({ code: 'c', state }, { bn_oauth_state: nonce }),
      res
    );

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe(
      '/player/profile?battlenet=linked_no_match'
    );
    expect(store.user_battlenet_links).toHaveLength(1);
  });

  it('compte Blizzard déjà lié à un autre user → ?battlenet=already_linked', async () => {
    configure();
    setCookieUser({ id: USER_B });
    // USER_A possède déjà ce battle_net_id.
    store.user_battlenet_links = [
      { auth_user_id: USER_A, battle_net_id: BNET_ID, battle_tag: BTAG },
    ];

    vi.spyOn(global, 'fetch' as any)
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
      )
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ sub: BNET_ID, battletag: BTAG }), {
            status: 200,
          })
      );

    const nonce = 'nonce-2';
    const state = signBattlenetState({
      nonce,
      authUserId: USER_B,
      returnTo: '/player/profile',
    });

    const handler = (await import('../../pages/api/auth/battlenet/callback'))
      .default;
    const res = makeRes();
    await handler(
      makeReq({ code: 'c', state }, { bn_oauth_state: nonce }),
      res
    );

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe(
      '/player/profile?battlenet=already_linked'
    );
    // Le lien d'origine n'a pas bougé.
    expect(store.user_battlenet_links).toHaveLength(1);
    expect(store.user_battlenet_links[0].auth_user_id).toBe(USER_A);
  });

  it('state/CSRF invalide (cookie nonce ≠ state) → ?battlenet=error', async () => {
    configure();
    setCookieUser({ id: USER_A });

    const state = signBattlenetState({
      nonce: 'real-nonce',
      authUserId: USER_A,
      returnTo: '/player/profile',
    });

    const handler = (await import('../../pages/api/auth/battlenet/callback'))
      .default;
    const res = makeRes();
    // Cookie porte un nonce différent → rejet.
    await handler(
      makeReq({ code: 'c', state }, { bn_oauth_state: 'other-nonce' }),
      res
    );

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe('/player/profile?battlenet=error');
    // Aucun échange réseau ni lien créé.
    expect(store.user_battlenet_links ?? []).toHaveLength(0);
  });

  it('state signé avec une autre clé → rejet ?battlenet=error', async () => {
    configure();
    setCookieUser({ id: USER_A });

    // Signe le state avec une autre clé HMAC.
    process.env.BLIZZARD_CLIENT_SECRET = 'attacker-secret';
    const forged = signBattlenetState({
      nonce: 'n',
      authUserId: USER_A,
      returnTo: '/player/profile',
    });
    process.env.BLIZZARD_CLIENT_SECRET = 'test-client-secret';

    const handler = (await import('../../pages/api/auth/battlenet/callback'))
      .default;
    const res = makeRes();
    await handler(
      makeReq({ code: 'c', state: forged }, { bn_oauth_state: 'n' }),
      res
    );

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe('/player/profile?battlenet=error');
  });
});
