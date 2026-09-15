// Unit tests — les routes staff d'équipe sont bornées à l'espace.
//
// L'ATTAQUE : `/api/admin/teams/[teamId]/members` (GET, POST, PATCH, DELETE),
// `/roster-bulk` et `/api/admin/teams/add-member` chargeaient l'équipe par son
// seul id. Un staff de n'importe quel espace — un owner d'espace développeur
// créé en libre-service suffit — lisait, complétait, modifiait ou vidait le
// roster d'une équipe d'un AUTRE espace. Ajouter un compte y fabriquait en plus
// un « rattachement » à son propre espace (correction de solde, rattrapage).
// Chaque cas vise une équipe de l'espace B depuis un staff de l'espace A :
// 404 (comme une équipe inexistante) et AUCUNE écriture.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: vi.fn(async () => undefined),
}));
vi.mock('@/utils/email', () => ({
  sendTeamJoinEmail: vi.fn(async () => undefined),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import membersHandler from '../../pages/api/admin/teams/[teamId]/members';
import rosterBulkHandler from '../../pages/api/admin/teams/[teamId]/roster-bulk';
import addMemberHandler from '../../pages/api/admin/teams/add-member';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEAM_A = '550e8400-e29b-41d4-a716-4466554400a1';
const TEAM_B = '550e8400-e29b-41d4-a716-4466554400b1';
const VICTIM = '22222222-2222-4222-8222-222222222222';
const ATTACKER_ALT = '33333333-3333-4333-8333-333333333333';
const TM_VICTIM = '44444444-4444-4444-8444-444444444444';

function staffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'admin',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let n = 0;
function req(over: Record<string, unknown>): any {
  n += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer scope-${Date.now()}-${n}` },
    query: {},
    body: {},
    cookies: {},
    ...over,
  };
}
function resp(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const snapshot = () => JSON.stringify(store.team_members);

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  store.staff = [staffRow()] as any;
  store.tenants = [
    { id: TENANT_A, slug: 'a', name: 'A', is_active: true },
    { id: TENANT_B, slug: 'b', name: 'B', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: 'staff-1', role: 'admin' },
  ] as any;
  store.teams = [
    { id: TEAM_A, tenant_id: TENANT_A, name: 'Alpha', captain_id: null },
    { id: TEAM_B, tenant_id: TENANT_B, name: 'Beta', captain_id: VICTIM },
  ] as any;
  store.team_members = [
    {
      id: TM_VICTIM,
      team_id: TEAM_B,
      tenant_id: TENANT_B,
      user_id: VICTIM,
      role: 'player',
      battle_tag: 'Victim#1234',
      is_substitute: false,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
  store.staff_logs = [] as any;
});

describe('/api/admin/teams/[teamId]/members — équipe d’un autre espace', () => {
  it('GET : 404, le roster ne sort pas', async () => {
    const res = resp();
    await membersHandler(req({ query: { teamId: TEAM_B } }), res);
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('Victim');
  });

  it('POST : 404, aucun compte ajouté', async () => {
    const before = snapshot();
    const res = resp();
    await membersHandler(
      req({
        method: 'POST',
        query: { teamId: TEAM_B },
        body: { userId: ATTACKER_ALT, battleTag: 'Alt#9999', force: true },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(snapshot()).toBe(before);
  });

  it('PATCH : 404, rien modifié', async () => {
    const before = snapshot();
    const res = resp();
    await membersHandler(
      req({
        method: 'PATCH',
        query: { teamId: TEAM_B },
        body: { memberId: TM_VICTIM, isSubstitute: true, force: true },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(snapshot()).toBe(before);
  });

  it('DELETE : 404, la joueuse n’est pas retirée', async () => {
    const before = snapshot();
    const res = resp();
    await membersHandler(
      req({
        method: 'DELETE',
        query: { teamId: TEAM_B },
        body: { memberId: TM_VICTIM, force: true },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(snapshot()).toBe(before);
  });

  it('POST sur SON espace : le membre est ajouté SANS accepted_at (ajout par un tiers)', async () => {
    // L'ajout staff reste possible, mais ne vaut pas accord de la personne :
    // sans `accepted_at`, il n'ouvre aucune prise TCG sur son compte.
    const res = resp();
    await membersHandler(
      req({
        method: 'POST',
        query: { teamId: TEAM_A },
        body: {
          userId: ATTACKER_ALT,
          battleTag: 'Alt#9999',
          force: true,
          mode: 'direct',
          reason: 'Correction du roster',
        },
      }),
      res
    );
    expect(res.statusCode).toBeLessThan(300);
    const added = (store.team_members as any[]).find(
      (m) => m.team_id === TEAM_A && m.user_id === ATTACKER_ALT
    );
    expect(added).toBeTruthy();
    expect(added.accepted_at ?? null).toBeNull();
  });

  it('GET sur une équipe de SON espace : 200', async () => {
    const res = resp();
    await membersHandler(req({ query: { teamId: TEAM_A } }), res);
    expect(res.statusCode).toBe(200);
  });
});

describe('/api/admin/teams/[teamId]/roster-bulk — équipe d’un autre espace', () => {
  it('404, aucun membre retiré', async () => {
    const before = snapshot();
    const res = resp();
    await rosterBulkHandler(
      req({
        method: 'POST',
        query: { teamId: TEAM_B },
        body: { operation: 'remove', memberIds: [TM_VICTIM], force: true },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(snapshot()).toBe(before);
  });
});

describe('/api/admin/teams/add-member — équipe d’un autre espace', () => {
  it('404, aucun rattachement fabriqué', async () => {
    const before = snapshot();
    const res = resp();
    await addMemberHandler(
      req({
        method: 'POST',
        body: { teamId: TEAM_B, userId: ATTACKER_ALT, battleTag: 'Alt#9999' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(snapshot()).toBe(before);
  });
});
