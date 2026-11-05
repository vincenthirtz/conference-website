// tests/unit/navigation.test.ts
//
// Couvre components/Navbar/navigation.ts — la source unique des liens (plan
// 6) et l'entrée active du menu du site (plan 8).

import { describe, it, expect } from 'vitest';
import {
  PUBLIC_LINKS,
  activePublicLinkRef,
  flatPublicLinks,
  isNavigableLink,
  publicLinkKey,
  subMenuSections,
} from '@/components/Navbar/navigation';
import nsNavbar from '@/lib/i18n/locales/fr/navbar';
import enNavbar from '@/lib/i18n/locales/en/navbar';

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

  it('« Agenda » actif sur les pages des événements — l’URL réelle, pas le motif', () => {
    for (const path of [
      '/tournoi',
      '/news/scrim-caritatif-du-17-mai',
      '/tournament/ow-womens-cup-2026',
      '/tournament/halloween-2026',
      '/tournament/halloween-2026/inscription-solo',
    ]) {
      expect(activePublicLinkRef(path)).toBe(key('Agenda'));
    }
  });

  it('le lien le plus précis gagne : « Équipes » sur /teams', () => {
    const links = [
      { title: 'Tournoi', ref: '/tournament/ow-womens-cup-2026' },
      { title: 'Équipes', ref: '/tournament/ow-womens-cup-2026/teams' },
    ];
    expect(
      activePublicLinkRef('/tournament/ow-womens-cup-2026/teams?x=1#top', links)
    ).toBe('/tournament/ow-womens-cup-2026/teams');
  });

  it('l’accueil seulement en correspondance exacte ; rien hors menu', () => {
    expect(activePublicLinkRef('/')).toBe(key('Accueil'));
    expect(activePublicLinkRef('/mentions-legales')).toBeNull();
  });

  it('une page de sous-menu active son entrée parente', () => {
    // Le hub mercato (ses deux onglets sont deux entrées du sous-menu).
    expect(activePublicLinkRef('/mercato')).toBe(key('Communauté'));
    expect(activePublicLinkRef('/mercato/joueuse')).toBe(key('Communauté'));
  });

  it('« Cartes » actif sur le catalogue et ses sous-pages', () => {
    expect(activePublicLinkRef('/tcg')).toBe(key('Cartes'));
    expect(activePublicLinkRef('/tcg/fan-art')).toBe(key('Cartes'));
  });
});

describe('l’Agenda des événements', () => {
  it('« À venir » : OWWC 2027, grisé et sans lien ; « À revoir » : les quatre passés, le plus récent d’abord', () => {
    const agenda = PUBLIC_LINKS.find((l) => l.title === 'Agenda');
    expect(
      subMenuSections(agenda?.subMenu ?? []).map((s) => [
        s.heading,
        s.items.map((i) => [i.title, i.ref ?? null, isNavigableLink(i)]),
      ])
    ).toEqual([
      ['À venir', [['OWWC 2027', null, false]]],
      [
        'À revoir',
        [
          ['Event Halloween', '/tournament/halloween-2026', true],
          ['OWWC 2026', '/tournament/ow-womens-cup-2026', true],
          [
            "Journée contre l'homophobie",
            '/news/scrim-caritatif-du-17-mai',
            true,
          ],
          ['OWWC 2025', '/tournoi', true],
        ],
      ],
    ]);
  });

  it('ni sous-titre ni entrée grisée dans la liste « Site » des barres staff et joueuse', () => {
    const titles = flatPublicLinks().map((l) => l.title);
    for (const t of ['À venir', 'À revoir', 'OWWC 2027']) {
      expect(titles.some((title) => title.endsWith(`– ${t}`))).toBe(false);
    }
  });

  it('un sous-menu sans sous-titre reste une seule section', () => {
    const community = PUBLIC_LINKS.find((l) => l.title === 'Communauté');
    const sections = subMenuSections(community?.subMenu ?? []);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.heading).toBeNull();
  });

  it('plus d’entrée « Event Halloween » ni « Édition 2025 » ailleurs dans le menu', () => {
    // Un doublon soulignerait une autre entrée que l'Agenda sur la même page.
    for (const ref of ['/tournoi', '/tournament/halloween-2026']) {
      expect(flatPublicLinks().filter((l) => l.ref === ref)).toHaveLength(1);
    }
    expect(PUBLIC_LINKS.some((l) => l.title === 'Event Halloween')).toBe(false);
  });

  it('localisé, sous-menu compris', () => {
    expect(enNavbar.publicLinks.Agenda).toBe('Events');
    const agenda = PUBLIC_LINKS.find((l) => l.title === 'Agenda');
    for (const sub of agenda?.subMenu ?? []) {
      expect(nsNavbar.fr.publicLinks).toHaveProperty([sub.title]);
      expect(enNavbar.publicLinks).toHaveProperty([sub.title]);
    }
  });
});

describe('le TCG au premier niveau du menu', () => {
  it('« Cartes » mène à /tcg, hors de tout sous-menu', () => {
    const cards = PUBLIC_LINKS.find((l) => l.title === 'Cartes');
    expect(cards?.ref).toBe('/tcg');
    expect(cards?.subMenu).toBeUndefined();
    // Un seul chemin vers /tcg : un doublon sous « Communauté » ferait deux
    // entrées actives pour la même page.
    const refs = flatPublicLinks().filter((l) => l.ref === '/tcg');
    expect(refs).toHaveLength(1);
  });

  it('localisé « Cartes » / « Cards »', () => {
    expect(nsNavbar.fr.publicLinks.Cartes).toBe('Cartes');
    expect(enNavbar.publicLinks.Cartes).toBe('Cards');
  });
});
