// Endpoints du chantier « plateforme de tournois » (lots 2, 3 et 5) —
// docs/PLAN-plateforme-tournois.md.
//
// La logique pure est déjà couverte ailleurs (matchAvailability,
// scheduleDiagnostics). Ce fichier couvre ce qui n'existe qu'au niveau de la
// route : le scope tenant, la validation d'entrée, et le GARDE-FOU du lot 5 —
// une écriture qui créerait une anomalie bloquante doit être refusée.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

// Les événements bot partent en `void` et frapperaient le réseau.
const { emitBotEvent, enrichMatchEvent } = vi.hoisted(() => ({
  emitBotEvent: vi.fn(async () => undefined),
  enrichMatchEvent: vi.fn(async () => ({})),
}));
vi.mock('@/utils/botEvents', () => ({ emitBotEvent }));
vi.mock('@/utils/matches/botEventEnrich', () => ({ enrichMatchEvent }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';

import availabilityHandler from '../../pages/api/admin/teams/[teamId]/availability';
import diagnosticsHandler from '../../pages/api/admin/tournament/[id]/schedule-diagnostics';
import moveHandler from '../../pages/api/admin/tournament/[id]/schedule-move';

// UUID de test valides au sens STRICT (v4 + bits de variante) : le corps de
// `schedule-move` passe par `z.string().uuid()`, plus exigeant que le
// `isValidUUID` maison utilisé ailleurs. Des UUID « décoratifs » y échouaient.
const TEAM_A = '11111111-1111-4111-8111-111111111111';
const TEAM_B = '22222222-2222-4222-8222-222222222222';
const TOURNOI = '33333333-3333-4333-8333-333333333333';
const MATCH_1 = '44444444-4444-4444-8444-444444444444';
const MATCH_2 = '55555555-5555-4555-8555-555555555555';

let _t = 0;
function freshToken() {
  _t += 1;
  return `t-${Date.now()}-${_t}`;
}

function makeStaffRow(role: string): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    role,
    tenant_id: DEFAULT_TENANT_ID,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  } as unknown as StaffMember;
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

/** `HH:MM` Paris (CEST, UTC+2 en septembre/octobre) → ISO UTC. */
function paris(day: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(
    `${day}T${String(h - 2).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`
  ).toISOString();
}

function seedTournament() {
  store.tournaments = [
    {
      id: TOURNOI,
      tenant_id: DEFAULT_TENANT_ID,
      name: 'Cup de test',
      start_date: '2026-09-18',
      end_date: '2026-10-23',
      timezone: 'Europe/Paris',
    },
  ] as any;
  store.teams = [
    { id: TEAM_A, tenant_id: DEFAULT_TENANT_ID, name: 'Alpha' },
    { id: TEAM_B, tenant_id: DEFAULT_TENANT_ID, name: 'Bravo' },
  ] as any;
  store.tournament_teams = [
    { id: 'tt1', tenant_id: DEFAULT_TENANT_ID, tournament_id: TOURNOI, team_id: TEAM_A },
    { id: 'tt2', tenant_id: DEFAULT_TENANT_ID, tournament_id: TOURNOI, team_id: TEAM_B },
  ] as any;
  store.matches = [
    {
      id: MATCH_1,
      tenant_id: DEFAULT_TENANT_ID,
      tournament_id: TOURNOI,
      stage_id: null,
      team1_id: TEAM_A,
      team2_id: TEAM_B,
      match_format: 'bo3',
      status: 'pending',
      is_bye: false,
      round_name: 'J1',
      round_number: 1,
      scheduled_at: paris('2026-09-18', '20:30'),
      deleted_at: null,
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  emitBotEvent.mockClear();
  enrichMatchEvent.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
  store.team_availability_constraints = [] as any;
  seedTournament();
});

/* -----------------------------------------------------------
 * /api/admin/teams/[teamId]/availability
 * ---------------------------------------------------------*/

describe('/api/admin/teams/[teamId]/availability', () => {
  it('400 sur un teamId invalide', async () => {
    const res = makeRes();
    await availabilityHandler(makeReq({ query: { teamId: 'bad' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('404 sur une équipe hors du tenant', async () => {
    store.teams = [
      { id: TEAM_A, tenant_id: 'un-autre-tenant', name: 'Alpha' },
    ] as any;
    const res = makeRes();
    await availabilityHandler(makeReq({ query: { teamId: TEAM_A } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('TEAM_NOT_FOUND');
  });

  it('GET rend une liste vide quand rien n’est déclaré', async () => {
    const res = makeRes();
    await availabilityHandler(makeReq({ query: { teamId: TEAM_A } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.constraints).toEqual([]);
  });

  it('POST crée une contrainte d’heure', async () => {
    const res = makeRes();
    await availabilityHandler(
      makeReq({
        method: 'POST',
        query: { teamId: TEAM_A },
        body: { kind: 'earliest', time_of_day: '21:00' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.constraint.kind).toBe('earliest');
    expect(res.body.constraint.timeOfDay).toBe('21:00');
    expect(res.body.constraint.timezone).toBe('Europe/Paris');
  });

  it('400 quand la nature exige un champ absent', async () => {
    // Le pendant TypeScript du CHECK SQL : sans lui, PostgREST renverrait 500.
    const res = makeRes();
    await availabilityHandler(
      makeReq({
        method: 'POST',
        query: { teamId: TEAM_A },
        body: { kind: 'earliest' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
  });

  it('400 sur un fuseau que le runtime ne connaît pas', async () => {
    // Un fuseau inconnu ferait taire le vérificateur sans que personne le voie.
    const res = makeRes();
    await availabilityHandler(
      makeReq({
        method: 'POST',
        query: { teamId: TEAM_A },
        body: { kind: 'earliest', time_of_day: '21:00', timezone: 'Mars/Olympus' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 sur un blackout aux dates inversées', async () => {
    const res = makeRes();
    await availabilityHandler(
      makeReq({
        method: 'POST',
        query: { teamId: TEAM_A },
        body: { kind: 'blackout', starts_on: '2026-09-20', ends_on: '2026-09-18' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('405 sur une méthode non prévue', async () => {
    const res = makeRes();
    await availabilityHandler(
      makeReq({ method: 'PUT', query: { teamId: TEAM_A } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/schedule-diagnostics
 * ---------------------------------------------------------*/

describe('/api/admin/tournament/[id]/schedule-diagnostics', () => {
  it('404 sur un tournoi hors du tenant', async () => {
    store.tournaments = [
      { id: TOURNOI, tenant_id: 'autre', name: 'X', timezone: 'Europe/Paris' },
    ] as any;
    const res = makeRes();
    await diagnosticsHandler(makeReq({ query: { id: TOURNOI } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('ne signale rien sur un calendrier sans contrainte', async () => {
    const res = makeRes();
    await diagnosticsHandler(makeReq({ query: { id: TOURNOI } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.counts.blocking).toBe(0);
    expect(res.body.constraintCount).toBe(0);
    expect(res.body.slotGrid).toEqual(['20:30']);
  });

  it('signale la contrainte violée, et rend le calendrier avec', async () => {
    store.team_availability_constraints = [
      {
        id: 'c1',
        tenant_id: DEFAULT_TENANT_ID,
        team_id: TEAM_A,
        tournament_id: null,
        kind: 'earliest',
        starts_on: null,
        ends_on: null,
        time_of_day: '21:00:00',
        weekdays: null,
        timezone: 'Europe/Paris',
        note: null,
      },
    ] as any;

    const res = makeRes();
    await diagnosticsHandler(makeReq({ query: { id: TOURNOI } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.counts.blocking).toBe(1);
    expect(res.body.anomalies[0].kind).toBe('availability');
    expect(res.body.anomalies[0].teamId).toBe(TEAM_A);
    // Le calendrier voyage avec le diagnostic : les deux vues montrent la même
    // chose, à la même seconde.
    expect(res.body.matches).toHaveLength(1);
    expect(res.body.constraints).toHaveLength(1);
  });

  it('405 sur autre chose qu’un GET', async () => {
    const res = makeRes();
    await diagnosticsHandler(
      makeReq({ method: 'POST', query: { id: TOURNOI } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/schedule-move
 * ---------------------------------------------------------*/

describe('/api/admin/tournament/[id]/schedule-move', () => {
  function moveReq(body: Record<string, unknown>) {
    return makeReq({ method: 'POST', query: { id: TOURNOI }, body });
  }

  it('refuse deux destinations pour le même match', async () => {
    const res = makeRes();
    await moveHandler(
      moveReq({
        moves: [
          { matchId: MATCH_1, scheduledAt: paris('2026-09-23', '22:00') },
          { matchId: MATCH_1, scheduledAt: paris('2026-09-23', '19:00') },
        ],
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('DUPLICATE_MATCH');
  });

  it('404 sur un match qui n’est pas dans ce tournoi', async () => {
    const res = makeRes();
    await moveHandler(
      moveReq({
        moves: [{ matchId: MATCH_2, scheduledAt: paris('2026-09-23', '22:00') }],
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('MATCH_NOT_IN_TOURNAMENT');
  });

  it('APERÇU par défaut : rien n’est écrit', async () => {
    const before = (store.matches as any)[0].scheduled_at;
    const res = makeRes();
    await moveHandler(
      moveReq({
        moves: [{ matchId: MATCH_1, scheduledAt: paris('2026-09-23', '22:00') }],
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.applied).toBe(false);
    expect((store.matches as any)[0].scheduled_at).toBe(before);
    expect(emitBotEvent).not.toHaveBeenCalled();
  });

  it('l’aperçu dit ce que le déplacement RÉPARE', async () => {
    store.team_availability_constraints = [
      {
        id: 'c1',
        tenant_id: DEFAULT_TENANT_ID,
        team_id: TEAM_A,
        tournament_id: null,
        kind: 'earliest',
        starts_on: null,
        ends_on: null,
        time_of_day: '21:00:00',
        weekdays: null,
        timezone: 'Europe/Paris',
        note: null,
      },
    ] as any;

    const res = makeRes();
    await moveHandler(
      moveReq({
        moves: [{ matchId: MATCH_1, scheduledAt: paris('2026-09-18', '22:00') }],
      }),
      res
    );
    expect(res.body.impact.fixed).toHaveLength(1);
    expect(res.body.impact.broken).toEqual([]);
    expect(res.body.impact.createsBlocking).toBe(false);
  });

  it('REFUSE d’appliquer un déplacement qui crée une anomalie bloquante', async () => {
    store.team_availability_constraints = [
      {
        id: 'c1',
        tenant_id: DEFAULT_TENANT_ID,
        team_id: TEAM_A,
        tournament_id: null,
        kind: 'blackout',
        starts_on: '2026-09-23',
        ends_on: '2026-09-23',
        time_of_day: null,
        weekdays: null,
        timezone: 'Europe/Paris',
        note: null,
      },
    ] as any;

    const before = (store.matches as any)[0].scheduled_at;
    const res = makeRes();
    await moveHandler(
      moveReq({
        moves: [{ matchId: MATCH_1, scheduledAt: paris('2026-09-23', '22:00') }],
        apply: true,
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('WOULD_CREATE_BLOCKING');
    // Le refus ne doit rien laisser derrière lui.
    expect((store.matches as any)[0].scheduled_at).toBe(before);
  });

  it('applique quand rien ne bloque, et émet le déplacement', async () => {
    const target = paris('2026-09-23', '22:00');
    const res = makeRes();
    await moveHandler(
      moveReq({ moves: [{ matchId: MATCH_1, scheduledAt: target }], apply: true }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.applied).toBe(true);
    expect((store.matches as any)[0].scheduled_at).toBe(target);

    // Attendre les émissions lancées en `void`.
    await new Promise((r) => setTimeout(r, 0));
    const names = emitBotEvent.mock.calls.map((c: unknown[]) => c[0]);
    expect(names).toContain('match.scheduled');
    // Le match avait DÉJÀ une date : c'est un déplacement, pas une
    // planification — les équipes doivent l'apprendre.
    expect(names).toContain('match.rescheduled');
  });

  it('405 sur autre chose qu’un POST', async () => {
    const res = makeRes();
    await moveHandler(makeReq({ method: 'GET', query: { id: TOURNOI } }), res);
    expect(res.statusCode).toBe(405);
  });
});
