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

import { resetSupabaseMock } from './__helpers__/supabaseMock';
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
import { splitRemaining } from '../../components/overlay/match/MatchSources';

const T1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const T2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const MATCH = 'bbbbbbbb-0000-4000-8000-000000000001';
const TOURNAMENT = 'cccccccc-0000-4000-8000-000000000001';

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

beforeEach(() => {
  resetSupabaseMock();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ── Le cœur pur ───────────────────────────────────────────────────────── */

/* ── Le point d'entrée ─────────────────────────────────────────────────── */

describe('phase du match', () => {
  it('un match clos est final, quelle que soit l’orthographe du statut', () => {
    for (const status of [
      'finished',
      'completed',
      'forfeit',
      'walkover',
      'cancelled',
    ]) {
      expect(matchPhase({ status, started_at: null })).toBe('final');
    }
  });

  it('un match démarré et non clos est en direct', () => {
    expect(
      matchPhase({ status: 'pending', started_at: '2026-09-18T17:02:00Z' })
    ).toBe('live');
  });

  it('un statut « en cours » suffit, même sans coup d’envoi horodaté', () => {
    for (const status of ['live', 'in_progress']) {
      expect(matchPhase({ status, started_at: null })).toBe('live');
    }
  });

  it('un score déjà saisi (1-0) passe le match en direct', () => {
    expect(
      matchPhase({
        status: 'pending',
        started_at: null,
        team1_score: 1,
        team2_score: 0,
      })
    ).toBe('live');
  });

  it('un 0-0 sans autre indice reste à venir', () => {
    expect(
      matchPhase({
        status: 'scheduled',
        started_at: null,
        team1_score: 0,
        team2_score: 0,
      })
    ).toBe('upcoming');
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
