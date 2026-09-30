// tests/unit/defineSubjectRoute.test.ts — la route déclarative côté sujet
// (lot P3, docs/PLAN-industrialisation-joueur.md).
//
// Critères du lot : 405 + Allow, `?as=` refusé si `subject: 'self'`, écriture
// act-as refusée sans double clé, permission d'équipe tenant-scopée (surcharges
// J3 comprises), zod → 400 `fields`, idempotence.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as z from 'zod';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async (_params?: any) => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '../../utils/player/defineSubjectRoute';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const STAFF_USER = '22222222-2222-4222-8222-222222222222';
const PLAYER = '33333333-3333-4333-8333-333333333333';
const TARGET = '44444444-4444-4444-8444-444444444444';
const TEAM_A = '66666666-6666-4666-8666-666666666666';
const TEAM_B = '77777777-7777-4777-8777-777777777777';

let n = 0;
function makeReq(over: Partial<any> = {}, auth = true): any {
  n += 1;
  const headers: Record<string, string> = {
    host: 'h',
    ...(over.headers ?? {}),
  };
  if (auth) headers.authorization = `Bearer t-subject-${n}`;
  return {
    method: 'GET',
    url: '/api/test',
    cookies: { staff_active_tenant_id: TENANT_A },
    query: {},
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...over,
    headers,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => res;
  return res;
}

async function call(route: any, over: Partial<any> = {}, auth = true) {
  const res = makeRes();
  await route(makeReq(over, auth), res);
  return res;
}

function seedStaff() {
  store.staff = [
    {
      id: STAFF_ID,
      auth_user_id: STAFF_USER,
      email: 'admin@example.com',
      role: 'admin',
      display_name: 'Adminette',
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
    } as StaffMember,
  ] as any;
  store.tenants = [
    { id: TENANT_A, slug: 'alpha', name: 'Alpha', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: STAFF_ID, role: 'admin' },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: PLAYER });
});

describe('defineSubjectRoute — méthodes et authentification', () => {
  const route = defineSubjectRoute({
    key: 'test-methods',
    GET: readSubject({ handler: () => ({ ok: true }) }),
  });

  it('405 + Allow sur une méthode non déclarée, avant toute auth', async () => {
    const res = await call(route, { method: 'DELETE' }, false);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
    expect(res.body).toMatchObject({ code: 'method_not_allowed' });
    expect(res.body.requestId).toBeTruthy();
  });

  it('401 sans jeton Bearer, au format d’erreur typé', async () => {
    const res = await call(route, {}, false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({
      error: 'Token required.',
      code: 'unauthenticated',
    });
  });

  it('expose ses métadonnées (matrice, OpenAPI)', () => {
    expect(route.subjectRoute.methods.GET).toMatchObject({
      subject: 'self',
      team: null,
      actAs: false,
      idempotent: false,
    });
  });
});

describe('defineSubjectRoute — sujet', () => {
  it("'self' : ?as=<autre> est refusé (et non ignoré)", async () => {
    const handler = vi.fn(() => ({ ok: true }));
    const route = defineSubjectRoute({
      key: 'test-self',
      GET: readSubject({ handler }),
    });
    const res = await call(route, { query: { as: TARGET } });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'subject_unsupported' });
    expect(handler).not.toHaveBeenCalled();
  });

  it("'self' : ?as=<moi> reste l'appelant", async () => {
    const route = defineSubjectRoute({
      key: 'test-self-me',
      GET: readSubject({ handler: ({ ctx }) => ({ id: ctx.subject.userId }) }),
    });
    const res = await call(route, { query: { as: PLAYER } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: PLAYER });
  });

  it("'follow' : le staff inspecte en lecture, réponse no-store, journal", async () => {
    setAuthUser({ id: STAFF_USER });
    seedStaff();
    setAdminUser(TARGET, 'cible@example.com');
    const route = defineSubjectRoute({
      key: 'test-follow',
      GET: readSubject({
        subject: 'follow',
        cache: false,
        handler: ({ ctx, res }) => {
          res.setHeader('Cache-Control', 'private, max-age=60');
          return { id: ctx.subject.userId, tenant: ctx.tenantId };
        },
      }),
    });
    const res = await call(route, { query: { as: TARGET } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: TARGET, tenant: TENANT_A });
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(logStaffActionMock.mock.calls[0]?.[0]).toMatchObject({
      action: 'view_player_data',
      entity_id: TARGET,
    });
  });

  it("'follow' : un non-staff ne peut pas inspecter", async () => {
    const route = defineSubjectRoute({
      key: 'test-follow-denied',
      GET: readSubject({ subject: 'follow', handler: () => ({ ok: true }) }),
    });
    const res = await call(route, { query: { as: TARGET } });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'subject_forbidden' });
  });

  it('écriture act-as : refusée sans la déclaration de route', async () => {
    setAuthUser({ id: STAFF_USER });
    seedStaff();
    setAdminUser(TARGET, 'cible@example.com');
    const handler = vi.fn(() => ({ ok: true }));
    const route = defineSubjectRoute({
      key: 'test-no-actas',
      POST: mutateSubject({ subject: 'follow', handler }),
    });
    const res = await call(route, {
      method: 'POST',
      query: { as: TARGET, act: '1' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'subject_read_only' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('écriture act-as : refusée sans la demande de l’appelant, acceptée avec', async () => {
    setAuthUser({ id: STAFF_USER });
    seedStaff();
    setAdminUser(TARGET, 'cible@example.com');
    const handler = vi.fn(({ ctx }: any) => ({
      id: ctx.subject.userId,
      acting: ctx.subject.isActingAs,
    }));
    const route = defineSubjectRoute({
      key: 'test-actas',
      POST: mutateSubject({ subject: 'follow', actAs: true, handler }),
    });

    const refused = await call(route, {
      method: 'POST',
      query: { as: TARGET },
    });
    expect(refused.statusCode).toBe(403);
    expect(refused.body).toMatchObject({ code: 'subject_read_only' });
    expect(handler).not.toHaveBeenCalled();

    const ok = await call(route, {
      method: 'POST',
      query: { as: TARGET, act: '1' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toEqual({ id: TARGET, acting: true });
    expect(logStaffActionMock.mock.calls.at(-1)?.[0]).toMatchObject({
      action: 'act_as_player',
      payload: expect.objectContaining({ method: 'POST' }),
    });
  });

  it("actAs sans subject 'follow' ne se déclare pas", () => {
    expect(() =>
      defineSubjectRoute({
        key: 'test-bad',
        POST: mutateSubject({ actAs: true, handler: () => null }),
      })
    ).toThrow(/actAs exige subject: 'follow'/);
  });
});

describe('defineSubjectRoute — équipe', () => {
  const route = defineSubjectRoute({
    key: 'test-team',
    tenantResolution: 'async',
    POST: mutateSubject({
      team: { permission: 'manage_scrims' },
      handler: ({ ctx }) => ({ teamId: ctx.team.teamId }),
    }),
  });

  function seedPlayerInTenantA() {
    // Membre simple de TEAM_A (tenant A) ; capitaine de TEAM_B, tenant B.
    store.team_members = [
      {
        id: 'tm1',
        team_id: TEAM_A,
        tenant_id: TENANT_A,
        user_id: PLAYER,
        role: 'player',
      },
    ] as any;
    store.teams = [
      { id: TEAM_A, tenant_id: TENANT_A, name: 'A', captain_id: null },
      { id: TEAM_B, tenant_id: TENANT_B, name: 'B', captain_id: PLAYER },
    ] as any;
  }

  it('refuse sans droit sur une équipe du tenant', async () => {
    seedPlayerInTenantA();
    const res = await call(route, { method: 'POST' });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden' });
  });

  it('ne sort pas du tenant du sujet, même avec ?teamId= d’une équipe capitainée ailleurs', async () => {
    seedPlayerInTenantA();
    const res = await call(route, {
      method: 'POST',
      query: { teamId: TEAM_B },
    });
    expect(res.statusCode).toBe(403);
  });

  it('honore une surcharge par membre (J3) sur la permission exigée', async () => {
    seedPlayerInTenantA();
    (store as any).team_member_permissions = [
      {
        team_id: TEAM_A,
        tenant_id: TENANT_A,
        user_id: PLAYER,
        permission: 'manage_scrims',
      },
    ];
    const res = await call(route, { method: 'POST' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ teamId: TEAM_A });
  });

  it('une autre permission ne suffit pas (message de la permission manquante)', async () => {
    seedPlayerInTenantA();
    (store as any).team_member_permissions = [
      {
        team_id: TEAM_A,
        tenant_id: TENANT_A,
        user_id: PLAYER,
        permission: 'manage_roster',
      },
    ];
    const res = await call(route, { method: 'POST' });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/scrims/);
  });
});

describe('defineSubjectRoute — validation et idempotence', () => {
  it('zod → 400 + fields', async () => {
    const route = defineSubjectRoute({
      key: 'test-zod',
      POST: mutateSubject({
        body: z.object({ open: z.boolean() }),
        handler: ({ body }) => body,
      }),
    });
    const res = await call(route, { method: 'POST', body: { open: 'oui' } });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'validation' });
    expect(res.body.fields).toHaveProperty('open');
  });

  it('rejoue une mutation déjà faite avec la même clé', async () => {
    let runs = 0;
    const route = defineSubjectRoute({
      key: 'test-idem',
      POST: mutateSubject({
        handler: () => {
          runs += 1;
          return { runs };
        },
      }),
    });
    const headers = { 'idempotency-key': 'k-subject-123' };
    const a = await call(route, { method: 'POST', headers, body: { x: 1 } });
    await new Promise((r) => setTimeout(r, 10));
    const b = await call(route, { method: 'POST', headers, body: { x: 1 } });
    expect(a.body).toEqual({ runs: 1 });
    expect(b.body).toEqual({ runs: 1 });
    expect(b.headers['Idempotency-Replay']).toBe('true');
    expect(runs).toBe(1);
  });
});
