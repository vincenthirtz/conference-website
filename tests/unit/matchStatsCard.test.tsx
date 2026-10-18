// @vitest-environment happy-dom
//
// La carte « avant-match » de la source `maps` (`/overlay/match/*?source=maps`).
// Targets : components/overlay/match/MatchStatsCard.tsx,
//           components/overlay/match/MatchSources.tsx (aiguillage `maps`)
//
// CE QUE CES CAS PROTÈGENT :
//   1. AVANT LE PREMIER VETO, LA SOURCE N'EST PLUS VIDE : elle montre les stats
//      reçues de l'API (constaté vide le 2026-10-18, Cup 2026 J7).
//   2. DÈS QU'UNE MAP EXISTE (veto ou manche), la source revient à la liste.
//   3. PAS DE STATS D'UN AUTRE MATCH : au passage au match suivant, l'ancienne
//      réponse ne s'affiche pas sous les nouvelles équipes.
//   4. UNE LIGNE SANS DONNÉE SE TAIT (pas de bans → pas de ligne ; aucune
//      confrontation → « première confrontation »), les noms ne sont jamais
//      tronqués.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  MatchSourceSurface,
  isPreMatch,
} from '@/components/overlay/match/MatchSources';
import type { MatchOverlayPayload } from '@/hooks/useMatchOverlay';
import type { OverlayMatchView } from '@/utils/overlay/matchOverlay';
import type { OverlayMatchStats } from '@/utils/overlay/matchStatsOverlay';

afterEach(cleanup);

const MATCH_ID = '89ffe2b7-7ce2-4c44-a35d-4510b8ad891f';

function matchView(over: Partial<OverlayMatchView> = {}): OverlayMatchView {
  return {
    id: MATCH_ID,
    phase: 'upcoming',
    format: 'bo3',
    roundName: 'J7',
    scheduledAt: '2026-10-21T18:00:00+00:00',
    startedAt: null,
    team1: {
      name: 'Chocomates',
      shortName: 'Choco',
      logoUrl: null,
      score: 0,
      isWinner: false,
    },
    team2: {
      name: 'Team Positivité',
      shortName: 'TP',
      logoUrl: null,
      score: 0,
      isWinner: false,
    },
    maps: [],
    veto: [],
    ...over,
  };
}

function payload(match: OverlayMatchView): MatchOverlayPayload {
  return {
    match,
    tournament: {
      id: 'tour',
      slug: 'ow-womens-cup-2026',
      name: 'OW WOMEN’s CUP 2026',
      shortName: null,
      game: 'overwatch',
    },
    branding: null,
    serverTime: '2026-10-18T13:27:07.767Z',
  };
}

function stats(over: Partial<OverlayMatchStats> = {}): OverlayMatchStats {
  return {
    matchId: MATCH_ID,
    stageName: 'Saison régulière',
    team1: {
      rank: 2,
      played: 6,
      wins: 5,
      losses: 1,
      draws: 0,
      mapDiff: 9,
      form: ['W', 'W', 'W', 'W', 'L'],
      disqualified: false,
    },
    team2: {
      rank: 7,
      played: 6,
      wins: 1,
      losses: 5,
      draws: 0,
      mapDiff: -8,
      form: ['L', 'L', 'L', 'L', 'W'],
      disqualified: false,
    },
    headToHead: { team1Wins: 0, team2Wins: 0, meetings: [] },
    pool: {
      scope: 'date',
      date: '2026-10-21',
      maps: [
        {
          name: 'Busan',
          type: 'control',
          team1: { wins: 0, losses: 0 },
          team2: { wins: 0, losses: 1 },
        },
        {
          name: 'Suravasa',
          type: 'flashpoint',
          team1: { wins: 0, losses: 0 },
          team2: { wins: 0, losses: 3 },
        },
        {
          name: 'Observatoire : Grímsvötn',
          type: 'escort',
          team1: { wins: 0, losses: 0 },
          team2: { wins: 0, losses: 0 },
        },
      ],
    },
    heroBans: { team1: [], team2: [] },
    ...over,
  };
}

function renderMaps(
  match: OverlayMatchView,
  s: OverlayMatchStats | null
): ReturnType<typeof render> {
  return render(
    <MatchSourceSurface
      source="maps"
      payload={payload(match)}
      stats={s}
      clockSkewMs={0}
      accent="#f0e63c"
      scale={1}
    />
  );
}

describe('carte avant-match', () => {
  it('remplace le cadre vide tant qu’aucune map n’est choisie', () => {
    renderMaps(matchView(), stats());

    expect(screen.getByTestId('match-stats-card')).toBeTruthy();
    expect(screen.getByText('Avant-match · Saison régulière')).toBeTruthy();
    // Rang, bilan, écart de maps (vrai signe moins).
    expect(screen.getByText('2e')).toBeTruthy();
    expect(screen.getByText('7e')).toBeTruthy();
    expect(screen.getByText('5V – 1D')).toBeTruthy();
    expect(screen.getByText('1V – 5D')).toBeTruthy();
    expect(screen.getByText('+9')).toBeTruthy();
    expect(screen.getByText('−8')).toBeTruthy();
    // Pool du soir, daté, avec un tiret quand l'équipe n'a jamais joué la map.
    expect(screen.getByText('Pool du 21/10')).toBeTruthy();
    expect(screen.getByText('0–3')).toBeTruthy();
    expect(screen.getByText('Observatoire : Grímsvötn')).toBeTruthy();
  });

  it('dit « première confrontation » et tait la ligne des bans sans donnée', () => {
    renderMaps(matchView(), stats());
    expect(
      screen.getByText('Première confrontation dans le tournoi')
    ).toBeTruthy();
    expect(screen.queryByText('Bans favoris')).toBeNull();
  });

  it('montre le face-à-face et les bans quand ils existent', () => {
    renderMaps(
      matchView(),
      stats({
        headToHead: {
          team1Wins: 1,
          team2Wins: 0,
          meetings: [
            { roundName: 'J2', team1Score: 2, team2Score: 1, winner: 1 },
          ],
        },
        heroBans: {
          team1: [{ hero: 'widowmaker', name: 'Widowmaker', count: 3 }],
          team2: [],
        },
      })
    );
    expect(screen.getByText('Face-à-face')).toBeTruthy();
    expect(screen.getByText('J2 2–1')).toBeTruthy();
    expect(screen.getByText('Widowmaker ×3')).toBeTruthy();
  });

  it('marque une équipe disqualifiée', () => {
    renderMaps(
      matchView(),
      stats({
        team2: { ...stats().team2!, rank: 8, disqualified: true },
      })
    );
    expect(screen.getByText('DNF')).toBeTruthy();
  });

  it('ne tronque jamais un nom d’équipe', () => {
    renderMaps(matchView(), stats());
    const name = screen.getByText('Team Positivité');
    expect(name.className).not.toMatch(/truncate|text-ellipsis/);
  });
});

describe('aiguillage de la source maps', () => {
  it('revient à la liste dès qu’un veto existe', () => {
    const match = matchView({
      veto: [{ step: 1, action: 'ban', map: 'Busan', side: 1 }],
    });
    expect(isPreMatch(match)).toBe(false);
    renderMaps(match, stats());
    expect(screen.queryByTestId('match-stats-card')).toBeNull();
    expect(screen.getByText('Veto')).toBeTruthy();
  });

  it('n’affiche pas les stats d’un autre match', () => {
    renderMaps(matchView(), stats({ matchId: 'autre-match' }));
    expect(screen.queryByTestId('match-stats-card')).toBeNull();
  });

  it('stats pas encore reçues : rien plutôt qu’un cadre vide', () => {
    const { container } = renderMaps(matchView(), null);
    expect(container.textContent).toBe('');
  });
});
