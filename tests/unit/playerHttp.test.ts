// tests/unit/playerHttp.test.ts — client typé de l'espace joueuse (lot P5).

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { session, router } = vi.hoisted(() => ({
  session: {
    value: { access_token: 'tok-p' } as { access_token: string } | null,
    /** La porte d'identité lève (session illisible, réseau). */
    throws: false,
  },
  router: {
    asPath: '/player/manage-team?teamId=t1' as string | undefined,
    replace: vi.fn(async (_path: string) => true),
  },
}));
vi.mock('@/utils/supabaseBrowser', () => ({
  supabaseClient: {
    auth: {
      getSession: async () => {
        if (session.throws) throw new Error('session illisible');
        return { data: { session: session.value } };
      },
    },
  },
}));
vi.mock('next/router', () => ({ default: router }));

import {
  playerBytesRequest,
  playerRequest,
  PlayerHttpError,
  playerErrorWithRef,
  scopedUrl,
  SELF_SCOPE,
} from '../../utils/player/playerHttp';
import { ApiHttpError } from '../../utils/http/authedRequest';
import { AdminHttpError } from '../../utils/admin/adminHttp';

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

function respond(status: number, body: unknown) {
  globalThis.fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  calls = [];
  session.value = { access_token: 'tok-p' };
  session.throws = false;
  router.asPath = '/player/manage-team?teamId=t1';
  router.replace.mockClear();
});

const SUBJECT = '4f1c2a7e-0b6d-4e3a-9c1f-2a3b4c5d6e7f';

describe('scopedUrl', () => {
  it('identité pour la joueuse elle-même, mono-équipe', () => {
    expect(scopedUrl('/api/player/x', SELF_SCOPE)).toBe('/api/player/x');
  });

  it('pose ?as= puis ?teamId=, comme withTeam(withSubject(url))', () => {
    expect(
      scopedUrl('/api/player/x', {
        subjectId: SUBJECT,
        actAs: false,
        teamId: 'team-1',
      })
    ).toBe(`/api/player/x?as=${SUBJECT}&teamId=team-1`);
  });

  it('act-as ajoute &act=1 juste après le sujet', () => {
    expect(
      scopedUrl('/api/teams/toggle-joinable', {
        subjectId: SUBJECT,
        actAs: true,
        teamId: null,
      })
    ).toBe(`/api/teams/toggle-joinable?as=${SUBJECT}&act=1`);
  });
});

describe('playerRequest', () => {
  it('Bearer de la session, portée suffixée, corps typé', async () => {
    respond(200, { rating: 1500 });
    const out = await playerRequest<{ rating: number }>(
      '/api/player/progression',
      { scope: { subjectId: SUBJECT, actAs: false, teamId: 't2' } }
    );
    expect(out.rating).toBe(1500);
    expect(calls[0].url).toBe(
      `/api/player/progression?as=${SUBJECT}&teamId=t2`
    );
    const h = new Headers(calls[0].init.headers);
    expect(h.get('Authorization')).toBe('Bearer tok-p');
    expect(h.has('Idempotency-Key')).toBe(false);
  });

  it('mutation : JSON + Idempotency-Key fraîche', async () => {
    respond(200, { ok: true });
    await playerRequest('/api/teams/toggle-scrim-open', {
      method: 'POST',
      json: { open: true },
      idempotent: true,
    });
    const h = new Headers(calls[0].init.headers);
    expect(h.get('Content-Type')).toBe('application/json');
    expect(h.get('Idempotency-Key')).toBeTruthy();
    expect(calls[0].init.body).toBe('{"open":true}');
  });

  it('erreur typée : code, fields, requestId ; base commune avec l’admin', async () => {
    respond(400, {
      error: 'Champ invalide',
      code: 'validation',
      fields: { open: 'booléen attendu' },
      requestId: 'abcdef123456',
    });
    const err = (await playerRequest('/api/x').catch(
      (e) => e
    )) as PlayerHttpError;
    expect(err).toBeInstanceOf(PlayerHttpError);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect(err).not.toBeInstanceOf(AdminHttpError);
    expect(err.message).toBe('Champ invalide');
    expect(err.code).toBe('validation');
    expect(err.fields).toEqual({ open: 'booléen attendu' });
    expect(playerErrorWithRef(err, 'Échec')).toBe('Échec (réf. abcdef12)');
  });

  it('401 → /login?next=<page courante>, sauf skipAuthRedirect', async () => {
    respond(401, { error: 'Non authentifié' });
    await playerRequest('/api/x').catch(() => {});
    expect(router.replace).toHaveBeenCalledWith(
      `/login?next=${encodeURIComponent('/player/manage-team?teamId=t1')}`
    );
    router.replace.mockClear();
    await playerRequest('/api/x', { skipAuthRedirect: true }).catch(() => {});
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('session absente : 401 sans requête', async () => {
    session.value = null;
    respond(200, {});
    const err = (await playerRequest('/api/x').catch(
      (e) => e
    )) as PlayerHttpError;
    expect(err).toBeInstanceOf(PlayerHttpError);
    expect(err.status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

describe('playerBytesRequest (réponse binaire : le PDF du règlement)', () => {
  const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
  function respondBytes(status = 200) {
    globalThis.fetch = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(PDF, {
        status,
        headers: { 'Content-Type': 'application/pdf' },
      });
    }) as unknown as typeof fetch;
  }

  it('même Bearer, même origine, même portée ; rend les octets', async () => {
    respondBytes();
    const out = await playerBytesRequest('/api/tournaments/t1/rules/file', {
      scope: { subjectId: null, actAs: false, teamId: 'team-1' },
    });
    expect(Array.from(out)).toEqual(Array.from(PDF));
    expect(calls[0].url).toBe('/api/tournaments/t1/rules/file?teamId=team-1');
    expect(calls[0].init.credentials).toBe('same-origin');
    expect(new Headers(calls[0].init.headers).get('Authorization')).toBe(
      'Bearer tok-p'
    );
  });

  it('erreur typée, corps JSON lu (404 d’un tournoi non public)', async () => {
    respond(404, { error: 'Introuvable', code: 'not_found', requestId: 'r-1' });
    const err = (await playerBytesRequest('/api/x', {
      skipAuthRedirect: true,
    }).catch((e) => e)) as PlayerHttpError;
    expect(err).toBeInstanceOf(PlayerHttpError);
    expect(err.status).toBe(404);
    expect(err.code).toBe('not_found');
  });

  it('sessionOptional : sans session, la requête part SANS Bearer (route publique)', async () => {
    session.value = null;
    respondBytes();
    const out = await playerBytesRequest('/api/x', { sessionOptional: true });
    expect(out.byteLength).toBe(PDF.byteLength);
    expect(calls).toHaveLength(1);
    expect(new Headers(calls[0].init.headers).has('Authorization')).toBe(false);
  });

  it('sessionOptional : une session illisible vaut « sans session »', async () => {
    session.throws = true;
    respondBytes();
    await playerBytesRequest('/api/x', { sessionOptional: true });
    expect(new Headers(calls[0].init.headers).has('Authorization')).toBe(false);
  });

  it('sans sessionOptional : 401 local sans requête, comme playerRequest', async () => {
    session.value = null;
    respondBytes();
    const err = (await playerBytesRequest('/api/x').catch(
      (e) => e
    )) as PlayerHttpError;
    expect(err.status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});
