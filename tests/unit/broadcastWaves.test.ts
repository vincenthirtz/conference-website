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
  role: 'owner' | 'admin' | 'caster' = 'admin'
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
    expect(
      recipients.map(({ user_id, email, label }) => ({ user_id, email, label }))
    ).toEqual([
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
    await expect(computeAudienceRecipients('unknown' as any)).rejects.toThrow(
      /Unsupported audience/
    );
  });

  it('team-captains: confirmed captains only, minus broadcast opt-outs', async () => {
    setAuthListUsers([
      { id: 'u1', email: 'a@x.com', email_confirmed_at: '2026-01-01' } as any,
      { id: 'u2', email: 'b@x.com', email_confirmed_at: '2026-01-01' } as any,
      { id: 'u3', email: 'c@x.com', email_confirmed_at: '2026-01-01' } as any,
    ]);
    store.teams = [
      { id: 't1', captain_id: 'u1', is_active: true },
      { id: 't2', captain_id: 'u2', is_active: true },
      // équipe inactive → capitaine u3 ignoré
      { id: 't3', captain_id: 'u3', is_active: false },
      // capitaine null → ignoré
      { id: 't4', captain_id: null, is_active: true },
    ] as any;
    store.notification_prefs = [
      {
        user_id: 'u2',
        event_type: 'broadcast',
        channel: 'email',
        enabled: false,
      },
    ] as any;

    const recipients = await computeAudienceRecipients('team-captains');
    expect(recipients.map((r) => r.user_id)).toEqual(['u1']);
  });

  it('team-members: dedups user ids across teams, intersected with confirmed', async () => {
    setAuthListUsers([
      { id: 'u1', email: 'a@x.com', email_confirmed_at: '2026-01-01' } as any,
      { id: 'u2', email: 'b@x.com', email_confirmed_at: '2026-01-01' } as any,
    ]);
    store.team_members = [
      { team_id: 't1', user_id: 'u1' },
      { team_id: 't2', user_id: 'u1' }, // doublon → dédupé
      { team_id: 't1', user_id: 'u2' },
      // membre non confirmé côté auth → exclu (pas dans la liste confirmée)
      { team_id: 't1', user_id: 'u9' },
      { team_id: 't1', user_id: null }, // null → ignoré
    ] as any;

    const recipients = await computeAudienceRecipients('team-members');
    expect(recipients.map((r) => r.user_id).sort()).toEqual(['u1', 'u2']);
  });

  it('staff: active non-deleted staff auth ids, intersected with confirmed', async () => {
    setAuthListUsers([
      { id: 'u1', email: 'a@x.com', email_confirmed_at: '2026-01-01' } as any,
      { id: 'u2', email: 'b@x.com', email_confirmed_at: '2026-01-01' } as any,
    ]);
    store.staff = [
      { id: 's1', auth_user_id: 'u1', is_active: true, deleted_at: null },
      // inactif → exclu
      { id: 's2', auth_user_id: 'u2', is_active: false, deleted_at: null },
    ] as any;

    const recipients = await computeAudienceRecipients('staff');
    expect(recipients.map((r) => r.user_id)).toEqual(['u1']);
  });

  it('tournament-never-logged-in: membres du tournoi en cours sans aucune session ouverte', async () => {
    setAuthListUsers([
      // inscrite au tournoi + jamais connectée → cible de la relance
      {
        id: 'u1',
        email: 'never@x.com',
        email_confirmed_at: '2026-01-01',
        last_sign_in_at: null,
      } as any,
      // inscrite mais déjà connectée → exclue
      {
        id: 'u2',
        email: 'active@x.com',
        email_confirmed_at: '2026-01-01',
        last_sign_in_at: '2026-06-01',
      } as any,
      // jamais connectée mais PAS inscrite au tournoi en cours → exclue
      {
        id: 'u3',
        email: 'outsider@x.com',
        email_confirmed_at: '2026-01-01',
        last_sign_in_at: null,
      } as any,
      // inscrite + jamais connectée MAIS opt-out broadcast → exclue
      {
        id: 'u4',
        email: 'optout@x.com',
        email_confirmed_at: '2026-01-01',
        last_sign_in_at: null,
      } as any,
    ]);
    store.tournaments = [
      {
        id: 'e8fa740c-d92b-49d8-a654-05a37d0eea3b',
        status: 'published',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
      },
    ] as any;
    store.tournament_teams = [
      {
        tournament_id: 'e8fa740c-d92b-49d8-a654-05a37d0eea3b',
        team_id: 't1',
      },
      // équipe d'un autre tournoi → membres hors audience
      { tournament_id: 'other-tournament', team_id: 't9' },
    ] as any;
    store.team_members = [
      { team_id: 't1', user_id: 'u1' },
      { team_id: 't1', user_id: 'u2' },
      { team_id: 't1', user_id: 'u4' },
      { team_id: 't9', user_id: 'u3' },
    ] as any;
    store.notification_prefs = [
      {
        user_id: 'u4',
        event_type: 'broadcast',
        channel: 'email',
        enabled: false,
      },
    ] as any;

    const recipients = await computeAudienceRecipients(
      'tournament-never-logged-in'
    );
    expect(recipients.map((r) => r.user_id)).toEqual(['u1']);
  });

  it('tournament-never-logged-in: audience vide si aucun tournoi en cours', async () => {
    setAuthListUsers([
      {
        id: 'u1',
        email: 'never@x.com',
        email_confirmed_at: '2026-01-01',
        last_sign_in_at: null,
      } as any,
    ]);
    store.tournaments = [] as any;
    store.team_members = [{ team_id: 't1', user_id: 'u1' }] as any;

    const recipients = await computeAudienceRecipients(
      'tournament-never-logged-in'
    );
    expect(recipients).toEqual([]);
  });

  it('adherents: paid+active only, deduped by lower(email), email opt-outs excluded', async () => {
    store.adherents = [
      {
        first_name: 'Alice',
        last_name: 'Martin',
        email: 'Alice@Example.com',
        auth_user_id: 'u1',
        is_active: true,
        payment_status: 'paid',
        deleted_at: null,
      },
      // doublon email (casse différente) → dédupé
      {
        first_name: 'Alice',
        last_name: 'Dup',
        email: 'alice@example.com',
        auth_user_id: null,
        is_active: true,
        payment_status: 'paid',
        deleted_at: null,
      },
      // sans compte auth → user_id null
      {
        first_name: 'Bob',
        last_name: '',
        email: 'bob@example.com',
        auth_user_id: null,
        is_active: true,
        payment_status: 'paid',
        deleted_at: null,
      },
      // non payé → exclu
      {
        first_name: 'Carol',
        last_name: 'X',
        email: 'carol@example.com',
        auth_user_id: null,
        is_active: true,
        payment_status: 'pending',
        deleted_at: null,
      },
      // opt-out email → exclu
      {
        first_name: 'Dan',
        last_name: 'Y',
        email: 'dan@example.com',
        auth_user_id: null,
        is_active: true,
        payment_status: 'paid',
        deleted_at: null,
      },
    ] as any;
    store.broadcast_email_optouts = [
      { email: 'dan@example.com', source: 'broadcast' },
    ] as any;

    const recipients = await computeAudienceRecipients('adherents');
    expect(
      recipients.map(({ user_id, email, label }) => ({ user_id, email, label }))
    ).toEqual([
      {
        user_id: 'u1',
        email: 'Alice@Example.com',
        label: 'Alice Martin',
      },
      { user_id: null, email: 'bob@example.com', label: 'Bob' },
    ]);
  });

  it('newsletter: seulement les abonné·es confirmé·es, email-only, sans opt-out', async () => {
    store.newsletter_subscribers = [
      { email: 'ext1@x.com', status: 'confirmed', confirmed_at: '2026-07-01' },
      { email: 'ext2@x.com', status: 'pending' }, // pas confirmé → exclu
      { email: 'ext3@x.com', status: 'unsubscribed' }, // désinscrit → exclu
      { email: 'OptedOut@x.com', status: 'confirmed' }, // opt-out email → exclu
    ] as any;
    store.broadcast_email_optouts = [{ email: 'optedout@x.com' }] as any;

    const recipients = await computeAudienceRecipients('newsletter');
    expect(
      recipients.map(({ user_id, email }) => ({ user_id, email }))
    ).toEqual([{ user_id: null, email: 'ext1@x.com' }]);
  });

  it('all-plus-newsletter: comptes confirmés + newsletter, dédupé par email (compte prioritaire)', async () => {
    setAuthListUsers([
      {
        id: 'u1',
        email: 'shared@x.com', // aussi dans la newsletter → le compte gagne
        email_confirmed_at: '2026-01-01',
        user_metadata: { display_name: 'Shared' },
      } as any,
    ]);
    store.newsletter_subscribers = [
      { email: 'shared@x.com', status: 'confirmed' }, // doublon → dédup vers le compte
      { email: 'extonly@x.com', status: 'confirmed' },
    ] as any;

    const recipients = await computeAudienceRecipients('all-plus-newsletter');
    const byEmail = Object.fromEntries(
      recipients.map((r) => [r.email.toLowerCase(), r.user_id])
    );
    // shared@x.com résolu vers le compte auth (user_id présent), pas email-only
    expect(byEmail['shared@x.com']).toBe('u1');
    expect(byEmail['extonly@x.com']).toBeNull();
    expect(recipients).toHaveLength(2);
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
    expect((store.broadcast_schedules as any[])[0].status).toBe('completed');
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
    store.staff = [makeStaffRow('caster')] as any;
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
