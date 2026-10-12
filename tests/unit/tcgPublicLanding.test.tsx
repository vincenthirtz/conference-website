// @vitest-environment happy-dom
//
// La vitrine publique `/tcg` : accroche, barème réel, association, point
// d'insertion des blocs « en action ».
// Targets : pages/tcg.tsx, utils/tcg/publicBareme.ts, components/tcg/landing/*,
//           components/tcg/live/index.tsx
//
// CE QUE CE FICHIER PROTÈGE AVANT TOUT : aucun montant du barème n'est écrit
// dans un texte. La page disait « jusqu'à trois paquets » pour le palmarès quand
// le champion en recevait cinq — un chiffre recopié diverge au premier réglage.

import { afterEach, describe, expect, it } from 'vitest';
import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import TcgCatalogPage from '@/pages/tcg';
import TcgLiveSections from '@/components/tcg/live';
import { buildEarnGroups } from '@/components/tcg/landing/TcgEarnSection';
import {
  pickFeaturedAssociationCards,
  type AssociationCardView,
} from '@/components/tcg/landing/TcgAssociationSection';
import {
  TCG_LOGIN_PATH,
  TCG_SPACE_PATH,
  startCtaHref,
} from '@/components/tcg/landing/TcgStartCta';
import {
  buildPublicTcgBareme,
  type PublicTcgBareme,
} from '@/utils/tcg/publicBareme';
import {
  BOOSTER_PRICE_COINS,
  MATCH_LOSS_COINS,
  MATCH_WIN_COINS,
} from '@/utils/tcg/economy';
import {
  PLACEMENT_TIERS,
  TOURNAMENT_PARTICIPATION_COINS,
} from '@/utils/tcg/earnSources';
import { PACK_SIZE } from '@/utils/tcg/drawPack';
import nsTcgCatalog from '@/lib/i18n/locales/fr/tcgCatalog';
import enTcgCatalog from '@/lib/i18n/locales/en/tcgCatalog';

afterEach(cleanup);

const bareme = buildPublicTcgBareme();

describe('buildPublicTcgBareme — lu des constantes, jamais recopié', () => {
  it('victoire, défaite, booster et taille de paquet', () => {
    expect(bareme.matchWin).toEqual({ coins: MATCH_WIN_COINS, packs: 1 });
    expect(bareme.matchLoss).toEqual({ coins: MATCH_LOSS_COINS, packs: 0 });
    expect(bareme.boosterPrice).toBe(BOOSTER_PRICE_COINS);
    expect(bareme.packSize).toBe(PACK_SIZE);
  });

  it('« N défaites suffisent » paie vraiment un booster', () => {
    expect(bareme.lossesPerBooster * MATCH_LOSS_COINS).toBeGreaterThanOrEqual(
      BOOSTER_PRICE_COINS
    );
    expect((bareme.lossesPerBooster - 1) * MATCH_LOSS_COINS).toBeLessThan(
      BOOSTER_PRICE_COINS
    );
  });

  it('palmarès : chaque palier, du champion au top cut', () => {
    expect(bareme.placements).toEqual(
      PLACEMENT_TIERS.map((tier) => ({
        badgeKey: tier.badgeKey,
        maxRank: tier.maxRank,
        coins: tier.coins,
        packs: tier.packs,
      }))
    );
  });

  it('la participation DNF reste sous chaque palier de palmarès', () => {
    expect(bareme.participation).toEqual({
      coins: TOURNAMENT_PARTICIPATION_COINS,
      packs: 0,
    });
    for (const tier of bareme.placements) {
      expect(tier.coins).toBeGreaterThan(bareme.participation.coins);
    }
  });

  it('sérialisable tel quel (props de getStaticProps)', () => {
    expect(JSON.parse(JSON.stringify(bareme))).toEqual(bareme);
  });
});

describe('textes de la vitrine — aucun chiffre en dur', () => {
  // Les clés ajoutées pour la vitrine : tout nombre doit passer par un
  // marqueur `{…}`, rempli depuis le barème.
  const LANDING = /^(hero|step|earn|reward|asso)/;
  const digitsOutsideMarkers = (v: string) =>
    /\d/.test(v.replace(/\{\w+\}/g, ''));

  it.each([
    ['fr', nsTcgCatalog.fr as Record<string, string>],
    ['en', enTcgCatalog as Record<string, string>],
  ])('%s', (_lang, dict) => {
    const offenders = Object.entries(dict)
      .filter(([k, v]) => LANDING.test(k) && digitsOutsideMarkers(v))
      .map(([k]) => k);
    expect(offenders).toEqual([]);
  });
});

describe('buildEarnGroups', () => {
  it('chaque montant affiché vient du barème', () => {
    const groups = buildEarnGroups(bareme, nsTcgCatalog.fr);
    const rows = groups.flatMap((g) => g.rows);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.match_win.coins).toBe(MATCH_WIN_COINS);
    expect(byKey.match_loss.coins).toBe(MATCH_LOSS_COINS);
    expect(byKey.placement_champion).toMatchObject({
      coins: PLACEMENT_TIERS[0].coins,
      packs: PLACEMENT_TIERS[0].packs,
    });
    expect(byKey.participation.coins).toBe(TOURNAMENT_PARTICIPATION_COINS);
    expect(byKey.placement_top_cut.label).toBe(
      `Top ${PLACEMENT_TIERS[PLACEMENT_TIERS.length - 1].maxRank}`
    );
  });

  it('une source qui ne rapporte rien disparaît au lieu d’afficher « +0 »', () => {
    const off: PublicTcgBareme = {
      ...bareme,
      battlenet: { coins: 0, packs: 0 },
    };
    const keys = buildEarnGroups(off, nsTcgCatalog.fr).flatMap((g) =>
      g.rows.map((r) => r.key)
    );
    expect(keys).not.toContain('battlenet');
    expect(keys).toContain('match_win');
  });
});

describe('pickFeaturedAssociationCards', () => {
  const card = (
    id: string,
    rarity: AssociationCardView['rarity'],
    description: string | null = null
  ): AssociationCardView => ({
    id,
    name: id,
    imageUrl: null,
    credit: null,
    description,
    rarity,
  });

  it('les plus rares d’abord, puis celles qui ont une description', () => {
    const picked = pickFeaturedAssociationCards([
      card('a', 'common', 'texte'),
      card('b', 'rare'),
      card('c', 'rare', 'Arukdo organise la Cup.'),
      card('d', 'legendary'),
    ]);
    expect(picked.map((c) => c.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('plafonne la mise en avant', () => {
    const many = Array.from({ length: 12 }, (_, i) => card(`x${i}`, 'common'));
    expect(pickFeaturedAssociationCards(many, 8)).toHaveLength(8);
  });
});

describe('CTA « Commencer ma collection »', () => {
  it('connectée : l’espace TCG ; sinon : connexion avec retour', () => {
    expect(startCtaHref(true)).toBe(TCG_SPACE_PATH);
    expect(startCtaHref(false)).toBe(TCG_LOGIN_PATH);
    expect(TCG_LOGIN_PATH).toBe('/login?next=/player/tcg');
  });
});

describe('TcgLiveSections — point d’insertion vide', () => {
  it('ne rend rien tant qu’aucun bloc n’est branché', () => {
    const { container } = render(<TcgLiveSections />);
    expect(container.innerHTML).toBe('');
  });
});

describe('/tcg — la page entière', () => {
  type PageProps = ComponentProps<typeof TcgCatalogPage>;
  const props = {
    bareme,
    playerCount: 12,
    seo: { title: { fr: 't', en: 't' } },
    cards: [
      {
        kind: 'map' as const,
        id: 'ilios',
        name: 'Ilios',
        imageUrl: null,
        rarity: 'common' as const,
      },
      ...Array.from({ length: 10 }, (_, i) => ({
        kind: 'association' as const,
        id: `asso-${i}`,
        name: i === 0 ? 'Arukdo' : `Bénévole ${i}`,
        imageUrl: null,
        credit: null,
        description: i === 0 ? 'Arukdo organise la Cup.' : null,
        rarity: i === 0 ? ('rare' as const) : ('common' as const),
      })),
    ],
  } satisfies PageProps;

  it('accroche, CTA, barème et association avec sa description', () => {
    render(<TcgCatalogPage {...props} />);
    expect(screen.getByRole('heading', { level: 1, name: /TCG/ })).toBeTruthy();
    // Anonyme au rendu : le CTA vise la connexion avec retour.
    const ctas = screen.getAllByRole('link', {
      name: 'Commencer ma collection',
    });
    expect(ctas.length).toBeGreaterThan(0);
    for (const a of ctas) expect(a.getAttribute('href')).toBe(TCG_LOGIN_PATH);

    expect(
      screen.getByRole('heading', { name: 'Comment gagner des pièces' })
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Lire le guide détaillé' })
    ).toHaveProperty('pathname', '/player/tcg-guide');

    expect(
      screen.getByRole('heading', { name: 'L’équipe derrière la Cup' })
    ).toBeTruthy();
    // Présente dans la section ET dans le catalogue.
    expect(
      screen.getAllByText('Arukdo organise la Cup.').length
    ).toBeGreaterThan(0);
  });

  it('« voir toutes » bascule le catalogue sur l’association', () => {
    render(<TcgCatalogPage {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Voir les 10 cartes/ }));
    expect(
      screen
        .getByRole('button', { name: 'L’association' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(document.activeElement?.id).toBe('tcg-catalog-title');
  });

  it('sans carte de l’association : pas de section vide', () => {
    render(<TcgCatalogPage {...props} cards={props.cards.slice(0, 1)} />);
    expect(
      screen.queryByRole('heading', { name: 'L’équipe derrière la Cup' })
    ).toBeNull();
  });
});
