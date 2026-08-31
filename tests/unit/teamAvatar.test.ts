// La pastille d'équipe, partagée entre la bande d'accueil et la liste des
// matchs.
//
// Ce qui compte ici, c'est le REPLI : une équipe sur huit n'a pas de logo, et
// sans monogramme la ligne affiche un trou — qui se lit comme un bug plutôt
// que comme une absence.
//
// Rendu SSR via react-dom/server (pas de jsdom dans ce repo).

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import TeamAvatar, { teamMonogram } from '@/components/Team/TeamAvatar';

function render(props: Record<string, unknown>): string {
  return renderToString(createElement(TeamAvatar, props as never));
}

describe('teamMonogram', () => {
  it('préfère le nom court', () => {
    expect(teamMonogram({ name: 'Venom Valkyries', shortName: 'TVVA' })).toBe(
      'TVVA'
    );
  });

  it('retombe sur les initiales', () => {
    expect(teamMonogram({ name: 'Team Positivité', shortName: null })).toBe(
      'TP'
    );
    expect(teamMonogram({ name: 'Hinode Sparkles', shortName: '' })).toBe('HS');
  });

  it('traite apostrophes et tirets comme des séparateurs', () => {
    expect(teamMonogram({ name: 'Shujaa Angel’s', shortName: null })).toBe(
      'SAS'
    );
  });

  it('tient sur un nom d’un seul mot', () => {
    expect(teamMonogram({ name: 'Eclypse', shortName: null })).toBe('E');
  });

  it('borne la longueur pour ne pas déborder de la pastille', () => {
    expect(
      teamMonogram({ name: 'X', shortName: 'ABCDEFGH' }).length
    ).toBeLessThanOrEqual(4);
    expect(
      teamMonogram({ name: 'Un Deux Trois Quatre Cinq', shortName: null })
        .length
    ).toBeLessThanOrEqual(3);
  });
});

describe('TeamAvatar', () => {
  it('affiche le logo quand il existe', () => {
    const html = render({
      name: 'Chocomates',
      shortName: 'Choco',
      logoUrl: 'https://cdn.example/choco.png',
    });
    expect(html).toContain('https://cdn.example/choco.png');
    expect(html).toContain('loading="lazy"');
  });

  it('remplace un logo absent par le monogramme, pas par un vide', () => {
    const html = render({
      name: 'Team Positivité',
      shortName: null,
      logoUrl: null,
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('TP');
  });

  it('est décoratif : le nom est déjà écrit à côté', () => {
    // Le doubler ferait lire deux fois la même chose à un lecteur d'écran —
    // dans les deux rendus, logo comme monogramme.
    expect(render({ name: 'Eclypse', logoUrl: null })).toContain(
      'aria-hidden="true"'
    );
    const avecLogo = render({
      name: 'Eclypse',
      logoUrl: 'https://cdn.example/e.png',
    });
    expect(avecLogo).toContain('aria-hidden="true"');
    expect(avecLogo).toContain('alt=""');
  });

  it('honore la taille demandée', () => {
    expect(render({ name: 'A', logoUrl: null, size: 'xs' })).toContain('h-5');
    expect(render({ name: 'A', logoUrl: null, size: 'lg' })).toContain('h-16');
  });
});
