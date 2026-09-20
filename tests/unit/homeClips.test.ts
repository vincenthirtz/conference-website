// Le bloc « clips du moment » de l'accueil.
//
// CE QU'IL REMPLACE : un panneau Twitch qui, hors direct, n'affichait qu'une
// promesse (« le lecteur s'ouvre ici quand la chaîne est en direct »). Un bloc
// vide l'essentiel du temps, au meilleur endroit de la page.
//
// CE QUE CES CAS PROTÈGENT :
//   1. RIEN NE S'AFFICHE SANS CLIP. Un cadre vide serait pire que l'absence.
//   2. Les clips passent AVANT les prochaines rencontres (l'ordre demandé).
//   3. Une vignette ouvre le clip sur Twitch, dans un nouvel onglet.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import HomeSpotlight from '@/components/Home/HomeSpotlight';
import HomeClips from '@/components/Home/HomeClips';
import type { UpcomingTournament } from '@/components/Home/HomeUpcomingTournament';
import type { HomeClip, HomeTeam } from '@/utils/home/loadHomeData';
import type { HomeMatchday } from '@/utils/home/loadNextMatchday';

const tournament: UpcomingTournament = {
  id: 'tour-1',
  name: 'OW Women’s Cup 2026',
  slug: 'ow-womens-cup-2026',
  shortName: null,
  status: 'published',
  startDate: '2026-09-18',
  endDate: '2026-10-23',
  format: 'BO3',
  maxTeams: 8,
  teamCount: 8,
};

const teams: HomeTeam[] = [
  {
    id: 'team-choco',
    name: 'Chocomates',
    shortName: 'CHOC',
    slug: 'chocomates',
    logoUrl: null,
  },
];

function clip(over: Partial<HomeClip> = {}): HomeClip {
  return {
    id: 'clip-1',
    title: 'Un triple kill de folie',
    url: 'https://www.twitch.tv/womens_cup/clip/AbcDef',
    thumbnailUrl: 'https://clips-media-assets2.twitch.tv/abc-480x272.jpg',
    viewCount: 412,
    duration: 32,
    ...over,
  };
}

const matchday: HomeMatchday = {
  date: '2026-09-25',
  totalCount: 1,
  matches: [
    {
      id: 'm-1',
      scheduledAt: '2026-09-25T18:30:00.000Z',
      status: 'pending',
      team1: teams[0],
      team2: {
        id: 'team-eclypse',
        name: 'Eclypse',
        shortName: 'ECL',
        slug: 'eclypse',
        logoUrl: null,
      },
      team1Score: null,
      team2Score: null,
      winnerTeamId: null,
    },
  ],
};

describe('HomeClips', () => {
  it('ouvre chaque clip sur Twitch, dans un nouvel onglet', () => {
    const html = renderToString(
      createElement(HomeClips, {
        clips: [clip()],
        channelUrl: 'https://www.twitch.tv/womens_cup',
      })
    );
    expect(html).toContain('https://www.twitch.tv/womens_cup/clip/AbcDef');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('Un triple kill de folie');
    // Durée lisible plutôt que « 32 » brut.
    expect(html).toContain('32 s');
  });

  it('ne rend rien sans clip', () => {
    const html = renderToString(
      createElement(HomeClips, {
        clips: [],
        channelUrl: 'https://www.twitch.tv/womens_cup',
      })
    );
    expect(html).toBe('');
  });
});

describe('HomeSpotlight — l’ordre du bloc', () => {
  it('place les clips AVANT les prochaines rencontres', () => {
    const html = renderToString(
      createElement(HomeSpotlight, {
        tournament,
        teams,
        matchdays: [matchday],
        clips: [clip()],
      })
    );
    const clipIdx = html.indexOf('clip/AbcDef');
    const matchIdx = html.indexOf('href="/match/m-1"');
    expect(clipIdx).toBeGreaterThan(-1);
    expect(matchIdx).toBeGreaterThan(-1);
    expect(clipIdx).toBeLessThan(matchIdx);
  });

  it('n’affiche plus la fiche du tournoi (dates, format, places)', () => {
    // Cinq semaines d'informations immobiles en haut de page : le hero les
    // porte déjà, et la section montre ce qui bouge.
    const html = renderToString(
      createElement(HomeSpotlight, {
        tournament,
        teams,
        matchdays: [matchday],
        clips: [clip()],
      })
    );
    expect(html).not.toContain('8 / 8');
    expect(html).not.toContain('BO3');
    expect(html).not.toContain('player.twitch.tv');
  });

  it('garde la bande des équipes même sans clip ni affiche', () => {
    const html = renderToString(
      createElement(HomeSpotlight, { tournament, teams })
    );
    expect(html).toContain('href="/team/chocomates"');
  });
});
