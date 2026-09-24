// tests/unit/navigation.test.ts
//
// Couvre components/Navbar/navigation.ts — la source unique des liens (plan
// 6) et l'entrée active du menu du site (plan 8).

import { describe, it, expect } from 'vitest';
import {
  PUBLIC_LINKS,
  activePublicLinkRef,
  flatPublicLinks,
  publicLinkKey,
} from '@/components/Navbar/navigation';

describe('PUBLIC_LINKS / flatPublicLinks', () => {
  it('les entrées masquées ne sortent dans AUCUN menu, barres comprises', () => {
    const titles = flatPublicLinks().map((l) => l.title);
    for (const hidden of ['À propos', 'Cast', 'Sponsors']) {
      expect(
        titles.some((t) => t === hidden || t.endsWith(`– ${hidden}`))
      ).toBe(false);
      expect(PUBLIC_LINKS.some((l) => l.title === hidden)).toBe(false);
    }
  });

  it('localise les titres, sous-menus compris', () => {
    const flat = flatPublicLinks((t) => `EN:${t}`);
    expect(flat.every((l) => l.title.startsWith('EN:'))).toBe(true);
    expect(flat.some((l) => l.title.includes(' – EN:'))).toBe(true);
  });
});

describe('activePublicLinkRef', () => {
  const key = (title: string) =>
    publicLinkKey(PUBLIC_LINKS.find((l) => l.title === title)!);

  it('« Tournoi » actif sur les pages du tournoi — l’URL réelle, pas le motif', () => {
    expect(activePublicLinkRef('/tournament/ow-womens-cup-2026')).toBe(
      key('Tournoi')
    );
    expect(activePublicLinkRef('/tournament/ow-womens-cup-2026/matches')).toBe(
      key('Tournoi')
    );
  });

  it('le lien le plus précis gagne : « Équipes » sur /teams', () => {
    expect(
      activePublicLinkRef('/tournament/ow-womens-cup-2026/teams?x=1#top')
    ).toBe(key('Équipes'));
  });

  it('l’accueil seulement en correspondance exacte ; rien hors menu', () => {
    expect(activePublicLinkRef('/')).toBe(key('Accueil'));
    expect(activePublicLinkRef('/mentions-legales')).toBeNull();
  });

  it('une page de sous-menu active son entrée parente', () => {
    expect(activePublicLinkRef('/rejoindre')).toBe(key('Communauté'));
  });
});
