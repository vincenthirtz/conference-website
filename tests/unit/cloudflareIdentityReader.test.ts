// tests/unit/cloudflareIdentityReader.test.ts
//
// Le lecteur de Better Auth du site (cloudflare/identityReader.ts) : il demande la session à
// l'API par la liaison, avec les en-têtes du relais, et ne prend jamais une réponse douteuse
// pour une personne. Puis la porte du site (utils/identity.ts) qui s'en sert. Lot 6 de
// docs/AUTH-BETTER-AUTH.md.

import { afterEach, describe, expect, it, vi } from 'vitest';

const { getUserById } = vi.hoisted(() => ({
  getUserById: vi.fn(async (id: string) => ({
    data: { user: { id } },
    error: null,
  })),
}));

vi.mock('@/utils/supabase', () => ({}));
vi.mock('../../utils/supabase', () => ({
  supabaseAdmin: { auth: { getUser: vi.fn(), admin: { getUserById } } },
  supabaseAnonServer: { auth: {} },
  getServerClient: vi.fn(() => ({ auth: { getUser: vi.fn() } })),
}));

import {
  bindIdentityReader,
  createIdentityReader,
  IDENTITY_BACKEND,
} from '../../cloudflare/identityReader';
import { userFromCookies, userFromToken } from '../../utils/identity';

const store = globalThis as unknown as Record<symbol, unknown>;
const CONTEXT = {
  origin: 'https://api.owwomenscup.fr',
  secret: 'secret-du-relais',
  clientIp: '203.0.113.5',
  host: 'owwomenscup.fr',
};
const SESSION = { id: 'u1', aal: 'aal2', accessToken: 'jeton' };

function binding(respond: () => Promise<Response>) {
  return {
    fetch: vi.fn(async (_url: string, _init?: RequestInit) => respond()),
  };
}

afterEach(() => {
  delete store[IDENTITY_BACKEND];
  vi.clearAllMocks();
});

describe('createIdentityReader', () => {
  it('demande la session à l’API, avec les en-têtes du relais', async () => {
    const api = binding(async () => Response.json(SESSION));
    const reader = createIdentityReader(api, CONTEXT);
    expect(
      await reader.sessionFromCookies('__Secure-owwc.session_token=v.s')
    ).toEqual(SESSION);
    const [url, init] = api.fetch.mock.calls[0];
    expect(url).toBe('https://api.owwomenscup.fr/api/identity-session');
    const headers = new Headers(init?.headers);
    expect(headers.get('cookie')).toBe('__Secure-owwc.session_token=v.s');
    expect(headers.get('x-owwc-edge')).toBe('secret-du-relais');
    expect(headers.get('x-owwc-host')).toBe('owwomenscup.fr');
    expect(headers.get('x-owwc-client-ip')).toBe('203.0.113.5');
  });

  it('passe le jeton en Bearer', async () => {
    const api = binding(async () => Response.json(SESSION));
    await createIdentityReader(api, CONTEXT).userFromToken('abc');
    expect(
      new Headers(api.fetch.mock.calls[0][1]?.headers).get('authorization')
    ).toBe('Bearer abc');
  });

  it.each([
    ['null', async () => Response.json(null)],
    ['une erreur', async () => new Response('oups', { status: 500 })],
    [
      'une forme inattendue',
      async () => Response.json({ id: '', aal: 'aal2' }),
    ],
    ['un niveau inconnu', async () => Response.json({ id: 'u1', aal: 'aal3' })],
    ['du texte', async () => new Response('pas du json')],
    ['une panne', async () => Promise.reject(new Error('liaison'))],
  ])('%s : personne', async (_name, respond) => {
    const reader = createIdentityReader(binding(respond), CONTEXT);
    expect(await reader.sessionFromCookies('c=1')).toBeNull();
  });
});

describe('bindIdentityReader', () => {
  it('posé avec la liaison et le secret, retiré sinon', () => {
    bindIdentityReader(
      binding(async () => Response.json(null)),
      CONTEXT
    );
    expect(store[IDENTITY_BACKEND]).toBeTruthy();
    bindIdentityReader(undefined, CONTEXT);
    expect(store[IDENTITY_BACKEND]).toBeUndefined();
    bindIdentityReader(
      binding(async () => Response.json(null)),
      { ...CONTEXT, secret: '' }
    );
    expect(store[IDENTITY_BACKEND]).toBeUndefined();
    bindIdentityReader(
      binding(async () => Response.json(null)),
      null
    );
    expect(store[IDENTITY_BACKEND]).toBeUndefined();
  });
});

describe('la porte du site avec ce lecteur', () => {
  const b64 = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${b64({ alg: 'ES256' })}.${b64({ iss: 'https://owwomenscup.fr/api/identity' })}.s`;

  it('un jeton Better Auth : la personne que l’API a vérifiée', async () => {
    bindIdentityReader(
      binding(async () => Response.json(SESSION)),
      CONTEXT
    );
    const out = await userFromToken(token);
    expect(getUserById).toHaveBeenCalledWith('u1');
    expect(out.data.user?.id).toBe('u1');
  });

  it('le cookie Better Auth du rendu serveur', async () => {
    bindIdentityReader(
      binding(async () => Response.json(SESSION)),
      CONTEXT
    );
    const out = await userFromCookies(
      { headers: { cookie: '__Secure-owwc.session_token=v.s' } } as never,
      {} as never
    );
    expect(out.data.user?.id).toBe('u1');
  });

  it('l’API ne reconnaît pas le jeton : refusé', async () => {
    bindIdentityReader(
      binding(async () => Response.json(null)),
      CONTEXT
    );
    const out = await userFromToken(token);
    expect(out.data.user).toBeNull();
    expect(out.error?.status).toBe(401);
    expect(getUserById).not.toHaveBeenCalled();
  });
});
