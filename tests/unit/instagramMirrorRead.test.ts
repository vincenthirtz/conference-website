// tests/unit/instagramMirrorRead.test.ts
//
// La lecture Instagram du miroir doit DIRE pourquoi elle échoue.
//
// Contexte (2026-09-11) : compte connecté, jeton valide jusqu'en novembre, et
// pourtant aucune publication Instagram n'est jamais arrivée sur le mur
// « Nos réseaux ». L'échec ne laissait qu'un warn dans les logs de la fonction
// Netlify ; un jeton indéchiffrable passait même pour « non configuré ». Ce que
// ces tests tiennent :
//   - un jeton présent mais illisible est une ERREUR, pas une absence ;
//   - le motif Meta est consigné sur le compte, sans jamais le jeton ;
//   - une liste vide se dit aussi ; un succès efface l'erreur de lecture.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { loadAccountMock, markReadErrorMock } = vi.hoisted(() => ({
  loadAccountMock: vi.fn(),
  markReadErrorMock: vi.fn(
    async (_tenantId: string, _message: string | null) => undefined
  ),
}));

vi.mock('@/utils/social/instagram', () => ({
  loadAccount: loadAccountMock,
  markReadError: markReadErrorMock,
}));

import {
  fetchOwnMedia,
  readInstagramForMirror,
} from '../../utils/social/instagramMirror';

const T = 'tenant-1';
const TOKEN = 'SECRET-TOKEN-NE-DOIT-PAS-FUIR';

function account(over: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    platform: 'instagram',
    externalAccountId: '17841400000000000',
    handle: 'womenscup_asso',
    accessToken: TOKEN,
    expiresAt: null,
    status: 'connected',
    lastError: null,
    tokenUnreadable: false,
    ...over,
  };
}

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(
    async (_url: string) =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
      })
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

const ONE_MEDIA = {
  data: [
    {
      id: '1',
      permalink: 'https://www.instagram.com/p/abc/',
      timestamp: '2026-09-10T10:00:00+0000',
      media_type: 'IMAGE',
      media_url: 'https://cdn.test/abc.jpg',
    },
  ],
};

beforeEach(() => {
  loadAccountMock.mockReset();
  markReadErrorMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchOwnMedia', () => {
  it('aucun compte → null (non configuré)', async () => {
    loadAccountMock.mockResolvedValue(null);
    await expect(fetchOwnMedia(T)).resolves.toBeNull();
  });

  it('jeton présent mais illisible → erreur explicite, pas « non configuré »', async () => {
    loadAccountMock.mockResolvedValue(
      account({ accessToken: null, tokenUnreadable: true })
    );
    await expect(fetchOwnMedia(T)).rejects.toThrow(/illisible/);
  });

  it('lit le compte par son identifiant explicite', async () => {
    loadAccountMock.mockResolvedValue(account());
    const f = stubFetch(200, { data: [] });
    await fetchOwnMedia(T);
    expect(String(f.mock.calls[0][0])).toContain('/17841400000000000/media?');
  });
});

describe('readInstagramForMirror', () => {
  it('consigne le motif Meta quand Instagram refuse — sans le jeton', async () => {
    loadAccountMock.mockResolvedValue(account());
    stubFetch(400, {
      error: {
        message: 'Unsupported get request.',
        type: 'IGApiException',
        code: 100,
      },
    });
    await expect(readInstagramForMirror(T)).rejects.toThrow(/HTTP 400/);
    expect(markReadErrorMock).toHaveBeenCalledTimes(1);
    const [tenant, msg] = markReadErrorMock.mock.calls[0];
    expect(tenant).toBe(T);
    expect(msg).toMatch(/Unsupported get request/);
    expect(msg).not.toContain(TOKEN);
  });

  it('consigne un jeton illisible', async () => {
    loadAccountMock.mockResolvedValue(
      account({ accessToken: null, tokenUnreadable: true })
    );
    await expect(readInstagramForMirror(T)).rejects.toThrow(/illisible/);
    expect(markReadErrorMock).toHaveBeenCalledWith(
      T,
      expect.stringMatching(/illisible/)
    );
  });

  it('une liste vide se dit : un compte muet n’aura jamais de carte', async () => {
    loadAccountMock.mockResolvedValue(account());
    stubFetch(200, { data: [] });
    await expect(readInstagramForMirror(T)).resolves.toEqual([]);
    expect(markReadErrorMock).toHaveBeenCalledWith(
      T,
      expect.stringMatching(/aucune publication/)
    );
  });

  it('un succès efface l’erreur de lecture', async () => {
    loadAccountMock.mockResolvedValue(account());
    stubFetch(200, ONE_MEDIA);
    const posts = await readInstagramForMirror(T);
    expect(posts).toHaveLength(1);
    expect(markReadErrorMock).toHaveBeenCalledWith(T, null);
  });

  it('non configuré → rien à consigner', async () => {
    loadAccountMock.mockResolvedValue(null);
    await expect(readInstagramForMirror(T)).resolves.toBeNull();
    expect(markReadErrorMock).not.toHaveBeenCalled();
  });
});
