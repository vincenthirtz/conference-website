// Source « matchs du jour » (`/overlay/day`).
// Targets : utils/overlay/dayOverlay.ts (pur), pages/api/overlay/day.ts
//
// CE QUE CES CAS PROTÈGENT :
//   1. LA JOURNÉE EST CELLE DE PARIS. Un match à 00:30 heure de Paris est la
//      veille en UTC : il doit rester dans SA journée, été comme hiver.
//   2. ON NE DIFFUSE PAS CE QUI N'EST PAS PUBLIC (404 tournoi privé, 402 sans
//      la capacité `matchOverlays`) — mêmes règles que les sources par match.
//   3. LE MATCH DU MOMENT RESTE À L'ÉCRAN quand la journée dépasse la limite.
//   4. UNE URL MAL FORMÉE SE VOIT TOUT DE SUITE (400).

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  buildDayOverlay,
  dayWindow,
  parisDateKey,
  parseDayLimit,
  resolveDayBounds,
  selectDayMatches,
} from '../../utils/overlay/dayOverlay';
import type { MatchRowForOverlay } from '../../utils/overlay/matchOverlay';
import handler from '../../pages/api/overlay/day';

const T1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const T2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const TOURNAMENT = 'cccccccc-0000-4000-8000-000000000001';
const OTHER_TENANT = 'dddddddd-0000-4000-8000-000000000009';

function row(
  id: string,
  over: Partial<MatchRowForOverlay> = {}
): MatchRowForOverlay {
  return {
    id,
    status: 'pending',
    started_at: null,
    scheduled_at: null,
    completed_at: null,
    match_format: 'bo3',
    round_name: null,
    team1_id: T1,
    team2_id: T2,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    ...over,
  };
}

describe('journée à Paris', () => {
  it('borne la journée d’été sur minuit heure de Paris (UTC+2)', () => {
    const b = resolveDayBounds('2026-09-18', 0)!;
    expect(new Date(b.startMs).toISOString()).toBe('2026-09-17T22:00:00.000Z');
    expect(new Date(b.endMs).toISOString()).toBe('2026-09-18T22:00:00.000Z');
  });

  it('borne la journée d’hiver sur UTC+1', () => {
    const b = resolveDayBounds('2026-01-10', 0)!;
    expect(new Date(b.startMs).toISOString()).toBe('2026-01-09T23:00:00.000Z');
  });

  it('gère la nuit du passage à l’heure d’hiver (journée de 25 h)', () => {
    const b = resolveDayBounds('2026-10-25', 0)!;
    expect(b.endMs - b.startMs).toBe(25 * 3600 * 1000);
  });

  it('prend aujourd’hui à Paris sans paramètre, même quand UTC est encore la veille', () => {
    // 23:30 UTC le 17 = 01:30 le 18 à Paris.
    const now = Date.parse('2026-09-17T23:30:00.000Z');
    expect(parisDateKey(now)).toBe('2026-09-18');
    expect(resolveDayBounds(undefined, now)!.date).toBe('2026-09-18');
  });

  it('refuse une date mal formée ou impossible', () => {
    expect(resolveDayBounds('18/09/2026', 0)).toBeNull();
    expect(resolveDayBounds('2026-02-31', 0)).toBeNull();
  });
});

describe('sélection des matchs du jour', () => {
  const bounds = resolveDayBounds('2026-09-18', 0)!;

  it('garde le match de 00:30 heure de Paris et écarte ceux des autres jours', () => {
    const rows = [
      row('late', { scheduled_at: '2026-09-17T22:30:00.000Z' }), // 00:30 le 18
      row('eve', { scheduled_at: '2026-09-17T21:30:00.000Z' }), // 23:30 le 17
      row('evening', { scheduled_at: '2026-09-18T17:00:00.000Z' }),
      row('next', { scheduled_at: '2026-09-18T22:00:00.000Z' }), // minuit le 19
    ];
    expect(selectDayMatches(rows, bounds).map((r) => r.id)).toEqual([
      'late',
      'evening',
    ]);
  });

  it('range un match sans horaire sur son coup d’envoi réel', () => {
    const rows = [
      row('unscheduled', { started_at: '2026-09-18T18:00:00.000Z' }),
      row('never', {}),
    ];
    expect(selectDayMatches(rows, bounds).map((r) => r.id)).toEqual([
      'unscheduled',
    ]);
  });

  it('met en avant le match en cours et projette les scores', () => {
    const rows = [
      row('m1', {
        scheduled_at: '2026-09-18T16:00:00.000Z',
        status: 'completed',
        completed_at: '2026-09-18T17:00:00.000Z',
        team1_score: 2,
        team2_score: 0,
        winner_team_id: T1,
      }),
      row('m2', {
        scheduled_at: '2026-09-18T17:30:00.000Z',
        started_at: '2026-09-18T17:35:00.000Z',
        status: 'in_progress',
        team1_score: 1,
      }),
    ];
    const teams = new Map([
      [
        T1,
        { id: T1, name: 'Venom Valkyries', short_name: null, logo_url: null },
      ],
    ]);
    const out = buildDayOverlay({
      rows,
      teams,
      bounds,
      nowMs: Date.parse('2026-09-18T18:00:00.000Z'),
    });
    expect(out.currentMatchId).toBe('m2');
    expect(out.matches[0]!.team1).toMatchObject({ score: 2, isWinner: true });
    // Équipe inconnue : `null`, que l'écran affiche « À déterminer ».
    expect(out.matches[0]!.team2).toBeNull();
    expect(out.matches[0]).not.toHaveProperty('maps');
  });
});

describe('fenêtre d’affichage', () => {
  const list = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}` }));

  it('garde le match du moment en deuxième ligne', () => {
    expect(dayWindow(list, 'm5', 4).map((m) => m.id)).toEqual([
      'm4',
      'm5',
      'm6',
      'm7',
    ]);
  });

  it('ne laisse pas de vide en fin de journée', () => {
    expect(dayWindow(list, 'm9', 4).map((m) => m.id)).toEqual([
      'm6',
      'm7',
      'm8',
      'm9',
    ]);
  });

  it('borne ?limit=', () => {
    expect(parseDayLimit(undefined)).toBe(8);
    expect(parseDayLimit('50')).toBe(12);
    expect(parseDayLimit('0')).toBe(1);
  });
});

/* ── Le point d'entrée ─────────────────────────────────────────────────── */

function makeReq(query: Record<string, unknown> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h' },
    cookies: {},
    query,
    body: {},
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

function seed() {
  store.tournaments = [
    {
      id: TOURNAMENT,
      slug: 'cup-2026',
      name: 'Cup 2026',
      short_name: 'Cup',
      game: 'overwatch',
      visibility: 'public',
      tenant_id: DEFAULT_TENANT_ID,
    },
  ];
  store.matches = [
    {
      ...row('bbbbbbbb-0000-4000-8000-000000000001', {
        scheduled_at: '2026-09-18T17:00:00.000Z',
      }),
      tenant_id: DEFAULT_TENANT_ID,
      tournament_id: TOURNAMENT,
      is_bye: false,
      deleted_at: null,
    },
    {
      ...row('bbbbbbbb-0000-4000-8000-000000000002', {
        scheduled_at: '2026-09-19T17:00:00.000Z',
      }),
      tenant_id: DEFAULT_TENANT_ID,
      tournament_id: TOURNAMENT,
      is_bye: false,
      deleted_at: null,
    },
  ];
  store.teams = [
    { id: T1, name: 'Venom Valkyries', short_name: 'VV', logo_url: null },
    { id: T2, name: 'Team Positivité', short_name: 'TP', logo_url: null },
  ];
}

describe('GET /api/overlay/day', () => {
  beforeEach(() => {
    resetSupabaseMock();
    seed();
  });

  it('exige le tournoi', async () => {
    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res.statusCode).toBe(400);
  });

  it('refuse une date illisible', async () => {
    const res = makeRes();
    await handler(makeReq({ tournament: 'cup-2026', date: 'demain' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('sert les matchs de la journée demandée, équipes comprises', async () => {
    const res = makeRes();
    await handler(makeReq({ tournament: 'cup-2026', date: '2026-09-18' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.date).toBe('2026-09-18');
    expect(res.body.matches).toHaveLength(1);
    expect(res.body.matches[0].team2.name).toBe('Team Positivité');
    expect(res.body.tournament.slug).toBe('cup-2026');
    expect(res.headers['Cache-Control']).toContain('s-maxage=15');
  });

  it('rend une liste vide, pas une erreur, un jour sans match', async () => {
    const res = makeRes();
    await handler(makeReq({ tournament: 'cup-2026', date: '2026-09-25' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.matches).toEqual([]);
    expect(res.body.currentMatchId).toBeNull();
  });

  it('ne diffuse pas un tournoi privé', async () => {
    store.tournaments[0]!.visibility = 'private';
    const res = makeRes();
    await handler(makeReq({ tournament: 'cup-2026' }), res);
    expect(res.statusCode).toBe(404);
  });

  it('refuse par le palier quand l’espace n’a pas les overlays', async () => {
    store.tournaments[0]!.tenant_id = OTHER_TENANT;
    store.tenants = [
      {
        id: OTHER_TENANT,
        slug: 'autre',
        plan: 'discovery',
        plan_status: 'active',
        plan_expires_at: null,
      },
    ];
    const res = makeRes();
    await handler(makeReq({ tournament: 'cup-2026', tenant: 'autre' }), res);
    expect(res.statusCode).toBe(402);
    expect(res.body.capability).toBe('matchOverlays');
  });
});

describe('jour forcé depuis l’onglet Outils (source déjà collée dans OBS)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    seed();
  });

  it('sans date dans l’URL, la source suit le jour forcé encore valide', async () => {
    Object.assign(store.tournaments[0]!, {
      overlay_day_date: '2026-09-19',
      overlay_day_set_at: new Date().toISOString(),
    });
    const res = makeRes();
    await handler(makeReq({ tournament: 'cup-2026' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.date).toBe('2026-09-19');
    expect(res.body.matches).toHaveLength(1);
  });

  it('une date explicite dans l’URL prime sur le forçage', async () => {
    Object.assign(store.tournaments[0]!, {
      overlay_day_date: '2026-09-19',
      overlay_day_set_at: new Date().toISOString(),
    });
    const res = makeRes();
    await handler(makeReq({ tournament: 'cup-2026', date: '2026-09-18' }), res);
    expect(res.body.date).toBe('2026-09-18');
  });

  it('un forçage de plus de 12 h est ignoré : retour au jour même', async () => {
    Object.assign(store.tournaments[0]!, {
      overlay_day_date: '2026-09-19',
      overlay_day_set_at: new Date(Date.now() - 13 * 3600_000).toISOString(),
    });
    const res = makeRes();
    await handler(makeReq({ tournament: 'cup-2026' }), res);
    expect(res.body.date).not.toBe('2026-09-19');
  });
});

describe('activeDayOverride / isDayString', () => {
  it('valide le format et le calendrier', async () => {
    const { isDayString } = await import('../../utils/overlay/dayOverride');
    expect(isDayString('2026-09-23')).toBe(true);
    expect(isDayString('2026-02-30')).toBe(false);
    expect(isDayString('23/09/2026')).toBe(false);
  });

  it('honore 12 h, pas une seconde de plus', async () => {
    const { activeDayOverride, DAY_OVERRIDE_TTL_MS } = await import(
      '../../utils/overlay/dayOverride'
    );
    const setAt = '2026-09-24T10:00:00.000Z';
    const t0 = new Date(setAt).getTime();
    const row = { overlay_day_date: '2026-09-23', overlay_day_set_at: setAt };
    expect(activeDayOverride(row, t0 + 1000)).toBe('2026-09-23');
    expect(activeDayOverride(row, t0 + DAY_OVERRIDE_TTL_MS)).toBeNull();
    expect(activeDayOverride({ overlay_day_date: null }, t0)).toBeNull();
  });
});
