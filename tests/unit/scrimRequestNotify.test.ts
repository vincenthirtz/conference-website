// tests/unit/scrimRequestNotify.test.ts
//
// Couvre l'effet de bord « email au(x) capitaine(s) » branché sur :
//   - la demande de scrim dirigée (site)  → pages/api/demandes/scrim.ts
//   - la création de scrim admin (bot)    → pages/api/bot/v1/scrims/index.ts
// + le helper de formatage de date `formatScrimDateFr`.
//
// `@/utils/email` est mocké (spy sur sendScrimRequestEmail) et
// `auth.admin.getUserById` fournit l'email du capitaine via setAdminUser.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { sendScrimRequestEmail } = vi.hoisted(() => ({
  sendScrimRequestEmail: vi.fn(async (_opts: Record<string, unknown>) => ({
    success: true,
  })),
}));
vi.mock('@/utils/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/email')>();
  return { ...actual, sendScrimRequestEmail };
});

const { notifyScrimRequest } = vi.hoisted(() => ({
  notifyScrimRequest: vi.fn(async () => undefined),
}));
vi.mock('@/utils/discord', () => ({ notifyScrimRequest }));

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
  seedBotAuth,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { formatScrimDateFr } from '../../utils/scrimRequestNotify';

import demandesScrimHandler from '../../pages/api/demandes/scrim';
import botScrimsHandler from '../../pages/api/bot/v1/scrims/index';

/* -----------------------------------------------------------
 * Fixtures / helpers
 * ---------------------------------------------------------*/

const MY_TEAM = '550e8400-e29b-41d4-a716-446655440d01';
const TARGET_TEAM = '550e8400-e29b-41d4-a716-446655440d02';
const TEAM_A = '550e8400-e29b-41d4-a716-446655440b01';
const TEAM_B = '550e8400-e29b-41d4-a716-446655440b02';
const DISCORD_ID = '123456789012345678';

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

// Vide la file de microtâches/macrotâches pour laisser les envois
// fire-and-forget (`void notify…().catch()`) se résoudre avant l'assertion.
async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

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

let _tok = 0;
function freshToken() {
  _tok += 1;
  return `t-${Date.now()}-${_tok}`;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  sendScrimRequestEmail.mockClear();
  notifyScrimRequest.mockClear();
  logStaffActionMock.mockClear();
});

/* -----------------------------------------------------------
 * (i) Demande de scrim dirigée (site) → 1 email au capitaine cible
 * ---------------------------------------------------------*/

describe('POST /api/demandes/scrim — email capitaine cible', () => {
  it("envoie un email au capitaine de l'équipe CIBLE (kind=request)", async () => {
    setAuthUser({
      id: 'requester-user',
      email: 'req@example.com',
      user_metadata: { display_name: 'Requester Cap' },
    });
    store.teams = [
      {
        id: MY_TEAM,
        name: 'Requesters',
        captain_id: 'requester-user',
        is_active: true,
      },
      {
        id: TARGET_TEAM,
        name: 'Targets',
        captain_id: 'target-captain',
        is_active: true,
      },
    ] as any;
    store.demandes = [];
    setAdminUser('target-captain', 'captain@target.com');

    const future = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();

    const req: any = {
      method: 'POST',
      headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
      query: {},
      body: { teamId: TARGET_TEAM, proposedSlots: [future], message: 'gg?' },
    };
    const res = makeRes();
    await demandesScrimHandler(req, res);
    expect(res.statusCode).toBe(201);

    await flush();

    expect(sendScrimRequestEmail).toHaveBeenCalledTimes(1);
    const arg = sendScrimRequestEmail.mock.calls[0][0] as any;
    expect(arg.to).toBe('captain@target.com');
    expect(arg.kind).toBe('request');
    expect(arg.recipientTeamName).toBe('Targets');
    expect(arg.opponentName).toBe('Requesters');
    expect(arg.isExternal).toBe(false);
    expect(typeof arg.dateLabel).toBe('string');
  });

  it("n'échoue pas (0 email) quand l'équipe cible n'a pas de capitaine", async () => {
    setAuthUser({ id: 'requester-user', email: 'req@example.com' });
    store.teams = [
      {
        id: MY_TEAM,
        name: 'Requesters',
        captain_id: 'requester-user',
        is_active: true,
      },
      { id: TARGET_TEAM, name: 'Targets', captain_id: null, is_active: true },
    ] as any;
    store.demandes = [];

    const future = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
    const req: any = {
      method: 'POST',
      headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
      query: {},
      body: { teamId: TARGET_TEAM, proposedSlots: [future] },
    };
    const res = makeRes();
    await demandesScrimHandler(req, res);
    expect(res.statusCode).toBe(201);

    await flush();
    expect(sendScrimRequestEmail).not.toHaveBeenCalled();
  });
});

/* -----------------------------------------------------------
 * (ii)+(iii) Création de scrim admin (bot)
 * ---------------------------------------------------------*/

describe('POST /api/bot/v1/scrims — emails capitaines', () => {
  beforeEach(() => {
    seedBotAuth();
    store.tenants = [
      {
        id: CONFERENCE_TENANT_ID,
        plan: 'foundation',
        plan_status: 'active',
        plan_expires_at: null,
      },
    ] as any;
    store.staff = [makeStaffRow('admin')] as any;
    setAuthUser({ id: 'user-1' });
    store.user_discord_links = [
      { discord_user_id: DISCORD_ID, auth_user_id: 'user-1' },
    ] as any;
  });

  function makeBotReq(over: Partial<any> = {}): any {
    return {
      method: 'POST',
      headers: {
        host: 'h',
        'x-api-key': 'test-key',
        'x-tenant-id': CONFERENCE_TENANT_ID,
      },
      query: {},
      body: {},
      ...over,
    };
  }

  it('(ii) envoie 2 emails quand team1 ET team2 sont présents', async () => {
    store.teams = [
      {
        id: TEAM_A,
        tenant_id: CONFERENCE_TENANT_ID,
        name: 'Phoenix',
        captain_id: 'cap-a',
        is_active: true,
      },
      {
        id: TEAM_B,
        tenant_id: CONFERENCE_TENANT_ID,
        name: 'Dragons',
        captain_id: 'cap-b',
        is_active: true,
      },
    ] as any;
    setAdminUser('cap-a', 'a@teams.com');
    setAdminUser('cap-b', 'b@teams.com');

    const res = makeRes();
    await botScrimsHandler(
      makeBotReq({
        body: {
          actorDiscordUserId: DISCORD_ID,
          name: 'Bot scrim',
          team1_id: TEAM_A,
          team2_id: TEAM_B,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);

    await flush();

    expect(sendScrimRequestEmail).toHaveBeenCalledTimes(2);
    const recipients = sendScrimRequestEmail.mock.calls
      .map((c) => (c[0] as any).to)
      .sort();
    expect(recipients).toEqual(['a@teams.com', 'b@teams.com']);
    for (const c of sendScrimRequestEmail.mock.calls) {
      expect((c[0] as any).kind).toBe('scheduled');
    }
    // opponentName = nom de l'AUTRE équipe.
    const byTo = Object.fromEntries(
      sendScrimRequestEmail.mock.calls.map((c) => [
        (c[0] as any).to,
        c[0] as any,
      ])
    );
    expect(byTo['a@teams.com'].recipientTeamName).toBe('Phoenix');
    expect(byTo['a@teams.com'].opponentName).toBe('Dragons');
    expect(byTo['b@teams.com'].opponentName).toBe('Phoenix');
  });

  it("(iii) n'envoie aucun email quand team2 est absent", async () => {
    store.teams = [
      {
        id: TEAM_A,
        tenant_id: CONFERENCE_TENANT_ID,
        name: 'Phoenix',
        captain_id: 'cap-a',
        is_active: true,
      },
    ] as any;
    setAdminUser('cap-a', 'a@teams.com');

    const res = makeRes();
    await botScrimsHandler(
      makeBotReq({
        body: {
          actorDiscordUserId: DISCORD_ID,
          name: 'Solo scrim',
          team1_id: TEAM_A,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);

    await flush();
    expect(sendScrimRequestEmail).not.toHaveBeenCalled();
  });
});

/* -----------------------------------------------------------
 * (iv) formatScrimDateFr
 * ---------------------------------------------------------*/

describe('formatScrimDateFr', () => {
  const iso = (offsetDays: number) =>
    new Date(Date.now() + offsetDays * 24 * 3600_000).toISOString();

  it('formate un créneau unique (string)', () => {
    const out = formatScrimDateFr(iso(2));
    expect(typeof out).toBe('string');
    expect(out).not.toContain('créneau');
  });

  it("formate le 1er créneau et suffixe le nombre d'autres (tableau)", () => {
    const out = formatScrimDateFr([iso(2), iso(3)]);
    expect(out).toContain('(+1 autre créneau)');

    const out3 = formatScrimDateFr([iso(2), iso(3), iso(4)]);
    expect(out3).toContain('(+2 autres créneaux)');
  });

  it('renvoie null pour un tableau vide, null/undefined, ou invalide', () => {
    expect(formatScrimDateFr([])).toBeNull();
    expect(formatScrimDateFr(null)).toBeNull();
    expect(formatScrimDateFr(undefined)).toBeNull();
    expect(formatScrimDateFr('')).toBeNull();
    expect(formatScrimDateFr('not-a-date')).toBeNull();
    expect(formatScrimDateFr(['not-a-date'])).toBeNull();
  });
});
