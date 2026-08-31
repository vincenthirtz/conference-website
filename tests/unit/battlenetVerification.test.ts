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
//   - CONNEXION Battle.net (comptes déjà liés) : compte lié → magic-link,
//     compte inconnu → ?battlenet=not_linked (jamais de création), nonce
//     invalide → error, et séparation de domaine des states login/vérification
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
  setAdminUser,
  setGenerateLinkResult,
} from './__helpers__/supabaseMock';
import {
  upsertBattlenetLink,
  stampVerifiedTeamMembers,
} from '../../utils/auth/battlenetLinks';
import {
  signBattlenetState,
  signBattlenetLoginState,
  verifyBattlenetLoginState,
  verifyBattlenetState,
} from '../../utils/battlenet';

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
      { id: 'tm-1', user_id: USER_A, role: 'player', battle_tag: 'Tracer#2100' },
      // case diff → match
      { id: 'tm-2', user_id: USER_A, role: 'player', battle_tag: 'tracer#2100' },
      // mismatch
      { id: 'tm-3', user_id: USER_A, role: 'player', battle_tag: 'Widow#1111' },
      // autre user
      { id: 'tm-5', user_id: USER_B, role: 'player', battle_tag: 'Tracer#2100' },
    ];

    const r = await stampVerifiedTeamMembers(USER_A, BTAG, BNET_ID);
    expect(r.verifiedCount).toBe(2);
    expect(r.mismatchCount).toBe(1);
    expect(r.filledCount).toBe(0);

    const byId = (id: string) => store.team_members.find((m) => m.id === id)!;
    expect(byId('tm-1').battle_tag_verified_at).toBeTruthy();
    expect(byId('tm-1').verified_battle_net_id).toBe(BNET_ID);
    expect(byId('tm-2').battle_tag_verified_at).toBeTruthy();
    // mismatch + autre user : non estampillés
    expect(byId('tm-3').battle_tag_verified_at).toBeUndefined();
    expect(byId('tm-5').battle_tag_verified_at).toBeUndefined();
  });

  // Le trou qui laissait des fiches « BattleTag manquant » alors que Blizzard
  // venait de prouver le tag (observé sur Chocomates et Team Positivité).
  it('REMPLIT une fiche jouante sans tag avec le tag prouvé, et l’estampille', async () => {
    store.team_members = [
      { id: 'tm-vide', user_id: USER_A, role: 'player', battle_tag: null },
      { id: 'tm-blanc', user_id: USER_A, role: 'substitute', battle_tag: '   ' },
    ];

    const r = await stampVerifiedTeamMembers(USER_A, BTAG, BNET_ID);
    expect(r.filledCount).toBe(2);
    expect(r.verifiedCount).toBe(0);
    // Une fiche vide n'est pas un mismatch : il n'y a rien qui diverge.
    expect(r.mismatchCount).toBe(0);

    const byId = (id: string) => store.team_members.find((m) => m.id === id)!;
    for (const id of ['tm-vide', 'tm-blanc']) {
      expect(byId(id).battle_tag).toBe(BTAG);
      expect(byId(id).battle_tag_verified_at).toBeTruthy();
      expect(byId(id).verified_battle_net_id).toBe(BNET_ID);
    }
  });

  it('laisse l’encadrement sans tag tranquille', async () => {
    // Un coach n'a jamais à fournir de BattleTag : lui en écrire un serait une
    // donnée que personne n'a demandée.
    store.team_members = [
      { id: 'tm-coach', user_id: USER_A, role: 'coach', battle_tag: null },
      { id: 'tm-manager', user_id: USER_A, role: 'manager', battle_tag: null },
    ];

    const r = await stampVerifiedTeamMembers(USER_A, BTAG, BNET_ID);
    expect(r.filledCount).toBe(0);

    const byId = (id: string) => store.team_members.find((m) => m.id === id)!;
    expect(byId('tm-coach').battle_tag).toBeNull();
    expect(byId('tm-manager').battle_tag).toBeNull();
  });

  it('renvoie 0/0/0 quand le user n’a aucune ligne team_members', async () => {
    store.team_members = [];
    const r = await stampVerifiedTeamMembers(USER_A, BTAG, BNET_ID);
    expect(r).toEqual({ verifiedCount: 0, mismatchCount: 0, filledCount: 0 });
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

  it('aucune ligne de roster (staff non-joueuse) → ?battlenet=linked, pas un avertissement', async () => {
    configure();
    setCookieUser({ id: USER_A });
    // Un membre du staff peut n'être dans aucune équipe : le lien est valide,
    // le retour doit être un succès neutre et surtout PAS « ton tag ne
    // correspond à aucun roster ».
    store.team_members = [];

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

    const nonce = 'nonce-staff';
    const state = signBattlenetState({
      nonce,
      authUserId: USER_A,
      returnTo: '/admin?profile=1',
    });
    const handler = (await import('../../pages/api/auth/battlenet/callback'))
      .default;
    const res = makeRes();
    await handler(
      makeReq({ code: 'c', state }, { bn_oauth_state: nonce }),
      res
    );

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe('/admin?profile=1&battlenet=linked');
    // Le lien existe bien malgré l'absence de roster.
    expect(store.user_battlenet_links).toHaveLength(1);
    expect(store.user_battlenet_links[0].auth_user_id).toBe(USER_A);
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

/* -----------------------------------------------------------
 * Connexion Battle.net (comptes DÉJÀ liés)
 * ---------------------------------------------------------*/

describe('states login vs vérification : séparation de domaine', () => {
  const OLD = process.env.BLIZZARD_CLIENT_SECRET;
  beforeEach(() => {
    process.env.BLIZZARD_CLIENT_SECRET = 'test-client-secret';
  });
  afterEach(() => {
    process.env.BLIZZARD_CLIENT_SECRET = OLD;
  });

  it("un state de vérification n'est pas accepté comme state de connexion", () => {
    const verif = signBattlenetState({
      nonce: 'n',
      authUserId: USER_A,
      returnTo: '/player/profile',
    });
    expect(verifyBattlenetLoginState(verif)).toBeNull();
  });

  it("un state de connexion n'est pas accepté comme state de vérification", () => {
    const login = signBattlenetLoginState({ nonce: 'n', returnTo: '/player' });
    expect(verifyBattlenetState(login)).toBeNull();
  });

  it('un state de connexion signé avec une autre clé est rejeté', () => {
    process.env.BLIZZARD_CLIENT_SECRET = 'attacker-secret';
    const forged = signBattlenetLoginState({ nonce: 'n', returnTo: '/player' });
    process.env.BLIZZARD_CLIENT_SECRET = 'test-client-secret';
    expect(verifyBattlenetLoginState(forged)).toBeNull();
  });

  it('un state de connexion expiré est rejeté', () => {
    const old = signBattlenetLoginState({
      nonce: 'n',
      returnTo: '/player',
      issuedAt: Date.now() - 20 * 60 * 1000,
    });
    expect(verifyBattlenetLoginState(old)).toBeNull();
  });
});

describe('GET /api/auth/battlenet/login-start', () => {
  const OLD_SECRET = process.env.BLIZZARD_CLIENT_SECRET;

  function configure() {
    process.env.BLIZZARD_CLIENT_ID = 'test-client-id';
    process.env.BLIZZARD_CLIENT_SECRET = 'test-client-secret';
    process.env.BLIZZARD_REDIRECT_URI =
      'http://localhost:3000/api/auth/battlenet/callback';
    process.env.BLIZZARD_OAUTH_BASE = 'https://oauth.battle.net';
  }

  afterEach(() => {
    process.env.BLIZZARD_CLIENT_SECRET = OLD_SECRET;
  });

  it('dormant → 503', async () => {
    delete process.env.BLIZZARD_CLIENT_ID;
    delete process.env.BLIZZARD_CLIENT_SECRET;
    const handler = (await import('../../pages/api/auth/battlenet/login-start'))
      .default;
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(503);
    expect((res.body as any).code).toBe('BATTLENET_NOT_CONFIGURED');
  });

  it('302 vers Blizzard + cookie de nonce DISTINCT du flux vérification', async () => {
    configure();
    const handler = (await import('../../pages/api/auth/battlenet/login-start'))
      .default;
    const res = makeRes();
    await handler(makeReq({ returnTo: '/player/matches' }), res);

    expect(res.statusCode).toBe(302);
    expect(String(res.headers.Location)).toContain('oauth.battle.net');
    const cookie = String(res.headers['Set-Cookie']);
    expect(cookie).toContain('bn_login_state=');
    expect(cookie).not.toContain('bn_oauth_state=');
    expect(cookie).toContain('HttpOnly');
  });

  it("returnTo externe est ramené à un chemin interne", async () => {
    configure();
    const handler = (await import('../../pages/api/auth/battlenet/login-start'))
      .default;
    const res = makeRes();
    await handler(makeReq({ returnTo: '//evil.example.com' }), res);

    // Le returnTo vit dans le state signé : on le relit pour vérifier.
    const url = new URL(String(res.headers.Location));
    const state = url.searchParams.get('state');
    expect(verifyBattlenetLoginState(state)?.returnTo).toBe('/player');
  });
});

describe('GET /api/auth/battlenet/callback — branche connexion', () => {
  const OLD_SECRET = process.env.BLIZZARD_CLIENT_SECRET;

  function configure() {
    process.env.BLIZZARD_CLIENT_ID = 'test-client-id';
    process.env.BLIZZARD_CLIENT_SECRET = 'test-client-secret';
    process.env.BLIZZARD_REDIRECT_URI =
      'http://localhost:3000/api/auth/battlenet/callback';
    process.env.BLIZZARD_OAUTH_BASE = 'https://oauth.battle.net';
  }

  function mockBlizzard(battleNetId = BNET_ID) {
    return vi
      .spyOn(global, 'fetch' as any)
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
      )
      .mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({ sub: battleNetId, battletag: BTAG }),
            { status: 200 }
          )
      );
  }

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.BLIZZARD_CLIENT_SECRET = OLD_SECRET;
  });

  it('compte lié → magic-link vers /auth/battlenet, sans session préalable', async () => {
    configure();
    // Aucun setCookieUser : la connexion est anonyme par définition.
    store.user_battlenet_links = [
      {
        auth_user_id: USER_A,
        battle_net_id: BNET_ID,
        battle_tag: BTAG,
        verified_at: '2026-07-01T00:00:00.000Z',
      },
    ];
    setAdminUser(USER_A, 'tracer@example.com');
    setGenerateLinkResult({
      data: { properties: { hashed_token: 'login-token-hash' } },
      error: null,
    });
    mockBlizzard();

    const nonce = 'login-nonce';
    const state = signBattlenetLoginState({ nonce, returnTo: '/player' });
    const handler = (await import('../../pages/api/auth/battlenet/callback'))
      .default;
    const res = makeRes();
    await handler(
      makeReq({ code: 'auth-code', state }, { bn_login_state: nonce }),
      res
    );

    expect(res.statusCode).toBe(302);
    const loc = String(res.headers.Location);
    expect(loc).toContain('/auth/battlenet?token_hash=login-token-hash');
    expect(loc).toContain('type=magiclink');
    expect(loc).toContain(`next=${encodeURIComponent('/player')}`);
  });

  it('compte Blizzard inconnu → ?battlenet=not_linked et AUCUNE création', async () => {
    configure();
    store.user_battlenet_links = [];
    mockBlizzard('9999999');

    const nonce = 'login-nonce-2';
    const state = signBattlenetLoginState({ nonce, returnTo: '/player' });
    const handler = (await import('../../pages/api/auth/battlenet/callback'))
      .default;
    const res = makeRes();
    await handler(
      makeReq({ code: 'auth-code', state }, { bn_login_state: nonce }),
      res
    );

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe('/login?battlenet=not_linked');
    // Le point crucial : on ne fabrique pas de compte ni de lien.
    expect(store.user_battlenet_links).toHaveLength(0);
  });

  it('nonce cookie absent ou différent → error (double-submit CSRF)', async () => {
    configure();
    const state = signBattlenetLoginState({
      nonce: 'expected',
      returnTo: '/player',
    });
    const handler = (await import('../../pages/api/auth/battlenet/callback'))
      .default;

    const noCookie = makeRes();
    await handler(makeReq({ code: 'c', state }), noCookie);
    expect(noCookie.headers.Location).toBe('/login?battlenet=error');

    const wrongCookie = makeRes();
    await handler(
      makeReq({ code: 'c', state }, { bn_login_state: 'other' }),
      wrongCookie
    );
    expect(wrongCookie.headers.Location).toBe('/login?battlenet=error');
  });

  it('compte lié mais sans email → error (pas de session bricolée)', async () => {
    configure();
    store.user_battlenet_links = [
      { auth_user_id: USER_B, battle_net_id: BNET_ID, battle_tag: BTAG },
    ];
    setAdminUser(USER_B, null);
    mockBlizzard();

    const nonce = 'login-nonce-3';
    const state = signBattlenetLoginState({ nonce, returnTo: '/player' });
    const handler = (await import('../../pages/api/auth/battlenet/callback'))
      .default;
    const res = makeRes();
    await handler(
      makeReq({ code: 'auth-code', state }, { bn_login_state: nonce }),
      res
    );
    expect(res.headers.Location).toBe('/login?battlenet=error');
  });

  it('refus de consentement Blizzard → error', async () => {
    configure();
    const nonce = 'login-nonce-4';
    const state = signBattlenetLoginState({ nonce, returnTo: '/player' });
    const handler = (await import('../../pages/api/auth/battlenet/callback'))
      .default;
    const res = makeRes();
    await handler(
      makeReq({ error: 'access_denied', state }, { bn_login_state: nonce }),
      res
    );
    expect(res.headers.Location).toBe('/login?battlenet=error');
  });
});

describe('GET /api/auth/battlenet/available', () => {
  const OLD_ID = process.env.BLIZZARD_CLIENT_ID;
  const OLD_SECRET = process.env.BLIZZARD_CLIENT_SECRET;
  afterEach(() => {
    if (OLD_ID) process.env.BLIZZARD_CLIENT_ID = OLD_ID;
    if (OLD_SECRET) process.env.BLIZZARD_CLIENT_SECRET = OLD_SECRET;
  });

  it('reflète la configuration sans rien divulguer de plus', async () => {
    const handler = (await import('../../pages/api/auth/battlenet/available'))
      .default;

    delete process.env.BLIZZARD_CLIENT_ID;
    delete process.env.BLIZZARD_CLIENT_SECRET;
    const off = makeRes();
    await handler(makeReq(), off);
    expect(off.statusCode).toBe(200);
    expect(off.body).toEqual({ configured: false });

    process.env.BLIZZARD_CLIENT_ID = 'id';
    process.env.BLIZZARD_CLIENT_SECRET = 'secret';
    const on = makeRes();
    await handler(makeReq(), on);
    expect(on.body).toEqual({ configured: true });
  });
});
