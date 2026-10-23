// Landing d'un tournoi CLOS : le hero nomme la championne, le classement final
// (final_rankings) passe en tête, et le suivi devient un bilan.
//
// Rendu côté serveur via react-dom/server, comme homeHeroV2A11y.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import FinalRanking from '@/components/tournament/landing/FinalRanking';
import LiveHub from '@/components/tournament/landing/LiveHub';
import TournamentHero from '@/components/tournament/landing/TournamentHero';
import type { PublicStanding } from '@/utils/public/readStandings';
import type { LiveHub as LiveHubData } from '@/utils/tournament/liveHub';
import type { PublicStandingsTable } from '@/utils/stages/publicStandings';

const PATH = '/tournament/ow-womens-cup-2026';

const standing = (
  rank: number,
  teamName: string,
  teamSlug: string | null = teamName.toLowerCase().replace(/\s+/g, '-')
): PublicStanding => ({
  rank,
  teamId: `t${rank}`,
  teamName,
  teamSlug,
  logoUrl: null,
  prize: null,
});

// Le classement figé de la Cup 2026.
const RANKING: PublicStanding[] = [
  standing(1, 'Chocomates'),
  standing(2, 'Hinode Sparkles'),
  standing(3, 'LVN EMBERS'),
  standing(4, 'Venom Valkyries', null),
  standing(5, 'LVN ASHES'),
];

describe('FinalRanking', () => {
  const html = renderToString(
    createElement(FinalRanking, { ranking: RANKING, tournamentPath: PATH })
  );

  it('titre, podium et lien vers la page Podium', () => {
    expect(html).toContain('Classement final');
    expect(html).toContain('aria-label="Podium"');
    expect(html).toContain(`href="${PATH}/podium"`);
  });

  it('podium lu 1-2-3, rangé 2-1-3 à l’écran', () => {
    expect(html.indexOf('Chocomates')).toBeLessThan(
      html.indexOf('Hinode Sparkles')
    );
    expect(html.indexOf('Hinode Sparkles')).toBeLessThan(
      html.indexOf('LVN EMBERS')
    );
    expect(html).toContain('1re place :');
    expect(html).toContain('2e place :');
    expect(html).toContain('3e place :');
    expect(html).toMatch(/<li class="[^"]*order-2"/);
    expect(html).toMatch(/<li class="[^"]*order-1"/);
    expect(html).toMatch(/<li class="[^"]*order-3"/);
  });

  it('le reste du classement suit, rang en toutes lettres', () => {
    expect(html).toContain('4e');
    expect(html).toContain('5e');
    expect(html.indexOf('LVN EMBERS')).toBeLessThan(
      html.indexOf('Venom Valkyries')
    );
    expect(html).toContain('href="/team/lvn-ashes"');
    // Sans slug, le nom seul.
    expect(html).not.toContain('href="/team/null"');
  });

  it('ne rend rien sans classement figé', () => {
    expect(
      renderToString(
        createElement(FinalRanking, { ranking: [], tournamentPath: PATH })
      )
    ).toBe('');
  });
});

describe('LiveHub — tournoi clos', () => {
  const team = (id: string, name: string) => ({
    id,
    slug: id,
    name,
    short_name: null,
    logo_url: null,
  });
  const hub: LiveHubData = {
    live: [],
    upcoming: [],
    recent: [
      {
        id: 'gf',
        scheduled_at: '2026-10-23T18:30:00Z',
        status: 'finished',
        is_bye: false,
        round_name: 'Grande finale',
        match_format: 'bo5',
        team1_score: 1,
        team2_score: 3,
        winner_team_id: 'c',
        forfeit_team_id: null,
        stream_url: null,
        team1: team('h', 'Hinode Sparkles'),
        team2: team('c', 'Chocomates'),
      },
    ],
    played: 30,
    total: 30,
    nextRound: null,
  };
  const standings: PublicStandingsTable[] = [
    {
      key: 'rs',
      stageName: 'Saison régulière',
      stageType: 'round_robin',
      groupKey: null,
      rows: [
        {
          rank: 1,
          teamId: 'h',
          teamName: 'Hinode Sparkles',
          shortName: null,
          slug: 'h',
          logoUrl: null,
          played: 7,
          wins: 7,
          losses: 0,
          draws: 0,
          points: 21,
          mapsWon: 14,
          mapsLost: 1,
          form: [],
          tiebrokenBy: null,
          disqualified: false,
          disqualificationMode: null,
        },
      ],
    },
  ];
  const render = (finished: boolean) =>
    renderToString(
      createElement(LiveHub, { hub, standings, tournamentPath: PATH, finished })
    );

  it('un bilan : ni prochains matchs ni barre d’avancement', () => {
    const html = render(true);
    expect(html).toContain('Résultats du tournoi');
    expect(html).toContain('30 matchs joués');
    expect(html).not.toContain('Prochains matchs');
    expect(html).not.toContain('Aucun match programmé');
    expect(html).not.toContain('role="progressbar"');
    expect(html).toContain('Grande finale');
  });

  it('le tableau dit de quelle phase il est le classement', () => {
    expect(render(true)).toMatch(/<h3[^>]*>Saison régulière<\/h3>/);
    expect(render(false)).toMatch(/<h3[^>]*>Classement<\/h3>/);
  });

  it('en cours, inchangé', () => {
    const html = render(false);
    expect(html).toContain('Où en est le tournoi');
    expect(html).toContain('Prochains matchs');
    expect(html).toContain('role="progressbar"');
  });
});

describe('TournamentHero — tournoi clos', () => {
  const tournament = {
    id: 'e8fa740c',
    name: "OW WOMEN's CUP 2026",
    slug: 'ow-womens-cup-2026',
    status: 'completed',
    start_date: '2026-09-18',
    end_date: '2026-10-23',
  };
  const render = (champion: PublicStanding | null) =>
    renderToString(
      createElement(TournamentHero, {
        tournament,
        phase: 'finished',
        tournamentPath: PATH,
        totalTeams: 8,
        placesRemaining: 0,
        leagues: [],
        registrationOpen: false,
        champion,
      })
    );

  it('nomme la championne et mène au podium', () => {
    const html = render(RANKING[0]);
    expect(html).toContain('Tournoi terminé');
    expect(html).toContain('Championnes');
    expect(html).toContain('href="/team/chocomates"');
    expect(html).toContain(`href="${PATH}/podium"`);
    expect(html).not.toContain(`href="${PATH}/bracket"`);
  });

  it('sans classement figé : le bracket, et pas de carte vide', () => {
    const html = render(null);
    expect(html).toContain('Tournoi terminé');
    expect(html).not.toContain('Championnes');
    expect(html).toContain(`href="${PATH}/bracket"`);
    expect(html).not.toContain('lg:justify-self-end');
  });
});
