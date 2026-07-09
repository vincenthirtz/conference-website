// tests/unit/apiBotTeamPatch.test.ts
// Tests pour PATCH /api/bot/v1/teams/[teamId] — capitaine modifie son équipe.
//
// Pendant logique de validation côté API + garde "captain only". Le mock
// supabase chainable ([__helpers__/supabaseMock]) joue le rôle de la DB —
// le PATCH écrit dans store.teams via le builder de Builder.update().

import { describe, it, expect, beforeEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  seedBotAuth,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/bot/v1/teams/[teamId]';

const TEAM_ID = '550e8400-e29b-41d4-a716-446655440b01';
const CAPTAIN_USER_ID = 'user-captain-1';
const CAPTAIN_DISCORD = '900000000000000001';
const OTHER_USER_ID = 'user-member-1';
const OTHER_DISCORD = '900000000000000002';
const ADMIN_USER_ID = 'user-admin-1';
const ADMIN_DISCORD = '900000000000000003';
const ADMIN_STAFF_ID = 'staff-admin-1';
const MANAGER_USER_ID = 'user-manager-1';
const MANAGER_DISCORD = '900000000000000004';
// Conference tenant UUID — match DEFAULT_TENANT_ID in utils/tenant.ts. The
// fallback resolveTenantId() injects this value into req.botContext.tenantId
// when the bot doesn't send x-tenant-id, so fixtures must carry it too for
// the S3 sweep tenant_id filters to match.
const CONFERENCE_TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'PATCH',
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-tenant-id': CONFERENCE_TENANT_ID,
    },
    query: { teamId: TEAM_ID },
    body: { actorDiscordUserId: CAPTAIN_DISCORD },
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  // Per-tenant bot auth: x-api-key resolves to CONFERENCE_TENANT_ID.
  seedBotAuth();
  // V2 strict tenant header — withBotRoute checks existence in `tenants`.
  store.tenants = [{ id: CONFERENCE_TENANT_ID, plan: 'foundation', plan_status: 'active', plan_expires_at: null }] as any;
  store.teams = [
    {
      id: TEAM_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Phoenix',
      slug: 'phoenix',
      short_name: 'PHX',
      description: 'Une description',
      discord: null,
      website: null,
      country: 'FR',
      captain_id: CAPTAIN_USER_ID,
      is_active: true,
      is_joinable: true,
    },
  ] as any;
  store.user_discord_links = [
    { discord_user_id: CAPTAIN_DISCORD, auth_user_id: CAPTAIN_USER_ID },
    { discord_user_id: OTHER_DISCORD, auth_user_id: OTHER_USER_ID },
    { discord_user_id: ADMIN_DISCORD, auth_user_id: ADMIN_USER_ID },
    { discord_user_id: MANAGER_DISCORD, auth_user_id: MANAGER_USER_ID },
  ] as any;
  store.staff = [
    { id: ADMIN_STAFF_ID, auth_user_id: ADMIN_USER_ID, role: 'admin' },
    { id: 'staff-manager-1', auth_user_id: MANAGER_USER_ID, role: 'manager' },
  ] as any;
});

describe('PATCH /api/bot/v1/teams/[teamId]', () => {
  it('401 without api key', async () => {
    const res = makeRes();
    await handler(makeReq({ headers: { host: 'h' } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('404 when team not found', async () => {
    store.teams = [];
    const res = makeRes();
    await handler(
      makeReq({ body: { actorDiscordUserId: CAPTAIN_DISCORD, name: 'X' } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('403 when actor is not the captain', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: { actorDiscordUserId: OTHER_DISCORD, name: 'NewName' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('400 when name too short', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { actorDiscordUserId: CAPTAIN_DISCORD, name: 'A' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/name doit faire/);
  });

  it('400 when website is not http(s)', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          actorDiscordUserId: CAPTAIN_DISCORD,
          website: 'javascript:alert(1)',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/website invalide/);
  });

  it('400 when no editable field is supplied', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { actorDiscordUserId: CAPTAIN_DISCORD } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/Aucun champ modifiable/);
  });

  it('200 happy path: updates name and description', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          actorDiscordUserId: CAPTAIN_DISCORD,
          name: 'Phoenix Rising',
          description: 'New description here',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const team = (res.body as any).team;
    expect(team.name).toBe('Phoenix Rising');
    expect(team.description).toBe('New description here');
    // Le mock met à jour le store : on vérifie aussi que les autres champs
    // n'ont pas été clobbered.
    expect(store.teams[0].slug).toBe('phoenix');
    expect(store.teams[0].short_name).toBe('PHX');
  });

  it('200 with empty string sets description to null', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: { actorDiscordUserId: CAPTAIN_DISCORD, description: '' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.teams[0].description).toBeNull();
  });

  it('200 accepts shortName as camelCase OR short_name', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: { actorDiscordUserId: CAPTAIN_DISCORD, shortName: 'PHX2' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.teams[0].short_name).toBe('PHX2');
  });

  it('GET path still works after PATCH support was added', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET', body: {} }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).team.id).toBe(TEAM_ID);
  });

  // -- Staff override path (/modifier-equipe-admin) ------------------------
  // Le bot envoie `actorIsStaff: true` quand un admin/owner veut modifier
  // n'importe quelle equipe. Le check capitaine est skippe ; requireBotStaff
  // re-resolved le role cote API (admin|owner) et 403 sinon.

  describe('actorIsStaff override', () => {
    it('200 admin staff can edit a team they are not captain of', async () => {
      const res = makeRes();
      await handler(
        makeReq({
          body: {
            actorDiscordUserId: ADMIN_DISCORD,
            actorIsStaff: true,
            name: 'Phoenix Reborn',
          },
        }),
        res
      );
      expect(res.statusCode).toBe(200);
      expect((res.body as any).team.name).toBe('Phoenix Reborn');
      expect(store.teams[0].name).toBe('Phoenix Reborn');
    });

    it('403 actorIsStaff:true but Discord ID is not staff admin/owner', async () => {
      const res = makeRes();
      await handler(
        makeReq({
          body: {
            actorDiscordUserId: OTHER_DISCORD,
            actorIsStaff: true,
            name: 'Hacked',
          },
        }),
        res
      );
      expect(res.statusCode).toBe(403);
      expect(store.teams[0].name).toBe('Phoenix');
    });

    it('403 actorIsStaff:true with manager role (admin/owner only)', async () => {
      const res = makeRes();
      await handler(
        makeReq({
          body: {
            actorDiscordUserId: MANAGER_DISCORD,
            actorIsStaff: true,
            name: 'NopeManager',
          },
        }),
        res
      );
      expect(res.statusCode).toBe(403);
      expect(store.teams[0].name).toBe('Phoenix');
    });

    it('400 actorIsStaff:true without actorDiscordUserId', async () => {
      const res = makeRes();
      await handler(
        makeReq({
          body: { actorIsStaff: true, name: 'X' },
        }),
        res
      );
      expect(res.statusCode).toBe(400);
    });

    it('404 actorIsStaff:true but team does not exist', async () => {
      store.teams = [];
      const res = makeRes();
      await handler(
        makeReq({
          body: {
            actorDiscordUserId: ADMIN_DISCORD,
            actorIsStaff: true,
            name: 'Ghost',
          },
        }),
        res
      );
      expect(res.statusCode).toBe(404);
    });

    it('still validates fields under staff override (name too short -> 400)', async () => {
      const res = makeRes();
      await handler(
        makeReq({
          body: {
            actorDiscordUserId: ADMIN_DISCORD,
            actorIsStaff: true,
            name: 'A',
          },
        }),
        res
      );
      expect(res.statusCode).toBe(400);
    });
  });
});
