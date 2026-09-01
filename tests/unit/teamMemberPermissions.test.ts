// Délégation de droits dans l'équipe — lot J3 (docs/PLAN-espace-joueur.md).
//
// Trois invariants, dans l'ordre où ils protègent :
//   1. on ne délègue pas ce qu'on n'a pas (sinon un rôle partiel s'auto-élargit) ;
//   2. la surcharge est ADDITIVE — elle crée un accès pour une joueuse
//      ordinaire, et ne retire jamais ce qu'un rôle accorde ;
//   3. la table est le journal : révoquer ne supprime pas la ligne.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/teams/member-permissions';
import { getManagedTeams } from '../../utils/teams/managementAccess';

const TEAM = '11111111-1111-1111-1111-111111111111';
const CAPTAIN = '22222222-2222-2222-2222-222222222222';
const COACH = '33333333-3333-3333-3333-333333333333';
const PLAYER = '44444444-4444-4444-4444-444444444444';
const OUTSIDER = '55555555-5555-5555-5555-555555555555';

let _t = 0;
function makeReq(over: Partial<any> = {}): any {
  _t += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_t}` },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: CAPTAIN });
  store.teams = [
    {
      id: TEAM,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Phenix',
      captain_id: CAPTAIN,
      is_active: true,
    },
  ] as any;
  store.team_members = [
    {
      id: 'tm-cap',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM,
      user_id: CAPTAIN,
      role: 'player',
    },
    {
      id: 'tm-coach',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM,
      user_id: COACH,
      role: 'coach',
    },
    {
      id: 'tm-player',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM,
      user_id: PLAYER,
      role: 'player',
    },
  ] as any;
  store.team_member_permissions = [] as any;
});

describe('POST — accorder', () => {
  it('la capitaine délègue les scrims à une joueuse ordinaire', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        body: { userId: PLAYER, permission: 'manage_scrims' },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const rows = store.team_member_permissions as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      team_id: TEAM,
      user_id: PLAYER,
      permission: 'manage_scrims',
      granted_by: CAPTAIN,
    });
  });

  it('ré-octroyer est idempotent : pas de doublon', async () => {
    for (let i = 0; i < 2; i++) {
      const res = makeRes();
      await handler(
        makeReq({
          method: 'POST',
          body: { userId: PLAYER, permission: 'manage_scrims' },
        }),
        res
      );
      expect(res.statusCode).toBe(200);
    }
    expect(store.team_member_permissions as any[]).toHaveLength(1);
  });

  it('refuse une permission inconnue', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        body: { userId: PLAYER, permission: 'become_admin' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('refuse une cible hors de l’équipe', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        body: { userId: OUTSIDER, permission: 'manage_scrims' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('un coach ne peut rien déléguer : il n’a pas manage_roster', async () => {
    setAuthUser({ id: COACH });
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        body: { userId: PLAYER, permission: 'manage_scrims' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(store.team_member_permissions as any[]).toHaveLength(0);
  });

  it('on ne délègue pas ce qu’on n’a pas soi-même', async () => {
    // Un rôle privilégié partiel : roster + rien d'autre.
    store.site_settings = [
      {
        key: 'team_roles',
        value: JSON.stringify([
          { value: 'player', label: 'Player', permissions: [] },
          {
            value: 'manager',
            label: 'Manager',
            permissions: ['manage_roster'],
          },
        ]),
      },
    ] as any;
    (store.team_members as any[]).push({
      id: 'tm-partial',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM,
      user_id: OUTSIDER,
      role: 'manager',
    });
    setAuthUser({ id: OUTSIDER });

    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        body: { userId: PLAYER, permission: 'manage_scrims' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('DELETE — révoquer', () => {
  it('révoque SANS supprimer la ligne : la table est le journal', async () => {
    await handler(
      makeReq({
        method: 'POST',
        body: { userId: PLAYER, permission: 'manage_scrims' },
      }),
      makeRes()
    );

    const res = makeRes();
    await handler(
      makeReq({
        method: 'DELETE',
        body: { userId: PLAYER, permission: 'manage_scrims' },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const rows = store.team_member_permissions as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].revoked_at).toBeTruthy();
    expect(rows[0].revoked_by).toBe(CAPTAIN);
  });
});

describe('effet sur les accès résolus', () => {
  it('une surcharge CRÉE un accès pour une joueuse sans rôle privilégié', async () => {
    const before = await getManagedTeams(PLAYER, CONFERENCE_TENANT_ID);
    expect(before).toHaveLength(0);

    await handler(
      makeReq({
        method: 'POST',
        body: { userId: PLAYER, permission: 'manage_scrims' },
      }),
      makeRes()
    );

    const after = await getManagedTeams(PLAYER, CONFERENCE_TENANT_ID);
    expect(after).toHaveLength(1);
    expect(after[0].permissions).toEqual(['manage_scrims']);
    expect(after[0].grantedPermissions).toEqual(['manage_scrims']);
    expect(after[0].isManager).toBe(true);
    expect(after[0].isCaptain).toBe(false);
  });

  it('la surcharge s’AJOUTE au rôle, elle ne le remplace pas', async () => {
    await handler(
      makeReq({
        method: 'POST',
        body: { userId: COACH, permission: 'manage_team_info' },
      }),
      makeRes()
    );

    const [access] = await getManagedTeams(COACH, CONFERENCE_TENANT_ID);
    // Rôle coach = scrims + feuille de match ; surcharge = infos d'équipe.
    expect(access.permissions).toEqual([
      'manage_team_info',
      'manage_scrims',
      'validate_lineup',
    ]);
    expect(access.grantedPermissions).toEqual(['manage_team_info']);
  });

  it('une surcharge révoquée ne donne plus rien', async () => {
    await handler(
      makeReq({
        method: 'POST',
        body: { userId: PLAYER, permission: 'manage_scrims' },
      }),
      makeRes()
    );
    await handler(
      makeReq({
        method: 'DELETE',
        body: { userId: PLAYER, permission: 'manage_scrims' },
      }),
      makeRes()
    );

    expect(await getManagedTeams(PLAYER, CONFERENCE_TENANT_ID)).toHaveLength(0);
  });
});

describe('GET — journal', () => {
  it('rend les délégations, révoquées comprises', async () => {
    await handler(
      makeReq({
        method: 'POST',
        body: { userId: PLAYER, permission: 'manage_scrims' },
      }),
      makeRes()
    );
    await handler(
      makeReq({
        method: 'DELETE',
        body: { userId: PLAYER, permission: 'manage_scrims' },
      }),
      makeRes()
    );

    const res = makeRes();
    await handler(makeReq(), res);
    const b = res.body as any;
    expect(b.grants).toHaveLength(1);
    expect(b.grants[0].revokedAt).toBeTruthy();
    expect(b.grants[0].grantedBy).toBe(CAPTAIN);
  });
});
