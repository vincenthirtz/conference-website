// Picks de map et bans de héros, par partie.
// Targets : utils/matches/heroBans.ts (pur),
//           pages/api/matches/[matchId]/games.ts (PUT).
//
// CE QUE CES CAS PROTÈGENT, par ordre d'importance :
//   1. UNE SAISIE REFUSÉE N'EFFACE RIEN. Le PUT remplace toutes les parties du
//      match ; la validation doit passer AVANT la suppression.
//   2. Rien d'inconnu n'atteint les stats publiques : héros hors manifeste,
//      équipe étrangère au match, même héros banni deux fois.
//   3. Un pick déjà fait au veto n'est pas compté une seconde fois.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import {
  computeHeroBanStats,
  computeMapBanStats,
  normalizeHeroBans,
  normalizePickedBy,
  vetoPicksFromGames,
} from '../../utils/matches/heroBans';
import gamesHandler from '../../pages/api/matches/[matchId]/games';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const T1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const T2 = 'bbbbbbbb-0000-4000-8000-000000000002';
const OUT = 'cccccccc-0000-4000-8000-000000000003';
const MATCH = 'dddddddd-0000-4000-8000-000000000004';

/* ── Validation ────────────────────────────────────────────────────────── */

describe('normalizeHeroBans', () => {
  const teams = [T1, T2];

  it('garde l’ordre des bans', () => {
    const r = normalizeHeroBans(
      [
        { team_id: T1, hero: 'hazard' },
        { team_id: T2, hero: 'mizuki' },
      ],
      teams
    );
    expect(r).toEqual({
      ok: true,
      bans: [
        { team_id: T1, hero: 'hazard' },
        { team_id: T2, hero: 'mizuki' },
      ],
    });
  });

  it('ignore une ligne sans héros, et traite l’absence de champ comme « aucun ban »', () => {
    expect(normalizeHeroBans([{ team_id: T1, hero: '' }], teams)).toEqual({
      ok: true,
      bans: [],
    });
    expect(normalizeHeroBans(undefined, teams)).toEqual({ ok: true, bans: [] });
  });

  it.each([
    [[{ team_id: T1, hero: 'misuki' }], 'hero_unknown'],
    [[{ team_id: OUT, hero: 'ana' }], 'hero_ban_team_not_in_match'],
    [
      [
        { team_id: T1, hero: 'ana' },
        { team_id: T2, hero: 'ana' },
      ],
      'hero_banned_twice',
    ],
    [
      [
        { team_id: T1, hero: 'ana' },
        { team_id: T1, hero: 'mercy' },
        { team_id: T1, hero: 'lucio' },
      ],
      'too_many_bans',
    ],
    ['ana', 'hero_bans_not_array'],
  ])('refuse %j (%s)', (raw, error) => {
    expect(normalizeHeroBans(raw, teams)).toEqual({ ok: false, error });
  });
});

describe('normalizePickedBy', () => {
  it('accepte une équipe du match ou rien', () => {
    expect(normalizePickedBy(T2, [T1, T2])).toEqual({ ok: true, teamId: T2 });
    expect(normalizePickedBy('', [T1, T2])).toEqual({ ok: true, teamId: null });
    expect(normalizePickedBy(OUT, [T1, T2]).ok).toBe(false);
  });
});

/* ── Stats ─────────────────────────────────────────────────────────────── */

describe('computeHeroBanStats', () => {
  it('compte par héros et par équipe, sur les seules maps renseignées', () => {
    const { mapsWithBans, heroes } = computeHeroBanStats([
      { hero_bans: [{ team_id: T1, hero: 'sigma' }] },
      {
        hero_bans: [
          { team_id: T2, hero: 'sigma' },
          { team_id: T1, hero: 'ana' },
        ],
      },
      { hero_bans: [] }, // map sans bans relevés : hors dénominateur
    ]);
    expect(mapsWithBans).toBe(2);
    expect(heroes[0]).toMatchObject({ hero: 'sigma', bans: 2, rate: 1 });
    expect(heroes[0].byTeam).toHaveLength(2);
    expect(heroes[1]).toMatchObject({ hero: 'ana', name: 'Ana', bans: 1 });
  });
});

describe('vetoPicksFromGames', () => {
  it('ajoute les picks des parties, sauf pour un match déjà pické au veto', () => {
    const picks = vetoPicksFromGames(
      [
        { match_id: 'm1', map_name: 'Junkertown', picked_by_team_id: T2 },
        { match_id: 'm1', map_name: 'Nepal', picked_by_team_id: null },
        { match_id: 'm2', map_name: 'Busan', picked_by_team_id: T1 },
      ],
      [{ match_id: 'm2', action: 'pick' }]
    );
    expect(picks).toEqual([
      { match_id: 'm1', action: 'pick', team_id: T2, map_name: 'Junkertown' },
    ]);
  });
});

/* ── Route ─────────────────────────────────────────────────────────────── */

function staffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'admin',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let n = 0;
function putReq(games: unknown[]): any {
  n += 1;
  return {
    method: 'PUT',
    headers: { host: 'h', authorization: `Bearer t-${n}` },
    query: { matchId: MATCH },
    body: { games, recomputeMode: 'none' },
    cookies: {},
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

describe('PUT /api/matches/[matchId]/games — picks et bans', () => {
  beforeEach(() => {
    resetSupabaseMock();
    invalidateStaffCache();
    setAuthUser({ id: 'user-1' });
    store.staff = [staffRow()] as any;
    store.matches = [
      { id: MATCH, tenant_id: TENANT, team1_id: T1, team2_id: T2 },
    ] as any;
    store.games = [
      {
        id: 'g-old',
        tenant_id: TENANT,
        match_id: MATCH,
        map_name: 'Nepal',
        map_order: 0,
        hero_bans: [],
      },
    ] as any;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('enregistre pick et bans validés', async () => {
    const res = makeRes();
    await gamesHandler(
      putReq([
        {
          map_name: 'Junkertown',
          map_order: 1,
          team1_score: 1,
          team2_score: 0,
          picked_by_team_id: T2,
          hero_bans: [
            { team_id: T2, hero: 'lucio' },
            { team_id: T1, hero: 'sigma' },
          ],
        },
      ]),
      res
    );
    expect(res.statusCode).toBe(200);
    const saved = (store.games as any[]).filter((g) => g.match_id === MATCH);
    expect(saved).toHaveLength(1);
    expect(saved[0].picked_by_team_id).toBe(T2);
    expect(saved[0].hero_bans.map((b: any) => b.hero)).toEqual([
      'lucio',
      'sigma',
    ]);
  });

  it('refuse un ban invalide SANS effacer les parties existantes', async () => {
    const res = makeRes();
    await gamesHandler(
      putReq([
        { map_name: 'Nepal', map_order: 0 },
        {
          map_name: 'Junkertown',
          map_order: 1,
          hero_bans: [{ team_id: OUT, hero: 'ana' }],
        },
      ]),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: 'hero_ban_team_not_in_match',
      gameIndex: 1,
    });
    expect((store.games as any[]).map((g) => g.id)).toEqual(['g-old']);
  });
});

describe('computeMapBanStats', () => {
  it('agrège par map : parties, choix, héros bannis', () => {
    const out = computeMapBanStats([
      {
        map_name: 'Oasis',
        picked_by_team_id: null,
        hero_bans: [
          { team_id: 'A', hero: 'orisa' },
          { team_id: 'B', hero: 'cassidy' },
        ],
      },
      {
        map_name: 'Oasis',
        hero_bans: [
          { team_id: 'C', hero: 'cassidy' },
          { team_id: 'D', hero: 'mauga' },
        ],
      },
      { map_name: "King's Row", picked_by_team_id: 'C', hero_bans: [] },
      { map_name: null, hero_bans: [{ team_id: 'A', hero: 'ana' }] },
    ]);
    expect(out.map((m) => m.map)).toEqual(['Oasis', "King's Row"]);
    const oasis = out[0];
    expect(oasis).toMatchObject({ played: 2, picked: 0, mapsWithBans: 2 });
    expect(oasis.bans.map((b) => [b.hero, b.count])).toEqual([
      ['cassidy', 2],
      ['mauga', 1],
      ['orisa', 1],
    ]);
    expect(out[1]).toMatchObject({
      played: 1,
      picked: 1,
      mapsWithBans: 0,
      bans: [],
    });
  });
});
