// Règles de roster de l'équipe gérée, au SERVICE et à la garde — lot P10
// (docs/PLAN-industrialisation-joueur.md). Trois choses :
//   1. les déclarations des routes migrées (`handler.subjectRoute`) : act-as
//      S4 conservé exactement là où il existait, `?as=` refusé sur les routes
//      qui ne l'ont jamais suivi, permission d'équipe déclarée ;
//   2. « capitaine toujours tout » : la capitaine tranche les conflits entre
//      pairs (dégrader / retirer un membre privilégié), une manager non ;
//   3. « coach jamais roster » : le rôle coach (scrims, feuille de match) ne
//      passe aucune route de roster.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { getManagedTeam } from '../../utils/teams/managementAccess';
import { DEFAULT_TENANT_ID } from '../../utils/tenantId';
import { logger } from '../../utils/logger';
import type { SubjectRouteHandler } from '../../utils/player/defineSubjectRoute';
import type { SubjectContext } from '../../utils/subject';
import {
  removeMember,
  updateMemberRole,
} from '../../features/player/team/service/roster';

import updateRoleHandler from '../../pages/api/teams/update-member-role';
import updateSpecialtyHandler from '../../pages/api/teams/update-member-specialty';
import updateMemberHandler from '../../pages/api/teams/update-member';
import removeMemberHandler from '../../pages/api/teams/[teamId]/members';
import transferCaptainHandler from '../../pages/api/teams/transfer-captain';
import joinRequestsHandler from '../../pages/api/teams/join-requests';
import transferRequestsHandler from '../../pages/api/teams/transfer-requests';
import invitationsHandler from '../../pages/api/teams/invitations/index';
import invitationHandler from '../../pages/api/teams/invitations/[invitationId]';
import inviteLinksHandler from '../../pages/api/teams/invite-links/index';
import addMemberHandler from '../../pages/api/teams/add-member';
import leaveHandler from '../../pages/api/teams/leave';
import searchPlayersHandler from '../../pages/api/teams/search-players';
import freePlayersHandler from '../../pages/api/teams/free-players';
import inviteFreePlayerHandler from '../../pages/api/teams/invite-free-player';

vi.mock('@/utils/teams/rosterLock', () => ({
  isTeamRosterLocked: vi.fn(async () => ({ locked: false })),
  rosterLockErrorMessage: () => 'Roster locked',
}));

const TEAM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MANAGER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const COACH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PEER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TM_MGR = '22222222-2222-4222-8222-222222222222';
const TM_PEER = '44444444-4444-4444-8444-444444444444';
const TM_COACH = '55555555-5555-4555-8555-555555555555';

const ROSTER_FORBIDDEN =
  "Ton rôle dans l'équipe ne permet pas de gérer le roster.";

let n = 0;
function req(over: Record<string, unknown> = {}): any {
  n += 1;
  return {
    method: 'GET',
    url: '/api/test',
    headers: { host: 'h', authorization: `Bearer t-roster-rules-${n}` },
    cookies: {},
    query: {},
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...over,
  };
}

function res(): any {
  const r: any = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c: number) => ((r.statusCode = c), r);
  r.json = (b: unknown) => ((r.body = b), r);
  r.end = () => r;
  r.setHeader = (k: string, v: unknown) => {
    r.headers[k] = v;
  };
  return r;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  store.teams = [
    {
      id: TEAM_ID,
      name: 'Alpha',
      logo_url: null,
      captain_id: CAPTAIN_ID,
      is_active: true,
      tenant_id: DEFAULT_TENANT_ID,
    },
  ] as any;
  store.team_members = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      team_id: TEAM_ID,
      user_id: CAPTAIN_ID,
      role: 'player',
      tenant_id: DEFAULT_TENANT_ID,
    },
    {
      id: TM_MGR,
      team_id: TEAM_ID,
      user_id: MANAGER_ID,
      role: 'manager',
      tenant_id: DEFAULT_TENANT_ID,
    },
    {
      id: TM_PEER,
      team_id: TEAM_ID,
      user_id: PEER_ID,
      role: 'manager',
      tenant_id: DEFAULT_TENANT_ID,
    },
    {
      id: TM_COACH,
      team_id: TEAM_ID,
      user_id: COACH_ID,
      role: 'coach',
      tenant_id: DEFAULT_TENANT_ID,
    },
  ] as any;
});

/* ------------------------------------------------------------------------
 * 1. Déclarations
 * ---------------------------------------------------------------------- */

type Expect = {
  subject: 'self' | 'follow';
  actAs: boolean;
  team: string | null;
};
const F = (actAs: boolean, team: string | null): Expect => ({
  subject: 'follow',
  actAs,
  team,
});
const S = (team: string | null): Expect => ({
  subject: 'self',
  actAs: false,
  team,
});

const DECLARED: [string, SubjectRouteHandler, Record<string, Expect>][] = [
  [
    'update-member-role',
    updateRoleHandler as never,
    { PATCH: F(true, 'manage_roster') },
  ],
  [
    'update-member-specialty',
    updateSpecialtyHandler as never,
    { PATCH: F(true, 'manage_roster') },
  ],
  [
    'update-member',
    updateMemberHandler as never,
    { PATCH: F(true, 'manage_roster') },
  ],
  // Équipe du chemin : garde appelée par le service (ordre 400/404/403).
  ['[teamId]/members', removeMemberHandler as never, { DELETE: F(true, null) }],
  // Capitaine trouvée par son capitanat, manager par la garde : service.
  [
    'transfer-captain',
    transferCaptainHandler as never,
    { PATCH: F(true, null) },
  ],
  [
    'join-requests',
    joinRequestsHandler as never,
    {
      GET: F(false, 'manage_join_requests'),
      POST: F(true, 'manage_join_requests'),
    },
  ],
  [
    'invitations',
    invitationsHandler as never,
    { GET: F(false, 'manage_roster'), POST: F(true, 'manage_roster') },
  ],
  [
    'invitations/[id]',
    invitationHandler as never,
    { POST: F(true, 'manage_roster'), DELETE: F(true, 'manage_roster') },
  ],
  [
    'invite-links',
    inviteLinksHandler as never,
    {
      GET: F(false, 'manage_roster'),
      POST: F(true, 'manage_roster'),
      DELETE: F(true, 'manage_roster'),
    },
  ],
  [
    'search-players',
    searchPlayersHandler as never,
    { GET: F(false, 'manage_roster') },
  ],
  [
    'transfer-requests',
    transferRequestsHandler as never,
    { GET: S('manage_roster'), POST: S('manage_roster') },
  ],
  ['add-member', addMemberHandler as never, { POST: S('manage_roster') }],
  ['free-players', freePlayersHandler as never, { GET: S('manage_roster') }],
  [
    'invite-free-player',
    inviteFreePlayerHandler as never,
    { POST: S('manage_roster') },
  ],
  // Partir est un droit de membre : appartenance vérifiée par le service.
  ['leave', leaveHandler as never, { POST: S(null) }],
];

describe('routes de roster migrées : déclarations (S4 inchangé)', () => {
  for (const [name, handler, methods] of DECLARED) {
    it(name, () => {
      const meta = handler.subjectRoute.methods;
      expect(Object.keys(meta).sort()).toEqual(Object.keys(methods).sort());
      for (const [m, want] of Object.entries(methods)) {
        const got = meta[m as keyof typeof meta]!;
        expect({
          subject: got.subject,
          actAs: got.actAs,
          team: got.team?.permission ?? null,
        }).toEqual(want);
      }
    });
  }
});

/* ------------------------------------------------------------------------
 * 2. « Capitaine toujours tout » — au service
 * ---------------------------------------------------------------------- */

async function ctxFor(userId: string) {
  const team = await getManagedTeam(userId, DEFAULT_TENANT_ID, TEAM_ID);
  expect(team).not.toBeNull();
  const subject: SubjectContext = {
    userId,
    tenantId: DEFAULT_TENANT_ID,
    callerId: userId,
    isInspection: false,
    staffId: null,
    staffRole: null,
    isActingAs: false,
  };
  return {
    db: supabaseAdmin as never,
    tenantId: DEFAULT_TENANT_ID,
    subject,
    logger,
    team: team!,
  };
}

describe('capitaine toujours tout (service)', () => {
  it('la capitaine dégrade une manager ; une manager ne dégrade pas sa pair', async () => {
    await expect(
      updateMemberRole(await ctxFor(MANAGER_ID), {
        memberId: TM_PEER,
        role: 'player',
      })
    ).rejects.toMatchObject({ status: 403 });

    const done = await updateMemberRole(await ctxFor(CAPTAIN_ID), {
      memberId: TM_PEER,
      role: 'player',
    });
    expect(done).toMatchObject({ success: true, newRole: 'player' });
  });

  it('la capitaine retire une manager ; une manager ne retire pas sa pair', async () => {
    const managerCtx = await ctxFor(MANAGER_ID);
    await expect(
      removeMember(managerCtx, TEAM_ID, { memberId: TM_PEER })
    ).rejects.toMatchObject({ status: 403 });

    const captainCtx = await ctxFor(CAPTAIN_ID);
    await expect(
      removeMember(captainCtx, TEAM_ID, { memberId: TM_PEER })
    ).resolves.toMatchObject({ success: true });
  });

  it('personne ne retire la capitaine du roster (transfert d’abord)', async () => {
    const managerCtx = await ctxFor(MANAGER_ID);
    await expect(
      removeMember(managerCtx, TEAM_ID, {
        memberId: '11111111-1111-4111-8111-111111111111',
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});

/* ------------------------------------------------------------------------
 * 3. « Coach jamais roster » — à la garde
 * ---------------------------------------------------------------------- */

describe('coach jamais roster', () => {
  beforeEach(() => setAuthUser({ id: COACH_ID }));

  const CASES: [
    string,
    (q: any, r: any) => Promise<void>,
    Record<string, unknown>,
  ][] = [
    [
      'update-member-role',
      updateRoleHandler,
      { method: 'PATCH', body: { memberId: TM_PEER, role: 'player' } },
    ],
    [
      'update-member',
      updateMemberHandler,
      { method: 'PATCH', body: { memberId: TM_PEER, battle_tag: 'Abc#1234' } },
    ],
    [
      'add-member',
      addMemberHandler,
      { method: 'POST', body: { email: 'x@example.com' } },
    ],
    [
      'invitations',
      invitationsHandler,
      { method: 'POST', body: { email: 'x@example.com' } },
    ],
    ['invite-links', inviteLinksHandler, { method: 'POST', body: {} }],
    [
      'search-players',
      searchPlayersHandler,
      { method: 'GET', query: { q: 'abc' } },
    ],
    ['free-players', freePlayersHandler, { method: 'GET' }],
    ['transfer-requests', transferRequestsHandler, { method: 'GET' }],
    [
      '[teamId]/members',
      removeMemberHandler,
      {
        method: 'DELETE',
        query: { teamId: TEAM_ID },
        body: { memberId: TM_PEER },
      },
    ],
  ];

  for (const [name, handler, over] of CASES) {
    it(`${name} : 403, rien d'écrit`, async () => {
      const before = JSON.stringify(store.team_members);
      const r = res();
      await handler(req(over), r);
      expect(r.statusCode).toBe(403);
      expect(r.body?.error).toBe(ROSTER_FORBIDDEN);
      expect(JSON.stringify(store.team_members)).toBe(before);
    });
  }

  it('le coach garde ses gestes à lui (scrims), pas le roster', async () => {
    const access = await getManagedTeam(COACH_ID, DEFAULT_TENANT_ID, TEAM_ID);
    expect(access?.permissions).toContain('manage_scrims');
    expect(access?.permissions).not.toContain('manage_roster');
  });
});
