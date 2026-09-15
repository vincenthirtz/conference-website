// Unit tests — l'ajout d'un membre par le STAFF passe par une invitation.
//
// Les routes staff inséraient directement le compte au roster, sans l'accord de
// la personne. Désormais (cf. utils/teams/staffInvitation.ts) :
//   - par défaut, une invitation EN ATTENTE est créée : aucun membre, aucune
//     news, un email avec le lien privé ;
//   - l'ajout direct exige un motif, journalisé, et laisse `accepted_at` NULL ;
//   - s'ajouter soi-même vaut accord : ajout direct, sans motif, `accepted_at`.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const logStaffAction = vi.hoisted(() => vi.fn(async () => undefined));
const sendTeamInviteLinkEmail = vi.hoisted(() =>
  vi.fn(async () => ({ success: true }))
);
const sendTeamJoinEmail = vi.hoisted(() =>
  vi.fn(async () => ({ success: true }))
);
vi.mock('@/utils/staffLogs', () => ({ logStaffAction }));
vi.mock('@/utils/email', () => ({
  sendTeamJoinEmail,
  sendTeamInviteLinkEmail,
}));
vi.mock('../../utils/email', () => ({
  sendTeamJoinEmail,
  sendTeamInviteLinkEmail,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import membersHandler from '../../pages/api/admin/teams/[teamId]/members';
import addMemberHandler from '../../pages/api/admin/teams/add-member';
import { parseStaffAddMode } from '../../utils/teams/staffAddMode';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEAM_A = '550e8400-e29b-41d4-a716-4466554400a1';
const TEAM_WITH_CAPTAIN = '550e8400-e29b-41d4-a716-4466554400a2';
const PLAYER = '33333333-3333-4333-8333-333333333333';
const CAPTAIN = '22222222-2222-4222-8222-222222222222';
const STAFF_USER = '11111111-1111-4111-8111-111111111111';

function staffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: STAFF_USER,
    email: 'staff@a.com',
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
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer invite-${Date.now()}-${n}` },
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

const invites = () =>
  ((store.demandes ?? []) as any[]).filter((d) => d.type === 'invite');
const rosterOf = (teamId: string) =>
  ((store.team_members ?? []) as any[]).filter((m) => m.team_id === teamId);

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffAction.mockClear();
  sendTeamInviteLinkEmail.mockClear();
  sendTeamJoinEmail.mockClear();
  setAuthUser({ id: STAFF_USER });
  setAdminUser(PLAYER, 'joueuse@exemple.fr');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  store.staff = [staffRow()] as any;
  store.tenants = [
    { id: TENANT_A, slug: 'a', name: 'A', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: 'staff-1', role: 'admin' },
  ] as any;
  store.teams = [
    { id: TEAM_A, tenant_id: TENANT_A, name: 'Alpha', captain_id: null },
    {
      id: TEAM_WITH_CAPTAIN,
      tenant_id: TENANT_A,
      name: 'Beta',
      captain_id: CAPTAIN,
    },
  ] as any;
  store.team_members = [] as any;
  store.demandes = [] as any;
  store.news = [] as any;
  store.tournament_teams = [] as any;
  store.staff_logs = [] as any;
});

describe('parseStaffAddMode', () => {
  it('invitation par défaut, sans motif', () => {
    expect(parseStaffAddMode({})).toEqual({
      ok: true,
      mode: 'invite',
      reason: null,
    });
  });
  it('ajout direct : motif exigé, rogné', () => {
    expect(parseStaffAddMode({ mode: 'direct' })).toMatchObject({
      ok: false,
      code: 'REASON_REQUIRED',
    });
    expect(
      parseStaffAddMode({ mode: 'direct', reason: '   ok  ' })
    ).toMatchObject({
      ok: false,
      code: 'REASON_REQUIRED',
    });
    expect(
      parseStaffAddMode({ mode: 'direct', reason: '  Roster à régulariser ' })
    ).toEqual({ ok: true, mode: 'direct', reason: 'Roster à régulariser' });
  });
  it('mode inconnu : refusé plutôt que ramené au défaut', () => {
    expect(parseStaffAddMode({ mode: 'force' })).toMatchObject({
      ok: false,
      code: 'INVALID_MODE',
    });
  });
});

describe('/api/admin/teams/[teamId]/members — POST', () => {
  it("sans mode : invitation en attente, personne n'est ajouté", async () => {
    const res = resp();
    await membersHandler(
      req({
        query: { teamId: TEAM_A },
        body: { userId: PLAYER, battleTag: 'Joueuse#1234' },
      }),
      res
    );
    expect(res.statusCode).toBe(202);
    expect(res.body.invited).toBe(true);
    expect(res.body.invite_url).toMatch(/^http/);
    expect(res.body.email_sent).toBe(true);

    expect(rosterOf(TEAM_A)).toHaveLength(0);
    const [invite] = invites();
    expect(invite).toMatchObject({
      tenant_id: TENANT_A,
      team_id: TEAM_A,
      user_id: PLAYER,
      status: 'pending',
      source: 'staff',
    });
    expect(invite.payload.desired_role).toBe('player');
    expect(invite.payload.invite_token_hash).toBeTruthy();
    // Le jeton en clair ne sort qu'une fois, dans la réponse : jamais stocké.
    expect(JSON.stringify(invite)).not.toContain(
      res.body.invite_url.split('/').pop()
    );

    expect(sendTeamInviteLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'joueuse@exemple.fr', teamName: 'Alpha' })
    );
    expect(sendTeamJoinEmail).not.toHaveBeenCalled();
    expect(logStaffAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'invite_team_member' })
    );
  });

  it('remplaçante cochée : le rôle de l’invitation porte « substitute »', async () => {
    const res = resp();
    await membersHandler(
      req({
        query: { teamId: TEAM_A },
        body: { userId: PLAYER, battleTag: 'Joueuse#1234', isSubstitute: true },
      }),
      res
    );
    expect(res.statusCode).toBe(202);
    expect(invites()[0].payload.desired_role).toBe('substitute');
  });

  it("capitanat promis sur une équipe qui a déjà sa capitaine : 409, rien n'est créé", async () => {
    const res = resp();
    await membersHandler(
      req({
        query: { teamId: TEAM_WITH_CAPTAIN },
        body: { userId: PLAYER, battleTag: 'Joueuse#1234', setCaptain: true },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('CAPTAIN_ALREADY_SET');
    expect(invites()).toHaveLength(0);
    expect(store.teams[1]).toMatchObject({ captain_id: CAPTAIN });
  });

  it('ajout direct SANS motif : 400, aucune écriture', async () => {
    const res = resp();
    await membersHandler(
      req({
        query: { teamId: TEAM_A },
        body: { userId: PLAYER, battleTag: 'Joueuse#1234', mode: 'direct' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('REASON_REQUIRED');
    expect(rosterOf(TEAM_A)).toHaveLength(0);
    expect(invites()).toHaveLength(0);
  });

  it('ajout direct AVEC motif : membre sans accepted_at, motif journalisé', async () => {
    const res = resp();
    await membersHandler(
      req({
        query: { teamId: TEAM_A },
        body: {
          userId: PLAYER,
          battleTag: 'Joueuse#1234',
          mode: 'direct',
          reason: 'Roster d’inscription à régulariser',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const [member] = rosterOf(TEAM_A);
    expect(member.user_id).toBe(PLAYER);
    expect(member.accepted_at ?? null).toBeNull();
    expect(invites()).toHaveLength(0);
    expect(logStaffAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'add_team_member',
        payload: expect.objectContaining({
          mode: 'direct',
          reason: 'Roster d’inscription à régulariser',
        }),
      })
    );
  });

  it("s'ajouter soi-même : direct, sans motif, avec accepted_at", async () => {
    const res = resp();
    await membersHandler(
      req({
        query: { teamId: TEAM_A },
        body: { userId: STAFF_USER, role: 'coach' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const [member] = rosterOf(TEAM_A);
    expect(member.user_id).toBe(STAFF_USER);
    expect(member.accepted_at).toBeTruthy();
    expect(invites()).toHaveLength(0);
  });
});

describe('/api/admin/teams/add-member — POST', () => {
  it('sans mode : invitation, ni membre ni news « X rejoint Y »', async () => {
    const res = resp();
    await addMemberHandler(
      req({
        body: { teamId: TEAM_A, userId: PLAYER, battleTag: 'Joueuse#1234' },
      }),
      res
    );
    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      invited: true,
      teamId: TEAM_A,
      userId: PLAYER,
      captainSet: false,
      emailSent: true,
    });
    expect(rosterOf(TEAM_A)).toHaveLength(0);
    expect(store.news).toHaveLength(0);
    expect(invites()).toHaveLength(1);
  });

  it('une seconde invitation pour la même personne : 409', async () => {
    const body = { teamId: TEAM_A, userId: PLAYER, battleTag: 'Joueuse#1234' };
    await addMemberHandler(req({ body }), resp());
    const res = resp();
    await addMemberHandler(req({ body }), res);
    expect(res.statusCode).toBe(409);
    expect(invites()).toHaveLength(1);
  });

  it('ajout direct avec motif : la personne est prévenue par email', async () => {
    const res = resp();
    await addMemberHandler(
      req({
        body: {
          teamId: TEAM_A,
          userId: PLAYER,
          battleTag: 'Joueuse#1234',
          mode: 'direct',
          reason: 'Personne sans accès à ses emails',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(rosterOf(TEAM_A)[0].accepted_at ?? null).toBeNull();
    expect(sendTeamJoinEmail).toHaveBeenCalledWith(
      'joueuse@exemple.fr',
      'Alpha',
      'player',
      TENANT_A
    );
    expect(res.body.emailSent).toBe(true);
  });
});
