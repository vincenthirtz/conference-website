// Section « Le prochain rendez-vous » de l'accueil : ce qu'elle met en avant.
//
// DEUX PROBLÈMES SUCCESSIFS, tous deux figés ici.
//
// 1. Une visiteuse qui arrivait une fois les 8 places prises lisait
//    « Inscriptions ouvertes », voyait un bouton « Inscrire mon équipe » qui ne
//    menait nulle part d'utile, et repartait. La section ouvre trois portes —
//    scrim, recherche d'équipe, création pour la saison suivante.
//
// 2. Le correctif du dessus a fini par se retourner : à DEUX JOURS du coup
//    d'envoi, la carte menait encore par « Complet », « toutes les places sont
//    prises » et « en attendant la suite » — pendant que son propre pied
//    annonçait les matchs du vendredi. Trois messages de porte fermée sur
//    l'événement le plus imminent de l'année. L'imminence prime désormais, et
//    les trois portes reculent au second rang sans disparaître.
//
// L'HORLOGE EST INJECTÉE. Sans ça ces tests changeraient de résultat selon le
// jour où on les lance : `startDate` est une date fixe, donc « complet » et
// « ça commence demain » seraient le même cas rendu différemment en mars et en
// septembre. Chaque test dit explicitement à quelle distance du départ il se
// place.
//
// Pas de jsdom/testing-library dans ce repo (politique zéro dépendance) : on
// rend côté serveur via react-dom/server, comme adminCasterSceneEditors.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import HomeSpotlight from '@/components/Home/HomeSpotlight';
import type { UpcomingTournament } from '@/components/Home/HomeUpcomingTournament';
import type { TwitchLive } from '@/components/Home/useTwitchLive';
import type { HomeTeam } from '@/utils/home/loadHomeData';

const live: TwitchLive = { live: false, parent: null, channel: 'womens_cup' };

const START = '2026-09-18';
/** Trois mois avant : aucun début en vue, l'état des places décide seul. */
const LOIN = '2026-06-01';
/** Deux jours avant : la situation réelle du 16 septembre 2026. */
const IMMINENT = '2026-09-16';

function tournament(
  over: Partial<UpcomingTournament> = {}
): UpcomingTournament {
  return {
    id: 'e8fa740c-d92b-49d8-a654-05a37d0eea3b',
    name: "OW WOMEN's CUP 2026",
    slug: 'ow-womens-cup-2026',
    shortName: 'OWWC26',
    status: 'published',
    startDate: START,
    endDate: null,
    format: 'Round robin',
    maxTeams: 8,
    teamCount: 3,
    ...over,
  };
}

function render(
  t: UpcomingTournament | null,
  teams: HomeTeam[] = [],
  now: string = LOIN
): string {
  return renderToString(
    createElement(HomeSpotlight, {
      tournament: t,
      prizeCents: null,
      live,
      teams,
      now,
    })
  );
}

describe('HomeSpotlight — places restantes', () => {
  it('invite à inscrire son équipe et annonce les inscriptions ouvertes', () => {
    const html = render(tournament({ teamCount: 3 }));
    expect(html).toContain('Inscrire mon équipe');
    expect(html).toContain('Inscriptions ouvertes');
    expect(html).not.toContain('Proposer un scrim');
  });
});

describe('HomeSpotlight — tournoi complet, début lointain', () => {
  const full = tournament({ teamCount: 8, maxTeams: 8 });

  it('remplace « inscriptions ouvertes » par « complet »', () => {
    const html = render(full);
    expect(html).toContain('Complet');
    expect(html).not.toContain('Inscriptions ouvertes');
  });

  it('propose les trois portes de sortie plutôt qu’un constat', () => {
    const html = render(full);
    expect(html).toContain('Proposer un scrim');
    expect(html).toContain('Chercher une équipe');
    expect(html).toContain('Créer une équipe (prochaine saison)');
    expect(html).toContain('href="/scrim"');
    expect(html).toContain('href="/rejoindre"');
    expect(html).toContain('href="/team/create"');
  });

  it('retire le CTA d’inscription, qui ne mène plus nulle part', () => {
    const html = render(full);
    expect(html).not.toContain('Inscrire mon équipe');
  });

  // Le seuil se DÉDUIT des places : si une équipe se désiste, la section
  // réinvite d'elle-même. C'est ce qui distingue ce calcul d'un drapeau posé à
  // la main, qui resterait levé.
  it('réinvite dès qu’une place se libère', () => {
    const html = render(tournament({ teamCount: 7, maxTeams: 8 }));
    expect(html).toContain('Inscrire mon équipe');
    expect(html).not.toContain('Proposer un scrim');
  });

  it('ne se déclenche pas sans plafond de places déclaré', () => {
    // `maxTeams` nul = pas de notion de complétude ; 40 équipes inscrites ne
    // font pas un tournoi plein.
    const html = render(tournament({ teamCount: 40, maxTeams: null }));
    expect(html).toContain('Inscrire mon équipe');
    expect(html).not.toContain('Proposer un scrim');
  });

  it('un tournoi EN COURS garde son affichage live, complet ou non', () => {
    // Pendant le tournoi, proposer « créer une équipe » n'aurait pas de sens :
    // la section bascule sur l'état live, qui prime.
    const html = render(tournament({ teamCount: 8, status: 'running' }));
    expect(html).toContain('En cours');
    expect(html).not.toContain('Proposer un scrim');
    expect(html).not.toContain('Inscrire mon équipe');
  });
});

/* ---------------------------------------------------------------------------
 * L'imminence prime
 *
 * Le cas qui a motivé la refonte : complet ET à deux jours du départ. C'est
 * exactement la situation du 16 septembre 2026, où la carte disait « en
 * attendant la suite » au-dessus d'un pied annonçant les matchs du vendredi.
 * ------------------------------------------------------------------------- */

describe('HomeSpotlight — début imminent', () => {
  const full = tournament({ teamCount: 8, maxTeams: 8 });

  it('mène par le compte à rebours, pas par « Complet »', () => {
    const html = render(full, [], IMMINENT);
    expect(html).toContain('Dans 2 jours');
    // Le constat de porte fermée ne doit plus être ce qu'on lit en premier.
    expect(html).not.toContain('Toutes les places sont prises');
  });

  it('annonce le coup d’envoi et le nombre d’équipes', () => {
    const html = render(full, [], IMMINENT);
    expect(html).toContain('Coup d’envoi dans 2 jours');
    expect(html).toContain('8');
  });

  it('pousse le calendrier en action principale', () => {
    const html = render(full, [], IMMINENT);
    expect(html).toContain('Voir le calendrier');
    expect(html).toContain('href="/tournament/ow-womens-cup-2026/matches"');
  });

  // Elles ne disparaissent pas : une visiteuse arrivée trop tard garde les
  // scrims, la recherche d'équipe et la saison suivante. Elles reculent.
  it('garde les trois portes de sortie, au second rang', () => {
    const html = render(full, [], IMMINENT);
    expect(html).toContain('Pas encore d’équipe ?');
    expect(html).toContain('Proposer un scrim');
    expect(html).toContain('Chercher une équipe');
  });

  it('le jour même se dit autrement que « dans 0 jour »', () => {
    const html = render(full, [], START);
    expect(html).toContain('Ça commence aujourd’hui');
    expect(html).not.toContain('Dans 0 jour');
  });

  it('un début imminent AVEC des places libres garde l’inscription', () => {
    // Le compte à rebours ne doit pas fermer une porte encore ouverte : trois
    // équipes sur huit, à deux jours, il reste tout à fait le temps.
    const html = render(tournament({ teamCount: 3 }), [], IMMINENT);
    expect(html).toContain('Inscrire mon équipe');
    expect(html).toContain('Voir le calendrier');
    // Le second rang n'a pas lieu d'être : l'inscription est au premier.
    expect(html).not.toContain('Pas encore d’équipe ?');
  });
});

/* ---------------------------------------------------------------------------
 * La bande des équipes
 *
 * Elle a été le PIED de la carte, en concurrence avec les affiches de la
 * journée : l'une OU l'autre. Les semaines où un calendrier est publié, les
 * équipes disparaissaient donc de la page. Elle est maintenant une section à
 * part, pleine largeur, rendue par le même composant — ces tests fixent
 * qu'elle accompagne toujours la carte, et qu'elle s'efface à vide.
 * ------------------------------------------------------------------------- */

describe('HomeSpotlight — bande « équipes engagées »', () => {
  const teams: HomeTeam[] = [
    {
      id: 'id-1',
      name: 'Chocomates',
      shortName: 'Choco',
      slug: 'chocomates',
      logoUrl: null,
    },
    {
      id: 'id-2',
      name: 'Eclypse',
      shortName: 'LGE',
      slug: 'eclypse',
      logoUrl: null,
    },
  ];

  it('accompagne la carte du rendez-vous', () => {
    const html = render(tournament(), teams);
    expect(html).toContain('Le prochain rendez-vous');
    expect(html).toContain('href="/team/chocomates"');
    expect(html).toContain('href="/team/eclypse"');
  });

  it('sort du conteneur pour occuper toute la largeur', () => {
    const html = render(tournament(), teams);
    // La bande ne doit plus être une cellule de la grille de la carte.
    expect(html).not.toContain('md:col-span-2');
  });

  it('annonce le nombre d’équipes engagées', () => {
    const html = render(tournament(), teams);
    expect(html).toContain('2');
    expect(html).toContain('Elles participent');
  });

  it('s’efface quand aucune équipe n’est engagée, sans vider la carte', () => {
    const html = render(tournament(), []);
    expect(html).not.toContain('Elles participent');
    // La carte, elle, reste : le rendez-vous existe même sans engagée.
    expect(html).toContain('Le prochain rendez-vous');
  });
});
