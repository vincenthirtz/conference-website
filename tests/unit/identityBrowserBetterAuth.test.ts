// @vitest-environment happy-dom
//
// La porte du navigateur côté Better Auth (lot 7 de docs/AUTH-BETTER-AUTH.md) : l'interrupteur
// et sa mémoire, la forme Supabase des réponses, le jeton gardé puis renouvelé, le code demandé
// après le mot de passe, et ce qui n'est pas encore pris en charge.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseAuth } = vi.hoisted(() => ({
  supabaseAuth: {
    getSession: vi.fn(async () => ({
      data: { session: 'supabase' },
      error: null,
    })),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe() {} } },
    })),
    mfa: {},
  },
}));

vi.mock('../../utils/supabaseBrowser', () => ({
  supabaseClient: { auth: supabaseAuth },
}));

import {
  AUTH_BACKEND_STORAGE_KEY,
  currentAuthBackend,
  pickAuthBackend,
} from '../../utils/authBackend';
import { identityBrowser } from '../../utils/identityBrowser';

const b64 = (value: object) =>
  btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const jwt = (exp: number) => `${b64({ alg: 'ES256' })}.${b64({ exp })}.sig`;

const USER = {
  id: 'u1',
  email: 'essai@example.com',
  emailVerified: true,
  createdAt: '2026-11-02T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
  twoFactorEnabled: true,
  metadata: { role: 'player', battle_tag: 'Essai#1234' },
};

type Route = (body: unknown) => { status?: number; json: unknown };
let routes: Record<string, Route>;
let calls: { path: string; method: string; body: unknown }[];

function serve() {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace('/api/identity', '');
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ path, method: init?.method ?? 'GET', body });
      const route = routes[path];
      if (!route) return new Response('null', { status: 404 });
      const { status = 200, json } = route(body);
      return new Response(JSON.stringify(json), { status });
    })
  );
}

const exp = () => Math.floor(Date.now() / 1000) + 300;

beforeEach(async () => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/?auth=better-auth');
  routes = {
    '/get-session': () => ({
      json: { session: { expiresAt: '2026-12-02', aal: 'aal2' }, user: USER },
    }),
    '/token': () => ({ json: { token: jwt(exp()) } }),
    '/sign-out': () => ({ json: { success: true } }),
  };
  serve();
  // Une session déjà fermée d'un test précédent : on repart d'un jeton vide.
  await identityBrowser.signOut();
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('l’interrupteur', () => {
  it.each([
    [undefined, null, null, 'supabase'],
    ['better-auth', null, null, 'better-auth'],
    [undefined, 'better', null, 'better-auth'],
    ['better-auth', 'supabase', null, 'supabase'],
    [undefined, null, 'better-auth', 'better-auth'],
    [undefined, 'n-importe', 'supabase', 'supabase'],
  ] as const)(
    'configuration %s, adresse %s, mémoire %s → %s',
    (env, override, stored, expected) => {
      expect(pickAuthBackend(env, override, stored)).toBe(expected);
    }
  );

  it('se souvient du choix de l’adresse, d’une page à l’autre', () => {
    window.history.replaceState(null, '', '/login?auth=better-auth');
    expect(currentAuthBackend()).toBe('better-auth');
    window.history.replaceState(null, '', '/player');
    expect(currentAuthBackend()).toBe('better-auth');
    window.history.replaceState(null, '', '/player?auth=supabase');
    expect(currentAuthBackend()).toBe('supabase');
    window.history.replaceState(null, '', '/admin');
    expect(currentAuthBackend()).toBe('supabase');
    expect(window.localStorage.getItem(AUTH_BACKEND_STORAGE_KEY)).toBe(
      'supabase'
    );
  });
});

describe('la porte, côté Better Auth', () => {
  it('une session sous la forme de Supabase, avec le profil et un jeton', async () => {
    const { data, error } = await identityBrowser.getSession();
    expect(error).toBeNull();
    expect(supabaseAuth.getSession).not.toHaveBeenCalled();
    expect(data.session?.user.id).toBe('u1');
    expect(data.session?.user.user_metadata).toEqual(USER.metadata);
    expect(data.session?.access_token.split('.')).toHaveLength(3);
    expect(data.session?.expires_at).toBeGreaterThan(Date.now() / 1000);
  });

  it('garde le jeton : une seconde lecture ne le redemande pas', async () => {
    await identityBrowser.getSession();
    await identityBrowser.getSession();
    expect(calls.filter((c) => c.path === '/token')).toHaveLength(1);
  });

  it('pas de session : null, sans erreur, et pas de jeton demandé', async () => {
    routes['/get-session'] = () => ({ json: null });
    const { data, error } = await identityBrowser.getSession();
    expect(data.session).toBeNull();
    expect(error).toBeNull();
    expect(calls.some((c) => c.path === '/token')).toBe(false);
  });

  it('connexion d’un compte protégé : le code d’abord, puis la session', async () => {
    routes['/sign-in/email'] = () => ({ json: { twoFactorRedirect: true } });
    const signedIn = vi.fn();
    const { data: sub } = identityBrowser.onAuthStateChange(signedIn);
    const first = await identityBrowser.signInWithPassword({
      email: 'essai@example.com',
      password: 'x',
    });
    expect((first as { twoFactorRequired?: boolean }).twoFactorRequired).toBe(
      true
    );
    expect(first.data.session).toBeNull();
    expect(signedIn).not.toHaveBeenCalled();

    routes['/two-factor/verify-totp'] = () => ({ json: { token: 'session' } });
    const second = await identityBrowser.verifyTwoFactorCode('123456');
    expect(second.error).toBeNull();
    expect(second.data.session?.user.id).toBe('u1');
    expect(signedIn).toHaveBeenCalledWith(
      'SIGNED_IN',
      expect.objectContaining({ access_token: expect.any(String) })
    );
    expect(
      calls.find((c) => c.path === '/two-factor/verify-totp')?.body
    ).toEqual({ code: '123456' });
    sub.subscription.unsubscribe();
  });

  it('un mauvais mot de passe ou un mauvais code : une erreur, pas de session', async () => {
    routes['/sign-in/email'] = () => ({
      status: 401,
      json: { message: 'Invalid email or password' },
    });
    const wrong = await identityBrowser.signInWithPassword({
      email: 'a@b.c',
      password: 'x',
    });
    expect(wrong.error?.status).toBe(401);
    routes['/two-factor/verify-totp'] = () => ({
      status: 401,
      json: { message: 'Invalid code' },
    });
    const code = await identityBrowser.verifyTwoFactorCode('000000');
    expect(code.error?.status).toBe(401);
    expect(code.data.session).toBeNull();
  });

  it('la déconnexion prévient les écrans, et une déconnexion partout ferme les autres sessions', async () => {
    routes['/revoke-sessions'] = () => ({ json: { status: true } });
    const listener = vi.fn();
    const { data: sub } = identityBrowser.onAuthStateChange(listener);
    await identityBrowser.signOut({ scope: 'global' });
    expect(calls.map((c) => c.path)).toEqual(['/revoke-sessions', '/sign-out']);
    expect(
      calls.every((c) => c.method === 'POST' && c.body !== undefined)
    ).toBe(true);
    expect(listener).toHaveBeenCalledWith('SIGNED_OUT', null);
    sub.subscription.unsubscribe();
  });

  it('Discord : l’aller vers Better Auth, avec la page de retour', async () => {
    routes['/sign-in/social'] = () => ({
      json: { url: 'https://discord.com/oauth2/authorize?x=1' },
    });
    const assign = vi.fn();
    vi.stubGlobal('location', {
      ...window.location,
      assign,
      href: 'https://owwomenscup.fr/login',
    });
    const { error } = await identityBrowser.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: 'https://owwomenscup.fr/auth/discord-member?next=%2Fadmin',
      },
    });
    expect(error).toBeNull();
    expect(calls.find((c) => c.path === '/sign-in/social')?.body).toEqual({
      provider: 'discord',
      callbackURL: 'https://owwomenscup.fr/auth/discord-member?next=%2Fadmin',
      errorCallbackURL:
        'https://owwomenscup.fr/auth/discord-member?next=%2Fadmin',
    });
    expect(assign).toHaveBeenCalledWith(
      'https://discord.com/oauth2/authorize?x=1'
    );
  });

  it('le retour de Discord : rien à échanger, la session est déjà là', async () => {
    const { data, error } =
      await identityBrowser.exchangeCodeForSession('code');
    expect(error).toBeNull();
    expect(data.session?.user.id).toBe('u1');
  });

  it('le niveau et le facteur viennent de la session', async () => {
    const aal = await identityBrowser.mfa.getAuthenticatorAssuranceLevel();
    expect(aal.data?.currentLevel).toBe('aal2');
    const factors = await identityBrowser.mfa.listFactors();
    expect(factors.data?.totp?.[0]?.status).toBe('verified');
  });

  it.each(['setSession', 'verifyOtp', 'updateUser'] as const)(
    '%s : pas encore, une erreur claire',
    async (name) => {
      const out = await (
        identityBrowser[name] as (
          ...a: unknown[]
        ) => Promise<{ error: { status?: number; message: string } | null }>
      )({});
      expect(out.error?.status).toBe(501);
      expect(out.error?.message).toContain('lot 7b');
    }
  );

  it('renouvelle le jeton avant sa fin, avec TOKEN_REFRESHED', async () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    const { data: sub } = identityBrowser.onAuthStateChange(listener);
    await identityBrowser.refreshSession();
    await vi.advanceTimersByTimeAsync(250_000);
    expect(listener).toHaveBeenCalledWith(
      'TOKEN_REFRESHED',
      expect.objectContaining({ access_token: expect.any(String) })
    );
    sub.subscription.unsubscribe();
  });
});

describe('la porte, côté Supabase', () => {
  it('sans interrupteur : Supabase, comme avant', async () => {
    window.history.replaceState(null, '', '/?auth=supabase');
    const { data } = await identityBrowser.getSession();
    expect(data.session).toBe('supabase');
    expect(supabaseAuth.getSession).toHaveBeenCalled();
  });
});
