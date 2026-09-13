// Le bloc « où j'en suis » de la collection TCG.
//
// Ce qui se teste ici tient en trois promesses :
//
//   - un dénominateur ABSENT masque sa ligne : jamais « 0 / 0 », jamais
//     « NaN % ». C'est la promesse la plus importante, parce que l'échec est
//     silencieux — une collection normale à l'écran, mais qui décrit une
//     lacune de mesure et non la collection de la lectrice ;
//   - la progression est lisible en TEXTE, pas seulement en largeur de barre ;
//   - les nombres réels sont dits même quand la barre, elle, est bornée.
//
// Rendu SSR via react-dom/server (pas de jsdom dans ce repo).

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import TcgCollectionProgress, {
  completionPercent,
  rarityRows,
  type TcgCollectionProgressProps,
} from '@/components/tcg/TcgCollectionProgress';

const labels: TcgCollectionProgressProps['labels'] = {
  title: 'Progression',
  count: '{owned} / {pool} cartes',
  percent: '{percent} %',
  copies: '{count} exemplaires',
  progressAria: 'Progression de la collection',
  byRarityTitle: 'Par rarete',
  rarityCount: '{owned} / {pool}',
  complete: 'Collection complete',
  rarity: {
    common: 'Commune',
    rare: 'Rare',
    epic: 'Epique',
    legendary: 'Legendaire',
  },
};

function render(
  props: Omit<TcgCollectionProgressProps, 'labels'>
): string | null {
  const html = renderToString(
    createElement(TcgCollectionProgress, { ...props, labels })
  );
  return html === '' ? null : html;
}

describe('completionPercent', () => {
  it('rend un pourcentage entier', () => {
    expect(completionPercent(12, 48)).toBe(25);
  });

  it('ne rend 100 que si la collection est vraiment complete', () => {
    // 4799/4800 arrondit a 100 : ce serait annoncer la fin a une carte pres.
    expect(completionPercent(4799, 4800)).toBe(99);
    expect(completionPercent(4800, 4800)).toBe(100);
  });

  it('borne a 100 quand le vivier a retreci sous le nombre possede', () => {
    // Consentement retire / equipe dissoute : le vivier peut passer sous le
    // nombre de cartes deja distribuees.
    expect(completionPercent(117, 100)).toBe(100);
  });

  it('rend 0 sur un vivier nul plutot qu une division par zero', () => {
    expect(completionPercent(0, 0)).toBe(0);
    expect(Number.isNaN(completionPercent(5, 0))).toBe(false);
  });
});

describe('rarityRows', () => {
  it('masque toute la repartition sans vivier par rarete', () => {
    expect(rarityRows({ common: 3 }, null)).toEqual([]);
    expect(rarityRows({ common: 3 }, undefined)).toEqual([]);
  });

  it('compte zero pour un palier absent des possedes, si la table existe', () => {
    // La table des possedes fait autorite : palier absent = zero possede.
    const rows = rarityRows({ common: 3 }, { common: 10, legendary: 4 });
    expect(rows).toEqual([
      { rarity: 'common', owned: 3, pool: 10 },
      { rarity: 'legendary', owned: 0, pool: 4 },
    ]);
  });

  it('n invente rien quand la table des possedes est absente', () => {
    expect(rarityRows(null, { common: 10 })).toEqual([]);
  });

  it('ignore un palier au vivier vide, nul ou aberrant', () => {
    const rows = rarityRows(
      { common: 1, rare: 1, epic: 1, legendary: 1 },
      {
        common: 0,
        rare: Number.NaN,
        epic: -5,
        legendary: 4,
      }
    );
    expect(rows).toEqual([{ rarity: 'legendary', owned: 1, pool: 4 }]);
  });

  it('suit l ordre du plus courant au plus rare', () => {
    const rows = rarityRows({}, { legendary: 1, common: 1, epic: 1, rare: 1 });
    expect(rows.map((r) => r.rarity)).toEqual([
      'common',
      'rare',
      'epic',
      'legendary',
    ]);
  });
});

describe('TcgCollectionProgress', () => {
  it('affiche la progression en texte, pas seulement en largeur', () => {
    const html = render({
      owned: { distinct: 12, total: 30 },
      pool: { distinct: 48 },
    });
    expect(html).toContain('12 / 48 cartes');
    expect(html).toContain('25 %');
    // Le texte accessible redit la meme chose que la largeur.
    expect(html).toContain('aria-valuetext="12 / 48 cartes — 25 %"');
    expect(html).toContain('aria-valuenow="12"');
    expect(html).toContain('aria-valuemax="48"');
    expect(html).toContain('width:25%');
  });

  it('masque la barre quand le vivier est inconnu, sans afficher 0 / 0', () => {
    const html = render({ owned: { distinct: 4, total: 7 }, pool: null });
    expect(html).not.toContain('progressbar');
    expect(html).not.toContain('0 / 0');
    expect(html).not.toContain('NaN');
    // Les exemplaires, eux, restent affichables : ils n ont pas de denominateur.
    expect(html).toContain('7 exemplaires');
  });

  it('masque la barre sur un vivier a zero', () => {
    const html = render({
      owned: { distinct: 0, total: 0 },
      pool: { distinct: 0 },
    });
    expect(html).not.toContain('progressbar');
    expect(html).not.toContain('0 / 0');
  });

  it('ne rend rien du tout quand aucune donnee n est exploitable', () => {
    // Pas de cadre vide : un bloc « progression » sans chiffre pose la
    // question qu il pretend resoudre.
    expect(render({ owned: null, pool: null })).toBeNull();
    expect(
      render({ owned: { distinct: undefined, total: null }, pool: {} })
    ).toBeNull();
  });

  it('resiste a des nombres aberrants sans afficher NaN', () => {
    const html = render({
      owned: { distinct: Number.NaN, total: Number.POSITIVE_INFINITY },
      pool: { distinct: -3 },
    });
    expect(html ?? '').not.toContain('NaN');
    expect(html ?? '').not.toContain('Infinity');
  });

  it('annonce la collection complete', () => {
    const html = render({
      owned: { distinct: 48, total: 90 },
      pool: { distinct: 48 },
    });
    expect(html).toContain('Collection complete');
    expect(html).toContain('width:100%');
  });

  it('dit les nombres reels meme quand la barre est bornee', () => {
    // Vivier retreci : la barre plafonne, le texte ne ment pas.
    const html = render({
      owned: { distinct: 117, total: 200 },
      pool: { distinct: 100 },
    });
    expect(html).toContain('117 / 100 cartes');
    expect(html).toContain('width:100%');
  });

  it('rend une ligne par rarete du vivier, barres masquees aux lecteurs', () => {
    const html = render({
      owned: { distinct: 5, total: 9, byRarity: { common: 4, epic: 1 } },
      pool: { distinct: 20, byRarity: { common: 10, epic: 6, legendary: 4 } },
    });
    expect(html).toContain('Commune');
    expect(html).toContain('4 / 10');
    expect(html).toContain('1 / 6');
    // Palier jamais obtenu : dit, pas masque — c est un objectif.
    expect(html).toContain('Legendaire');
    expect(html).toContain('0 / 4');
    // Rare absent du vivier : aucune ligne.
    expect(html).not.toContain('Rare</span>');
    expect(html).toContain('aria-hidden="true"');
  });

  it('reprend la palette de TcgCard et n en invente pas une seconde', () => {
    const html = render({
      owned: { distinct: 1, total: 1, byRarity: { legendary: 1 } },
      pool: { distinct: 4, byRarity: { legendary: 4 } },
    });
    // Teinte legendaire = celle de TcgCard ; le remplissage suit via bg-current.
    expect(html).toContain('text-cyan-200');
    expect(html).toContain('bg-current');
  });

  it('respecte prefers-reduced-motion sur les barres animees', () => {
    const html = render({
      owned: { distinct: 1, total: 1 },
      pool: { distinct: 4 },
    });
    expect(html).toContain('motion-reduce:transition-none');
  });
});
