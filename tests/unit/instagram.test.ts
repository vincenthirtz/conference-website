// Tests du socle Instagram (utils/social/instagram.ts).
//
// Ce qui compte ici :
//   - le `state` signé : une signature valable ne doit pas suffire si elle est
//     périmée, et une signature bricolée ne doit jamais passer ;
//   - l'attente du conteneur média. Publier un conteneur encore IN_PROGRESS
//     échoue, et l'échec est INTERMITTENT — il passe avec une petite image et
//     casse avec une grande. Sans test, personne ne couvre ce chemin.
//   - `requiresImage` : Instagram refuse un post sans visuel, et ce refus doit
//     tomber à l'aperçu, pas en pleine publication une fois le site déjà servi.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => ({ delivered: true, attempts: 1 })),
}));

import {
  buildAuthorizeUrl,
  publishImage,
  signState,
  verifyState,
  INSTAGRAM_SCOPES,
} from '../../utils/social/instagram';
import { resolveTarget } from '../../utils/social/socialPosts';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

beforeEach(() => {
  process.env.SECRETS_ENC_KEY = 'test-key-for-unit-tests';
  process.env.INSTAGRAM_APP_ID = '1746104713098525';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('state signé', () => {
  it('accepte un state qu’on vient d’émettre', () => {
    const payload = verifyState(signState(TENANT));
    expect(payload?.tenantId).toBe(TENANT);
  });

  it('refuse une signature bricolée', () => {
    const state = signState(TENANT);
    const [body] = state.split('.');
    expect(verifyState(`${body}.pasunesignature`)).toBeNull();
  });

  it('refuse un corps modifié, même avec l’ancienne signature', () => {
    const [, mac] = signState(TENANT).split('.');
    const forged = Buffer.from(
      JSON.stringify({ tenantId: 'autre', nonce: 'x', iat: Date.now() })
    ).toString('base64url');
    expect(verifyState(`${forged}.${mac}`)).toBeNull();
  });

  it('refuse un state périmé', () => {
    const state = signState(TENANT);
    // 11 minutes plus tard : au-delà du TTL de 10 min.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    expect(verifyState(state)).toBeNull();
  });

  it('refuse une entrée vide ou malformée', () => {
    expect(verifyState('')).toBeNull();
    expect(verifyState('sanspoint')).toBeNull();
  });
});

describe('buildAuthorizeUrl', () => {
  it('porte les scopes de publication et l’URI de redirection', () => {
    const url = new URL(buildAuthorizeUrl('abc'));
    expect(url.origin + url.pathname).toBe(
      'https://www.instagram.com/oauth/authorize'
    );
    expect(url.searchParams.get('scope')).toBe(INSTAGRAM_SCOPES.join(','));
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('abc');
    expect(url.searchParams.get('redirect_uri')).toContain(
      '/api/admin/instagram/callback'
    );
  });
});

/** Répond par la première entrée dont l'URL correspond au motif. */
function mockFetchSequence(
  routes: Array<{ match: RegExp; ok?: boolean; body: unknown }>
) {
  const calls: string[] = [];
  const queue = [...routes];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(String(url));
      const i = queue.findIndex((r) => r.match.test(String(url)));
      const route = i >= 0 ? queue.splice(i, 1)[0] : null;
      if (!route) throw new Error(`Appel non prévu : ${url}`);
      return {
        ok: route.ok ?? true,
        status: route.ok === false ? 400 : 200,
        text: async () => JSON.stringify(route.body),
      } as unknown as Response;
    })
  );
  return calls;
}

describe('publishImage', () => {
  const params = {
    igUserId: '178414',
    accessToken: 'tok',
    imageUrl: 'https://img.test/a.png',
    caption: 'Le J7 bouge',
  };

  it('crée le conteneur, attend FINISHED, puis publie', async () => {
    const calls = mockFetchSequence([
      { match: /\/media$/, body: { id: 'container-1' } },
      { match: /status_code/, body: { status_code: 'FINISHED' } },
      { match: /media_publish/, body: { id: 'media-9' } },
      { match: /permalink/, body: { permalink: 'https://instagr.am/p/9' } },
    ]);

    const out = await publishImage(params, async () => {});
    expect(out.mediaId).toBe('media-9');
    expect(out.permalink).toBe('https://instagr.am/p/9');
    // La vérification du statut a bien eu lieu AVANT la publication.
    const statusAt = calls.findIndex((c) => c.includes('status_code'));
    const publishAt = calls.findIndex((c) => c.includes('media_publish'));
    expect(statusAt).toBeGreaterThanOrEqual(0);
    expect(statusAt).toBeLessThan(publishAt);
  });

  it('patiente tant que le conteneur est IN_PROGRESS', async () => {
    mockFetchSequence([
      { match: /\/media$/, body: { id: 'container-1' } },
      { match: /status_code/, body: { status_code: 'IN_PROGRESS' } },
      { match: /status_code/, body: { status_code: 'FINISHED' } },
      { match: /media_publish/, body: { id: 'media-9' } },
      { match: /permalink/, body: { permalink: null } },
    ]);

    const out = await publishImage(params, async () => {});
    expect(out.mediaId).toBe('media-9');
  });

  it('ne publie PAS si le conteneur part en ERROR', async () => {
    const calls = mockFetchSequence([
      { match: /\/media$/, body: { id: 'container-1' } },
      { match: /status_code/, body: { status_code: 'ERROR' } },
    ]);

    await expect(publishImage(params, async () => {})).rejects.toThrow(
      /préparer l'image/
    );
    expect(calls.some((c) => c.includes('media_publish'))).toBe(false);
  });

  it('remonte le message de Meta quand le conteneur est refusé', async () => {
    mockFetchSequence([
      {
        match: /\/media$/,
        ok: false,
        body: { error: { message: 'Invalid image_url' } },
      },
    ]);

    await expect(publishImage(params, async () => {})).rejects.toThrow(
      /Invalid image_url/
    );
  });

  it('publie quand même si la lecture du permalien échoue', async () => {
    mockFetchSequence([
      { match: /\/media$/, body: { id: 'container-1' } },
      { match: /status_code/, body: { status_code: 'FINISHED' } },
      { match: /media_publish/, body: { id: 'media-9' } },
      { match: /permalink/, ok: false, body: { error: { message: 'nope' } } },
    ]);

    const out = await publishImage(params, async () => {});
    expect(out.mediaId).toBe('media-9');
    expect(out.permalink).toBeNull();
  });
});

describe('validation Instagram côté composeur', () => {
  it('refuse un post sans image, à l’aperçu', () => {
    const out = resolveTarget({ text: 'Le J7 bouge' }, { platform: 'instagram' });
    expect(out.error).toMatch(/image est obligatoire/);
  });

  it('accepte un post avec image', () => {
    const out = resolveTarget(
      { text: 'Le J7 bouge', imageUrl: 'https://img.test/a.png' },
      { platform: 'instagram' }
    );
    expect(out.error).toBeNull();
  });

  it('refuse une légende au-delà de 2 200 caractères', () => {
    const out = resolveTarget(
      { text: 'x'.repeat(2201), imageUrl: 'https://img.test/a.png' },
      { platform: 'instagram' }
    );
    expect(out.error).toMatch(/1 de trop/);
  });
});
