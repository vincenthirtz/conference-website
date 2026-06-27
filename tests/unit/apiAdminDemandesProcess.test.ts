// Unit tests for the demandes processing engine HTTP layer.
//   POST /api/admin/demandes  (action: 'updateStatus' | 'requestMoreInfo')
//
// Focus on the enhanced approval flow:
//   - approving a captain_request with a NEW team name auto-creates the team
//     and assigns the requester as captain in one step;
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
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'manager'
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
  store.staff = [makeStaffRow('manager')] as any;
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
