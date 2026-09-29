// tests/unit/playerHttp.test.ts — client typé de l'espace joueuse (lot P5).

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { session, router } = vi.hoisted(() => ({
  session: {
    value: { access_token: 'tok-p' } as { access_token: string } | null,
  },
  router: {
    asPath: '/player/manage-team?teamId=t1' as string | undefined,
    replace: vi.fn(async (_path: string) => true),
  },
}));
vi.mock('@/utils/supabaseBrowser', () => ({
  supabaseClient: {
    auth: {
      getSession: async () => ({ data: { session: session.value } }),
    },
  },
}));
vi.mock('next/router', () => ({ default: router }));

import {
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
