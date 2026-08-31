// GET /api/bot/v1/role-sync/snapshot — « qui doit avoir quel rôle Discord ».
//
// Régression du 2026-08-31 : le handler indexait les appartenances dans un
// Map<user_id, membership>, donc une seule ligne survivait par compte. Pour une
// manager qui encadre deux équipes (l'index unique (tenant_id, user_id) est
// PARTIEL et exempte `manager`), le bot ne voyait qu'une équipe : il classait le
// rôle de l'autre « géré mais non attendu » et le RETIRAIT. Concrètement, on
// ajoutait « LVN EMBERS » à une manager de « LVN ASHES » et Ashes disparaissait.
//
// Cible : pages/api/bot/v1/role-sync/snapshot.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  store,
  resetSupabaseMock,
  seedBotAuth,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/bot/v1/role-sync/snapshot';

const MANAGER = 'auth-manager';
const DISCORD_ID = '236889823653134344';
const TEAM_ASHES = '550e8400-e29b-41d4-a716-4466554400a1';
const TEAM_EMBERS = '550e8400-e29b-41d4-a716-4466554400a2';

function makeReq(over: Partial<any> = {}, method = 'GET'): any {
  return {
    method,
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-tenant-id': CONFERENCE_TENANT_ID,
    },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  seedBotAuth();
  store.tenants = [
    {
      id: CONFERENCE_TENANT_ID,
      plan: 'foundation',
      plan_status: 'active',
      plan_expires_at: null,
    },
  ] as any;
  store.user_discord_links = [
    { auth_user_id: MANAGER, discord_user_id: DISCORD_ID, discord_username: 'amissa' },
  ] as any;
  store.team_members = [
    {
      user_id: MANAGER,
      team_id: TEAM_ASHES,
      role: 'manager',
      is_substitute: false,
      tenant_id: CONFERENCE_TENANT_ID,
      created_at: '2026-08-26T16:43:10Z',
      team: {
        id: TEAM_ASHES,
        name: 'LVN ASHES',
        captain_id: 'someone-else',
        discord_role_id: 'role-ashes',
      },
    },
    {
      user_id: MANAGER,
      team_id: TEAM_EMBERS,
      role: 'manager',
      is_substitute: false,
      tenant_id: CONFERENCE_TENANT_ID,
      created_at: '2026-08-29T20:16:50Z',
      team: {
        id: TEAM_EMBERS,
        name: 'LVN EMBERS',
        captain_id: 'someone-else',
        discord_role_id: 'role-embers',
      },
    },
  ] as any;
  store.staff = [] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('auth', () => {
  it('401 sans api key', async () => {
    const res = makeRes();
    await handler(makeReq({ headers: { host: 'h' } }), res);
    expect(res.statusCode).toBe(401);
  });
});

describe('multi-équipes', () => {
  it('sert les DEUX équipes d’une manager dans teams[]', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);

    const user = (res.body as any).users.find((u: any) => u.authUserId === MANAGER);
    expect(user.teams.map((t: any) => t.discordRoleId).sort()).toEqual([
      'role-ashes',
      'role-embers',
    ]);
    expect(user.teams.every((t: any) => t.role === 'manager')).toBe(true);
  });

  it('garde `team` (appartenance principale) pour un bot pas encore à jour', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    const user = (res.body as any).users.find((u: any) => u.authUserId === MANAGER);
    expect(user.team).not.toBeNull();
    expect(user.teams.some((t: any) => t.id === user.team.id)).toBe(true);
  });

  it('teams=[] et team=null pour un compte lié sans équipe', async () => {
    store.team_members = [] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    const user = (res.body as any).users.find((u: any) => u.authUserId === MANAGER);
    expect(user.teams).toEqual([]);
    expect(user.team).toBeNull();
  });
});
