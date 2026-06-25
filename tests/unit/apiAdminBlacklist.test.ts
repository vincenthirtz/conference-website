// tests/unit/apiAdminBlacklist.test.ts
//
// Feature Blacklist joueurs — Lot 2 (endpoints admin staff, minRole 'manager').
// Ref: pages/api/admin/moderation/blacklist/{index,[id]}.ts.
//
// index.ts (GET / POST):
//   - POST 400 quand aucun identifiant fourni.
//   - POST normalise le battle_tag (lowercase + trim) à l'écriture.
//   - POST stampe banned_by = auth user id + tenant_id = tenant courant.
//   - POST appelle logStaffAction('blacklist_add').
//   - GET scope par tenant (entrée d'un autre tenant absente) + filtre active.
//   - Auth : rôle < manager (caster) → 403.
//
// [id].ts (PATCH / DELETE):
//   - PATCH toggle active → met à jour + logStaffAction('blacklist_update').
//   - DELETE → supprime + logStaffAction('blacklist_remove').
//   - Cross-tenant : PATCH/DELETE sur une entrée d'un AUTRE tenant → 404.
//
// NOTE mock : le filtre `search` du GET passe par `.or(...)` qui est un no-op
// dans le mock supabase en mémoire (cf. supabaseMock.Builder.or). On ne teste
// donc PAS le matching texte de `search` ici (il n'y a aucun moyen fiable de
// l'exercer sans réimplémenter PostgREST). Le scope tenant et le filtre
// `active` reposent sur `.eq(...)` qui est, lui, réellement implémenté.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

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
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import listHandler from '../../pages/api/admin/moderation/blacklist/index';
import idHandler from '../../pages/api/admin/moderation/blacklist/[id]';

/* -----------------------------------------------------------
 * Constants
 * ---------------------------------------------------------*/

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_USER_ID = 'user-mgr-1';
const ENTRY_A = '22222222-2222-4222-8222-2222222222aa';
const ENTRY_B = '22222222-2222-4222-8222-2222222222bb';
const ENTRY_OTHER = '22222222-2222-4222-8222-2222222222cc';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'manager'
): StaffMember {
  return {
    id: STAFF_ID,
    auth_user_id: AUTH_USER_ID,
    email: 'mgr@example.com',
    role,
    display_name: 'Manager',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    is_pole_admin: false,
  } as StaffMember;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: 'Bearer t-mgr' },
    cookies: { staff_active_tenant_id: TENANT_A },
    query: {},
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
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
    end() {
      return this;
    },
  };
}

function seedStaff(role: 'owner' | 'admin' | 'manager' | 'caster' = 'manager') {
  store.staff = [makeStaffRow(role)] as any;
  store.tenants = [
    { id: TENANT_A, slug: 'alpha', name: 'Alpha', is_active: true },
    { id: TENANT_B, slug: 'beta', name: 'Beta', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: STAFF_ID, role: 'manager' },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: AUTH_USER_ID });
  seedStaff('manager');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ===========================================================================
 * POST /api/admin/moderation/blacklist
 * =========================================================================*/

describe('POST /api/admin/moderation/blacklist', () => {
  it('400 quand aucun identifiant fourni', async () => {
    const res = makeRes();
    await listHandler(
      makeReq({ method: 'POST', body: { reason: 'tricheur' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toBeTruthy();
  });

  it('201 + battle_tag normalisé lowercase/trim à l’écriture', async () => {
    store.player_blacklist = [];
    const res = makeRes();
    await listHandler(
      makeReq({
        method: 'POST',
        body: { battle_tag: '  Smurf#1234  ', reason: 'smurf' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const created = res.body as any;
    expect(created.battle_tag).toBe('smurf#1234');
    // Persisté tel quel dans le store.
    const row = (store.player_blacklist as any[]).find(
      (r) => r.id === created.id
    );
    expect(row.battle_tag).toBe('smurf#1234');
  });

  it('201 stampe banned_by = auth user id + tenant_id = tenant courant', async () => {
    store.player_blacklist = [];
    const res = makeRes();
    await listHandler(
      makeReq({
        method: 'POST',
        body: {
          display_name: 'Cheater',
          discord_user_id: '123456789012345678',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const created = res.body as any;
    expect(created.banned_by).toBe(AUTH_USER_ID);
    expect(created.tenant_id).toBe(TENANT_A);
    expect(created.active).toBe(true);
  });

  it('appelle logStaffAction(blacklist_add) avec le staff courant', async () => {
    store.player_blacklist = [];
    const res = makeRes();
    await listHandler(
      makeReq({ method: 'POST', body: { battle_tag: 'Foo#1' } }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
    const call = logStaffActionMock.mock.calls[0][0];
    expect(call.action).toBe('blacklist_add');
    expect(call.staff_id).toBe(STAFF_ID);
    expect(call.entity_type).toBe('blacklist');
    expect(call.tenant_id).toBe(TENANT_A);
    expect(call.entity_id).toBe((res.body as any).id);
  });
});

/* ===========================================================================
 * GET /api/admin/moderation/blacklist
 * =========================================================================*/

describe('GET /api/admin/moderation/blacklist', () => {
  function seedEntries() {
    store.player_blacklist = [
      {
        id: ENTRY_A,
        tenant_id: TENANT_A,
        battle_tag: 'alpha#1',
        display_name: 'AlphaGuy',
        discord_user_id: null,
        reason: null,
        notes: null,
        banned_by: AUTH_USER_ID,
        active: true,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: ENTRY_B,
        tenant_id: TENANT_A,
        battle_tag: 'beta#2',
        display_name: 'BetaGuy',
        discord_user_id: null,
        reason: null,
        notes: null,
        banned_by: AUTH_USER_ID,
        active: false,
        created_at: '2026-05-02T00:00:00.000Z',
        updated_at: '2026-05-02T00:00:00.000Z',
      },
      {
        id: ENTRY_OTHER,
        tenant_id: TENANT_B,
        battle_tag: 'gamma#3',
        display_name: 'GammaGuy',
        discord_user_id: null,
        reason: null,
        notes: null,
        banned_by: AUTH_USER_ID,
        active: true,
        created_at: '2026-05-03T00:00:00.000Z',
        updated_at: '2026-05-03T00:00:00.000Z',
      },
    ] as any;
  }

  it('200 scope par tenant : l’entrée d’un autre tenant n’apparaît pas', async () => {
    seedEntries();
    const res = makeRes();
    await listHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const ids = (res.body as any).items.map((r: any) => r.id);
    expect(ids).toContain(ENTRY_A);
    expect(ids).toContain(ENTRY_B);
    expect(ids).not.toContain(ENTRY_OTHER);
    expect((res.body as any).total).toBe(2);
  });

  it('200 filtre active=true', async () => {
    seedEntries();
    const res = makeRes();
    await listHandler(
      makeReq({ method: 'GET', query: { active: 'true' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const ids = (res.body as any).items.map((r: any) => r.id);
    expect(ids).toEqual([ENTRY_A]);
  });

  it('200 filtre active=false', async () => {
    seedEntries();
    const res = makeRes();
    await listHandler(
      makeReq({ method: 'GET', query: { active: 'false' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const ids = (res.body as any).items.map((r: any) => r.id);
    expect(ids).toEqual([ENTRY_B]);
  });
});

/* ===========================================================================
 * Auth boundary
 * =========================================================================*/

describe('blacklist index auth', () => {
  it('403 quand le rôle est insuffisant (caster < manager)', async () => {
    seedStaff('caster');
    invalidateStaffCache();
    const res = makeRes();
    await listHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('405 sur méthode non gérée', async () => {
    const res = makeRes();
    await listHandler(makeReq({ method: 'PUT' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET,POST');
  });
});

/* ===========================================================================
 * PATCH /api/admin/moderation/blacklist/[id]
 * =========================================================================*/

describe('PATCH /api/admin/moderation/blacklist/[id]', () => {
  function seedEntry(tenantId = TENANT_A, active = true) {
    store.player_blacklist = [
      {
        id: ENTRY_A,
        tenant_id: tenantId,
        battle_tag: 'alpha#1',
        display_name: 'AlphaGuy',
        discord_user_id: null,
        reason: null,
        notes: null,
        banned_by: AUTH_USER_ID,
        active,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
    ] as any;
  }

  it('200 toggle active → met à jour + logStaffAction(blacklist_update)', async () => {
    seedEntry(TENANT_A, true);
    const res = makeRes();
    await idHandler(
      makeReq({
        method: 'PATCH',
        query: { id: ENTRY_A },
        body: { active: false },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).active).toBe(false);
    expect((store.player_blacklist as any[])[0].active).toBe(false);

    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
    const call = logStaffActionMock.mock.calls[0][0];
    expect(call.action).toBe('blacklist_update');
    expect(call.entity_id).toBe(ENTRY_A);
    expect(call.tenant_id).toBe(TENANT_A);
    expect(call.payload).toMatchObject({ active: false });
  });

  it('404 cross-tenant : PATCH sur une entrée d’un autre tenant (non touchée)', async () => {
    seedEntry(TENANT_B, true);
    const res = makeRes();
    await idHandler(
      makeReq({
        method: 'PATCH',
        query: { id: ENTRY_A },
        body: { active: false },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    // L'entrée de l'autre tenant reste intacte.
    expect((store.player_blacklist as any[])[0].active).toBe(true);
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('400 sur id invalide', async () => {
    const res = makeRes();
    await idHandler(
      makeReq({
        method: 'PATCH',
        query: { id: 'not-a-uuid' },
        body: { active: false },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

/* ===========================================================================
 * DELETE /api/admin/moderation/blacklist/[id]
 * =========================================================================*/

describe('DELETE /api/admin/moderation/blacklist/[id]', () => {
  function seedEntry(tenantId = TENANT_A) {
    store.player_blacklist = [
      {
        id: ENTRY_A,
        tenant_id: tenantId,
        battle_tag: 'alpha#1',
        display_name: 'AlphaGuy',
        discord_user_id: null,
        reason: null,
        notes: null,
        banned_by: AUTH_USER_ID,
        active: true,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
    ] as any;
  }

  it('204 supprime + logStaffAction(blacklist_remove)', async () => {
    seedEntry(TENANT_A);
    const res = makeRes();
    await idHandler(makeReq({ method: 'DELETE', query: { id: ENTRY_A } }), res);
    expect(res.statusCode).toBe(204);
    expect(store.player_blacklist as any[]).toHaveLength(0);

    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
    const call = logStaffActionMock.mock.calls[0][0];
    expect(call.action).toBe('blacklist_remove');
    expect(call.entity_id).toBe(ENTRY_A);
    expect(call.tenant_id).toBe(TENANT_A);
  });

  it('404 cross-tenant : DELETE sur une entrée d’un autre tenant (non supprimée)', async () => {
    seedEntry(TENANT_B);
    const res = makeRes();
    await idHandler(makeReq({ method: 'DELETE', query: { id: ENTRY_A } }), res);
    expect(res.statusCode).toBe(404);
    expect(store.player_blacklist as any[]).toHaveLength(1);
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });
});
