// tests/unit/adminHttp.test.ts — requête admin hors composant (lot L10).

import { describe, it, expect, beforeEach, vi } from 'vitest';

// `vi.mock` est remonté en tête de fichier : ce qu'il capture doit l'être aussi.
const { session, replace, router } = vi.hoisted(() => ({
  session: {
    value: { access_token: 'tok-1' } as { access_token: string } | null,
  },
  replace: vi.fn(async (_path: string) => true),
  router: { asPath: undefined as string | undefined },
}));
vi.mock('@/utils/supabaseBrowser', () => ({
  supabaseClient: {
    auth: {
      getSession: async () => ({ data: { session: session.value } }),
    },
  },
}));
vi.mock('next/router', () => ({
  default: {
    replace,
    get asPath() {
      return router.asPath;
    },
  },
}));

import {
  adminRequest,
  AdminHttpError,
  adminErrorMessage,
} from '../../utils/admin/adminHttp';

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
  session.value = { access_token: 'tok-1' };
  replace.mockClear();
});

describe('adminRequest', () => {
  it('envoie le Bearer de la session et rend le corps typé', async () => {
    respond(200, { items: [1, 2] });
    const out = await adminRequest<{ items: number[] }>('/api/admin/x');
    expect(out.items).toEqual([1, 2]);
    const h = new Headers(calls[0].init.headers);
    expect(h.get('Authorization')).toBe('Bearer tok-1');
    expect(h.has('Idempotency-Key')).toBe(false);
  });

  it('sérialise json et pose une Idempotency-Key fraîche sur une mutation', async () => {
    respond(200, { ok: 1 });
    await adminRequest('/api/admin/x', {
      method: 'POST',
      json: { a: 1 },
      idempotent: true,
    });
    await adminRequest('/api/admin/x', {
      method: 'POST',
      json: { a: 1 },
      idempotent: true,
    });
    const k1 = new Headers(calls[0].init.headers).get('Idempotency-Key');
    const k2 = new Headers(calls[1].init.headers).get('Idempotency-Key');
    expect(k1).toBeTruthy();
    expect(k1).not.toBe(k2);
    expect(calls[0].init.body).toBe('{"a":1}');
    expect(new Headers(calls[0].init.headers).get('Content-Type')).toBe(
      'application/json'
    );
  });

  it('lit l’erreur typée de defineAdminRoute', async () => {
    respond(400, {
      error: 'Nom trop court.',
      code: 'validation',
      fields: { name: 'Nom trop court.' },
      requestId: 'abcdef12-3456',
    });
    const err = (await adminRequest('/api/admin/x').catch(
      (e) => e
    )) as AdminHttpError;
    expect(err).toBeInstanceOf(AdminHttpError);
    expect(err.status).toBe(400);
    expect(err.code).toBe('validation');
    expect(err.fields).toEqual({ name: 'Nom trop court.' });
    expect(adminErrorMessage(err, 'Échec.')).toBe('Échec. (réf. abcdef12)');
  });

  it('tolère une erreur historique sans code', async () => {
    respond(500, { error: 'Erreur serveur' });
    const err = (await adminRequest('/api/admin/x').catch(
      (e) => e
    )) as AdminHttpError;
    expect(err.code).toBeNull();
    expect(adminErrorMessage(err, 'Échec.')).toBe('Échec.');
  });

  it('redirige vers la connexion sur 401, sauf demande contraire', async () => {
    respond(401, { error: 'Non authentifié' });
    await adminRequest('/api/admin/x').catch(() => {});
    expect(replace).toHaveBeenCalledWith('/admin/login');

    replace.mockClear();
    await adminRequest('/api/admin/x', { skipAuthRedirect: true }).catch(
      () => {}
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('401 : la connexion ramène sur la page courante (?next=)', async () => {
    router.asPath = '/admin/news/7';
    respond(401, { error: 'Non authentifié' });
    await adminRequest('/api/admin/x').catch(() => {});
    expect(replace).toHaveBeenCalledWith(
      `/admin/login?next=${encodeURIComponent('/admin/news/7')}`
    );
    router.asPath = undefined;
  });

  it('échoue sans session, sans appeler le réseau', async () => {
    session.value = null;
    respond(200, {});
    await expect(adminRequest('/api/admin/x')).rejects.toMatchObject({
      status: 401,
    });
    expect(calls).toHaveLength(0);
  });
});
