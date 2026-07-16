// Unit tests for the demandes processing engine HTTP layer.
//   POST /api/admin/demandes  (action: 'updateStatus' | 'requestMoreInfo')
//
// Focus on the enhanced approval flow:
//   - approving a captain_request with a NEW team name auto-creates the team
//     and assigns the requester as captain in one step;
//   - co-members on a new-team captain_request become PENDING INVITES
//     (demandes type='invite', source='website') — NOT forced team_members;
//   - approving with a corrected battle_tag writes the corrected tag;
//   - the "request more info" action persists staff_note and keeps status
//     pending;
//   - existing approve / reject behaviour is preserved (no regression).
//
// Mirrors the supabaseMock harness used by apiAdminMatchDrafts.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAuthListUsers,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import handler from '../../pages/api/admin/demandes/index';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'; // DEFAULT_TENANT_ID

const REQUESTER = '44444444-4444-4444-8444-444444444444';
const DEMANDE_CAPTAIN_NEW = '11111111-1111-4111-8111-111111111111';
const DEMANDE_CAPTAIN_EXISTING = '11111111-1111-4111-8111-111111111112';
const DEMANDE_JOIN = '11111111-1111-4111-8111-111111111113';
const DEMANDE_OTHER = '11111111-1111-4111-8111-111111111114';
const EXISTING_TEAM = '22222222-2222-4222-8222-22222222aaaa';

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'admin'
): StaffMember {
  return {
    id: 'staff-mgr-1',
    auth_user_id: 'user-1',
    email: 'mgr@x.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: {},
    body: {},
    cookies: {},
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

function seedBase() {
  store.staff = [makeStaffRow('admin')] as any;
  store.teams = [
    {
      id: EXISTING_TEAM,
      tenant_id: TENANT,
      name: 'Existing Squad',
      slug: 'existing-squad',
      captain_id: null,
      is_active: true,
    },
  ] as any;
  store.team_members = [] as any;
  store.tournament_teams = [] as any;
  store.news = [] as any;
  store.staff_logs = [] as any;
  store.demandes = [
    {
      id: DEMANDE_CAPTAIN_NEW,
      tenant_id: TENANT,
      user_id: REQUESTER,
      team_id: null,
      type: 'captain_request',
      status: 'pending',
      comment: 'New team please',
      staff_note: null,
      source: 'website',
      payload: {
        request_type: 'new_team',
        team_name: 'Brand New Team',
        user_battle_tag: 'Cap#1234',
        user_email: 'captain@x.com',
        members: [
          {
            email: 'invitee1@x.com',
            battle_tag: 'Inv1#1111',
            display_name: 'Invitee One',
            specialty: 'tank',
          },
          {
            email: 'invitee2@x.com',
            battle_tag: 'Inv2#2222',
            display_name: 'Invitee Two',
            specialty: 'support',
          },
          // The requester is also (redundantly) in the invited list; the
          // approval path must NOT re-insert them as a player.
          {
            email: 'captain@x.com',
            battle_tag: 'Cap#1234',
            display_name: 'Captain',
            specialty: 'dps',
          },
        ],
      },
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: DEMANDE_CAPTAIN_EXISTING,
      tenant_id: TENANT,
      user_id: REQUESTER,
      team_id: EXISTING_TEAM,
      type: 'captain_request',
      status: 'pending',
      comment: null,
      staff_note: null,
      source: 'website',
      payload: {
        request_type: 'existing_team',
        existing_team_id: EXISTING_TEAM,
        existing_team_name: 'Existing Squad',
        user_email: 'captain@x.com',
        // Invited members present on an EXISTING-team request must be ignored:
        // the approval is a pure captain promotion, not a roster edit.
        members: [
          {
            email: 'invitee1@x.com',
            battle_tag: 'Inv1#1111',
            specialty: 'tank',
          },
        ],
      },
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: DEMANDE_JOIN,
      tenant_id: TENANT,
      user_id: REQUESTER,
      team_id: EXISTING_TEAM,
      type: 'join',
      status: 'pending',
      comment: null,
      staff_note: null,
      source: 'website',
      payload: {
        desired_role: 'player',
        // Deliberately invalid / missing tag so staff can correct it.
        user_battle_tag: 'not-a-tag',
        team_name: 'Existing Squad',
      },
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: DEMANDE_OTHER,
      tenant_id: TENANT,
      user_id: REQUESTER,
      team_id: null,
      type: 'other',
      status: 'pending',
      comment: 'misc',
      staff_note: null,
      source: 'website',
      payload: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  // Invitees resolve to pre-existing auth users (resolveUserIdByEmail →
  // findOrCreateUserByEmail builds its email map from listUsers).
  setAuthListUsers([
    { id: 'invitee-1', email: 'invitee1@x.com' },
    { id: 'invitee-2', email: 'invitee2@x.com' },
    { id: REQUESTER, email: 'captain@x.com' },
  ]);
  seedBase();
});

describe('POST /api/admin/demandes — captain_request approval', () => {
  it('auto-creates a NEW team and assigns the requester as captain', async () => {
    const req = makeReq({
      body: {
        action: 'updateStatus',
        demandeIds: [DEMANDE_CAPTAIN_NEW],
        newStatus: 'approved',
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);

    // A new team got created with the payload name.
    const created = (store.teams as any[]).find(
      (t) => t.name === 'Brand New Team'
    );
    expect(created).toBeTruthy();
    expect(created.tenant_id).toBe(TENANT);
    expect(typeof created.slug).toBe('string');

    // Requester is a member with role captain + the stored BattleTag.
    const member = (store.team_members as any[]).find(
      (m) => m.team_id === created.id && m.user_id === REQUESTER
    );
    expect(member).toBeTruthy();
    expect(member.role).toBe('captain');
    expect(member.battle_tag).toBe('Cap#1234');

    // captain_id set on the team.
    expect(created.captain_id).toBe(REQUESTER);

    // Invite-accept model : co-members are NOT inserted as team_members — only
    // the captain is on the roster. They become PENDING INVITES instead.
    const teamMembers = (store.team_members as any[]).filter(
      (m) => m.team_id === created.id
    );
    expect(teamMembers.some((m) => m.user_id === 'invitee-1')).toBe(false);
    expect(teamMembers.some((m) => m.user_id === 'invitee-2')).toBe(false);

    // The requester is the only roster member, with role captain.
    const requesterRows = teamMembers.filter((m) => m.user_id === REQUESTER);
    expect(requesterRows.length).toBe(1);
    expect(requesterRows[0].role).toBe('captain');
    expect(teamMembers.length).toBe(1);

    // Each co-member gets a pending invite (demandes type='invite',
    // source='website') carrying role + battle_tag + specialty, inviter =
    // the captain (requester). The requester is NOT self-invited.
    const invites = (store.demandes as any[]).filter(
      (dem) =>
        dem.type === 'invite' &&
        dem.status === 'pending' &&
        dem.team_id === created.id
    );
    expect(invites.length).toBe(2);
    const inv1 = invites.find((i) => i.user_id === 'invitee-1');
    const inv2 = invites.find((i) => i.user_id === 'invitee-2');
    expect(inv1).toBeTruthy();
    expect(inv1.source).toBe('website');
    expect(inv1.payload.desired_role).toBe('player');
    expect(inv1.payload.specialty).toBe('tank');
    expect(inv1.payload.battle_tag).toBe('Inv1#1111');
    expect(inv1.payload.captain_auth_user_id).toBe(REQUESTER);
    expect(inv2).toBeTruthy();
    expect(inv2.payload.specialty).toBe('support');
    expect(invites.some((i) => i.user_id === REQUESTER)).toBe(false);

    // Outcome flag surfaced + audit log emitted.
    expect(res.body.outcomes[DEMANDE_CAPTAIN_NEW].teamAutoCreated).toBe(true);
    const processLog = (store.staff_logs as any[]).find(
      (l) => l.action === 'process_demande'
    );
    expect(processLog).toBeTruthy();
    expect(processLog.payload.team_auto_created).toBe(true);
  });

  it('guards against duplicate team names (reuses the existing team)', async () => {
    // Point the new-team demande at a name that already exists.
    (store.demandes as any[]).find(
      (d) => d.id === DEMANDE_CAPTAIN_NEW
    ).payload.team_name = 'Existing Squad';

    const teamCountBefore = (store.teams as any[]).length;

    const req = makeReq({
      body: {
        action: 'updateStatus',
        demandeIds: [DEMANDE_CAPTAIN_NEW],
        newStatus: 'approved',
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    // No new team created — the existing one is reused.
    expect((store.teams as any[]).length).toBe(teamCountBefore);
    const existing = (store.teams as any[]).find((t) => t.id === EXISTING_TEAM);
    expect(existing.captain_id).toBe(REQUESTER);
  });

  it('assigns captain on an EXISTING-team captain_request without creating a team', async () => {
    const teamCountBefore = (store.teams as any[]).length;

    const req = makeReq({
      body: {
        action: 'updateStatus',
        demandeIds: [DEMANDE_CAPTAIN_EXISTING],
        newStatus: 'approved',
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect((store.teams as any[]).length).toBe(teamCountBefore);
    const existing = (store.teams as any[]).find((t) => t.id === EXISTING_TEAM);
    expect(existing.captain_id).toBe(REQUESTER);
    expect(
      res.body.outcomes[DEMANDE_CAPTAIN_EXISTING]?.teamAutoCreated
    ).toBeFalsy();

    // SCOPING: invited members on an EXISTING-team request must NOT be inserted
    // NOR invited. Only the requester (captain promotion) should appear on the
    // team, and no invite demande should be created.
    const existingMembers = (store.team_members as any[]).filter(
      (m) => m.team_id === EXISTING_TEAM
    );
    expect(existingMembers.some((m) => m.user_id === 'invitee-1')).toBe(false);
    expect(existingMembers.every((m) => m.user_id === REQUESTER)).toBe(true);
    const existingTeamInvites = (store.demandes as any[]).filter(
      (dem) => dem.type === 'invite' && dem.team_id === EXISTING_TEAM
    );
    expect(existingTeamInvites.length).toBe(0);
  });
});

describe('POST /api/admin/demandes — corrected BattleTag', () => {
  it('writes the corrected battle_tag when approving a join', async () => {
    const req = makeReq({
      body: {
        action: 'updateStatus',
        demandeIds: [DEMANDE_JOIN],
        newStatus: 'approved',
        battleTagOverrides: { [DEMANDE_JOIN]: 'Fixed#5678' },
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find(
      (m) => m.team_id === EXISTING_TEAM && m.user_id === REQUESTER
    );
    expect(member).toBeTruthy();
    expect(member.battle_tag).toBe('Fixed#5678');
    expect(res.body.outcomes[DEMANDE_JOIN].tagCorrected).toBe(true);

    const processLog = (store.staff_logs as any[]).find(
      (l) => l.action === 'process_demande'
    );
    expect(processLog.payload.tag_corrected).toBe(true);
  });

  it('falls back to the stored battle_tag when no override is provided', async () => {
    const req = makeReq({
      body: {
        action: 'updateStatus',
        demandeIds: [DEMANDE_JOIN],
        newStatus: 'approved',
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find(
      (m) => m.team_id === EXISTING_TEAM && m.user_id === REQUESTER
    );
    expect(member.battle_tag).toBe('not-a-tag');
    expect(res.body.outcomes[DEMANDE_JOIN]?.tagCorrected).toBeFalsy();
  });
});

describe('POST /api/admin/demandes — requestMoreInfo', () => {
  it('persists the staff_note and keeps the demande pending', async () => {
    const req = makeReq({
      body: {
        action: 'requestMoreInfo',
        demandeId: DEMANDE_OTHER,
        note: 'Peux-tu confirmer ton BattleTag ?',
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const row = (store.demandes as any[]).find((d) => d.id === DEMANDE_OTHER);
    expect(row.status).toBe('pending');
    expect(row.staff_note).toContain('Peux-tu confirmer ton BattleTag ?');
    expect(row.staff_note).toContain('Infos demandées');

    const processLog = (store.staff_logs as any[]).find(
      (l) => l.action === 'process_demande'
    );
    expect(processLog).toBeTruthy();
    expect(processLog.payload.requested_more_info).toBe(true);
    expect(processLog.payload.resulting_status).toBe('pending');
  });

  it('appends to an existing staff_note rather than overwriting it', async () => {
    (store.demandes as any[]).find((d) => d.id === DEMANDE_OTHER).staff_note =
      'previous note';

    const req = makeReq({
      body: {
        action: 'requestMoreInfo',
        demandeId: DEMANDE_OTHER,
        note: 'second question',
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const row = (store.demandes as any[]).find((d) => d.id === DEMANDE_OTHER);
    expect(row.staff_note).toContain('previous note');
    expect(row.staff_note).toContain('second question');
  });

  it('rejects an empty note with 400', async () => {
    const req = makeReq({
      body: {
        action: 'requestMoreInfo',
        demandeId: DEMANDE_OTHER,
        note: '   ',
      },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/admin/demandes — no regression on basic flows', () => {
  it('approves an "other" demande and stamps processed_at', async () => {
    const req = makeReq({
      body: {
        action: 'updateStatus',
        demandeIds: [DEMANDE_OTHER],
        newStatus: 'approved',
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const row = (store.demandes as any[]).find((d) => d.id === DEMANDE_OTHER);
    expect(row.status).toBe('approved');
    expect(row.processed_at).toBeTruthy();
    expect(row.processed_by_staff_id).toBe('staff-mgr-1');
  });

  it('rejects a pending demande', async () => {
    const req = makeReq({
      body: {
        action: 'updateStatus',
        demandeIds: [DEMANDE_OTHER],
        newStatus: 'rejected',
        staffComment: 'incomplete',
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const row = (store.demandes as any[]).find((d) => d.id === DEMANDE_OTHER);
    expect(row.status).toBe('rejected');
    expect(row.staff_note).toBe('incomplete');
  });

  it('still emits the staff_batch_action audit log alongside process_demande', async () => {
    const req = makeReq({
      body: {
        action: 'updateStatus',
        demandeIds: [DEMANDE_OTHER],
        newStatus: 'approved',
      },
    });
    await handler(req, makeRes());

    const actions = (store.staff_logs as any[]).map((l) => l.action);
    expect(actions).toContain('staff_batch_action');
    expect(actions).toContain('process_demande');
  });
});
