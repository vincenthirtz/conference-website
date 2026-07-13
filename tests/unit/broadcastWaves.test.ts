import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { sendIdahobitLiveEmail, buildIdahobitLiveEmailHtml } = vi.hoisted(
  () => ({
    sendIdahobitLiveEmail: vi.fn(
      async (): Promise<{
        success: boolean;
        id?: string;
        error?: string;
      }> => ({ success: true })
    ),
    buildIdahobitLiveEmailHtml: vi.fn(
      (label: string | null) => `<html>preview ${label ?? ''}</html>`
    ),
  })
);
vi.mock('@/utils/email', () => ({
  sendIdahobitLiveEmail,
  buildIdahobitLiveEmailHtml,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAuthListUsers,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';
import {
  computeAudienceRecipients,
  processCampaignWave,
} from '../../utils/broadcasts';

import scheduleHandler from '../../pages/api/admin/broadcast/[campaignId]/schedule';
import waveHandler from '../../pages/api/admin/broadcast/[campaignId]/wave';
import indexHandler from '../../pages/api/admin/broadcast/index';
import cronHandler from '../../pages/api/cron/broadcast-process';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

const CAMPAIGN_ID = 'idahobit-live-2026';

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'admin'
): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
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

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: { campaignId: CAMPAIGN_ID },
    body: {},
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
  res.send = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  sendIdahobitLiveEmail.mockReset();
  sendIdahobitLiveEmail.mockResolvedValue({ success: true });
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
  setAuthListUsers([]);
});

/* -----------------------------------------------------------
 * computeAudienceRecipients
 * ---------------------------------------------------------*/

describe('computeAudienceRecipients', () => {
  it('skips unconfirmed users and applies battle_tag > display_name fallback', async () => {
    setAuthListUsers([
      // confirmé via email_confirmed_at, a un battle_tag → priorité
      {
        id: 'u1',
        email: 'a@x.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: { display_name: 'Ignored' },
      } as any,
      // confirmé, pas de battle_tag → fallback display_name
      {
        id: 'u2',
        email: 'b@x.com',
        confirmed_at: '2026-01-02',
        user_metadata: { display_name: 'Bee' },
      } as any,
      // confirmé, ni battle_tag ni display_name → label null
      {
        id: 'u3',
        email: 'c@x.com',
        email_confirmed_at: '2026-01-03',
        user_metadata: {},
      } as any,
      // non confirmé → ignoré
      {
        id: 'u4',
        email: 'd@x.com',
        user_metadata: { display_name: 'Dee' },
      } as any,
      // pas d'email → ignoré
      { id: 'u5', email: null, email_confirmed_at: '2026-01-01' } as any,
    ]);
    store.profiles = [{ id: 'u1', battle_tag: 'Alpha#1234' }] as any;

    const recipients = await computeAudienceRecipients('all-confirmed-users');
    expect(recipients).toEqual([
      { user_id: 'u1', email: 'a@x.com', label: 'Alpha' },
      { user_id: 'u2', email: 'b@x.com', label: 'Bee' },
      { user_id: 'u3', email: 'c@x.com', label: null },
    ]);
  });

  it('excludes users opted out of broadcast, keeps the others', async () => {
    setAuthListUsers([
      {
        id: 'u1',
        email: 'a@x.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: { display_name: 'Alpha' },
      } as any,
      {
        id: 'u2',
        email: 'b@x.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: { display_name: 'Bee' },
      } as any,
      {
        id: 'u3',
        email: 'c@x.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: { display_name: 'Cee' },
      } as any,
    ]);
    store.notification_prefs = [
      // u2 opted out of broadcast → excluded
      {
        user_id: 'u2',
        event_type: 'broadcast',
        channel: 'email',
        enabled: false,
      },
      // u3 opted out of a MATCH notification (not broadcast) → still included
      {
        user_id: 'u3',
        event_type: 'match.starting',
        channel: 'email',
        enabled: false,
      },
      // u1 explicitly re-enabled broadcast → included
      {
        user_id: 'u1',
        event_type: 'broadcast',
        channel: 'email',
        enabled: true,
      },
    ] as any;

    const recipients = await computeAudienceRecipients('all-confirmed-users');
    expect(recipients.map((r) => r.user_id).sort()).toEqual(['u1', 'u3']);
  });

  it('throws on unsupported audience', async () => {
    await expect(
      computeAudienceRecipients('unknown' as any)
    ).rejects.toThrow(/Unsupported audience/);
  });
});

/* -----------------------------------------------------------
 * processCampaignWave
 * ---------------------------------------------------------*/

describe('processCampaignWave', () => {
  it('returns null when no schedule exists', async () => {
    const result = await processCampaignWave(CAMPAIGN_ID);
    expect(result).toBeNull();
  });

  it('sends up to wave_size emails and marks them sent', async () => {
    store.broadcast_schedules = [
      {
        campaign_id: CAMPAIGN_ID,
        wave_size: 2,
        status: 'scheduled',
        last_wave_at: null,
        total_recipients: 3,
      },
    ] as any;
    store.broadcast_recipients = [
      {
        campaign_id: CAMPAIGN_ID,
        user_id: 'u1',
        email: 'a@x.com',
        label: 'Alpha',
        status: 'pending',
        created_at: '2026-05-01T10:00:00Z',
      },
      {
        campaign_id: CAMPAIGN_ID,
        user_id: 'u2',
        email: 'b@x.com',
        label: 'Bee',
        status: 'pending',
        created_at: '2026-05-01T10:01:00Z',
      },
      {
        campaign_id: CAMPAIGN_ID,
        user_id: 'u3',
        email: 'c@x.com',
        label: null,
        status: 'pending',
        created_at: '2026-05-01T10:02:00Z',
      },
    ] as any;

    const result = await processCampaignWave(CAMPAIGN_ID);
    expect(result).toMatchObject({
      attempted: 2,
      sent: 2,
      failed: 0,
      remainingPending: 1,
      status: 'scheduled',
    });
    expect(sendIdahobitLiveEmail).toHaveBeenCalledTimes(2);

    const sentRows = (store.broadcast_recipients as any[]).filter(
      (r) => r.status === 'sent'
    );
    expect(sentRows).toHaveLength(2);
  });

  it('records errors as failed recipients', async () => {
    sendIdahobitLiveEmail.mockResolvedValueOnce({
      success: false,
      error: 'Brevo bounce',
    });
    store.broadcast_schedules = [
      {
        campaign_id: CAMPAIGN_ID,
        wave_size: 1,
        status: 'scheduled',
        total_recipients: 1,
      },
    ] as any;
    store.broadcast_recipients = [
      {
        campaign_id: CAMPAIGN_ID,
        user_id: 'u1',
        email: 'a@x.com',
        label: 'Alpha',
        status: 'pending',
      },
    ] as any;

    const result = await processCampaignWave(CAMPAIGN_ID);
    expect(result).toMatchObject({
      sent: 0,
      failed: 1,
      remainingPending: 0,
      status: 'completed',
    });
    expect((store.broadcast_recipients as any[])[0].status).toBe('failed');
    expect((store.broadcast_recipients as any[])[0].error).toBe('Brevo bounce');
  });

  it('marks the schedule completed when no pending remain', async () => {
    store.broadcast_schedules = [
      {
        campaign_id: CAMPAIGN_ID,
        wave_size: 5,
        status: 'scheduled',
        total_recipients: 1,
      },
    ] as any;
    store.broadcast_recipients = [
      {
        campaign_id: CAMPAIGN_ID,
        user_id: 'u1',
        email: 'a@x.com',
        label: 'Alpha',
        status: 'pending',
      },
    ] as any;

    const result = await processCampaignWave(CAMPAIGN_ID);
    expect(result?.status).toBe('completed');
    expect(
      (store.broadcast_schedules as any[])[0].status
    ).toBe('completed');
  });

  it('skips when schedule is paused or completed', async () => {
    store.broadcast_schedules = [
      { campaign_id: CAMPAIGN_ID, wave_size: 5, status: 'paused' },
    ] as any;
    const result = await processCampaignWave(CAMPAIGN_ID);
    expect(result?.attempted).toBe(0);
    expect(sendIdahobitLiveEmail).not.toHaveBeenCalled();
  });
});

/* -----------------------------------------------------------
 * /api/admin/broadcast/[campaignId]/schedule
 * ---------------------------------------------------------*/

describe('schedule endpoint', () => {
  it('returns 401 without auth', async () => {
    setAuthUser(null);
    const res = makeRes();
    await scheduleHandler(
      makeAuthedReq({ method: 'POST', body: { waveSize: 10 } }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when role is below admin', async () => {
    store.staff = [makeStaffRow('manager')] as any;
    const res = makeRes();
    await scheduleHandler(
      makeAuthedReq({ method: 'POST', body: { waveSize: 10 } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for unknown campaign', async () => {
    const res = makeRes();
    await scheduleHandler(
      makeAuthedReq({
        method: 'POST',
        query: { campaignId: 'nope' },
        body: { waveSize: 10 },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('rejects invalid waveSize', async () => {
    const res = makeRes();
    await scheduleHandler(
      makeAuthedReq({ method: 'POST', body: { waveSize: 999 } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('snapshots recipients and creates the schedule row', async () => {
    setAuthListUsers([
      {
        id: 'u1',
        email: 'a@x.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: {},
      } as any,
      {
        id: 'u2',
        email: 'b@x.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: { display_name: 'Bee' },
      } as any,
    ]);
    store.profiles = [{ id: 'u1', battle_tag: 'Alpha#1234' }] as any;

    const res = makeRes();
    await scheduleHandler(
      makeAuthedReq({ method: 'POST', body: { waveSize: 5 } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).totalRecipients).toBe(2);
    expect((res.body as any).waveSize).toBe(5);
    expect(store.broadcast_schedules).toHaveLength(1);
    expect((store.broadcast_schedules as any[])[0].wave_size).toBe(5);
    expect((store.broadcast_schedules as any[])[0].status).toBe('scheduled');
  });

  it('GET returns the schedule and recipient breakdown', async () => {
    store.broadcast_schedules = [
      {
        campaign_id: CAMPAIGN_ID,
        wave_size: 10,
        status: 'scheduled',
        last_wave_at: '2026-05-01T10:00:00Z',
        total_recipients: 3,
      },
    ] as any;
    store.broadcast_recipients = [
      { campaign_id: CAMPAIGN_ID, user_id: 'u1', status: 'sent' },
      { campaign_id: CAMPAIGN_ID, user_id: 'u2', status: 'pending' },
      { campaign_id: CAMPAIGN_ID, user_id: 'u3', status: 'failed' },
    ] as any;

    const res = makeRes();
    await scheduleHandler(makeAuthedReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).schedule.wave_size).toBe(10);
    expect((res.body as any).recipients).toEqual({
      pending: 1,
      sent: 1,
      failed: 1,
    });
  });

  it('DELETE removes pending recipients and the schedule row', async () => {
    store.broadcast_schedules = [
      { campaign_id: CAMPAIGN_ID, wave_size: 10, status: 'scheduled' },
    ] as any;
    store.broadcast_recipients = [
      { campaign_id: CAMPAIGN_ID, user_id: 'u1', status: 'pending' },
      { campaign_id: CAMPAIGN_ID, user_id: 'u2', status: 'sent' }, // conservé
    ] as any;

    const res = makeRes();
    await scheduleHandler(makeAuthedReq({ method: 'DELETE' }), res);

    expect(res.statusCode).toBe(200);
    expect(store.broadcast_schedules).toHaveLength(0);
    // Pending supprimé, sent conservé
    expect(store.broadcast_recipients).toHaveLength(1);
    expect((store.broadcast_recipients as any[])[0].status).toBe('sent');
  });
});

/* -----------------------------------------------------------
 * /api/admin/broadcast/[campaignId]/wave (manual trigger)
 * ---------------------------------------------------------*/

describe('wave endpoint', () => {
  it('returns 400 when no schedule exists', async () => {
    const res = makeRes();
    await waveHandler(makeAuthedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('processes a wave when schedule is scheduled', async () => {
    store.broadcast_schedules = [
      {
        campaign_id: CAMPAIGN_ID,
        wave_size: 1,
        status: 'scheduled',
        total_recipients: 1,
      },
    ] as any;
    store.broadcast_recipients = [
      {
        campaign_id: CAMPAIGN_ID,
        user_id: 'u1',
        email: 'a@x.com',
        label: 'Alpha',
        status: 'pending',
      },
    ] as any;

    const res = makeRes();
    await waveHandler(makeAuthedReq({ method: 'POST' }), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).sent).toBe(1);
    expect((res.body as any).status).toBe('completed');
    expect(sendIdahobitLiveEmail).toHaveBeenCalledTimes(1);
  });
});

/* -----------------------------------------------------------
 * /api/cron/broadcast-process
 * ---------------------------------------------------------*/

describe('cron broadcast-process', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'sekret';
  });

  it('rejects unauthenticated requests', async () => {
    const res = makeRes();
    const req = {
      method: 'POST',
      headers: {},
      query: {},
      body: {},
    } as any;
    await cronHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('processes one wave per scheduled campaign', async () => {
    store.broadcast_schedules = [
      {
        campaign_id: CAMPAIGN_ID,
        wave_size: 5,
        status: 'scheduled',
        total_recipients: 1,
      },
    ] as any;
    store.broadcast_recipients = [
      {
        campaign_id: CAMPAIGN_ID,
        user_id: 'u1',
        email: 'a@x.com',
        label: 'Alpha',
        status: 'pending',
      },
    ] as any;

    const res = makeRes();
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer sekret' },
      query: {},
      body: {},
    } as any;
    await cronHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).processed).toBe(1);
    expect(sendIdahobitLiveEmail).toHaveBeenCalledTimes(1);
  });
});

/* -----------------------------------------------------------
 * /api/admin/broadcast index — catalog + schedule state
 * ---------------------------------------------------------*/

describe('broadcast list endpoint', () => {
  it('exposes the schedule + recipient breakdown when present', async () => {
    store.broadcast_schedules = [
      {
        campaign_id: CAMPAIGN_ID,
        wave_size: 10,
        status: 'scheduled',
        last_wave_at: null,
        total_recipients: 4,
      },
    ] as any;
    store.broadcast_recipients = [
      { campaign_id: CAMPAIGN_ID, user_id: 'u1', status: 'sent' },
      { campaign_id: CAMPAIGN_ID, user_id: 'u2', status: 'sent' },
      { campaign_id: CAMPAIGN_ID, user_id: 'u3', status: 'pending' },
      { campaign_id: CAMPAIGN_ID, user_id: 'u4', status: 'failed' },
    ] as any;

    const res = makeRes();
    await indexHandler(makeAuthedReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    const idahobit = (res.body as any).campaigns.find(
      (c: any) => c.id === CAMPAIGN_ID
    );
    expect(idahobit.schedule).toEqual({
      waveSize: 10,
      status: 'scheduled',
      lastWaveAt: null,
      totalRecipients: 4,
      pending: 1,
      sent: 2,
      failed: 1,
    });
  });
});
