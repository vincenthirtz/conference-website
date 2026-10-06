// tests/unit/blacklistExpiry.test.ts
//
// Sanctions temporaires (migration blacklist_expires_at) :
//   - prédicat central : une entrée échue est inactive, même `active = true` ;
//   - résolution durée / date ;
//   - checkBlacklist / checkEntityBlacklist ignorent une entrée échue ;
//   - admin : création avec durée, filtre `expired`, échéance passée refusée ;
//   - cron : bascule `active = false` les seules entrées échues, journalise
//     chaque levée sans auteur staff, `dry_run` n'écrit rien.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.CRON_SECRET = 'cron-test-secret';
});

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => undefined),
}));
const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async (_params?: any) => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import {
  isBlacklistEntryEffective,
  isBlacklistEntryExpired,
  resolveBlacklistExpiry,
} from '../../utils/moderation/blacklistExpiry';
import { isMissingColumnError } from '../../utils/moderation/missingColumn';
import { checkBlacklist } from '../../utils/moderation/blacklist';
import { checkEntityBlacklist } from '../../utils/moderation/entityBlacklist';
import listHandler from '../../pages/api/admin/moderation/blacklist/index';
import cronHandler from '../../pages/api/cron/blacklist-expiry';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_USER_ID = 'user-mgr-1';
const PAST = '2020-01-01T00:00:00.000Z';
const FUTURE = '2999-01-01T00:00:00.000Z';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: 'Bearer t-mgr' },
    cookies: { staff_active_tenant_id: TENANT },
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

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: AUTH_USER_ID });
  store.staff = [
    {
      id: STAFF_ID,
      auth_user_id: AUTH_USER_ID,
      email: 'mgr@example.com',
      role: 'admin',
      display_name: 'Manager',
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      is_pole_admin: false,
    },
  ] as any;
  store.tenants = [
    { id: TENANT, slug: 'alpha', name: 'Alpha', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: STAFF_ID, role: 'admin' },
  ] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('prédicat central', () => {
  const now = new Date('2026-10-06T12:00:00Z');

  it('sans échéance : actif tant que `active`', () => {
    expect(isBlacklistEntryEffective({ active: true }, now)).toBe(true);
    expect(isBlacklistEntryEffective({ active: false }, now)).toBe(false);
    expect(
      isBlacklistEntryEffective({ active: true, expires_at: null }, now)
    ).toBe(true);
  });

  it('échéance passée : inactive même avec `active = true`', () => {
    const entry = { active: true, expires_at: '2026-10-06T11:59:59Z' };
    expect(isBlacklistEntryExpired(entry, now)).toBe(true);
    expect(isBlacklistEntryEffective(entry, now)).toBe(false);
  });

  it('échéance future : active', () => {
    const entry = { active: true, expires_at: '2026-10-07T00:00:00Z' };
    expect(isBlacklistEntryEffective(entry, now)).toBe(true);
  });

  it('résout une durée en jours, une date, ou « sans échéance »', () => {
    expect(resolveBlacklistExpiry({ duration_days: 7 }, now)).toBe(
      '2026-10-13T12:00:00.000Z'
    );
    expect(
      resolveBlacklistExpiry({ expires_at: '2026-12-01T00:00:00Z' }, now)
    ).toBe('2026-12-01T00:00:00.000Z');
    expect(resolveBlacklistExpiry({ expires_at: null }, now)).toBeNull();
    expect(resolveBlacklistExpiry({}, now)).toBeUndefined();
    // La date l'emporte sur la durée.
    expect(
      resolveBlacklistExpiry(
        { expires_at: '2026-12-01T00:00:00Z', duration_days: 1 },
        now
      )
    ).toBe('2026-12-01T00:00:00.000Z');
  });

  it('reconnaît une colonne manquante (migration non appliquée)', () => {
    expect(
      isMissingColumnError(
        {
          code: '42703',
          message: 'column player_blacklist.expires_at does not exist',
        },
        'expires_at'
      )
    ).toBe(true);
    expect(
      isMissingColumnError(
        { code: '42703', message: 'column x.other does not exist' },
        'expires_at'
      )
    ).toBe(false);
    expect(isMissingColumnError({ message: 'boom' }, 'expires_at')).toBe(false);
  });
});

describe('vérifications : une entrée échue ne matche plus', () => {
  it('checkBlacklist ignore une entrée échue, garde une entrée future', async () => {
    store.player_blacklist = [
      {
        id: 'p-old',
        tenant_id: TENANT,
        battle_tag: 'cheater#1',
        display_name: null,
        discord_user_id: null,
        reason: 'ancien',
        active: true,
        expires_at: PAST,
      },
      {
        id: 'p-new',
        tenant_id: TENANT,
        battle_tag: 'cheater#2',
        display_name: null,
        discord_user_id: null,
        reason: 'en cours',
        active: true,
        expires_at: FUTURE,
      },
    ] as any;
    const old = await checkBlacklist(supabaseAdmin as any, TENANT, {
      battleTag: 'cheater#1',
    });
    expect(old.matched).toBe(false);
    const current = await checkBlacklist(supabaseAdmin as any, TENANT, {
      battleTag: 'cheater#2',
    });
    expect(current.matched).toBe(true);
  });

  it('checkEntityBlacklist ignore une entrée échue', async () => {
    store.entity_blacklist = [
      {
        id: 'e-old',
        tenant_id: TENANT,
        entity_type: 'team',
        name: 'Bad Team',
        reason: null,
        active: true,
        expires_at: PAST,
      },
    ] as any;
    const r = await checkEntityBlacklist(
      supabaseAdmin as any,
      TENANT,
      'Bad Team'
    );
    expect(r.matched).toBe(false);
  });
});

describe('admin : saisie et filtre des échéances', () => {
  it('POST avec `duration_days` pose une échéance future', async () => {
    store.player_blacklist = [];
    const res = makeRes();
    const before = Date.now();
    await listHandler(
      makeReq({
        method: 'POST',
        body: { battle_tag: 'Temp#1', duration_days: 7 },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const row = (store.player_blacklist as any[])[0];
    const t = Date.parse(row.expires_at);
    expect(t).toBeGreaterThan(before + 6 * 86_400_000);
    expect(t).toBeLessThan(before + 8 * 86_400_000);
    expect(logStaffActionMock.mock.calls[0][0].payload.expires_at).toBe(
      row.expires_at
    );
  });

  it('POST sans échéance n’écrit pas la colonne (insert valide avant migration)', async () => {
    store.player_blacklist = [];
    const res = makeRes();
    await listHandler(
      makeReq({ method: 'POST', body: { battle_tag: 'Perm#1' } }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect('expires_at' in (store.player_blacklist as any[])[0]).toBe(false);
  });

  it('POST avec une échéance passée → 400', async () => {
    store.player_blacklist = [];
    const res = makeRes();
    await listHandler(
      makeReq({
        method: 'POST',
        body: { battle_tag: 'Late#1', expires_at: PAST },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(store.player_blacklist).toHaveLength(0);
  });

  it('GET ?expired=true ne rend que les entrées échues', async () => {
    store.player_blacklist = [
      {
        id: 'a',
        tenant_id: TENANT,
        battle_tag: 'a#1',
        active: false,
        expires_at: PAST,
        created_at: '2026-01-01',
      },
      {
        id: 'b',
        tenant_id: TENANT,
        battle_tag: 'b#1',
        active: true,
        expires_at: FUTURE,
        created_at: '2026-01-02',
      },
    ] as any;
    const res = makeRes();
    await listHandler(makeReq({ query: { expired: 'true' } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).items.map((r: any) => r.id)).toEqual(['a']);
    expect((res.body as any).expiry_available).toBe(true);
  });
});

describe('/api/cron/blacklist-expiry', () => {
  function cronReq(over: Partial<any> = {}) {
    return makeReq({
      method: 'POST',
      headers: { host: 'h', authorization: 'Bearer cron-test-secret' },
      cookies: {},
      ...over,
    });
  }

  function seedBoth() {
    store.player_blacklist = [
      { id: 'p-exp', tenant_id: TENANT, active: true, expires_at: PAST },
      { id: 'p-fut', tenant_id: TENANT, active: true, expires_at: FUTURE },
      { id: 'p-perm', tenant_id: TENANT, active: true, expires_at: null },
      { id: 'p-off', tenant_id: TENANT, active: false, expires_at: PAST },
    ] as any;
    store.entity_blacklist = [
      { id: 'e-exp', tenant_id: TENANT, active: true, expires_at: PAST },
    ] as any;
  }

  it('401 sans secret', async () => {
    const res = makeRes();
    await cronHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('lève les seules entrées échues et journalise chaque levée', async () => {
    seedBoth();
    const res = makeRes();
    await cronHandler(cronReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.players.expired).toBe(1);
    expect(body.entities.expired).toBe(1);

    const byId = Object.fromEntries(
      (store.player_blacklist as any[]).map((r) => [r.id, r.active])
    );
    expect(byId).toEqual({
      'p-exp': false,
      'p-fut': true,
      'p-perm': true,
      'p-off': false,
    });
    expect((store.entity_blacklist as any[])[0].active).toBe(false);

    const actions = logStaffActionMock.mock.calls.map((c) => c[0]);
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.action).sort()).toEqual([
      'blacklist_expired',
      'entity_blacklist_expired',
    ]);
    for (const a of actions) {
      expect(a.staff_id).toBeNull();
      expect(a.tenant_id).toBe(TENANT);
      expect(a.payload.automatic).toBe(true);
    }
  });

  it('dry_run compte sans écrire ni journaliser', async () => {
    seedBoth();
    const res = makeRes();
    await cronHandler(cronReq({ query: { dry_run: '1' } }), res);
    expect((res.body as any).players.candidates).toBe(1);
    expect(
      (store.player_blacklist as any[]).find((r) => r.id === 'p-exp').active
    ).toBe(true);
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });
});
