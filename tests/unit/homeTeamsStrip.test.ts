// La bande des équipes engagées, sur la page d'accueil.
//
// Ce qui se teste ici tient en trois promesses :
//
//   - chaque équipe est CLIQUABLE et mène à sa fiche (c'est la raison d'être
//     de la bande) ;
//   - une équipe sans logo n'est pas un trou : elle reçoit un monogramme, pour
//     que la ligne reste régulière ;
//   - sans équipe engagée, la bande disparaît — un bandeau vide sous le titre
//     « elles participent » poserait la question qu'il prétend résoudre.
//
// Rendu SSR via react-dom/server (pas de jsdom dans ce repo).

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import HomeTeamsStrip, {
  teamMonogram,
} from '@/components/Home/HomeTeamsStrip';
// Le lien vers une fiche d'équipe est maintenant un util partagé : la bande
// d'accueil et la liste des équipes d'un tournoi pointent vers la MÊME page.
import { publicTeamHref } from '@/utils/teams/publicTeamHref';
import type { HomeTeam } from '@/utils/home/loadHomeData';

function team(over: Partial<HomeTeam> = {}): HomeTeam {
  return {
    id: 'id-1',
    name: 'Chocomates',
    shortName: 'Choco',
    slug: 'chocomates',
    logoUrl: 'https://cdn.example/choco.png',
    ...over,
  };
}

function render(teams: HomeTeam[]): string {
  return renderToString(createElement(HomeTeamsStrip, { teams }));
}

describe('publicTeamHref', () => {
  it('mène à la fiche par le slug', () => {
    expect(publicTeamHref(team())).toBe('/team/chocomates');
  });

  it('retombe sur l’id quand le slug manque', () => {
    // Une équipe sans slug reste atteignable : /team/[slug] accepte les deux.
    expect(publicTeamHref(team({ slug: null, id: 'abc-123' }))).toBe('/team/abc-123');
  });

  it('encode les slugs à caractères spéciaux', () => {
    expect(publicTeamHref(team({ slug: 'shujaa angel’s' }))).toContain('%20');
  });
});

describe('teamMonogram', () => {
  it('préfère le nom court', () => {
    expect(teamMonogram({ name: 'Venom Valkyries', shortName: 'TVVA' })).toBe(
      'TVVA'
    );
  });

  it('retombe sur les initiales', () => {
    expect(
      teamMonogram({ name: 'Team Positivité', shortName: null })
    ).toBe('TP');
    expect(teamMonogram({ name: 'Hinode Sparkles', shortName: '' })).toBe('HS');
  });

  it('coupe les apostrophes et tirets comme des séparateurs', () => {
    expect(teamMonogram({ name: 'Shujaa Angel’s', shortName: null })).toBe(
      'SAS'
    );
  });

  it('tient sur un nom d’un seul mot', () => {
    expect(teamMonogram({ name: 'Eclypse', shortName: null })).toBe('E');
  });
});

describe('HomeTeamsStrip', () => {
  it('rend un lien par équipe', () => {
    const html = render([
      team(),
      team({ id: 'id-2', name: 'Eclypse', slug: 'eclypse' }),
    ]);
    expect(html).toContain('href="/team/chocomates"');
    expect(html).toContain('href="/team/eclypse"');
    expect(html).toContain('Chocomates');
    expect(html).toContain('Eclypse');
  });

  it('affiche le logo quand il existe', () => {
    const html = render([team()]);
    expect(html).toContain('https://cdn.example/choco.png');
  });

  it('remplace un logo absent par un monogramme, pas par un vide', () => {
    const html = render([
      team({ name: 'Team Positivité', shortName: null, logoUrl: null }),
    ]);
    expect(html).not.toContain('<img');
    expect(html).toContain('TP');
  });

  it('annonce le nombre d’équipes engagées', () => {
    const html = render([team(), team({ id: 'id-2' }), team({ id: 'id-3' })]);
    expect(html).toContain('3');
  });

  it('ne rend RIEN quand aucune équipe n’est engagée', () => {
    expect(render([])).toBe('');
  });
});
