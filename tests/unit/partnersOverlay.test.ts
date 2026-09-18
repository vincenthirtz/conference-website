// La source OBS « partenaires » : ce qu'elle montre, et dans quel ordre.
//
// CE QUI MÉRITE UN TEST ICI : l'ordre est un CLASSEMENT commercial (super >
// major > cultural), et un partenaire affiché au mauvais rang — ou pas affiché
// du tout — est un engagement qu'on n'a pas tenu. Le reste du module n'est que
// du bornage de paramètres, mais c'est ce bornage qui décide de ce qui passe à
// l'antenne.

import { describe, it, expect } from 'vitest';
import { partnersFit } from '@/components/overlay/match/PartnersSource';
import {
  PARTNERS_MAX,
  parsePartnerCategories,
  parsePartnersLimit,
  selectOverlayPartners,
  type PartnerRow,
} from '@/utils/overlay/partnersOverlay';

function row(over: Partial<PartnerRow> & { id: string }): PartnerRow {
  return {
    name: `Partenaire ${over.id}`,
    category: 'major',
    logo_url: null,
    ...over,
  };
}

describe('parsePartnerCategories', () => {
  it('distingue « pas de filtre » de « filtre sans résultat »', () => {
    // `null` = toutes les catégories ; `[]` = on a filtré sur des catégories
    // inconnues. Les confondre afficherait TOUT le monde à qui n'en voulait
    // qu'une.
    expect(parsePartnerCategories(undefined)).toBeNull();
    expect(parsePartnerCategories('inconnue')).toEqual([]);
  });

  it('accepte une liste, normalisée et dédoublonnée', () => {
    expect(parsePartnerCategories('CULTURAL, major ,cultural')).toEqual([
      'cultural',
      'major',
    ]);
  });
});

describe('parsePartnersLimit', () => {
  it('borne, et prend tout le monde par défaut', () => {
    expect(parsePartnersLimit(undefined)).toBe(PARTNERS_MAX);
    expect(parsePartnersLimit('abc')).toBe(PARTNERS_MAX);
    expect(parsePartnersLimit('0')).toBe(1);
    expect(parsePartnersLimit('3')).toBe(3);
    expect(parsePartnersLimit('99')).toBe(PARTNERS_MAX);
  });
});

describe('selectOverlayPartners', () => {
  it('classe par catégorie : qui paie le plus passe devant', () => {
    const out = selectOverlayPartners([
      row({ id: 'c', category: 'cultural' }),
      row({ id: 'm', category: 'major' }),
      row({ id: 's', category: 'super' }),
    ]);
    expect(out.map((p) => p.id)).toEqual(['s', 'm', 'c']);
  });

  it('garde l’ordre de l’admin à catégorie égale', () => {
    // L'API trie déjà par `display_order` : le tri par catégorie ne doit pas
    // défaire ce choix (tri stable).
    const out = selectOverlayPartners([
      row({ id: 'm1', category: 'major' }),
      row({ id: 'm2', category: 'major' }),
      row({ id: 'm3', category: 'major' }),
    ]);
    expect(out.map((p) => p.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('ne fait pas disparaître une catégorie inconnue', () => {
    // Quelqu'un ajoute un palier en base sans toucher à ce fichier : le
    // partenaire passe en fin de bandeau, il ne s'évapore pas.
    const out = selectOverlayPartners([
      row({ id: 'x', category: 'nouveau_palier' }),
      row({ id: 's', category: 'super' }),
    ]);
    expect(out.map((p) => p.id)).toEqual(['s', 'x']);
  });

  it('écarte un partenaire sans nom', () => {
    // Sans logo il n'afficherait rien ; avec logo il n'aurait pas d'alt.
    const out = selectOverlayPartners([
      row({ id: 'vide', name: '   ' }),
      row({ id: 'ok' }),
    ]);
    expect(out.map((p) => p.id)).toEqual(['ok']);
  });

  it('filtre sur les catégories demandées', () => {
    const rows = [
      row({ id: 's', category: 'super' }),
      row({ id: 'c', category: 'cultural' }),
    ];
    expect(
      selectOverlayPartners(rows, { categories: ['cultural'] }).map((p) => p.id)
    ).toEqual(['c']);
    // Filtre vide = personne, et surtout pas « tout le monde ».
    expect(selectOverlayPartners(rows, { categories: [] })).toEqual([]);
  });

  it('écrête à la limite demandée', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })];
    expect(selectOverlayPartners(rows, { limit: 2 }).map((p) => p.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('rend le logo quand il existe, et le nom dans tous les cas', () => {
    const [avec, sans] = selectOverlayPartners([
      row({ id: 'a', name: 'Librairie', logo_url: '/img/l.png' }),
      row({ id: 'b', name: 'Warsage' }),
    ]);
    expect(avec).toEqual({ id: 'a', name: 'Librairie', logoUrl: '/img/l.png' });
    expect(sans).toEqual({ id: 'b', name: 'Warsage', logoUrl: null });
  });
});

describe('partnersFit', () => {
  // La source OBS peut faire n'importe quelle taille : ce calcul est la seule
  // chose qui empêche le bandeau de déborder de la source (donc d'être coupé à
  // l'antenne) ou de rester minuscule dans un grand cadre.
  it('fait tenir le bandeau ENTIER : c’est la plus petite contrainte qui gagne', () => {
    // 1920 de large laisserait grandir 3 fois ; 160 de haut, à peine. La
    // hauteur commande, sinon le bandeau sortirait par le bas.
    const fit = partnersFit(2, { width: 1920, height: 160 });
    expect(fit).toBeLessThanOrEqual(1);
    expect(fit).toBeGreaterThan(0.8);
  });

  it('grandit avec la source plutôt que de laisser du vide', () => {
    const petit = partnersFit(2, { width: 1920, height: 160 });
    const grand = partnersFit(2, { width: 1920, height: 300 });
    expect(grand).toBeGreaterThan(petit);
  });

  it('rétrécit quand les partenaires s’ajoutent', () => {
    const deux = partnersFit(2, { width: 1920, height: 160 });
    const dix = partnersFit(10, { width: 1920, height: 160 });
    expect(dix).toBeLessThan(deux);
  });

  it('reste borné, même sur une source absurde', () => {
    expect(
      partnersFit(1, { width: 10_000, height: 10_000 })
    ).toBeLessThanOrEqual(2);
    expect(partnersFit(12, { width: 100, height: 40 })).toBeGreaterThanOrEqual(
      0.2
    );
    // Viewport pas encore mesuré (premier rendu) : pas de division par zéro.
    expect(partnersFit(2, { width: 0, height: 0 })).toBe(1);
  });
});
