// Sources de stream par match (lot « overlays dans l'offre Régie »).
// Targets : utils/overlay/matchOverlay.ts (pur),
//           pages/api/overlay/match/[matchId].ts
//
// CE QUE CES CAS PROTÈGENT, par ordre d'importance :
//   1. ON NE DIFFUSE PAS CE QUI N'EST PAS PUBLIC. Un tournoi privé ne sort pas
//      par une URL d'overlay devinée, et un espace sans la capacité
//      `matchOverlays` reçoit un 402 — pas un écran.
//   2. LE SCORE AFFICHÉ EST CELUI DE LA FEUILLE DE MATCH. Le vainqueur vient
//      de `winner_team_id`, jamais d'une comparaison de scores : un forfait
//      réglé 0-0 a quand même un gagnant, et l'écran doit le dire.
//   3. « LE MATCH DU MOMENT » NE SAUTE PAS UN MATCH EN COURS. C'est la
//      promesse de l'URL `next` : une régie la colle le matin et n'y touche
//      plus de la journée.
//   4. UNE URL MAL FORMÉE SE VOIT TOUT DE SUITE (400), au lieu d'échouer en
//      plein direct.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  buildOverlayMatch,
  matchPhase,
  parseOverlaySource,
  pickOverlayMatch,
  RECENT_FINAL_WINDOW_MS,
  STARTING_SOON_MS,
  type MatchRowForOverlay,
} from '../../utils/overlay/matchOverlay';
import handler from '../../pages/api/overlay/match/[matchId]';
import { splitRemaining } from '../../components/overlay/match/MatchSources';

const T1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const T2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const MATCH = 'bbbbbbbb-0000-4000-8000-000000000001';
const TOURNAMENT = 'cccccccc-0000-4000-8000-000000000001';
const OTHER_TENANT = 'dddddddd-0000-4000-8000-000000000009';

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

function matchRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: MATCH,
    tenant_id: DEFAULT_TENANT_ID,
    tournament_id: TOURNAMENT,
    status: 'pending',
    started_at: null,
    scheduled_at: '2026-09-18T17:00:00.000Z',
    completed_at: null,
    match_format: 'bo3',
    round_name: 'Journée 1',
    team1_id: T1,
    team2_id: T2,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    is_bye: false,
    deleted_at: null,
    ...over,
  };
}

function seedPublicMatch(over: Partial<Record<string, unknown>> = {}) {
  store.matches = [matchRow(over)];
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
  store.teams = [
    { id: T1, name: 'Venom Valkyries', short_name: 'VNM', logo_url: null },
    { id: T2, name: 'Hinode', short_name: 'HIN', logo_url: null },
  ];
  store.tenants = [
    {
      id: DEFAULT_TENANT_ID,
      plan: 'foundation',
      plan_status: 'active',
      plan_expires_at: null,
    },
  ];
}

beforeEach(() => {
  resetSupabaseMock();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ── Le cœur pur ───────────────────────────────────────────────────────── */

describe('phase du match', () => {
  it('un match clos est final, quelle que soit l’orthographe du statut', () => {
    for (const status of ['finished', 'completed', 'forfeit', 'cancelled']) {
      expect(matchPhase({ status, started_at: null })).toBe('final');
    }
  });

  it('un match démarré et non clos est en direct', () => {
    expect(
      matchPhase({ status: 'pending', started_at: '2026-09-18T17:02:00Z' })
    ).toBe('live');
  });

  it('un match ni clos ni démarré est à venir', () => {
    expect(matchPhase({ status: 'pending', started_at: null })).toBe(
      'upcoming'
    );
  });
});

describe('projection vers l’écran', () => {
  it('affiche 0 plutôt que rien quand le score n’est pas encore saisi', () => {
    const view = buildOverlayMatch({
      match: matchRow() as MatchRowForOverlay,
      team1: { id: T1, name: 'A', short_name: null, logo_url: null },
      team2: { id: T2, name: 'B', short_name: null, logo_url: null },
    });
    expect(view.team1?.score).toBe(0);
    expect(view.team2?.score).toBe(0);
  });

  it('tient le vainqueur de la feuille de match, pas d’une comparaison de scores', () => {
    // Forfait réglé 0-0 : personne ne « mène », et pourtant il y a un gagnant.
    const view = buildOverlayMatch({
      match: matchRow({
        status: 'forfeit',
        team1_score: 0,
        team2_score: 0,
        winner_team_id: T2,
      }) as MatchRowForOverlay,
      team1: { id: T1, name: 'A', short_name: null, logo_url: null },
      team2: { id: T2, name: 'B', short_name: null, logo_url: null },
    });
    expect(view.team1?.isWinner).toBe(false);
    expect(view.team2?.isWinner).toBe(true);
    expect(view.phase).toBe('final');
  });

  it('trie les manches et rapporte chaque victoire au bon côté', () => {
    const view = buildOverlayMatch({
      match: matchRow() as MatchRowForOverlay,
      team1: { id: T1, name: 'A', short_name: null, logo_url: null },
      team2: { id: T2, name: 'B', short_name: null, logo_url: null },
      games: [
        {
          map_name: 'Busan',
          map_order: 2,
          team1_score: 1,
          team2_score: 2,
          winner_team_id: T2,
        },
        {
          map_name: 'King’s Row',
          map_order: 1,
          team1_score: 3,
          team2_score: 2,
          winner_team_id: T1,
        },
      ],
    });
    expect(view.maps.map((m) => m.name)).toEqual(['King’s Row', 'Busan']);
    expect(view.maps.map((m) => m.winner)).toEqual([1, 2]);
  });

  it('ignore une étape de veto au libellé inconnu, et situe les autres', () => {
    const view = buildOverlayMatch({
      match: matchRow() as MatchRowForOverlay,
      team1: { id: T1, name: 'A', short_name: null, logo_url: null },
      team2: { id: T2, name: 'B', short_name: null, logo_url: null },
      vetos: [
        { step_number: 2, action: 'pick', map_name: 'Ilios', team_id: T2 },
        { step_number: 1, action: 'ban', map_name: 'Nepal', team_id: T1 },
        { step_number: 3, action: 'bidule', map_name: 'Oasis', team_id: null },
        {
          step_number: 4,
          action: 'decider',
          map_name: 'Lijiang',
          team_id: null,
        },
      ],
    });
    expect(view.veto.map((v) => [v.action, v.side])).toEqual([
      ['ban', 1],
      ['pick', 2],
      ['decider', null],
    ]);
  });
});

describe('« le match du moment »', () => {
  const now = Date.parse('2026-09-18T19:30:00.000Z');
  const row = (over: Partial<Record<string, unknown>>) =>
    matchRow({
      id: `m-${JSON.stringify(over)}`,
      ...over,
    }) as MatchRowForOverlay;

  it('préfère un match en cours à un match programmé plus tôt', () => {
    const live = row({ started_at: '2026-09-18T19:20:00.000Z' });
    const soon = row({ scheduled_at: '2026-09-18T19:00:00.000Z' });
    expect(pickOverlayMatch([soon, live], now)).toBe(live);
  });

  it('ne saute pas un match dont l’heure vient de passer sans démarrage', () => {
    // Le cas réel : personne n'a cliqué « démarrer », le match se joue quand
    // même. Sans la tolérance, l'overlay basculerait sur le suivant.
    const justPassed = row({ scheduled_at: '2026-09-18T19:00:00.000Z' });
    const later = row({ scheduled_at: '2026-09-18T20:30:00.000Z' });
    expect(pickOverlayMatch([later, justPassed], now)).toBe(justPassed);
  });

  it('abandonne un match programmé depuis trop longtemps', () => {
    const stale = row({
      scheduled_at: new Date(now - STARTING_SOON_MS - 60_000).toISOString(),
    });
    const later = row({ scheduled_at: '2026-09-18T20:30:00.000Z' });
    expect(pickOverlayMatch([stale, later], now)).toBe(later);
  });

  it('garde le dernier résultat à l’écran tant qu’il est frais', () => {
    const justFinished = row({
      status: 'finished',
      scheduled_at: null,
      completed_at: new Date(now - 10 * 60_000).toISOString(),
    });
    expect(pickOverlayMatch([justFinished], now)).toBe(justFinished);
  });

  it('ne ressuscite pas le match de la veille', () => {
    const old = row({
      status: 'finished',
      scheduled_at: null,
      completed_at: new Date(
        now - RECENT_FINAL_WINDOW_MS - 60_000
      ).toISOString(),
    });
    expect(pickOverlayMatch([old], now)).toBeNull();
  });

  it('rend null plutôt qu’un match arbitraire quand il n’y a rien à montrer', () => {
    expect(pickOverlayMatch([], now)).toBeNull();
  });
});

describe('temps restant affiché', () => {
  it('sépare les jours au lieu d’afficher 57 heures comme des minutes', () => {
    // Le cas qui a motivé la correction : un match à deux jours affichait
    // « 57:01:14 », qu'on lit spontanément comme cinquante-sept minutes.
    const { days, clock } = splitRemaining(
      (2 * 24 * 3600 + 9 * 3600 + 1 * 60 + 14) * 1000
    );
    expect(days).toBe(2);
    expect(clock).toBe('09:01');
  });

  it('garde les secondes sous le jour, et l’heure seulement si elle existe', () => {
    expect(splitRemaining((3 * 3600 + 4 * 60 + 5) * 1000)).toEqual({
      days: 0,
      clock: '3:04:05',
    });
    expect(splitRemaining((7 * 60 + 9) * 1000)).toEqual({
      days: 0,
      clock: '07:09',
    });
  });

  it('ne descend jamais sous zéro', () => {
    expect(splitRemaining(-5000)).toEqual({ days: 0, clock: '00:00' });
  });
});

describe('paramètre source', () => {
  it('retombe sur le tableau de score quand la source est inconnue', () => {
    expect(parseOverlaySource('n’importe quoi')).toBe('scoreboard');
    expect(parseOverlaySource(undefined)).toBe('scoreboard');
    expect(parseOverlaySource('COUNTDOWN')).toBe('countdown');
  });
});

/* ── Le point d'entrée ─────────────────────────────────────────────────── */

describe('GET /api/overlay/match/[matchId]', () => {
  it('refuse un identifiant qui n’est pas un match', async () => {
    const res = makeRes();
    await handler(makeReq({ matchId: 'pas-un-uuid' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('exige le tournoi pour « le match du moment »', async () => {
    const res = makeRes();
    await handler(makeReq({ matchId: 'next' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('sert le match, ses équipes et ses manches', async () => {
    seedPublicMatch({
      status: 'finished',
      team1_score: 2,
      team2_score: 1,
      winner_team_id: T1,
    });
    store.games = [
      {
        match_id: MATCH,
        map_name: 'Busan',
        map_order: 1,
        team1_score: 2,
        team2_score: 1,
        winner_team_id: T1,
      },
    ];

    const res = makeRes();
    await handler(makeReq({ matchId: MATCH }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.match.team1.name).toBe('Venom Valkyries');
    expect(res.body.match.team1.isWinner).toBe(true);
    expect(res.body.match.maps).toHaveLength(1);
    expect(res.body.tournament.name).toBe('Cup 2026');
    // Le compte à rebours a besoin de l'heure du serveur, pas de celle du PC.
    expect(typeof res.body.serverTime).toBe('string');
  });

  it('ne diffuse pas un tournoi privé', async () => {
    seedPublicMatch();
    store.tournaments[0]!.visibility = 'private';

    const res = makeRes();
    await handler(makeReq({ matchId: MATCH }), res);
    expect(res.statusCode).toBe(404);
  });

  it('ne diffuse pas un match supprimé', async () => {
    seedPublicMatch({ deleted_at: '2026-09-17T10:00:00.000Z' });

    const res = makeRes();
    await handler(makeReq({ matchId: MATCH }), res);
    expect(res.statusCode).toBe(404);
  });

  it('refuse par le palier quand l’espace n’a pas les overlays', async () => {
    seedPublicMatch({ tenant_id: OTHER_TENANT });
    store.tournaments[0]!.tenant_id = OTHER_TENANT;
    store.tenants = [
      {
        id: OTHER_TENANT,
        plan: 'discovery',
        plan_status: 'active',
        plan_expires_at: null,
      },
    ];

    const res = makeRes();
    await handler(makeReq({ matchId: MATCH }), res);
    expect(res.statusCode).toBe(402);
    expect(res.body.code).toBe('PLAN_CAPABILITY_REQUIRED');
    expect(res.body.capability).toBe('matchOverlays');
  });

  it('rend un écran d’attente, pas une erreur, quand aucun match n’est à montrer', async () => {
    seedPublicMatch({
      status: 'finished',
      completed_at: '2020-01-01T00:00:00.000Z',
      scheduled_at: null,
    });

    const res = makeRes();
    await handler(makeReq({ matchId: 'next', tournament: 'cup-2026' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.match).toBeNull();
    expect(res.body.tournament.slug).toBe('cup-2026');
  });
});
