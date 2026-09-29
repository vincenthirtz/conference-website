// tests/unit/apiAdminScrimForward.test.ts
// POST /api/admin/scrims/forward — transfert d'une demande de scrim externe
// vers une autre équipe (module features/admin/scrims).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(
    async (_entry: Record<string, unknown>) => undefined
  ),
}));
vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import forwardHandler from '../../pages/api/admin/scrims/forward';

const DEMANDE_ID = '6b3e2f0a-1c4d-4e5f-8a9b-0c1d2e3f4a51';
const TEAM_A = '6b3e2f0a-1c4d-4e5f-8a9b-0c1d2e3f4a61';
const TEAM_B = '6b3e2f0a-1c4d-4e5f-8a9b-0c1d2e3f4a62';

function staffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'caster',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let n = 0;
function makeReq(body: unknown): any {
  n += 1;
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer t-fwd-${n}` },
    query: {},
    body,
  };
}

function makeRes(): any {
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
  logStaffActionMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [staffRow()] as any;
  store.teams = [
    {
      id: TEAM_A,
      name: 'Phoenix',
      is_active: true,
      tenant_id: CONFERENCE_TENANT_ID,
    },
    {
      id: TEAM_B,
      name: 'Dragons',
      is_active: true,
      tenant_id: CONFERENCE_TENANT_ID,
    },
  ] as any;
  store.demandes = [
    {
      id: DEMANDE_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      type: 'scrim',
      source: 'public',
      status: 'pending',
      team_id: TEAM_A,
      comment: 'Scrim mardi ?',
      payload: {},
      staff_note: null,
    },
  ] as any;
});

describe('POST /api/admin/scrims/forward', () => {
  it('201 : crée la demande pour l’équipe cible, annote l’origine, journalise', async () => {
    const res = makeRes();
    await forwardHandler(
      makeReq({ demandeId: DEMANDE_ID, targetTeamId: TEAM_B }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      targetTeam: { id: TEAM_B, name: 'Dragons' },
    });
    const rows = store.demandes as any[];
    expect(rows).toHaveLength(2);
    const created = rows.find((d) => d.id === res.body.newDemandeId);
    expect(created).toMatchObject({ team_id: TEAM_B, source: 'public' });
    expect(created.payload.forwarded_from.demande_id).toBe(DEMANDE_ID);
    expect(rows[0].staff_note).toContain('Transférée vers Dragons');
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
    expect(logStaffActionMock.mock.calls[0][0]).toMatchObject({
      action: 'forward_scrim_request',
      entity_type: 'demande',
      entity_id: DEMANDE_ID,
      payload: { subject: 'scrim_forward', target_team_id: TEAM_B },
    });
  });

  it('400 sur un demandeId invalide, rien d’écrit', async () => {
    const res = makeRes();
    await forwardHandler(
      makeReq({ demandeId: 'nope', targetTeamId: TEAM_B }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('demandeId invalide.');
    expect(store.demandes).toHaveLength(1);
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });
});
