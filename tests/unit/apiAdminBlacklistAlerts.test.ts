// tests/unit/apiAdminBlacklistAlerts.test.ts
//
// Feature Blacklist joueurs — lecture admin du journal des alertes de détection.
// Ref: pages/api/admin/moderation/blacklist/alerts.ts.
//
//   - GET → liste paginée (curseur descendant created_at) des alertes du tenant
//           courant, shape camelCase { alerts, nextCursor }.
//   - Scope tenant : une alerte d'un autre tenant n'apparaît jamais.
//   - Pagination : lit limit+1 ; >limit rows → nextCursor renseigné, sinon null.
//   - Filtres strength / source / discordUserId appliqués via `.eq(...)`.
//   - Auth : rôle < manager (caster) → 403.
//
// NOTE mock : `.order(...)` est un no-op dans le mock supabase in-memory ; on
// n'asserte donc PAS l'ordre réel de tri SQL mais le scope tenant + les filtres
// + la mécanique de pagination (limit+1 / slice / nextCursor), tous portés par
// `.eq(...)` et `.limit(...)` réellement implémentés.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import alertsHandler from '../../pages/api/admin/moderation/blacklist/alerts';

/* -----------------------------------------------------------
 * Constants
 * ---------------------------------------------------------*/

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_USER_ID = 'user-mgr-1';

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

let alertCounter = 0;
/** Forge une row blacklist_alerts seedée dans le store. */
function makeAlert(over: Record<string, unknown> = {}) {
  alertCounter += 1;
  return {
    id: `alert-${alertCounter}`,
    tenant_id: TENANT_A,
    created_at: `2026-05-${String(alertCounter).padStart(2, '0')}T00:00:00.000Z`,
    discord_user_id: '100000000000000000',
    battle_tag: 'foo#1',
    display_name: 'Foo',
    matched_on: 'battle_tag',
    strength: 'strong',
    source: 'bot_scan',
    context: 'guild-scan',
    reason: null,
    blacklist_entry_id: null,
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: AUTH_USER_ID });
  seedStaff('manager');
  alertCounter = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ===========================================================================
 * GET — happy path + scope tenant
 * =========================================================================*/

describe('GET /api/admin/moderation/blacklist/alerts', () => {
  it('200 → liste scopée au tenant courant (camelCase), autre tenant exclu', async () => {
    store.blacklist_alerts = [
      makeAlert({ id: 'a-self', tenant_id: TENANT_A }),
      makeAlert({ id: 'a-other', tenant_id: TENANT_B }),
    ] as any;

    const res = makeRes();
    await alertsHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(Array.isArray(body.alerts)).toBe(true);
    const ids = body.alerts.map((a: any) => a.id);
    expect(ids).toContain('a-self');
    expect(ids).not.toContain('a-other');
    expect(body.nextCursor).toBeNull();

    // Shape camelCase, pas de fuite snake_case.
    const alert = body.alerts[0];
    expect(alert).toHaveProperty('createdAt');
    expect(alert).toHaveProperty('discordUserId');
    expect(alert).toHaveProperty('matchedOn');
    expect(alert).toHaveProperty('blacklistEntryId');
    expect(alert).not.toHaveProperty('created_at');
    expect(alert).not.toHaveProperty('discord_user_id');
  });

  it('200 → liste vide quand aucune alerte', async () => {
    store.blacklist_alerts = [] as any;
    const res = makeRes();
    await alertsHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).alerts).toEqual([]);
    expect((res.body as any).nextCursor).toBeNull();
  });
});

/* ===========================================================================
 * Pagination
 * =========================================================================*/

describe('GET blacklist alerts pagination', () => {
  it('nextCursor renseigné quand il y a plus de `limit` lignes', async () => {
    // limit=2 → le handler lit 3 rows (limit+1) ; on en seed 3 → hasMore.
    store.blacklist_alerts = [
      makeAlert({ id: 'p1' }),
      makeAlert({ id: 'p2' }),
      makeAlert({ id: 'p3' }),
    ] as any;

    const res = makeRes();
    await alertsHandler(makeReq({ query: { limit: '2' } }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.alerts).toHaveLength(2);
    // Curseur = created_at de la dernière row de la page.
    expect(body.nextCursor).toBe(body.alerts[1].createdAt);
    expect(body.nextCursor).not.toBeNull();
  });

  it('nextCursor null quand le nombre de lignes ≤ limit', async () => {
    store.blacklist_alerts = [
      makeAlert({ id: 'q1' }),
      makeAlert({ id: 'q2' }),
    ] as any;

    const res = makeRes();
    await alertsHandler(makeReq({ query: { limit: '2' } }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.alerts).toHaveLength(2);
    expect(body.nextCursor).toBeNull();
  });

  it('400 quand limit dépasse le max (200)', async () => {
    const res = makeRes();
    await alertsHandler(makeReq({ query: { limit: '500' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quand le curseur `before` n’est pas une date valide', async () => {
    const res = makeRes();
    await alertsHandler(makeReq({ query: { before: 'pas-une-date' } }), res);
    expect(res.statusCode).toBe(400);
  });
});

/* ===========================================================================
 * Filtres
 * =========================================================================*/

describe('GET blacklist alerts filtres', () => {
  beforeEach(() => {
    store.blacklist_alerts = [
      makeAlert({
        id: 'f-strong-scan',
        strength: 'strong',
        source: 'bot_scan',
        discord_user_id: '111111111111111111',
      }),
      makeAlert({
        id: 'f-soft-reg',
        strength: 'soft',
        source: 'registration',
        discord_user_id: '222222222222222222',
      }),
      makeAlert({
        id: 'f-strong-add',
        strength: 'strong',
        source: 'bot_member_add',
        discord_user_id: '111111111111111111',
      }),
    ] as any;
  });

  it('filtre strength=soft', async () => {
    const res = makeRes();
    await alertsHandler(makeReq({ query: { strength: 'soft' } }), res);
    expect(res.statusCode).toBe(200);
    const ids = (res.body as any).alerts.map((a: any) => a.id);
    expect(ids).toEqual(['f-soft-reg']);
  });

  it('filtre source=registration', async () => {
    const res = makeRes();
    await alertsHandler(makeReq({ query: { source: 'registration' } }), res);
    expect(res.statusCode).toBe(200);
    const ids = (res.body as any).alerts.map((a: any) => a.id);
    expect(ids).toEqual(['f-soft-reg']);
  });

  it('filtre discordUserId', async () => {
    const res = makeRes();
    await alertsHandler(
      makeReq({ query: { discordUserId: '111111111111111111' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const ids = (res.body as any).alerts.map((a: any) => a.id).sort();
    expect(ids).toEqual(['f-strong-add', 'f-strong-scan']);
  });

  it('400 quand source hors enum', async () => {
    const res = makeRes();
    await alertsHandler(makeReq({ query: { source: 'unknown' } }), res);
    expect(res.statusCode).toBe(400);
  });
});

/* ===========================================================================
 * Auth + méthode
 * =========================================================================*/

describe('blacklist alerts auth', () => {
  it('403 quand le rôle est insuffisant (caster < manager)', async () => {
    seedStaff('caster');
    invalidateStaffCache();
    const res = makeRes();
    await alertsHandler(makeReq(), res);
    expect(res.statusCode).toBe(403);
  });

  it('405 sur méthode non gérée', async () => {
    const res = makeRes();
    await alertsHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });
});
