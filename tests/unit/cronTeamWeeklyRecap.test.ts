// Unit tests — cron /api/cron/team-weekly-recap (N7).
//
// Ce que le cron doit garantir et que le cœur pur ne peut pas :
//
//   - l'auth CRON_SECRET ;
//   - l'émission d'UN event par équipe, jamais deux la même semaine ;
//   - le silence total pour une équipe dormante ;
//   - qu'une équipe en échec n'avorte pas le run des autres.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const emitBotEvent = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ delivered: true, attempts: 1 })
);
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: (...args: unknown[]) => emitBotEvent(...args),
}));

import {
  store,
  resetSupabaseMock,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import handler from '../../pages/api/cron/team-weekly-recap';

const TEAM_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEAM_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
/**
 * Adversaire HORS du tenant listé : un affrontement entre deux équipes du
 * tenant produit légitimement DEUX récaps (les deux ont joué). Pour isoler
 * l'équipe testée, on la fait jouer contre une équipe absente de `store.teams`.
 */
const TEAM_OUTSIDE = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SECRET = 'test-cron-secret';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { authorization: `Bearer ${SECRET}` },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

/** Instant à J-`days`, dans la fenêtre du récap (7 jours). */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function seed() {
  store.teams = [
    {
      id: TEAM_A,
      name: 'Alpha',
      tenant_id: CONFERENCE_TENANT_ID,
      is_active: true,
      deleted_at: null,
    },
    {
      id: TEAM_B,
      name: 'Bravo',
      tenant_id: CONFERENCE_TENANT_ID,
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.team_members = [
    {
      id: 'tm-1',
      team_id: TEAM_A,
      user_id: 'user-1',
      tenant_id: CONFERENCE_TENANT_ID,
      battle_tag_verified_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
  store.user_discord_links = [
    { user_id: 'user-1', discord_user_id: 'd1' },
  ] as any;
  store.matches = [] as any;
  store.scrims = [] as any;
  store.demandes = [] as any;
  store.team_reviews = [] as any;
  store.team_availability = [] as any;
  store.player_rating_history = [] as any;
  store.bot_event_outbox = [] as any;
}

/** Un match gagné par Alpha contre une équipe extérieure, dans la fenêtre. */
function playedMatch(id = 'match-1') {
  return {
    id,
    tenant_id: CONFERENCE_TENANT_ID,
    status: 'finished',
    scheduled_at: daysAgo(2),
    completed_at: null,
    team1_id: TEAM_A,
    team2_id: TEAM_OUTSIDE,
    team1_score: 3,
    team2_score: 1,
    winner_team_id: TEAM_A,
    deleted_at: null,
  };
}

async function run(over: Partial<any> = {}) {
  const req = makeReq(over);
  const res = makeRes();
  await handler(req, res);
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  emitBotEvent.mockClear();
  seed();
  process.env.CRON_SECRET = SECRET;
});

describe('auth', () => {
  it('refuse sans secret', async () => {
    const res = await run({ headers: {} });
    expect(res.statusCode).toBe(401);
    expect(emitBotEvent).not.toHaveBeenCalled();
  });

  it('accepte le secret en query', async () => {
    const res = await run({ headers: {}, query: { secret: SECRET } });
    expect(res.statusCode).toBe(200);
  });

  it('rejette une méthode non supportée', async () => {
    const res = await run({ method: 'DELETE' });
    expect(res.statusCode).toBe(405);
  });
});

describe('silence', () => {
  it('n’émet rien quand aucune équipe n’a vécu la semaine', async () => {
    const res = await run();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ teams: 2, emitted: 0, empty: 2 });
    expect(emitBotEvent).not.toHaveBeenCalled();
  });

  it('n’émet rien pour une équipe qui n’a QUE des constats chroniques', async () => {
    // Un membre sans BattleTag vérifié, un affrontement ancien non débriefé :
    // chronique, donc jamais un motif d'envoi.
    (store.team_members[0] as any).battle_tag_verified_at = null;
    store.matches = [{ ...playedMatch(), scheduled_at: daysAgo(60) }] as any;
    const res = await run();
    expect(res.body.emitted).toBe(0);
    expect(emitBotEvent).not.toHaveBeenCalled();
  });
});

describe('émission', () => {
  it('émet un récap pour l’équipe qui a joué, et pour elle seule', async () => {
    store.matches = [playedMatch()] as any;
    const res = await run();

    expect(res.body.emitted).toBe(1);
    expect(emitBotEvent).toHaveBeenCalledTimes(1);
    const [eventName, payload, tenantId] = emitBotEvent.mock.calls[0] as [
      string,
      any,
      string,
    ];
    expect(eventName).toBe('team.weekly.recap');
    expect(tenantId).toBe(CONFERENCE_TENANT_ID);
    expect(payload.teamId).toBe(TEAM_A);
    expect(payload.teamName).toBe('Alpha');
    expect(payload.recap).toMatchObject({ played: 1, wins: 1 });
    expect(payload.summary).toContain('1 affrontement');
  });

  it('compte les propositions de scrim en attente', async () => {
    store.demandes = [
      {
        id: 'd1',
        tenant_id: CONFERENCE_TENANT_ID,
        type: 'scrim',
        team_id: TEAM_A,
        status: 'pending',
      },
    ] as any;
    await run();
    const payload = (emitBotEvent.mock.calls[0] as [string, any, string])[1];
    expect(payload.recap.pendingProposals).toBe(1);
  });

  it('moyenne la variation de niveau des membres notées', async () => {
    store.matches = [playedMatch()] as any;
    store.player_rating_history = [
      {
        id: 'h1',
        tenant_id: CONFERENCE_TENANT_ID,
        user_id: 'user-1',
        rating_before: 1500,
        rating_after: 1520,
        occurred_at: daysAgo(1),
      },
    ] as any;
    await run();
    const payload = (emitBotEvent.mock.calls[0] as [string, any, string])[1];
    expect(payload.recap.ratingDelta).toBe(20);
    expect(payload.recap.ratedPlayers).toBe(1);
  });

  it('ignore un affrontement hors de la fenêtre', async () => {
    store.matches = [
      { ...playedMatch('old'), scheduled_at: daysAgo(30) },
    ] as any;
    const res = await run();
    expect(res.body.emitted).toBe(0);
  });
});

describe('déduplication', () => {
  it('n’émet pas deux fois la même semaine', async () => {
    store.matches = [playedMatch()] as any;
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-1',
        event_name: 'team.weekly.recap',
        tenant_id: CONFERENCE_TENANT_ID,
        created_at: daysAgo(1),
        payload: { data: { teamId: TEAM_A } },
      },
    ] as any;
    const res = await run();
    expect(res.body).toMatchObject({ emitted: 0, alreadySent: 1 });
    expect(emitBotEvent).not.toHaveBeenCalled();
  });

  it('ré-émet si le précédent récap est hors fenêtre', async () => {
    store.matches = [playedMatch()] as any;
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-old',
        event_name: 'team.weekly.recap',
        tenant_id: CONFERENCE_TENANT_ID,
        created_at: daysAgo(30),
        payload: { data: { teamId: TEAM_A } },
      },
    ] as any;
    const res = await run();
    expect(res.body.emitted).toBe(1);
  });

  it('ne confond pas le récap d’une autre équipe', async () => {
    store.matches = [playedMatch()] as any;
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-b',
        event_name: 'team.weekly.recap',
        tenant_id: CONFERENCE_TENANT_ID,
        created_at: daysAgo(1),
        payload: { data: { teamId: TEAM_B } },
      },
    ] as any;
    const res = await run();
    expect(res.body.emitted).toBe(1);
  });
});

describe('robustesse', () => {
  it('une équipe en échec n’avorte pas le run des autres', async () => {
    store.matches = [
      playedMatch(),
      {
        ...playedMatch('match-b'),
        team1_id: TEAM_B,
        team2_id: TEAM_OUTSIDE,
        winner_team_id: TEAM_B,
      },
    ] as any;
    emitBotEvent.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const res = await run();
    expect(res.statusCode).toBe(200);
    expect(res.body.failed).toBe(1);
    expect(res.body.emitted).toBe(1);
  });
});
