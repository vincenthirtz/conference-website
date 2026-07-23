// tests/unit/apiAdminSupportConvertBlacklist.test.ts
//
// Feature « conversion signalement → blacklist » (minRole 'admin').
// Ref: pages/api/admin/support/tickets/[id]/convert-blacklist.ts.
// Miroir du style de tests/unit/apiAdminEntityBlacklist.test.ts.
//
//   - 201 kind 'player' : insert player_blacklist (battle_tag normalisé,
//     banned_by/tenant stampés) + lien converted_player_blacklist_id + log.
//   - 201 kind 'entity' : insert entity_blacklist + converted_entity_blacklist_id.
//   - 400 : kind manquant/inconnu, aucun identifiant player, name manquant entité.
//   - 404 : ticket introuvable. 409 : déjà converti pour ce kind.
//   - Auth : rôle < admin (caster) → 403. 405 sur méthode non gérée.
//
// NOTE tenant : support_tickets n'a pas de tenant_id — l'entrée blacklist est
// écrite dans le tenant courant du staff (ctx.tenantId), c'est ce qu'on vérifie.

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

import convertHandler from '../../pages/api/admin/support/tickets/[id]/convert-blacklist';

/* -----------------------------------------------------------
 * Constants
 * ---------------------------------------------------------*/

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_USER_ID = 'user-adm-1';
const TICKET_ID = '99999999-9999-4999-8999-999999999999';
const OTHER_UUID = '88888888-8888-4888-8888-888888888888';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'admin'
): StaffMember {
  return {
    id: STAFF_ID,
    auth_user_id: AUTH_USER_ID,
    email: 'adm@example.com',
    role,
    display_name: 'Admin',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    is_pole_admin: false,
  } as StaffMember;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: 'Bearer t-adm' },
    cookies: { staff_active_tenant_id: TENANT_A },
    query: { id: TICKET_ID },
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

function seedStaff(role: 'owner' | 'admin' | 'caster' = 'admin') {
  store.staff = [makeStaffRow(role)] as any;
  store.tenants = [
    { id: TENANT_A, slug: 'alpha', name: 'Alpha', is_active: true },
    { id: TENANT_B, slug: 'beta', name: 'Beta', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: STAFF_ID, role: 'admin' },
  ] as any;
}

function seedTicket(over: Partial<any> = {}) {
  store.support_tickets = [
    {
      id: TICKET_ID,
      category: 'behavior',
      severity: 'high',
      status: 'open',
      reported_target_type: 'player',
      reported_target_name: 'Cheater',
      reported_battle_tag: 'Cheater#1234',
      converted_player_blacklist_id: null,
      converted_entity_blacklist_id: null,
      ...over,
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: AUTH_USER_ID });
  seedStaff('admin');
  seedTicket();
  store.player_blacklist = [] as any;
  store.entity_blacklist = [] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ===========================================================================
 * 201 — kind 'player'
 * =========================================================================*/

describe('POST convert-blacklist — kind player', () => {
  it('201 : insert player_blacklist normalisé + lien ticket + log', async () => {
    const res = makeRes();
    await convertHandler(
      makeReq({
        body: {
          kind: 'player',
          battle_tag: '  Cheater#1234  ',
          display_name: 'Cheater',
          reason: 'signalement confirmé',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const body = res.body as any;
    expect(body.kind).toBe('player');
    expect(body.ticket_id).toBe(TICKET_ID);
    // Entrée créée : battle_tag lowercase/trim, stamps tenant/banned_by/active.
    expect(body.entry.battle_tag).toBe('cheater#1234');
    expect(body.entry.display_name).toBe('Cheater');
    expect(body.entry.reason).toBe('signalement confirmé');
    expect(body.entry.tenant_id).toBe(TENANT_A);
    expect(body.entry.banned_by).toBe(AUTH_USER_ID);
    expect(body.entry.active).toBe(true);
    // Persistée dans player_blacklist (PAS entity_blacklist).
    expect(store.player_blacklist as any[]).toHaveLength(1);
    expect(store.entity_blacklist as any[]).toHaveLength(0);
    // Ticket relié via converted_player_blacklist_id.
    const ticket = (store.support_tickets as any[])[0];
    expect(ticket.converted_player_blacklist_id).toBe(body.entry.id);
    expect(ticket.converted_entity_blacklist_id).toBeNull();
    // Audit.
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
    const call = logStaffActionMock.mock.calls[0][0];
    expect(call.action).toBe('support_ticket_convert_blacklist');
    expect(call.staff_id).toBe(STAFF_ID);
    expect(call.entity_type).toBe('support_ticket');
    expect(call.entity_id).toBe(TICKET_ID);
    expect(call.tenant_id).toBe(TENANT_A);
    expect(call.payload).toMatchObject({
      kind: 'player',
      blacklist_entry_id: body.entry.id,
      battle_tag: 'cheater#1234',
    });
  });

  it('400 quand aucun identifiant player fourni', async () => {
    const res = makeRes();
    await convertHandler(
      makeReq({ body: { kind: 'player', reason: 'sans identifiant' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(store.player_blacklist as any[]).toHaveLength(0);
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('400 quand discord_user_id invalide (pas un snowflake)', async () => {
    const res = makeRes();
    await convertHandler(
      makeReq({ body: { kind: 'player', discord_user_id: 'not-a-snowflake' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('409 quand le ticket est déjà converti côté joueur', async () => {
    seedTicket({ converted_player_blacklist_id: OTHER_UUID });
    const res = makeRes();
    await convertHandler(
      makeReq({ body: { kind: 'player', battle_tag: 'Cheater#1234' } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).error).toBeTruthy();
    expect(store.player_blacklist as any[]).toHaveLength(0);
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('une conversion entité reste possible après une conversion joueur (colonnes indépendantes)', async () => {
    seedTicket({ converted_player_blacklist_id: OTHER_UUID });
    const res = makeRes();
    await convertHandler(
      makeReq({
        body: { kind: 'entity', entity_type: 'team', name: 'Toxic Squad' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).kind).toBe('entity');
  });
});

/* ===========================================================================
 * 201 — kind 'entity'
 * =========================================================================*/

describe('POST convert-blacklist — kind entity', () => {
  it('201 : insert entity_blacklist + lien ticket + log', async () => {
    const res = makeRes();
    await convertHandler(
      makeReq({
        body: {
          kind: 'entity',
          entity_type: 'org',
          name: '  XYZ Org  ',
          reason: 'structure bannie',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const body = res.body as any;
    expect(body.kind).toBe('entity');
    expect(body.ticket_id).toBe(TICKET_ID);
    expect(body.entry.entity_type).toBe('org');
    expect(body.entry.name).toBe('XYZ Org');
    expect(body.entry.tenant_id).toBe(TENANT_A);
    expect(body.entry.banned_by).toBe(AUTH_USER_ID);
    expect(body.entry.active).toBe(true);
    // Persistée dans entity_blacklist (PAS player_blacklist).
    expect(store.entity_blacklist as any[]).toHaveLength(1);
    expect(store.player_blacklist as any[]).toHaveLength(0);
    // Ticket relié via converted_entity_blacklist_id.
    const ticket = (store.support_tickets as any[])[0];
    expect(ticket.converted_entity_blacklist_id).toBe(body.entry.id);
    expect(ticket.converted_player_blacklist_id).toBeNull();
    // Audit.
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
    const call = logStaffActionMock.mock.calls[0][0];
    expect(call.action).toBe('support_ticket_convert_blacklist');
    expect(call.payload).toMatchObject({
      kind: 'entity',
      blacklist_entry_id: body.entry.id,
      entity_type: 'org',
      name: 'XYZ Org',
    });
  });

  it('400 quand name manquant', async () => {
    const res = makeRes();
    await convertHandler(
      makeReq({ body: { kind: 'entity', entity_type: 'team' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(store.entity_blacklist as any[]).toHaveLength(0);
  });

  it('400 quand entity_type hors enum', async () => {
    const res = makeRes();
    await convertHandler(
      makeReq({
        body: { kind: 'entity', entity_type: 'player', name: 'Toxic Squad' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('409 quand le ticket est déjà converti côté entité', async () => {
    seedTicket({ converted_entity_blacklist_id: OTHER_UUID });
    const res = makeRes();
    await convertHandler(
      makeReq({
        body: { kind: 'entity', entity_type: 'team', name: 'Toxic Squad' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(store.entity_blacklist as any[]).toHaveLength(0);
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });
});

/* ===========================================================================
 * Erreurs communes
 * =========================================================================*/

describe('POST convert-blacklist — erreurs communes', () => {
  it('400 quand kind manquant ou inconnu', async () => {
    const res1 = makeRes();
    await convertHandler(makeReq({ body: { battle_tag: 'Foo#1' } }), res1);
    expect(res1.statusCode).toBe(400);

    const res2 = makeRes();
    await convertHandler(
      makeReq({ body: { kind: 'bogus', battle_tag: 'Foo#1' } }),
      res2
    );
    expect(res2.statusCode).toBe(400);
  });

  it('400 sur id invalide', async () => {
    const res = makeRes();
    await convertHandler(
      makeReq({
        query: { id: 'not-a-uuid' },
        body: { kind: 'player', battle_tag: 'Foo#1' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 quand le ticket est introuvable', async () => {
    const res = makeRes();
    await convertHandler(
      makeReq({
        query: { id: OTHER_UUID },
        body: { kind: 'player', battle_tag: 'Foo#1' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(store.player_blacklist as any[]).toHaveLength(0);
  });

  it('403 quand le rôle est insuffisant (caster < admin)', async () => {
    seedStaff('caster');
    invalidateStaffCache();
    const res = makeRes();
    await convertHandler(
      makeReq({ body: { kind: 'player', battle_tag: 'Foo#1' } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('405 sur méthode non gérée', async () => {
    const res = makeRes();
    await convertHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });
});
