// Événements de planification d'un match (match.scheduled / match.rescheduled /
// match.unscheduled) — règle partagée utils/matches/scheduleEvents.ts et TOUTES
// les routes qui écrivent `matches.scheduled_at`.
//
// Le 2026-09-09, 14 matchs ont été déplacés par des chemins qui n'émettaient
// rien (auto-planification, décalage de round, planification en masse) ou
// seulement à moitié (PATCH bot : jamais de match.rescheduled). Ces tests
// verrouillent, route par route : changement → bons événements, créneau
// inchangé → rien, date retirée → match.unscheduled.
//
// On NE mocke PAS utils/botEvents : les événements atterrissent dans l'outbox
// en mémoire (`store.bot_event_outbox`), ce qui vérifie aussi l'insertion EN
// LOT. Sans BOT_WEBHOOK_URL, aucun push HTTP n'est tenté.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { enrichMatchEvent } = vi.hoisted(() => ({
  enrichMatchEvent: vi.fn(async (matchId: string) => ({
    matchId,
    discordScheduledEventId: `dse-${matchId}`,
  })),
}));
vi.mock('@/utils/matches/botEventEnrich', () => ({ enrichMatchEvent }));
vi.mock('@/utils/discord', () => ({
  notifyMatchStarting: vi.fn(async () => undefined),
}));

import {
  store,
  fromCalls,
  resetSupabaseMock,
  setAuthUser,
  seedBotAuth,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  buildScheduleEvents,
  collapseScheduleChanges,
  emitScheduleEvents,
  sameScheduleInstant,
  scheduleEventNames,
} from '../../utils/matches/scheduleEvents';

import adminMatchHandler from '../../pages/api/admin/matches/[matchId]';
import botMatchHandler from '../../pages/api/bot/v1/matches/[matchId]';
import autoScheduleHandler from '../../pages/api/admin/tournament/[id]/auto-schedule';
import tournamentBulkHandler from '../../pages/api/admin/tournament/[id]/bulk-matches';
import stageBulkHandler from '../../pages/api/admin/stages/[stageId]/bulk-matches';

const TOURNOI = '33333333-3333-4333-8333-333333333333';
const STAGE = '66666666-6666-4666-8666-666666666666';
const OTHER_STAGE = '66666666-6666-4666-8666-666666666667';
const M1 = '44444444-4444-4444-8444-444444444441';
const M2 = '44444444-4444-4444-8444-444444444442';
const M3 = '44444444-4444-4444-8444-444444444443';
const M4 = '44444444-4444-4444-8444-444444444444';
const M5 = '44444444-4444-4444-8444-444444444445';

const A = '2026-09-18T18:30:00.000Z';
/** Même instant que A, autre écriture (celle de PostgREST). */
const A_PG = '2026-09-18T18:30:00+00:00';
const B = '2026-09-23T20:00:00.000Z';

const ACTOR_DISCORD = '123456789012345678';

let _t = 0;
function freshToken() {
  _t += 1;
  return `t-${Date.now()}-${_t}`;
}

function makeReq(over: Record<string, unknown> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: {},
    body: {},
    ...over,
  };
}

function makeBotReq(over: Record<string, unknown> = {}): any {
  return {
    method: 'PATCH',
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

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

type OutboxRow = {
  event_name: string;
  tenant_id: string;
  payload: { data: Record<string, any> };
};

function outbox(): OutboxRow[] {
  return (store.bot_event_outbox ?? []) as unknown as OutboxRow[];
}
function events(): Array<[string, string]> {
  return outbox().map((r) => [r.event_name, r.payload.data.matchId]);
}
function dataOf(name: string, matchId: string) {
  return outbox().find(
    (r) => r.event_name === name && r.payload.data.matchId === matchId
  )?.payload.data;
}
/** Laisse s'écouler les émissions lancées en `void` (routes unitaires). */
async function settle() {
  await new Promise((r) => setTimeout(r, 25));
}

function match(over: Record<string, unknown>) {
  return {
    tenant_id: DEFAULT_TENANT_ID,
    tournament_id: TOURNOI,
    scrim_id: null,
    stage_id: STAGE,
    status: 'pending',
    is_bye: false,
    match_format: 'bo3',
    round_number: 1,
    scheduled_at: null,
    deleted_at: null,
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  enrichMatchEvent.mockClear();
  vi.stubEnv('BOT_WEBHOOK_URL', '');
  setAuthUser({ id: 'user-1' });
  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: 'user-1',
      role: 'admin',
      tenant_id: DEFAULT_TENANT_ID,
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
    } as unknown as StaffMember,
  ] as any;
  store.tournaments = [
    {
      id: TOURNOI,
      tenant_id: DEFAULT_TENANT_ID,
      name: 'OW WOMEN’s CUP',
      status: 'running',
      start_date: '2026-09-01',
      end_date: '2026-10-31',
      timezone: 'Europe/Paris',
    },
  ] as any;
  store.tournament_stages = [
    { id: STAGE, tenant_id: DEFAULT_TENANT_ID, tournament_id: TOURNOI },
    { id: OTHER_STAGE, tenant_id: DEFAULT_TENANT_ID, tournament_id: TOURNOI },
  ] as any;
  store.team_availability_constraints = [] as any;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/* -----------------------------------------------------------
 * Règle pure
 * ---------------------------------------------------------*/

describe('scheduleEvents · règle', () => {
  const c = (previous: string | null, next: string | null) => ({
    matchId: M1,
    tournamentId: TOURNOI,
    scrimId: null,
    previous,
    next,
  });

  it('première date → match.scheduled seul', () => {
    expect(scheduleEventNames(c(null, B))).toEqual(['match.scheduled']);
  });

  it('déplacement → match.scheduled PUIS match.rescheduled', () => {
    expect(scheduleEventNames(c(A, B))).toEqual([
      'match.scheduled',
      'match.rescheduled',
    ]);
  });

  it('date retirée → match.unscheduled', () => {
    expect(scheduleEventNames(c(A, null))).toEqual(['match.unscheduled']);
  });

  it('même instant, autre écriture → rien', () => {
    expect(sameScheduleInstant(A, A_PG)).toBe(true);
    expect(scheduleEventNames(c(A, A_PG))).toEqual([]);
    expect(scheduleEventNames(c(null, null))).toEqual([]);
  });

  it('match.rescheduled est un SUR-ENSEMBLE de match.scheduled', () => {
    const enriched = { discordScheduledEventId: 'dse' } as any;
    const [scheduled, rescheduled] = buildScheduleEvents(c(A, B), enriched);
    for (const key of Object.keys(scheduled.data)) {
      expect(rescheduled.data[key]).toEqual(scheduled.data[key]);
    }
    expect(rescheduled.data).toMatchObject({
      match_id: M1,
      previousScheduledAt: A,
      from: A,
      to: B,
      scheduledAt: B,
    });
  });

  it('dédoublonne : date d’avant la 1re écriture, date de la dernière', () => {
    const out = collapseScheduleChanges([c(A, B), c(B, A_PG)]);
    // A → B → A : le match n'a finalement pas bougé.
    expect(out).toEqual([]);
    const moved = collapseScheduleChanges([c(null, A), c(A, B)]);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ previous: null, next: B });
  });

  it('un lot = UNE insertion outbox, quel que soit le nombre de matchs', async () => {
    fromCalls.length = 0;
    const result = await emitScheduleEvents(
      [
        { ...c(A, B), matchId: M1 },
        { ...c(null, B), matchId: M2 },
        { ...c(A, null), matchId: M3 },
      ],
      DEFAULT_TENANT_ID
    );
    expect(result).toMatchObject({ matches: 3, events: 4 });
    expect(fromCalls.filter((t) => t === 'bot_event_outbox')).toHaveLength(1);
    expect(events()).toEqual([
      ['match.scheduled', M1],
      ['match.rescheduled', M1],
      ['match.scheduled', M2],
      ['match.unscheduled', M3],
    ]);
  });
});

/* -----------------------------------------------------------
 * PATCH /api/admin/matches/[matchId] — la référence, inchangée
 * ---------------------------------------------------------*/

describe('PATCH /api/admin/matches/[matchId]', () => {
  async function patch(body: Record<string, unknown>) {
    const res = makeRes();
    await adminMatchHandler(
      makeReq({ method: 'PATCH', query: { matchId: M1 }, body }),
      res
    );
    return res;
  }

  it('déplacement → scheduled + rescheduled, payload enrichi', async () => {
    store.matches = [match({ id: M1, scheduled_at: A })] as any;
    const res = await patch({ scheduled_at: B });
    expect(res.statusCode).toBe(200);
    await vi.waitFor(() => expect(outbox()).toHaveLength(2));

    expect(dataOf('match.scheduled', M1)).toEqual({
      matchId: M1,
      tournamentId: TOURNOI,
      scrimId: null,
      scheduledAt: B,
      enriched: { matchId: M1, discordScheduledEventId: `dse-${M1}` },
    });
    expect(dataOf('match.rescheduled', M1)).toEqual({
      matchId: M1,
      match_id: M1,
      tournamentId: TOURNOI,
      scrimId: null,
      scheduledAt: B,
      previousScheduledAt: A,
      from: A,
      to: B,
      enriched: { matchId: M1, discordScheduledEventId: `dse-${M1}` },
    });
  });

  it('première date → match.scheduled seul', async () => {
    store.matches = [match({ id: M1, scheduled_at: null })] as any;
    await patch({ scheduled_at: B });
    await vi.waitFor(() => expect(outbox()).toHaveLength(1));
    await settle();
    expect(events()).toEqual([['match.scheduled', M1]]);
  });

  it('date retirée → match.unscheduled (avec l’ancienne date + enriched)', async () => {
    store.matches = [match({ id: M1, scheduled_at: A })] as any;
    await patch({ scheduled_at: null });
    await vi.waitFor(() => expect(outbox()).toHaveLength(1));
    await settle();
    expect(events()).toEqual([['match.unscheduled', M1]]);
    expect(dataOf('match.unscheduled', M1)).toMatchObject({
      matchId: M1,
      previousScheduledAt: A,
      enriched: { discordScheduledEventId: `dse-${M1}` },
    });
  });

  it('même créneau réécrit → aucun événement', async () => {
    store.matches = [match({ id: M1, scheduled_at: A })] as any;
    await patch({ scheduled_at: A_PG });
    await settle();
    expect(outbox()).toEqual([]);
  });

  it('PATCH sans scheduled_at → aucun événement de planification', async () => {
    store.matches = [match({ id: M1, scheduled_at: A })] as any;
    await patch({ notes: 'rien à voir' });
    await settle();
    expect(outbox()).toEqual([]);
  });
});

/* -----------------------------------------------------------
 * PATCH /api/bot/v1/matches/[matchId] — /planifier
 * ---------------------------------------------------------*/

describe('PATCH /api/bot/v1/matches/[matchId]', () => {
  beforeEach(() => {
    seedBotAuth();
    store.user_discord_links = [
      { discord_user_id: ACTOR_DISCORD, auth_user_id: 'u-bot' },
    ] as any;
    (store.staff as any[]).push({
      id: 'staff-bot',
      auth_user_id: 'u-bot',
      role: 'admin',
    });
    (store.tournaments as any[])[0].tenant_id = CONFERENCE_TENANT_ID;
  });

  async function patch(scheduledAt: string | null) {
    const res = makeRes();
    await botMatchHandler(
      makeBotReq({
        query: { matchId: M1 },
        body: { actorDiscordUserId: ACTOR_DISCORD, scheduledAt },
      }),
      res
    );
    return res;
  }

  it('déplacement → scheduled + rescheduled (manquait jusqu’ici)', async () => {
    store.matches = [
      match({ id: M1, tenant_id: CONFERENCE_TENANT_ID, scheduled_at: A }),
    ] as any;
    const res = await patch(B);
    expect(res.statusCode).toBe(200);
    await vi.waitFor(() => expect(outbox()).toHaveLength(2));
    expect(events()).toEqual([
      ['match.scheduled', M1],
      ['match.rescheduled', M1],
    ]);
    expect(dataOf('match.rescheduled', M1)).toMatchObject({
      from: A,
      to: B,
      previousScheduledAt: A,
      scheduledAt: B,
      tournamentId: TOURNOI,
    });
    expect(outbox()[0].tenant_id).toBe(CONFERENCE_TENANT_ID);
  });

  it('date retirée → match.unscheduled', async () => {
    store.matches = [
      match({ id: M1, tenant_id: CONFERENCE_TENANT_ID, scheduled_at: A }),
    ] as any;
    await patch(null);
    await vi.waitFor(() => expect(outbox()).toHaveLength(1));
    await settle();
    expect(events()).toEqual([['match.unscheduled', M1]]);
  });

  it('même créneau → aucun événement', async () => {
    store.matches = [
      match({ id: M1, tenant_id: CONFERENCE_TENANT_ID, scheduled_at: A }),
    ] as any;
    const res = await patch(A_PG);
    expect(res.statusCode).toBe(200);
    await settle();
    expect(outbox()).toEqual([]);
  });
});

/* -----------------------------------------------------------
 * POST /api/admin/tournament/[id]/auto-schedule
 * ---------------------------------------------------------*/

describe('POST /api/admin/tournament/[id]/auto-schedule', () => {
  const windows = [
    { start: '2026-09-18T17:00:00.000Z', end: '2026-09-18T22:00:00.000Z' },
  ];

  function seed() {
    store.matches = [
      // Déjà daté : le scheduler le renvoie « verrouillé » à la même heure.
      match({ id: M1, scheduled_at: A, team1_id: 'ta', team2_id: 'tb' }),
      match({ id: M2, scheduled_at: null, team1_id: 'tc', team2_id: 'td' }),
    ] as any;
  }

  async function run(body: Record<string, unknown>) {
    const res = makeRes();
    await autoScheduleHandler(
      makeReq({ method: 'POST', query: { id: TOURNOI }, body }),
      res
    );
    return res;
  }

  it('n’émet que pour les matchs dont la date a réellement changé', async () => {
    seed();
    const res = await run({ windows });
    expect(res.statusCode).toBe(200);
    const placed = (res.body.scheduled as Array<{ matchId: string }>).map(
      (s) => s.matchId
    );
    expect(placed).toEqual(expect.arrayContaining([M1, M2]));
    // Attendu (pas de `void`) : l'outbox est écrite avant la réponse.
    expect(events()).toEqual([['match.scheduled', M2]]);
  });

  it('simulation (dryRun) → rien d’écrit, rien d’émis', async () => {
    seed();
    const res = await run({ windows, dryRun: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.dryRun).toBe(true);
    await settle();
    expect(outbox()).toEqual([]);
  });
});

/* -----------------------------------------------------------
 * POST /api/admin/tournament/[id]/bulk-matches — shift_round
 * ---------------------------------------------------------*/

describe('POST /api/admin/tournament/[id]/bulk-matches · shift_round', () => {
  it('décale le round → scheduled + rescheduled par match daté, rien sinon', async () => {
    store.matches = [
      match({ id: M1, scheduled_at: A }),
      match({ id: M2, scheduled_at: null }),
      match({ id: M3, scheduled_at: A, round_number: 2 }),
    ] as any;
    const res = makeRes();
    await tournamentBulkHandler(
      makeReq({
        method: 'POST',
        query: { id: TOURNOI },
        body: {
          mode: 'shift_round',
          stageId: STAGE,
          roundNumber: 1,
          offsetMinutes: 30,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.shifted).toBe(1);
    const shifted = '2026-09-18T19:00:00.000Z';
    expect(events()).toEqual([
      ['match.scheduled', M1],
      ['match.rescheduled', M1],
    ]);
    expect(dataOf('match.rescheduled', M1)).toMatchObject({
      from: A,
      to: shifted,
    });
  });
});

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]/bulk-matches — PATCH + undo
 * ---------------------------------------------------------*/

describe('/api/admin/stages/[stageId]/bulk-matches', () => {
  it('PATCH : bons événements par match, en UNE insertion outbox', async () => {
    store.matches = [
      match({ id: M1, scheduled_at: A }), // déplacé
      match({ id: M2, scheduled_at: null }), // planifié
      match({ id: M3, scheduled_at: A }), // date retirée
      match({ id: M4, scheduled_at: A, stage_id: OTHER_STAGE }), // hors phase
      match({ id: M5, scheduled_at: A }), // même créneau
    ] as any;
    fromCalls.length = 0;
    const res = makeRes();
    await stageBulkHandler(
      makeReq({
        method: 'PATCH',
        query: { stageId: STAGE },
        body: {
          schedules: [
            { matchId: M1, scheduled_at: B },
            { matchId: M2, scheduled_at: B },
            { matchId: M3, scheduled_at: null },
            { matchId: M4, scheduled_at: B },
            { matchId: M5, scheduled_at: A_PG },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(events()).toEqual([
      ['match.scheduled', M1],
      ['match.rescheduled', M1],
      ['match.scheduled', M2],
      ['match.unscheduled', M3],
    ]);
    expect(fromCalls.filter((t) => t === 'bot_event_outbox')).toHaveLength(1);
  });

  it('undo d’une planification → le retour arrière est notifié', async () => {
    store.matches = [match({ id: M1, scheduled_at: B })] as any;
    const res = makeRes();
    await stageBulkHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE },
        body: {
          action: 'undo',
          undoPayload: {
            type: 'bulk_schedule',
            snapshots: [{ matchId: M1, fields: { scheduled_at: A } }],
          },
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(events()).toEqual([
      ['match.scheduled', M1],
      ['match.rescheduled', M1],
    ]);
    expect(dataOf('match.rescheduled', M1)).toMatchObject({ from: B, to: A });
  });

  it('undo sans scheduled_at → aucun événement de planification', async () => {
    store.matches = [
      match({ id: M1, scheduled_at: A, status: 'cancelled' }),
    ] as any;
    const res = makeRes();
    await stageBulkHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE },
        body: {
          action: 'undo',
          undoPayload: {
            type: 'bulk_cancel',
            snapshots: [{ matchId: M1, fields: { status: 'pending' } }],
          },
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(outbox()).toEqual([]);
  });
});
