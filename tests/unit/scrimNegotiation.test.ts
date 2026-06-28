// Unit tests for scrim multi-slot negotiation (proposal / counter-proposal).
//
// Targets:
//  - pages/api/demandes/scrim.ts            (multi-slot create)
//  - pages/api/teams/scrim-requests.ts      (accept / counter / reject + listing)
//  - pages/api/player/dashboard.ts          (loadPendingScrims both-direction)
//  - utils/teams/scrimNegotiation.ts        (helpers)

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';
import {
  normalizeSlots,
  readScrimNego,
} from '../../utils/teams/scrimNegotiation';

const { notifyScrimRequest, notifyScrimCounterProposal } = vi.hoisted(() => ({
  notifyScrimRequest: vi.fn(async () => undefined),
  notifyScrimCounterProposal: vi.fn(async () => undefined),
}));
vi.mock('@/utils/discord', () => ({
  notifyScrimRequest,
  notifyScrimCounterProposal,
}));
vi.mock('@/utils/scrimEvents', () => ({
  emitScrimEvent: vi.fn(async () => undefined),
}));

import scrimCreateHandler from '../../pages/api/demandes/scrim';
import scrimRequestsHandler from '../../pages/api/teams/scrim-requests';
import dashboardHandler from '../../pages/api/player/dashboard';

// ── Fixtures ─────────────────────────────────────────────
const TEAM_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; // requester
const TEAM_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; // target
const CAPTAIN_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CAPTAIN_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const DEMANDE_ID = '99999999-9999-9999-9999-999999999999';

const SLOT_1 = '2026-08-01T20:00:00.000Z';
const SLOT_2 = '2026-08-02T20:00:00.000Z';
const SLOT_3 = '2026-08-03T20:00:00.000Z';

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
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function seedTeams() {
  store.teams = [
    { id: TEAM_A, name: 'Alpha', captain_id: CAPTAIN_A, is_active: true },
    { id: TEAM_B, name: 'Bravo', captain_id: CAPTAIN_B, is_active: true },
  ] as any;
  store.team_members = [
    { id: 'tm-a', team_id: TEAM_A, user_id: CAPTAIN_A, role: 'player' },
    { id: 'tm-b', team_id: TEAM_B, user_id: CAPTAIN_B, role: 'player' },
  ] as any;
}

/** Seed a pending scrim demande proposed by `proposedBy` with the given slots. */
function seedScrimDemande(opts: {
  proposedBy: string;
  slots: string[];
  rounds?: number;
  agreedSlot?: string | null;
  id?: string;
}) {
  store.demandes = [
    {
      id: opts.id ?? DEMANDE_ID,
      user_id: CAPTAIN_A,
      team_id: TEAM_B,
      type: 'scrim',
      status: 'pending',
      source: 'website',
      comment: 'Scrim ce soir ?',
      created_at: new Date().toISOString(),
      payload: {
        from_team_id: TEAM_A,
        from_team_name: 'Alpha',
        target_team_name: 'Bravo',
        preferred_date: opts.slots[0],
        scrim_nego: {
          slots: opts.slots,
          proposed_by: opts.proposedBy,
          rounds: opts.rounds ?? 1,
          agreed_slot: opts.agreedSlot ?? null,
        },
      },
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  seedTeams();
  store.demandes = [];
  store.scrims = [];
  setAdminUser(CAPTAIN_A, 'capA@test.local', {
    user_metadata: { display_name: 'Cap A' },
  });
  setAdminUser(CAPTAIN_B, 'capB@test.local', {
    user_metadata: { display_name: 'Cap B' },
  });
  notifyScrimRequest.mockClear();
  notifyScrimCounterProposal.mockClear();
});

// ── helpers ──────────────────────────────────────────────
describe('utils/teams/scrimNegotiation', () => {
  it('normalizeSlots: dedupes and canonicalizes ISO', () => {
    const r = normalizeSlots([SLOT_1, SLOT_1, '2026-08-02T20:00:00Z']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.slots).toEqual([SLOT_1, SLOT_2]);
  });

  it('normalizeSlots: rejects empty', () => {
    expect(normalizeSlots([]).ok).toBe(false);
  });

  it('normalizeSlots: rejects > 5 slots', () => {
    const six = [
      SLOT_1,
      SLOT_2,
      SLOT_3,
      '2026-08-04T20:00:00Z',
      '2026-08-05T20:00:00Z',
      '2026-08-06T20:00:00Z',
    ];
    expect(normalizeSlots(six).ok).toBe(false);
  });

  it('normalizeSlots: rejects invalid date', () => {
    expect(normalizeSlots(['nope']).ok).toBe(false);
  });

  it('readScrimNego: legacy fallback from preferred_date', () => {
    const nego = readScrimNego({
      from_team_id: TEAM_A,
      preferred_date: SLOT_1,
    });
    expect(nego.slots).toEqual([SLOT_1]);
    expect(nego.proposed_by).toBe(TEAM_A);
    expect(nego.rounds).toBe(1);
  });
});

// ── POST /api/demandes/scrim (create) ────────────────────
describe('POST /api/demandes/scrim — multi-slot create', () => {
  it('creates scrim_nego with up to 5 slots', async () => {
    setAuthUser({ id: CAPTAIN_A, email: 'capA@test.local' });
    const res = makeRes();
    await scrimCreateHandler(
      makeReq({ body: { teamId: TEAM_B, proposedSlots: [SLOT_1, SLOT_2] } }),
      res
    );
    expect(res.statusCode).toBe(201);
    const inserted: any = store.demandes[0];
    expect(inserted.type).toBe('scrim');
    expect(inserted.payload.scrim_nego.slots).toEqual([SLOT_1, SLOT_2]);
    expect(inserted.payload.scrim_nego.proposed_by).toBe(TEAM_A);
    expect(inserted.payload.scrim_nego.rounds).toBe(1);
    expect(inserted.payload.scrim_nego.agreed_slot).toBe(null);
    expect(inserted.payload.preferred_date).toBe(SLOT_1);
    expect(notifyScrimRequest).toHaveBeenCalledTimes(1);
  });

  it('accepts legacy preferredDate as single-slot fallback', async () => {
    setAuthUser({ id: CAPTAIN_A, email: 'capA@test.local' });
    const res = makeRes();
    await scrimCreateHandler(
      makeReq({ body: { teamId: TEAM_B, preferredDate: SLOT_1 } }),
      res
    );
    expect(res.statusCode).toBe(201);
    const inserted: any = store.demandes[0];
    expect(inserted.payload.scrim_nego.slots).toEqual([SLOT_1]);
    expect(inserted.payload.preferred_date).toBe(SLOT_1);
  });

  it('400 when more than 5 slots', async () => {
    setAuthUser({ id: CAPTAIN_A, email: 'capA@test.local' });
    const res = makeRes();
    await scrimCreateHandler(
      makeReq({
        body: {
          teamId: TEAM_B,
          proposedSlots: [
            SLOT_1,
            SLOT_2,
            SLOT_3,
            '2026-08-04T20:00:00Z',
            '2026-08-05T20:00:00Z',
            '2026-08-06T20:00:00Z',
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when no slot and no preferredDate', async () => {
    setAuthUser({ id: CAPTAIN_A, email: 'capA@test.local' });
    const res = makeRes();
    await scrimCreateHandler(makeReq({ body: { teamId: TEAM_B } }), res);
    expect(res.statusCode).toBe(400);
  });
});

// ── POST /api/teams/scrim-requests — counter ─────────────
describe('POST /api/teams/scrim-requests — counter', () => {
  it('non-proposer (target) counters: slots/proposed_by/rounds updated, stays pending', async () => {
    seedScrimDemande({ proposedBy: TEAM_A, slots: [SLOT_1] });
    setAuthUser({ id: CAPTAIN_B, email: 'capB@test.local' });
    const res = makeRes();
    await scrimRequestsHandler(
      makeReq({
        body: {
          demandeId: DEMANDE_ID,
          action: 'counter',
          slots: [SLOT_2, SLOT_3],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const d: any = store.demandes[0];
    expect(d.status).toBe('pending');
    expect(d.payload.scrim_nego.slots).toEqual([SLOT_2, SLOT_3]);
    expect(d.payload.scrim_nego.proposed_by).toBe(TEAM_B);
    expect(d.payload.scrim_nego.rounds).toBe(2);
    expect(d.payload.preferred_date).toBe(SLOT_2);
    expect(notifyScrimCounterProposal).toHaveBeenCalledTimes(1);
  });

  it('proposer cannot counter their own slots (400)', async () => {
    seedScrimDemande({ proposedBy: TEAM_A, slots: [SLOT_1] });
    setAuthUser({ id: CAPTAIN_A, email: 'capA@test.local' });
    const res = makeRes();
    await scrimRequestsHandler(
      makeReq({
        body: { demandeId: DEMANDE_ID, action: 'counter', slots: [SLOT_2] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(notifyScrimCounterProposal).not.toHaveBeenCalled();
  });

  it('counter with > 5 slots is rejected (400)', async () => {
    seedScrimDemande({ proposedBy: TEAM_A, slots: [SLOT_1] });
    setAuthUser({ id: CAPTAIN_B, email: 'capB@test.local' });
    const res = makeRes();
    await scrimRequestsHandler(
      makeReq({
        body: {
          demandeId: DEMANDE_ID,
          action: 'counter',
          slots: [
            SLOT_1,
            SLOT_2,
            SLOT_3,
            '2026-08-04T20:00:00Z',
            '2026-08-05T20:00:00Z',
            '2026-08-06T20:00:00Z',
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

// ── POST /api/teams/scrim-requests — accept ──────────────
describe('POST /api/teams/scrim-requests — accept', () => {
  it('non-proposer accepts a slot: agreed_slot set, status approved, draft scrim created', async () => {
    seedScrimDemande({ proposedBy: TEAM_A, slots: [SLOT_1, SLOT_2] });
    setAuthUser({ id: CAPTAIN_B, email: 'capB@test.local' });
    const res = makeRes();
    await scrimRequestsHandler(
      makeReq({
        body: { demandeId: DEMANDE_ID, action: 'accept', slot: SLOT_2 },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.newStatus).toBe('approved');
    expect(res.body.agreedSlot).toBe(SLOT_2);

    const d: any = store.demandes.find((x: any) => x.id === DEMANDE_ID);
    expect(d.status).toBe('approved');
    expect(d.payload.scrim_nego.agreed_slot).toBe(SLOT_2);
    expect(d.payload.preferred_date).toBe(SLOT_2);

    // draft scrim with scheduled_date = agreed_slot
    const scrim: any = (store.scrims || []).find(
      (s: any) => s.source_demande_id === DEMANDE_ID
    );
    expect(scrim).toBeTruthy();
    expect(scrim.scheduled_date).toBe(SLOT_2);
    expect(scrim.status).toBe('draft');

    // notification demande (type other)
    const notif: any = store.demandes.find((x: any) => x.type === 'other');
    expect(notif).toBeTruthy();
    expect(notif.payload.notification_type).toBe('scrim_accepted');
  });

  it('proposer cannot accept their own slots (400)', async () => {
    seedScrimDemande({ proposedBy: TEAM_A, slots: [SLOT_1, SLOT_2] });
    setAuthUser({ id: CAPTAIN_A, email: 'capA@test.local' });
    const res = makeRes();
    await scrimRequestsHandler(
      makeReq({
        body: { demandeId: DEMANDE_ID, action: 'accept', slot: SLOT_1 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when slot not in current slots', async () => {
    seedScrimDemande({ proposedBy: TEAM_A, slots: [SLOT_1] });
    setAuthUser({ id: CAPTAIN_B, email: 'capB@test.local' });
    const res = makeRes();
    await scrimRequestsHandler(
      makeReq({
        body: { demandeId: DEMANDE_ID, action: 'accept', slot: SLOT_3 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('legacy single-slot "approve" with no slot accepts the lone slot', async () => {
    // Legacy demande: no scrim_nego, just preferred_date.
    store.demandes = [
      {
        id: DEMANDE_ID,
        user_id: CAPTAIN_A,
        team_id: TEAM_B,
        type: 'scrim',
        status: 'pending',
        source: 'website',
        comment: null,
        created_at: new Date().toISOString(),
        payload: {
          from_team_id: TEAM_A,
          from_team_name: 'Alpha',
          target_team_name: 'Bravo',
          preferred_date: SLOT_1,
        },
      },
    ] as any;
    setAuthUser({ id: CAPTAIN_B, email: 'capB@test.local' });
    const res = makeRes();
    await scrimRequestsHandler(
      makeReq({ body: { demandeId: DEMANDE_ID, action: 'approve' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.agreedSlot).toBe(SLOT_1);
    const d: any = store.demandes.find((x: any) => x.id === DEMANDE_ID);
    expect(d.status).toBe('approved');
  });
});

// ── POST /api/teams/scrim-requests — reject ──────────────
describe('POST /api/teams/scrim-requests — reject', () => {
  it('participant rejects: status rejected', async () => {
    seedScrimDemande({ proposedBy: TEAM_A, slots: [SLOT_1] });
    setAuthUser({ id: CAPTAIN_B, email: 'capB@test.local' });
    const res = makeRes();
    await scrimRequestsHandler(
      makeReq({ body: { demandeId: DEMANDE_ID, action: 'reject' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.newStatus).toBe('rejected');
    const d: any = store.demandes[0];
    expect(d.status).toBe('rejected');
  });
});

// ── GET listing (both directions, awaiting me) ───────────
describe('GET /api/teams/scrim-requests — awaiting-me listing', () => {
  it('target sees a scrim proposed by requester (awaiting target)', async () => {
    seedScrimDemande({ proposedBy: TEAM_A, slots: [SLOT_1] });
    setAuthUser({ id: CAPTAIN_B, email: 'capB@test.local' });
    const res = makeRes();
    await scrimRequestsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const item = res.body.demandes.find((d: any) => d.id === DEMANDE_ID);
    expect(item).toBeTruthy();
    expect(item.iAmRequester).toBe(false);
    expect(item.myTeamId).toBe(TEAM_B);
    expect(item.scrimNego.slots).toEqual([SLOT_1]);
    expect(item.scrimNego.proposedBy).toBe(TEAM_A);
  });

  it('requester sees a scrim countered back to them (awaiting requester)', async () => {
    // After B counters, proposed_by = TEAM_B, so it's A's turn.
    seedScrimDemande({ proposedBy: TEAM_B, slots: [SLOT_2], rounds: 2 });
    setAuthUser({ id: CAPTAIN_A, email: 'capA@test.local' });
    const res = makeRes();
    await scrimRequestsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const item = res.body.demandes.find((d: any) => d.id === DEMANDE_ID);
    expect(item).toBeTruthy();
    expect(item.iAmRequester).toBe(true);
    expect(item.myTeamId).toBe(TEAM_A);
    expect(item.scrimNego.rounds).toBe(2);
  });

  it('proposer does NOT see their own pending proposal (not their turn)', async () => {
    seedScrimDemande({ proposedBy: TEAM_A, slots: [SLOT_1] });
    setAuthUser({ id: CAPTAIN_A, email: 'capA@test.local' });
    const res = makeRes();
    await scrimRequestsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const item = res.body.demandes.find((d: any) => d.id === DEMANDE_ID);
    expect(item).toBeFalsy();
  });
});

// ── dashboard loadPendingScrims (both directions) ────────
describe('GET /api/player/dashboard — pendingScrims both directions', () => {
  it('target captain dashboard surfaces awaiting-me scrim', async () => {
    seedScrimDemande({ proposedBy: TEAM_A, slots: [SLOT_1] });
    setAuthUser({ id: CAPTAIN_B, email: 'capB@test.local' });
    const res = makeRes();
    await dashboardHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const ps = res.body.pendingScrims.find((d: any) => d.id === DEMANDE_ID);
    expect(ps).toBeTruthy();
    expect(ps.iAmRequester).toBe(false);
    expect(ps.scrimNego.proposedBy).toBe(TEAM_A);
  });

  it('requester captain dashboard surfaces scrim countered back to them', async () => {
    seedScrimDemande({ proposedBy: TEAM_B, slots: [SLOT_2], rounds: 2 });
    setAuthUser({ id: CAPTAIN_A, email: 'capA@test.local' });
    const res = makeRes();
    await dashboardHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const ps = res.body.pendingScrims.find((d: any) => d.id === DEMANDE_ID);
    expect(ps).toBeTruthy();
    expect(ps.iAmRequester).toBe(true);
  });

  it('proposer dashboard does NOT surface their own pending proposal', async () => {
    seedScrimDemande({ proposedBy: TEAM_A, slots: [SLOT_1] });
    setAuthUser({ id: CAPTAIN_A, email: 'capA@test.local' });
    const res = makeRes();
    await dashboardHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const ps = (res.body.pendingScrims || []).find(
      (d: any) => d.id === DEMANDE_ID
    );
    expect(ps).toBeFalsy();
  });
});
