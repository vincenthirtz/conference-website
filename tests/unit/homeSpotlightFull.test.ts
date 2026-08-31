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

const live: TwitchLive = { live: false, parent: null, channel: 'womens_cup' };

function tournament(over: Partial<UpcomingTournament> = {}): UpcomingTournament {
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

function render(t: UpcomingTournament | null): string {
  return renderToString(
    createElement(HomeSpotlight, { tournament: t, prizeCents: null, live })
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
