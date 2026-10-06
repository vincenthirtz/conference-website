// tests/unit/checkinEmailDefault.test.ts
//
// E-mail « check-in ouvert » en OPT-OUT pour qui peut pointer (lot P6).
//
// Ce que ce fichier verrouille :
//   1. dispatcher : capitaine et coach/manager des deux équipes du match
//      reçoivent `checkin.opened` SANS ligne de préférence ; une ligne
//      explicite à false est respectée ; une joueuse ordinaire reste en
//      opt-in ; les autres events restent en opt-in même pour la capitaine ;
//   2. préférences : le GET affiche ce défaut à qui peut pointer, et à elle
//      seule ; le PUT écrit toujours une ligne explicite pour ce couple.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SITE_URL = 'https://test.example';
  process.env.EMAIL_UNSUBSCRIBE_SECRET = 'unsub-secret';
});

const { sendDigestEmail } = vi.hoisted(() => ({
  sendDigestEmail: vi.fn(async (_opts: unknown) => ({
    success: true,
    id: 'msg-1',
  })),
}));
vi.mock('@/utils/email', () => ({ sendDigestEmail }));

import {
  CONFERENCE_TENANT_ID,
  resetSupabaseMock,
  setAdminUser,
  setAuthUser,
  store,
} from './__helpers__/supabaseMock';
import { runEmailDispatcher } from '../../utils/emailDispatcher';
import handler from '@/pages/api/player/push/prefs';

const TENANT = CONFERENCE_TENANT_ID;
const NOW = '2026-10-06T10:00:00.000Z';

function seedTeams() {
  store.teams = [
    { id: 'team-a', tenant_id: TENANT, captain_id: 'cap-a', name: 'Alpha' },
    { id: 'team-b', tenant_id: TENANT, captain_id: null, name: 'Bravo' },
  ] as any;
  store.team_members = [
    {
      team_id: 'team-a',
      tenant_id: TENANT,
      user_id: 'coach-a',
      role: ' Coach ',
    },
    {
      team_id: 'team-a',
      tenant_id: TENANT,
      user_id: 'player-a',
      role: 'player',
    },
    { team_id: 'team-b', tenant_id: TENANT, user_id: 'mgr-b', role: 'manager' },
  ] as any;
}

function recipients(): string[] {
  return sendDigestEmail.mock.calls
    .map((c) => (c[0] as { to: string }).to)
    .sort();
}

function pref(userId: string, eventType: string, enabled: boolean) {
  (store.notification_prefs as any[]).push({
    user_id: userId,
    event_type: eventType,
    channel: 'email',
    enabled,
  });
}

describe('dispatcher e-mail — checkin.opened', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    resetSupabaseMock();
    seedTeams();
    store.staff = [];
    store.tenant_staff = [];
    store.notification_prefs = [];
    store.email_deliveries = [];
    store.matches = [
      { id: 'm1', tenant_id: TENANT, team1_id: 'team-a', team2_id: 'team-b' },
    ] as any;
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-checkin',
        event_name: 'checkin.opened',
        tenant_id: TENANT,
        payload: { match_id: 'm1' },
        created_at: NOW,
      },
    ] as any;
    for (const u of ['cap-a', 'coach-a', 'player-a', 'mgr-b']) {
      setAdminUser(u, `${u}@example.com`);
    }
    sendDigestEmail.mockClear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('qui peut pointer le reçoit sans préférence ; une joueuse non', async () => {
    await runEmailDispatcher();
    expect(recipients()).toEqual([
      'cap-a@example.com',
      'coach-a@example.com',
      'mgr-b@example.com',
    ]);
  });

  it('un refus explicite est respecté', async () => {
    pref('cap-a', 'checkin.opened', false);
    await runEmailDispatcher();
    expect(recipients()).not.toContain('cap-a@example.com');
    expect(recipients()).toContain('coach-a@example.com');
  });

  it('une joueuse ordinaire qui a accepté le reçoit (opt-in inchangé)', async () => {
    pref('player-a', 'checkin.opened', true);
    await runEmailDispatcher();
    expect(recipients()).toContain('player-a@example.com');
  });

  it('les autres events restent en opt-in, même pour la capitaine', async () => {
    store.bot_event_outbox = [
      {
        id: 2,
        event_id: 'evt-start',
        event_name: 'match.starting',
        tenant_id: TENANT,
        payload: { match_id: 'm1' },
        created_at: NOW,
      },
    ] as any;
    await runEmailDispatcher();
    expect(sendDigestEmail).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */

let _tok = 0;
function makeReq(over: Partial<any> = {}): any {
  _tok += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer ced-${Date.now()}-${_tok}` },
    query: {},
    body: {},
    ...over,
  };
}
function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.send = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

async function getPrefs(userId: string) {
  setAuthUser({ id: userId });
  const res = makeRes();
  await handler(makeReq(), res);
  expect(res.statusCode).toBe(200);
  return res.body as { email: Record<string, boolean> };
}

describe('préférences — défaut affiché et PUT', () => {
  beforeEach(() => {
    resetSupabaseMock();
    seedTeams();
    store.notification_prefs = [];
  });

  it('capitaine : checkin.opened activé par défaut, le reste en opt-in', async () => {
    const { email } = await getPrefs('cap-a');
    expect(email['checkin.opened']).toBe(true);
    expect(email['match.starting']).toBe(false);
  });

  it('coach (casse/espaces ignorés) et manager : activé par défaut', async () => {
    expect((await getPrefs('coach-a')).email['checkin.opened']).toBe(true);
    expect((await getPrefs('mgr-b')).email['checkin.opened']).toBe(true);
  });

  it('joueuse ordinaire : désactivé par défaut', async () => {
    expect((await getPrefs('player-a')).email['checkin.opened']).toBe(false);
  });

  it('une ligne explicite à false l’emporte', async () => {
    pref('cap-a', 'checkin.opened', false);
    expect((await getPrefs('cap-a')).email['checkin.opened']).toBe(false);
  });

  it('PUT écrit toujours une ligne explicite pour ce couple', async () => {
    setAuthUser({ id: 'cap-a' });
    for (const enabled of [false, true]) {
      const res = makeRes();
      await handler(
        makeReq({
          method: 'PUT',
          body: { eventType: 'checkin.opened', channel: 'email', enabled },
        }),
        res
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.email['checkin.opened']).toBe(enabled);
      const rows = (store.notification_prefs as any[]).filter(
        (r) =>
          r.user_id === 'cap-a' &&
          r.event_type === 'checkin.opened' &&
          r.channel === 'email'
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].enabled).toBe(enabled);
    }
  });
});
