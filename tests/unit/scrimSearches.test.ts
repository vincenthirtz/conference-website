// Unit tests — recherches de scrim datées (R5), matching (R6), annuaire (R4).
//
// Règles couvertes :
//   - une recherche exige des créneaux FUTURS (annoncer une dispo révolue est
//     la façon la plus simple de polluer l'annuaire) ;
//   - `teams.open_for_scrim` devient un DÉRIVÉ : posé à la publication, retiré
//     à la clôture — les surfaces qui lisent le booléen restent vraies ;
//   - une seule annonce active par équipe : republier mate à jour, ne duplique
//     pas ;
//   - `scrim.search.matched` n'est émis QUE si des créneaux se recoupent
//     réellement, et cible les équipes concernées ;
//   - la permission `manage_scrims` est exigée (R2) ;
//   - l'annuaire trie par créneaux en commun et purge les annonces périmées.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const emitBotEvent = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: (...args: unknown[]) => emitBotEvent(...args),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import searchesHandler from '../../pages/api/teams/scrim-searches';
import directoryHandler from '../../pages/api/player/teams-directory';
import {
  normalizeSearchSlots,
  overlappingSlots,
  defaultExpiryFor,
  isSearchLive,
} from '../../utils/teams/scrimSearch';

const TEAM_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEAM_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEAM_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CAPTAIN_A = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const COACH_A = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

/** Créneau ISO à +N jours, minute ronde. */
function futureSlot(days: number, hour = 21): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

let _tok = 0;
function makeReq(over: Partial<any> = {}): any {
  _tok += 1;
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_tok}` },
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

function seed() {
  store.teams = [
    {
      id: TEAM_A,
      name: 'Alpha',
      captain_id: CAPTAIN_A,
      tenant_id: CONFERENCE_TENANT_ID,
      is_active: true,
      is_joinable: true,
      open_for_scrim: false,
      deleted_at: null,
    },
    {
      id: TEAM_B,
      name: 'Bravo',
      captain_id: 'captain-b',
      tenant_id: CONFERENCE_TENANT_ID,
      is_active: true,
      is_joinable: false,
      open_for_scrim: false,
      deleted_at: null,
    },
    {
      id: TEAM_C,
      name: 'Charlie',
      captain_id: 'captain-c',
      tenant_id: CONFERENCE_TENANT_ID,
      is_active: true,
      is_joinable: true,
      open_for_scrim: false,
      deleted_at: null,
    },
  ] as any;
  store.team_members = [
    {
      id: 'tm-coach',
      team_id: TEAM_A,
      user_id: COACH_A,
      role: 'coach',
      tenant_id: CONFERENCE_TENANT_ID,
    },
  ] as any;
  store.scrim_searches = [] as any;
  store.team_ratings = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  emitBotEvent.mockClear();
  seed();
  setAuthUser({ id: CAPTAIN_A });
});

/* -----------------------------------------------------------
 * Helpers purs
 * ---------------------------------------------------------*/

describe('scrimSearch — helpers', () => {
  it('refuse un créneau passé', () => {
    const r = normalizeSearchSlots(['2020-01-01T20:00:00.000Z']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/futur/i);
  });

  it('déduplique et ordonne chronologiquement', () => {
    const a = futureSlot(3);
    const b = futureSlot(1);
    const r = normalizeSearchSlots([a, b, a]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.slots).toEqual([b, a]);
  });

  it('expire par défaut 2 h après le dernier créneau', () => {
    const slot = futureSlot(1);
    const expiry = defaultExpiryFor([slot]);
    expect(new Date(expiry).getTime() - new Date(slot).getTime()).toBe(
      2 * 60 * 60 * 1000
    );
  });

  it('ne considère vivante ni une annonce close ni une annonce périmée', () => {
    expect(
      isSearchLive({ status: 'cancelled', expires_at: futureSlot(5) })
    ).toBe(false);
    expect(
      isSearchLive({ status: 'active', expires_at: '2020-01-01T00:00:00.000Z' })
    ).toBe(false);
    expect(isSearchLive({ status: 'active', expires_at: futureSlot(5) })).toBe(
      true
    );
  });

  it('calcule les créneaux communs', () => {
    const a = futureSlot(1);
    const b = futureSlot(2);
    const c = futureSlot(3);
    expect(overlappingSlots([a, b], [b, c])).toEqual([b]);
    expect(overlappingSlots([a], [c])).toEqual([]);
  });
});

/* -----------------------------------------------------------
 * POST /api/teams/scrim-searches
 * ---------------------------------------------------------*/

describe('POST /api/teams/scrim-searches', () => {
  it('publie une annonce et pose le dérivé open_for_scrim', async () => {
    const slot = futureSlot(2);
    const res = makeRes();

    await searchesHandler(makeReq({ body: { slots: [slot] } }), res);

    expect(res.statusCode).toBe(201);
    const rows = (store.scrim_searches as any[]) ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].team_id).toBe(TEAM_A);
    expect(rows[0].status).toBe('active');
    expect(rows[0].slots).toEqual([slot]);
    // Le booléen historique suit désormais la réalité de l'annonce.
    expect(
      (store.teams as any[]).find((t) => t.id === TEAM_A).open_for_scrim
    ).toBe(true);
  });

  it('400 sur un créneau passé', async () => {
    const res = makeRes();
    await searchesHandler(
      makeReq({ body: { slots: ['2020-01-01T20:00:00.000Z'] } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_SLOTS');
    expect((store.scrim_searches as any[]) ?? []).toHaveLength(0);
  });

  it('republier met à jour au lieu de dupliquer', async () => {
    const first = futureSlot(2);
    const second = futureSlot(4);

    await searchesHandler(makeReq({ body: { slots: [first] } }), makeRes());
    await searchesHandler(makeReq({ body: { slots: [second] } }), makeRes());

    const rows = (store.scrim_searches as any[]) ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].slots).toEqual([second]);
  });

  it("n'émet PAS d'alerte quand aucun créneau ne se recoupe", async () => {
    (store.scrim_searches as any[]).push({
      id: 's-b',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_B,
      slots: [futureSlot(9)],
      status: 'active',
      expires_at: futureSlot(10),
    });

    await searchesHandler(
      makeReq({ body: { slots: [futureSlot(2)] } }),
      makeRes()
    );

    expect(emitBotEvent).not.toHaveBeenCalled();
  });

  it('émet scrim.search.matched vers les équipes aux créneaux communs', async () => {
    const shared = futureSlot(2);
    (store.scrim_searches as any[]).push(
      {
        id: 's-b',
        tenant_id: CONFERENCE_TENANT_ID,
        team_id: TEAM_B,
        slots: [shared, futureSlot(6)],
        status: 'active',
        expires_at: futureSlot(7),
      },
      // Annonce PÉRIMÉE : ne doit jamais être notifiée.
      {
        id: 's-c',
        tenant_id: CONFERENCE_TENANT_ID,
        team_id: TEAM_C,
        slots: [shared],
        status: 'active',
        expires_at: '2020-01-01T00:00:00.000Z',
      }
    );

    const res = makeRes();
    await searchesHandler(makeReq({ body: { slots: [shared] } }), res);

    expect(res.statusCode).toBe(201);
    expect((res.body as any).matchedTeams).toBe(1);
    expect(emitBotEvent).toHaveBeenCalledTimes(1);
    const [eventName, payload] = emitBotEvent.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(eventName).toBe('scrim.search.matched');
    expect(payload.targetTeamIds).toEqual([TEAM_B]);
    expect(payload.teamId).toBe(TEAM_A);
  });

  it('403 quand le rôle ne couvre pas manage_scrims', async () => {
    // Coach sans permission : la config par défaut ne lui en donne aucune, il
    // n'est donc même pas « manager » → 403 générique.
    store.site_settings = [
      {
        key: 'team_roles',
        value: JSON.stringify([
          { value: 'player', label: 'Player', permissions: [] },
          { value: 'coach', label: 'Coach', permissions: ['manage_roster'] },
        ]),
      },
    ] as any;
    setAuthUser({ id: COACH_A });

    const res = makeRes();
    await searchesHandler(makeReq({ body: { slots: [futureSlot(2)] } }), res);

    expect(res.statusCode).toBe(403);
    expect((store.scrim_searches as any[]) ?? []).toHaveLength(0);
  });

  it('DELETE clôt l’annonce et retire le dérivé', async () => {
    await searchesHandler(
      makeReq({ body: { slots: [futureSlot(2)] } }),
      makeRes()
    );

    const res = makeRes();
    await searchesHandler(makeReq({ method: 'DELETE' }), res);

    expect(res.statusCode).toBe(200);
    const rows = (store.scrim_searches as any[]) ?? [];
    expect(rows[0].status).toBe('cancelled');
    expect(
      (store.teams as any[]).find((t) => t.id === TEAM_A).open_for_scrim
    ).toBe(false);
  });
});

/* -----------------------------------------------------------
 * GET /api/player/teams-directory
 * ---------------------------------------------------------*/

describe('GET /api/player/teams-directory', () => {
  it('exclut mon équipe et remonte les créneaux communs en premier', async () => {
    const shared = futureSlot(2);
    (store.scrim_searches as any[]).push(
      {
        id: 's-a',
        tenant_id: CONFERENCE_TENANT_ID,
        team_id: TEAM_A,
        slots: [shared],
        status: 'active',
        expires_at: futureSlot(3),
      },
      {
        id: 's-c',
        tenant_id: CONFERENCE_TENANT_ID,
        team_id: TEAM_C,
        slots: [shared],
        status: 'active',
        expires_at: futureSlot(3),
      }
    );

    const res = makeRes();
    await directoryHandler(makeReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.myTeamId).toBe(TEAM_A);
    const ids = body.teams.map((t: any) => t.id);
    expect(ids).not.toContain(TEAM_A);
    // Charlie a un créneau en commun → devant Bravo (aucune annonce).
    expect(ids[0]).toBe(TEAM_C);
    const charlie = body.teams.find((t: any) => t.id === TEAM_C);
    expect(charlie.scrim_search.common_slots).toEqual([shared]);
    const bravo = body.teams.find((t: any) => t.id === TEAM_B);
    expect(bravo.scrim_search).toBeNull();
  });

  it('purge les annonces périmées à la lecture', async () => {
    (store.scrim_searches as any[]).push({
      id: 's-c',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_C,
      slots: [futureSlot(1)],
      status: 'active',
      expires_at: '2020-01-01T00:00:00.000Z',
    });

    const res = makeRes();
    await directoryHandler(makeReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    const rows = (store.scrim_searches as any[]) ?? [];
    expect(rows[0].status).toBe('cancelled');
    const charlie = (res.body as any).teams.find((t: any) => t.id === TEAM_C);
    expect(charlie.scrim_search).toBeNull();
  });
});
