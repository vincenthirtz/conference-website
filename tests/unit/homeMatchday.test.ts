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
  isFinalsDay,
  matchdayToday,
  nextKickoff,
} from '@/utils/home/matchdayToday';
import {
  selectNextMatchday,
  selectNextMatchdays,
  shapeMatchdayMatch,
  type HomeMatchday,
} from '@/utils/home/loadNextMatchday';
import type { PublicMatch } from '@/utils/public/readMatches';
import type { HomeTeam } from '@/utils/home/loadHomeData';
import HomeMatchdayStrip, {
  LARGE_MATCHDAY_MAX,
  shouldShowRound,
} from '@/components/Home/HomeMatchdayStrip';
import HomeSpotlight from '@/components/Home/HomeSpotlight';
import type { UpcomingTournament } from '@/components/Home/HomeUpcomingTournament';

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

/* ------------------------------------------------------------------------ */

function matchday(over: Partial<HomeMatchday> = {}): HomeMatchday {
  const shaped = shapeMatchdayMatch(match(), new Map());
  if (!shaped) throw new Error('fixture invalide');
  return { date: '2026-09-18', matches: [shaped], totalCount: 1, ...over };
}

/* ── « Et après ? » ────────────────────────────────────────────────────────
 *
 * Une seule journée laissait la question ouverte : à la Cup 2026 on joue le
 * mercredi et le vendredi, et savoir « ce soir » sans savoir « et après »
 * oblige à ouvrir le calendrier.
 */

/* ── Fraîcheur ─────────────────────────────────────────────────────────────
 *
 * L'accueil et les pages de tournoi sont statiques (ISR 15 min). Un score
 * saisi doit s'y voir tout de suite : sinon la carte « prochain rendez-vous »
 * annonce encore un match déjà joué, ce qui s'est produit le 18/09/2026.
 */

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
    expect(shaped?.team1?.shortName).toBe('CHOC');
    expect(shaped?.team1?.slug).toBe('chocomates');
  });

  it('tient sans rien connaître de l’équipe', () => {
    const shaped = shapeMatchdayMatch(match(), new Map());
    expect(shaped?.team2?.name).toBe('Eclypse');
    expect(shaped?.team2?.shortName).toBeNull();
  });

  it('écarte une affiche dont un côté n’a pas de nom', () => {
    expect(
      shapeMatchdayMatch(match({ team2_name: null }), new Map())
    ).toBeNull();
  });
});

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

describe('HomeSpotlight — les affiches, jamais un vide', () => {
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

  function render(...days: (HomeMatchday | null)[]): string {
    return renderToString(
      createElement(HomeSpotlight, {
        tournament,
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

  it('n’affiche plus la bande des équipes engagées', () => {
    expect(render(matchday())).not.toContain('Elles participent');
  });

  it('n’affiche rien sans calendrier publié', () => {
    expect(render(null)).toBe('');
  });
});

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
          roundName: null,
          outOfStage: false,
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

/* ── Finales : deux affiches, un finaliste à venir ──────────────────────────
 *
 * Le 23/10/2026, la petite finale attendait son second finaliste : la home
 * écartait l'affiche et annonçait « 1 match au programme » un soir de deux
 * finales. Un côté inconnu s'affiche désormais « À déterminer » — jamais un
 * exempt —, la manche se nomme, et une journée de deux affiches se montre en
 * grandes cartes.
 */

describe('finales : un côté pas encore connu', () => {
  const tbd = () =>
    match({ id: 'petite', team2_id: null, team2_name: null, stage_id: null });

  it('s’affiche « à déterminer » quand on sait que ce n’est pas un exempt', () => {
    const shaped = shapeMatchdayMatch(tbd(), new Map(), {
      roundName: 'Petite finale',
      isBye: false,
    });
    expect(shaped?.team1?.name).toBe('Chocomates');
    expect(shaped?.team2).toBeNull();
    expect(shaped?.roundName).toBe('Petite finale');
    expect(shaped?.outOfStage).toBe(true);
  });

  it('un exempt, ou un match sans renseignement, reste écarté', () => {
    expect(
      shapeMatchdayMatch(tbd(), new Map(), { roundName: null, isBye: true })
    ).toBeNull();
    expect(shapeMatchdayMatch(tbd(), new Map())).toBeNull();
  });

  it('la journée retient l’affiche incomplète quand le filtre l’autorise', () => {
    const all = [tbd(), match({ id: 'grande' })];
    expect(
      selectNextMatchday(all, NOW_THURSDAY)?.matches.map((m) => m.id)
    ).toEqual(['grande']);
    const picked = selectNextMatchdays(
      all,
      NOW_THURSDAY,
      1,
      (m) => m.id === 'petite'
    )[0];
    expect(picked?.matches.map((m) => m.id).sort()).toEqual([
      'grande',
      'petite',
    ]);
  });
});

describe('nom de manche sur l’affiche', () => {
  function shaped(over: Partial<PublicMatch>, roundName: string | null) {
    const s = shapeMatchdayMatch(match(over), new Map(), {
      roundName,
      isBye: false,
    });
    if (!s) throw new Error('fixture invalide');
    return s;
  }

  it('toujours pour une finale hors phase', () => {
    const grande = shaped({ stage_id: null }, 'Grande finale');
    expect(shouldShowRound(grande, [grande])).toBe(true);
  });

  it('pas sur une journée de saison toute dans la même manche', () => {
    const a = shaped({ id: 'a', stage_id: 'stage-1' }, 'J7');
    const b = shaped({ id: 'b', stage_id: 'stage-1' }, 'J7');
    expect(shouldShowRound(a, [a, b])).toBe(false);
  });

  it('quand la journée mêle plusieurs manches, et jamais sans nom', () => {
    const a = shaped({ id: 'a', stage_id: 'stage-1' }, 'J7');
    const b = shaped({ id: 'b', stage_id: 'stage-1' }, 'J8');
    expect(shouldShowRound(a, [a, b])).toBe(true);
    const anon = shaped({ id: 'c', stage_id: null }, null);
    expect(shouldShowRound(anon, [anon])).toBe(false);
  });
});

describe('HomeMatchdayStrip — soir de finales', () => {
  function finalsDay(): HomeMatchday {
    const petite = shapeMatchdayMatch(
      match({
        id: 'petite',
        team2_id: null,
        team2_name: null,
        scheduled_at: '2026-10-23T17:00:00.000Z',
      }),
      new Map(),
      { roundName: 'Petite finale', isBye: false }
    );
    const grande = shapeMatchdayMatch(
      match({ id: 'grande', scheduled_at: '2026-10-23T18:30:00.000Z' }),
      new Map(),
      { roundName: 'Grande finale', isBye: false }
    );
    if (!petite || !grande) throw new Error('fixture invalide');
    return { date: '2026-10-23', matches: [petite, grande], totalCount: 2 };
  }

  it('annonce les deux finales, nommées, et le finaliste à venir', () => {
    const html = renderToString(
      createElement(HomeMatchdayStrip, {
        matchday: finalsDay(),
        matchesHref: '/tournament/ow-womens-cup-2026/matches',
      })
    );
    expect(html).toContain('2 matchs au programme');
    expect(html).toContain('Petite finale');
    expect(html).toContain('Grande finale');
    expect(html).toContain('À déterminer');
  });

  it('montre une journée de deux affiches en grandes cartes', () => {
    expect(LARGE_MATCHDAY_MAX).toBe(2);
    const html = renderToString(
      createElement(HomeMatchdayStrip, {
        matchday: finalsDay(),
        matchesHref: '/tournament/ow-womens-cup-2026/matches',
      })
    );
    // Grand format : rembourrage et blasons agrandis.
    expect(html).toContain('py-5');
    expect(html).toContain('h-12 w-12');
  });
});

/* ── Un jour de match ──────────────────────────────────────────────────────
 *
 * Le 23/10/2026, soir des deux finales, l'accueil les montrait SOUS l'encart
 * Halloween et sous les clips du moment, et le hero ne disait rien de la
 * soirée. Ces règles décident de l'ordre de la page (pages/index) et du
 * décompte du hero.
 */

describe('matchdayToday — la journée annoncée se joue-t-elle aujourd’hui ?', () => {
  // 10 h à Paris le vendredi 18 septembre (CEST = UTC+2).
  const FRIDAY_MORNING = new Date('2026-09-18T08:00:00.000Z');

  it('rend la journée quand elle tombe aujourd’hui, à Paris', () => {
    const day = matchday();
    expect(matchdayToday([day], FRIDAY_MORNING)).toBe(day);
  });

  it('rend null la veille, et sans journée', () => {
    expect(matchdayToday([matchday()], NOW_THURSDAY)).toBeNull();
    expect(matchdayToday([], FRIDAY_MORNING)).toBeNull();
  });

  it('suit le jour de Paris, pas celui d’UTC', () => {
    // 23 h 30 UTC le jeudi = 1 h 30 le vendredi à Paris.
    const parisFriday = new Date('2026-09-17T23:30:00.000Z');
    expect(matchdayToday([matchday()], parisFriday)).not.toBeNull();
  });
});

describe('isFinalsDay', () => {
  it('vrai quand toutes les affiches sont hors phase', () => {
    expect(isFinalsDay(matchday())).toBe(true);
  });

  it('faux dès qu’une affiche appartient à une phase', () => {
    const inStage = shapeMatchdayMatch(
      match({ id: 'm-2', stage_id: 'stage-1' }),
      new Map()
    );
    if (!inStage) throw new Error('fixture invalide');
    const day = matchday();
    expect(
      isFinalsDay({ ...day, matches: [...day.matches, inStage], totalCount: 2 })
    ).toBe(false);
  });

  it('faux pour une journée vide', () => {
    expect(isFinalsDay(matchday({ matches: [], totalCount: 0 }))).toBe(false);
  });
});

describe('nextKickoff — ce que vise le décompte du hero', () => {
  function finalsDay(): HomeMatchday {
    const small = shapeMatchdayMatch(
      match({ id: 'small', scheduled_at: '2026-10-23T17:00:00.000Z' }),
      new Map()
    );
    const grand = shapeMatchdayMatch(
      match({ id: 'grand', scheduled_at: '2026-10-23T18:30:00.000Z' }),
      new Map()
    );
    if (!small || !grand) throw new Error('fixture invalide');
    return { date: '2026-10-23', matches: [small, grand], totalCount: 2 };
  }

  it('vise le premier coup d’envoi à venir', () => {
    expect(nextKickoff(finalsDay(), new Date('2026-10-23T09:00:00.000Z'))).toBe(
      '2026-10-23T17:00:00.000Z'
    );
  });

  it('passe au match suivant une fois le premier lancé', () => {
    const day = finalsDay();
    day.matches[0] = { ...day.matches[0], status: 'ongoing' };
    expect(nextKickoff(day, new Date('2026-10-23T17:20:00.000Z'))).toBe(
      '2026-10-23T18:30:00.000Z'
    );
  });

  it('ignore un match en retard sur son horaire', () => {
    // Encore « pending » à 19 h 10 : viser 19 h, c'est viser le passé.
    expect(nextKickoff(finalsDay(), new Date('2026-10-23T17:10:00.000Z'))).toBe(
      '2026-10-23T18:30:00.000Z'
    );
  });

  it('rend null quand tout a commencé', () => {
    expect(
      nextKickoff(finalsDay(), new Date('2026-10-23T19:00:00.000Z'))
    ).toBeNull();
  });
});

describe('HomeSpotlight — soir de finales', () => {
  const tournament: UpcomingTournament = {
    id: 'tour-1',
    name: "OW WOMEN's CUP 2026",
    slug: 'ow-womens-cup-2026',
    shortName: null,
    status: 'running',
    startDate: '2026-09-18',
    endDate: '2026-10-23',
    format: 'BO3',
    maxTeams: 8,
    teamCount: 8,
  };

  function render(finalsTonight: boolean): string {
    return renderToString(
      createElement(HomeSpotlight, {
        tournament,
        matchdays: [matchday()],
        finalsTonight,
      })
    );
  }

  it('nomme les finales et renvoie au direct', () => {
    const html = render(true);
    expect(html).toContain('Ce soir');
    expect(html).toContain('Les finales');
    expect(html).toContain('href="https://www.twitch.tv/');
    expect(html).toContain('Suivre sur Twitch');
  });

  it('garde « À suivre » les autres jours, sans lien Twitch', () => {
    const html = render(false);
    expect(html).toContain('À suivre');
    expect(html).not.toContain('Les finales');
    expect(html).not.toContain('twitch.tv');
  });
});
