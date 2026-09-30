// tests/unit/defineAdminRoute.test.ts — le socle des routes admin (lot L3).
//
// Ce que chaque route migrée obtient sans l'écrire : 405 + Allow, garde
// staff, validation zod → 400 + fields, erreurs typées, journal écrit
// seulement après un succès, idempotence par défaut sur les mutations,
// requestId dans l'en-tête et dans le corps d'erreur.

import { describe, it, expect, beforeEach } from 'vitest';
import * as z from 'zod';
import type { StaffMember } from '../../types/staff';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';
import {
  defineAdminRoute,
  mutate,
  read,
  RESPONSE_SENT,
} from '../../utils/admin/defineAdminRoute';
import {
  ConflictError,
  NotFoundError,
  PreconditionError,
} from '../../utils/admin/errors';

function staffRow(role: StaffMember['role']): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let tokenN = 0;
function makeReq(over: Record<string, unknown> = {}): any {
  tokenN += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-def-${tokenN}` },
    cookies: {},
    query: {},
    body: {},
    socket: { remoteAddress: `10.0.0.${tokenN % 250}` },
    ...over,
  };
}

function makeRes(): any {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
  };
}

async function call(route: any, over: Record<string, unknown> = {}) {
  const res = makeRes();
  await route(makeReq(over), res);
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateTenantAccessCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [staffRow('admin')] as any;
  (store as any).staff_logs = [];
});

describe('defineAdminRoute — aiguillage', () => {
  const route = defineAdminRoute({
    key: 'test-dispatch',
    guard: 'admin',
    GET: read({ handler: () => ({ hello: 'world' }) }),
    PATCH: mutate({ audit: false, handler: () => ({ patched: true }) }),
  });

  it('répond ce que le handler retourne, avec un X-Request-Id', async () => {
    const res = await call(route);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ hello: 'world' });
    expect(typeof res.headers['X-Request-Id']).toBe('string');
  });

  it('405 + Allow sur une méthode non déclarée, sans toucher à la garde', async () => {
    setAuthUser(null as any);
    const res = await call(route, { method: 'DELETE' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET,PATCH');
    expect(res.body.code).toBe('method_not_allowed');
  });

  it('reprend un x-request-id fourni par le proxy', async () => {
    const res = await call(route, {
      headers: {
        host: 'h',
        authorization: 'Bearer t-rid',
        'x-request-id': 'proxy-req-12345',
      },
    });
    expect(res.headers['X-Request-Id']).toBe('proxy-req-12345');
  });

  it('RESPONSE_SENT laisse le handler écrire lui-même', async () => {
    const raw = defineAdminRoute({
      key: 'test-raw',
      guard: 'admin',
      GET: read({
        handler: ({ res }) => {
          res.status(202).json({ custom: true });
          return RESPONSE_SENT;
        },
      }),
    });
    const res = await call(raw);
    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({ custom: true });
  });

  it('expose ses métadonnées (matrice de permissions, OpenAPI)', () => {
    expect(route.adminRoute.key).toBe('test-dispatch');
    expect(route.adminRoute.methods.GET).toMatchObject({
      guard: 'admin',
      audit: null,
      idempotent: false,
    });
    expect(route.adminRoute.methods.PATCH).toMatchObject({
      audit: false,
      idempotent: true,
    });
  });
});

describe('defineAdminRoute — garde', () => {
  const route = defineAdminRoute({
    key: 'test-guard',
    guard: { permission: 'manage_teams' },
    GET: read({ handler: () => ({ ok: 1 }) }),
    POST: mutate({
      guard: 'owner',
      audit: false,
      handler: () => ({ ok: 2 }),
    }),
  });

  it('401 codé sans authentification', async () => {
    setAuthUser(null as any);
    const res = await call(route);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('unauthenticated');
  });

  it('403 codé quand le rôle n’a pas la permission', async () => {
    store.staff = [staffRow('referee')] as any;
    const res = await call(route);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('forbidden');
    expect(typeof res.body.requestId).toBe('string');
  });

  it('une garde de méthode remplace celle de la route', async () => {
    const get = await call(route);
    expect(get.statusCode).toBe(200);
    const post = await call(route, { method: 'POST' });
    expect(post.statusCode).toBe(403);
  });

  it('refuse une mutation cross-origin (CSRF) sans Bearer', async () => {
    const res = await call(route, {
      method: 'POST',
      headers: { host: 'h', origin: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('defineAdminRoute — validation et erreurs', () => {
  let calls = 0;
  const route = defineAdminRoute({
    key: 'test-validate',
    guard: 'admin',
    GET: read({
      query: z.object({ id: z.string().min(3, { error: 'id trop court.' }) }),
      handler: ({ query }) => {
        calls += 1;
        if (query.id === 'missing') throw new NotFoundError('Pas là.');
        if (query.id === 'locked')
          throw new PreconditionError('Match résolu.', 'match_resolved');
        if (query.id === 'boom') throw new Error('secret interne');
        return { id: query.id };
      },
    }),
    POST: mutate({
      body: z.object({
        name: z.string().min(2, { error: 'Nom trop court.' }),
        seed: z.number().int(),
      }),
      audit: false,
      handler: ({ body }) => {
        if (body.name === 'dup') throw new ConflictError('Déjà pris.');
        return { created: body.name, seed: body.seed };
      },
    }),
  });

  beforeEach(() => {
    calls = 0;
  });

  it('400 validation avec le message métier et les champs, handler non appelé', async () => {
    const res = await call(route, { query: { id: 'a' } });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: 'id trop court.',
      code: 'validation',
      fields: { id: 'id trop court.' },
    });
    expect(calls).toBe(0);
  });

  it('le corps est validé et typé', async () => {
    const bad = await call(route, {
      method: 'POST',
      body: { name: 'x', seed: 'nope' },
    });
    expect(bad.statusCode).toBe(400);
    expect(Object.keys(bad.body.fields).sort()).toEqual(['name', 'seed']);

    const ok = await call(route, {
      method: 'POST',
      body: { name: 'Alpha', seed: 3 },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toEqual({ created: 'Alpha', seed: 3 });
  });

  it('traduit les erreurs typées (404, 409 + reason)', async () => {
    const nf = await call(route, { query: { id: 'missing' } });
    expect(nf.statusCode).toBe(404);
    expect(nf.body).toMatchObject({ error: 'Pas là.', code: 'not_found' });

    const pre = await call(route, { query: { id: 'locked' } });
    expect(pre.statusCode).toBe(409);
    expect(pre.body).toMatchObject({
      code: 'precondition',
      reason: 'match_resolved',
    });

    const conflict = await call(route, {
      method: 'POST',
      body: { name: 'dup', seed: 1 },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.body.code).toBe('conflict');
  });

  it('une exception inattendue devient un 500 générique, sans fuite du message', async () => {
    const res = await call(route, { query: { id: 'boom' } });
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('internal');
    expect(JSON.stringify(res.body)).not.toContain('secret interne');
    expect(res.body.requestId).toBe(res.headers['X-Request-Id']);
  });
});

describe('defineAdminRoute — journal', () => {
  const route = defineAdminRoute({
    key: 'test-audit',
    guard: 'admin',
    DELETE: mutate({
      query: z.object({ id: z.string() }),
      audit: 'delete_free_player',
      handler: ({ query, ctx }) => {
        ctx.audit({ entity_type: 'free_player', entity_id: query.id });
        if (query.id === 'fail') throw new NotFoundError();
        ctx.audit({ payload: { name: 'Alice' } });
        return { success: true };
      },
    }),
  });

  it('écrit l’entrée après un succès, détails fusionnés, tenant et staff remplis', async () => {
    const res = await call(route, { method: 'DELETE', query: { id: 'fp-1' } });
    expect(res.statusCode).toBe(200);
    const logs = (store as any).staff_logs;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      staff_id: 'staff-1',
      action: 'delete_free_player',
      entity_type: 'free_player',
      entity_id: 'fp-1',
      payload: { name: 'Alice' },
    });
    expect(typeof logs[0].tenant_id).toBe('string');
  });

  it('n’écrit rien quand le handler échoue', async () => {
    const res = await call(route, { method: 'DELETE', query: { id: 'fail' } });
    expect(res.statusCode).toBe(404);
    expect((store as any).staff_logs).toHaveLength(0);
  });
});

describe('defineAdminRoute — idempotence', () => {
  it('rejoue la réponse d’une mutation déjà faite avec la même clé', async () => {
    let runs = 0;
    const route = defineAdminRoute({
      key: 'test-idem',
      guard: 'admin',
      POST: mutate({
        audit: false,
        handler: () => {
          runs += 1;
          return { runs };
        },
      }),
    });
    const headers = {
      host: 'h',
      authorization: 'Bearer t-idem',
      'idempotency-key': 'k-123456789',
    };
    const a = await call(route, { method: 'POST', headers, body: { x: 1 } });
    // L'écriture du cache est asynchrone (fire-and-forget) : on la laisse finir.
    await new Promise((r) => setTimeout(r, 10));
    const b = await call(route, { method: 'POST', headers, body: { x: 1 } });
    expect(a.body).toEqual({ runs: 1 });
    expect(b.body).toEqual({ runs: 1 });
    expect(b.headers['Idempotency-Replay']).toBe('true');
    expect(runs).toBe(1);
  });

  it('idempotent: false exécute à chaque fois', async () => {
    let runs = 0;
    const route = defineAdminRoute({
      key: 'test-idem-off',
      guard: 'admin',
      POST: mutate({
        audit: false,
        idempotent: false,
        handler: () => {
          runs += 1;
          return { runs };
        },
      }),
    });
    const headers = {
      host: 'h',
      authorization: 'Bearer t-idem2',
      'idempotency-key': 'k-abcdefghi',
    };
    await call(route, { method: 'POST', headers });
    await call(route, { method: 'POST', headers });
    expect(runs).toBe(2);
  });
});
