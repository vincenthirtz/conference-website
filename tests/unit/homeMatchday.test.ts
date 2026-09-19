// Les affiches de la prochaine journée, en pied de la carte « prochain
// rendez-vous » de l'accueil.
//
// Trois promesses s'y jouent :
//
//   - on annonce LA BONNE JOURNÉE : celle qui reste à voir, pas celle de la
//     veille — un samedi matin, « le prochain rendez-vous » ne doit pas
//     afficher les matchs du vendredi soir ;
//   - on n'annonce RIEN D'INVENTÉ : un match sans horaire, ou dont un côté
//     n'est pas encore connu (demi-finale à pourvoir, exempt), n'est pas une
//     affiche et ne s'affiche pas ;
//   - sans journée à annoncer, la carte RETOMBE sur les équipes engagées au
//     lieu d'exposer un bloc vide.
//
// Rendu SSR via react-dom/server (pas de jsdom dans ce repo).

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import {
  selectNextMatchday,
  selectNextMatchdays,
  shapeMatchdayMatch,
  type HomeMatchday,
} from '@/utils/home/loadNextMatchday';
import { matchRevalidationPaths } from '@/utils/matches/revalidateMatchPages';
import type { PublicMatch } from '@/utils/public/readMatches';
import type { HomeTeam } from '@/utils/home/loadHomeData';
import HomeMatchdayStrip from '@/components/Home/HomeMatchdayStrip';
import HomeSpotlight from '@/components/Home/HomeSpotlight';
import type { UpcomingTournament } from '@/components/Home/HomeUpcomingTournament';
import type { TwitchLive } from '@/components/Home/useTwitchLive';

const CHOCO = 'team-choco';
const ECLYPSE = 'team-eclypse';

function match(over: Partial<PublicMatch> = {}): PublicMatch {
  return {
    id: 'm-1',
    stage_id: null,
    round_number: null,
    bracket_side: null,
    team1_id: CHOCO,
    team1_name: 'Chocomates',
    team1_logo_url: null,
    team2_id: ECLYPSE,
    team2_name: 'Eclypse',
    team2_logo_url: null,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    status: 'pending',
    // 20 h 30 à Paris le vendredi 18 septembre 2026 (CEST = UTC+2).
    scheduled_at: '2026-09-18T18:30:00.000Z',
    ...over,
  };
}

const NOW_THURSDAY = new Date('2026-09-17T10:00:00.000Z');

describe('selectNextMatchday — quelle journée on annonce', () => {
  it('retient le premier jour à venir', () => {
    const picked = selectNextMatchday(
      [
        match({ id: 'later', scheduled_at: '2026-09-25T18:30:00.000Z' }),
        match({ id: 'friday' }),
      ],
      NOW_THURSDAY
    );
    expect(picked?.date).toBe('2026-09-18');
    expect(picked?.matches.map((m) => m.id)).toEqual(['friday']);
  });

  it('range les affiches par heure de coup d’envoi', () => {
    const picked = selectNextMatchday(
      [
        match({ id: 'late', scheduled_at: '2026-09-18T20:00:00.000Z' }),
        match({ id: 'early', scheduled_at: '2026-09-18T17:00:00.000Z' }),
      ],
      NOW_THURSDAY
    );
    expect(picked?.matches.map((m) => m.id)).toEqual(['early', 'late']);
  });

  it('ignore la veille', () => {
    const saturdayMorning = new Date('2026-09-19T07:00:00.000Z');
    expect(selectNextMatchday([match()], saturdayMorning)).toBeNull();
  });

  it('garde le jour même tant qu’un match reste à jouer', () => {
    // 19 h à Paris le vendredi : la soirée n'est pas finie.
    const fridayEvening = new Date('2026-09-18T17:00:00.000Z');
    const picked = selectNextMatchday(
      [
        match({ id: 'played', status: 'finished' }),
        match({ id: 'to-play', scheduled_at: '2026-09-18T20:00:00.000Z' }),
      ],
      fridayEvening
    );
    expect(picked?.date).toBe('2026-09-18');
  });

  it('passe à la journée suivante quand tout est joué', () => {
    // Même jour, mais plus rien à voir : on annonce le vendredi suivant plutôt
    // que des résultats déjà connus.
    const fridayLate = new Date('2026-09-18T21:30:00.000Z');
    const picked = selectNextMatchday(
      [
        match({ id: 'played', status: 'finished' }),
        match({ id: 'next-week', scheduled_at: '2026-09-25T18:30:00.000Z' }),
      ],
      fridayLate
    );
    expect(picked?.matches.map((m) => m.id)).toEqual(['next-week']);
  });

  it('écarte ce qui n’est pas une affiche, sans faire tomber la journée', () => {
    const picked = selectNextMatchday(
      [
        // Adversaire pas encore désigné (ou exempt) : rien à annoncer.
        match({ id: 'tbd', team2_id: null, team2_name: null }),
        // Pas d'horaire : on ne sait pas quand, donc on se tait.
        match({ id: 'no-time', scheduled_at: null }),
        match({ id: 'real' }),
      ],
      NOW_THURSDAY
    );
    // La journée tient quand même, avec la seule affiche complète.
    expect(picked?.matches.map((m) => m.id)).toEqual(['real']);
  });

  it('ne renvoie rien quand aucun match n’est programmé', () => {
    expect(selectNextMatchday([], NOW_THURSDAY)).toBeNull();
    expect(
      selectNextMatchday([match({ scheduled_at: null })], NOW_THURSDAY)
    ).toBeNull();
  });
});

describe('shapeMatchdayMatch — ce que l’affiche emprunte aux engagées', () => {
  const known = new Map<string, HomeTeam>([
    [
      CHOCO,
      {
        id: CHOCO,
        name: 'Chocomates',
        shortName: 'CHOC',
        slug: 'chocomates',
        logoUrl: null,
      },
    ],
  ]);

  it('reprend nom court et slug de l’équipe déjà chargée', () => {
    const shaped = shapeMatchdayMatch(match(), known);
    expect(shaped?.team1.shortName).toBe('CHOC');
    expect(shaped?.team1.slug).toBe('chocomates');
  });

  it('tient sans rien connaître de l’équipe', () => {
    const shaped = shapeMatchdayMatch(match(), new Map());
    expect(shaped?.team2.name).toBe('Eclypse');
    expect(shaped?.team2.shortName).toBeNull();
  });

  it('écarte une affiche dont un côté n’a pas de nom', () => {
    expect(
      shapeMatchdayMatch(match({ team2_name: null }), new Map())
    ).toBeNull();
  });
});

/* ------------------------------------------------------------------------ */

function matchday(over: Partial<HomeMatchday> = {}): HomeMatchday {
  const shaped = shapeMatchdayMatch(match(), new Map());
  if (!shaped) throw new Error('fixture invalide');
  return { date: '2026-09-18', matches: [shaped], totalCount: 1, ...over };
}

describe('HomeMatchdayStrip', () => {
  function render(m: HomeMatchday): string {
    return renderToString(
      createElement(HomeMatchdayStrip, {
        matchday: m,
        matchesHref: '/tournament/ow-womens-cup-2026/matches',
      })
    );
  }

  it('annonce le jour, les deux équipes et l’heure', () => {
    const html = render(matchday());
    expect(html).toContain('vendredi');
    expect(html).toContain('18');
    expect(html).toContain('Chocomates');
    expect(html).toContain('Eclypse');
    expect(html).toContain('20:30');
  });

  it('mène à la fiche du match', () => {
    expect(render(matchday())).toContain('href="/match/m-1"');
  });

  it('nomme le lien pour les lecteurs d’écran', () => {
    // Lu tel quel, « Chocomates 20:30 Eclypse » ne dit pas qui affronte qui.
    expect(render(matchday())).toContain('Chocomates contre Eclypse');
  });

  it('montre le score plutôt que l’heure quand le match est joué', () => {
    const shaped = shapeMatchdayMatch(
      match({
        status: 'finished',
        team1_score: 3,
        team2_score: 1,
        winner_team_id: CHOCO,
      }),
      new Map()
    );
    const html = render(matchday({ matches: [shaped as never] }));
    expect(html).toContain('Terminé');
    expect(html).toContain('>3<');
    // L'heure quitte la colonne centrale (elle reste dans le nom accessible).
    expect(html).not.toContain('>20:30<');
  });

  it('renvoie au calendrier complet, et dit ce qu’il reste', () => {
    const html = render(matchday({ totalCount: 5 }));
    expect(html).toContain('href="/tournament/ow-womens-cup-2026/matches"');
    expect(html).toContain('Tout le calendrier');
    expect(html).toContain('4');
  });
});

describe('HomeSpotlight — affiches ou équipes, jamais un vide', () => {
  const live: TwitchLive = { live: false, parent: null, channel: 'womens_cup' };
  const tournament: UpcomingTournament = {
    id: 'e8fa740c-d92b-49d8-a654-05a37d0eea3b',
    name: "OW WOMEN's CUP 2026",
    slug: 'ow-womens-cup-2026',
    shortName: 'OWWC26',
    status: 'running',
    startDate: '2026-09-18',
    endDate: null,
    format: 'Round robin',
    maxTeams: 8,
    teamCount: 8,
  };
  const teams: HomeTeam[] = [
    {
      id: CHOCO,
      name: 'Chocomates',
      shortName: 'CHOC',
      slug: 'chocomates',
      logoUrl: null,
    },
  ];

  function render(...days: (HomeMatchday | null)[]): string {
    return renderToString(
      createElement(HomeSpotlight, {
        tournament,
        prizeCents: null,
        live,
        teams,
        matchdays: days.filter((d): d is HomeMatchday => d !== null),
      })
    );
  }

  it('annonce les affiches quand il y en a', () => {
    const html = render(matchday());
    expect(html).toContain('Chocomates');
    expect(html).toContain('Eclypse');
    expect(html).toContain('20:30');
  });

  // Les affiches ont d'abord PRIS LA PLACE de la bande des engagées : l'une OU
  // l'autre dans le pied de carte. Donc les semaines où un calendrier est
  // publié — celles où le tournoi intéresse — les équipes quittaient la page.
  // Les deux coexistent maintenant : le pied dit qui joue vendredi, la bande
  // pleine largeur dit qui court.
  it('n’évince plus la bande des équipes engagées', () => {
    const html = render(matchday());
    expect(html).toContain('20:30');
    expect(html).toContain('Elles participent');
    expect(html).toContain('href="/team/chocomates"');
  });

  it('garde les équipes engagées sans calendrier publié', () => {
    const html = render(null);
    expect(html).toContain('Elles participent');
    expect(html).toContain('href="/team/chocomates"');
  });
});

/* ── « Et après ? » ────────────────────────────────────────────────────────
 *
 * Une seule journée laissait la question ouverte : à la Cup 2026 on joue le
 * mercredi et le vendredi, et savoir « ce soir » sans savoir « et après »
 * oblige à ouvrir le calendrier.
 */

describe('selectNextMatchdays — la journée suivante', () => {
  const nextWednesday = '2026-09-23T18:00:00.000Z';

  it('rend les deux prochaines journées, dans l’ordre', () => {
    const days = selectNextMatchdays(
      [
        match({ id: 'm-2', scheduled_at: nextWednesday }),
        match(),
        match({ id: 'm-3', scheduled_at: '2026-09-25T18:30:00.000Z' }),
      ],
      NOW_THURSDAY
    );
    expect(days.map((d) => d.date)).toEqual(['2026-09-18', '2026-09-23']);
  });

  it('n’en rend qu’une quand il n’y a rien après', () => {
    expect(selectNextMatchdays([match()], NOW_THURSDAY)).toHaveLength(1);
  });

  it('ignore la journée du jour entièrement jouée, comme la sélection simple', () => {
    const days = selectNextMatchdays(
      [
        match({ status: 'finished' }),
        match({ id: 'm-2', scheduled_at: nextWednesday }),
      ],
      new Date('2026-09-18T21:00:00.000Z')
    );
    expect(days.map((d) => d.date)).toEqual(['2026-09-23']);
  });
});

describe('HomeMatchdayStrip — journée suivante en résumé', () => {
  function day(date: string, id: string): HomeMatchday {
    return {
      date: date.slice(0, 10),
      totalCount: 1,
      matches: [
        {
          id,
          scheduledAt: date,
          status: 'pending',
          team1: {
            id: CHOCO,
            name: 'Chocomates',
            shortName: 'CHOC',
            slug: 'chocomates',
            logoUrl: null,
          },
          team2: {
            id: ECLYPSE,
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
  }

  it('annonce la journée d’après sous les affiches du jour', () => {
    const html = renderToString(
      createElement(HomeMatchdayStrip, {
        matchday: day('2026-09-18T18:30:00.000Z', 'm-1'),
        following: day('2026-09-23T18:00:00.000Z', 'm-2'),
        matchesHref: '/tournament/cup/matches',
      })
    );
    expect(html).toContain('Puis');
    expect(html).toContain('href="/match/m-2"');
    // MÊME AFFICHE que la journée du jour (blasons, mise en miroir), pas un
    // résumé en une ligne : deux traitements pour la même information, et
    // l'œil ne s'y retrouvait pas.
    const cards = html.split('grid-cols-[1fr_auto_1fr]').length - 1;
    expect(cards).toBe(2);
  });

  it('ne montre rien de plus sans journée suivante', () => {
    const html = renderToString(
      createElement(HomeMatchdayStrip, {
        matchday: day('2026-09-18T18:30:00.000Z', 'm-1'),
        matchesHref: '/tournament/cup/matches',
      })
    );
    expect(html).not.toContain('Puis');
  });
});

/* ── Fraîcheur ─────────────────────────────────────────────────────────────
 *
 * L'accueil et les pages de tournoi sont statiques (ISR 15 min). Un score
 * saisi doit s'y voir tout de suite : sinon la carte « prochain rendez-vous »
 * annonce encore un match déjà joué, ce qui s'est produit le 18/09/2026.
 */

describe('matchRevalidationPaths', () => {
  it('rafraîchit l’accueil, la fiche du match et les pages du tournoi', () => {
    expect(matchRevalidationPaths('m-1', 'ow-womens-cup-2026')).toEqual([
      '/',
      '/match/m-1',
      '/tournament/ow-womens-cup-2026',
      '/tournament/ow-womens-cup-2026/matches',
      '/tournament/ow-womens-cup-2026/standings',
      '/tournament/ow-womens-cup-2026/stats',
      '/tournament/ow-womens-cup-2026/bracket',
    ]);
  });

  it('se limite à l’accueil et au match pour un scrim (sans tournoi)', () => {
    expect(matchRevalidationPaths('m-1', null)).toEqual(['/', '/match/m-1']);
  });
});
