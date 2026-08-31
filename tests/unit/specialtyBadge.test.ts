// La pastille de poste, partagée entre la page publique, l'écran d'équipe et
// les deux écrans staff.
//
// Elle existait sous forme d'un `getSpecialtyStyle` local à la page publique.
// Les écrans staff n'en avaient donc aucun : le poste — tank, dps, support —
// n'y était affiché nulle part, alors que la ligne montrait bien le rôle
// d'équipe (« joueuse »), qui ne dit pas la même chose. D'où le composant
// partagé, et ces tests qui fixent ce qu'il rend.
//
// Rendu SSR via react-dom/server (pas de jsdom dans ce repo).

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import SpecialtyBadge from '@/components/Team/SpecialtyBadge';

function render(specialty: string | null | undefined): string {
  return renderToString(createElement(SpecialtyBadge, { specialty }));
}

describe('SpecialtyBadge', () => {
  it('rend les quatre postes', () => {
    expect(render('tank')).toContain('Tank');
    expect(render('dps')).toContain('DPS');
    expect(render('support')).toContain('Support');
    expect(render('flex')).toContain('Flex');
  });

  it('tolère la casse : la base stocke en minuscules, pas les imports', () => {
    expect(render('TANK')).toContain('Tank');
    expect(render(' Support ')).toContain('Support');
  });

  it('donne une couleur distincte à chaque poste', () => {
    // La couleur est une convention de lecture : l'orange dit « tank » avant
    // même qu'on lise le mot. Deux postes de la même teinte la casseraient.
    const teintes = ['tank', 'dps', 'support', 'flex'].map((s) => {
      const html = render(s);
      return (html.match(/(orange|red|emerald|purple)-500/) ?? [])[1];
    });
    expect(new Set(teintes).size).toBe(4);
  });

  it('ne rend rien quand le poste est absent', () => {
    // « Non déclaré » n'est pas une information à mettre sur chaque ligne :
    // c'est à l'appelant de signaler le manque s'il le veut.
    expect(render(null)).toBe('');
    expect(render(undefined)).toBe('');
    expect(render('')).toBe('');
    expect(render('   ')).toBe('');
  });

  it('ne rend rien sur un poste inconnu plutôt que de l’afficher brut', () => {
    // Une valeur inventée (import, API tierce) ne doit pas traverser
    // l'affichage telle quelle.
    expect(render('jungler')).toBe('');
    expect(render('healer')).toBe('');
  });
});
