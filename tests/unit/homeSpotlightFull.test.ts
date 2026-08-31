// Section « Le prochain rendez-vous » de l'accueil : ce qu'elle propose quand
// le tournoi est COMPLET.
//
// Le problème traité : une visiteuse qui arrive une fois les 8 places prises
// lisait « Inscriptions ouvertes », voyait un bouton « Inscrire mon équipe »
// qui ne mène nulle part d'utile, et repartait. La section ouvre désormais
// trois portes — scrim, recherche d'équipe, création pour la saison suivante.
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

function tournament(
  over: Partial<UpcomingTournament> = {}
): UpcomingTournament {
  return {
    id: 'e8fa740c-d92b-49d8-a654-05a37d0eea3b',
    name: "OW WOMEN's CUP 2026",
    slug: 'ow-womens-cup-2026',
    shortName: 'OWWC26',
    status: 'published',
    startDate: '2026-09-18',
    endDate: null,
    format: 'Round robin',
    maxTeams: 8,
    teamCount: 3,
    ...over,
  };
}

function render(
  t: UpcomingTournament | null,
  teams: HomeTeam[] = []
): string {
  return renderToString(
    createElement(HomeSpotlight, {
      tournament: t,
      prizeCents: null,
      live,
      teams,
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

describe('HomeSpotlight — tournoi complet', () => {
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
 * Fusion avec la bande des équipes
 *
 * « Le prochain rendez-vous » et « elles participent » vivaient dans deux
 * sections successives, qui disaient la même chose à deux endroits. Elles ne
 * font plus qu'une carte : ces tests fixent que le pied en fait bien partie, et
 * qu'il s'efface quand il n'a rien à montrer.
 * ------------------------------------------------------------------------- */

describe('HomeSpotlight — pied « équipes engagées »', () => {
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

  it('rend les équipes DANS la carte du rendez-vous', () => {
    const html = render(tournament(), teams);
    // Un seul rendu porte les deux : le titre de la section et les liens
    // d'équipe. C'est tout l'objet de la fusion.
    expect(html).toContain('Le prochain rendez-vous');
    expect(html).toContain('href="/team/chocomates"');
    expect(html).toContain('href="/team/eclypse"');
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
