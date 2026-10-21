// @vitest-environment happy-dom
//
// Niveau, attaque, défense sur la face d'une carte (lot 11 de
// docs/PLAN-tcg-2.md), contre les formes rendues par conference-api.
//
// LES VALEURS SONT FIGÉES EN LITTÉRAL, les mêmes que côté API
// (`tcgCollectionApi.test.ts`, `tcgPacksApi.test.ts`, `tcgLive.test.ts`,
// `tcgTradesApi.test.ts`) : une retouche du barème fait tomber les deux côtés.
//
// Ce que ces cas protègent :
//   - la ligne est du TEXTE : niveau écrit, ATK et DEF en chiffres, et une
//     phrase entière pour le lecteur d'écran (les étoiles et « ATK » sont
//     décoratifs pour lui) ;
//   - chaque projection de l'écran (collection, révélation, vitrine, échanges)
//     fait suivre `stats` jusqu'à la carte ;
//   - une réponse d'avant (sans `stats`) ou un écran sans libellés : pas de
//     ligne, jamais des chiffres inventés ni une langue en dur ;
//   - les cartes qui ne sont pas un exemplaire (fiche, catalogue) calculent
//     les MÊMES chiffres avec le module pur partagé.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import TcgCard, { type TcgCardProps } from '@/components/tcg/TcgCard';
import TcgCardStatsLine from '@/components/tcg/TcgCardStatsLine';
import { tcgCardStatsLabels } from '@/components/tcg/tcgCardStatsLabels';
import { showcaseCardSubject } from '@/components/tcg/TcgShowcaseSection';
import { collectionToShowcaseCard } from '@/components/tcg/TcgShowcaseEditor';
import {
  cardSubject,
  type CollectionCard,
  type DrawnCard,
} from '@/features/player/tcg/model';
import {
  subjectOf,
  type TradeCardView,
} from '@/features/player/tcg/tradeModel';
import { cardStats } from '@/utils/tcg/cardStats';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import enPlayerTcg from '@/lib/i18n/locales/en/playerTcg';

beforeEach(() => {
  vi.spyOn(window, 'fetch').mockResolvedValue(
    new Response(null, { status: 204 })
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Les littéraux du barème — ceux des tests de conference-api. */
const COMMON_BULWARK = {
  level: 3,
  attack: 1000,
  defense: 1400,
  profile: 'bulwark',
} as const;
const RARE_ASSAULT = {
  level: 4,
  attack: 1800,
  defense: 1200,
  profile: 'assault',
} as const;
const EPIC_BULWARK = {
  level: 6,
  attack: 1600,
  defense: 2400,
  profile: 'bulwark',
} as const;
const LEGENDARY_BALANCED = {
  level: 8,
  attack: 2500,
  defense: 2500,
  profile: 'balanced',
} as const;

const fr = nsPlayerTcg.fr;
const labels: TcgCardProps['labels'] = {
  rarity: {
    common: fr.rarityCommon,
    rare: fr.rarityRare,
    epic: fr.rarityEpic,
    legendary: fr.rarityLegendary,
  },
  foil: fr.foil,
  copies: fr.copies,
  stats: tcgCardStatsLabels(fr),
};

/** Une carte de joueuse de la collection, telle que la rend l'API. */
const COLLECTION_PLAYER: CollectionCard = {
  kind: 'player',
  userId: 'aaaaaaaa-0000-4000-8000-000000000001',
  displayName: 'Akira',
  imageUrl: null,
  figure: null,
  rarity: 'common',
  isFoil: true,
  count: 1,
  recyclable: null,
  stats: COMMON_BULWARK,
};

describe('TcgCard — la ligne de chiffres', () => {
  it('écrit le niveau, l’attaque et la défense en texte réel', () => {
    render(
      <TcgCard
        subject={cardSubject(COLLECTION_PLAYER)}
        rarity="common"
        isFoil
        stats={COMMON_BULWARK}
        labels={labels}
      />
    );
    const line = screen.getByTestId('tcg-card-stats');
    expect(line.textContent).toContain('Niv. 3');
    expect(line.textContent).toContain('ATK 1000');
    expect(line.textContent).toContain('DEF 1400');
    // Trois étoiles pour le niveau 3 — décoratives.
    expect(line.textContent).toContain('★★★');
    expect(line.textContent).not.toContain('★★★★');
  });

  it('dit la phrase entière au lecteur d’écran ; la ligne abrégée lui est cachée', () => {
    render(
      <TcgCard
        subject={cardSubject(COLLECTION_PLAYER)}
        rarity="common"
        stats={COMMON_BULWARK}
        labels={labels}
      />
    );
    const line = screen.getByTestId('tcg-card-stats');
    const sentence = within(line).getByText(
      'Niveau 3, attaque 1000, défense 1400'
    );
    expect(sentence.className).toContain('sr-only');
    for (const p of line.querySelectorAll('p')) {
      expect(p.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('huit étoiles pour une légendaire, sans rien tronquer', () => {
    render(
      <TcgCard
        subject={{
          kind: 'team',
          teamId: 't1',
          name: 'Hinode',
          slug: null,
          logoUrl: null,
        }}
        rarity="legendary"
        stats={LEGENDARY_BALANCED}
        labels={labels}
      />
    );
    const line = screen.getByTestId('tcg-card-stats');
    expect(line.textContent).toContain('★'.repeat(8));
    expect(line.textContent).toContain('Niv. 8');
    // Aucune troncature : la ligne passe à la ligne, elle ne coupe pas.
    expect(line.innerHTML).not.toContain('truncate');
  });

  it('la vue agrandie dit le profil ; la vignette non', () => {
    const { unmount } = render(
      <TcgCard
        subject={cardSubject(COLLECTION_PLAYER)}
        rarity="common"
        stats={COMMON_BULWARK}
        labels={labels}
        fullDescription
      />
    );
    expect(screen.getByText('Profil : Rempart')).toBeTruthy();
    unmount();
    render(
      <TcgCard
        subject={cardSubject(COLLECTION_PLAYER)}
        rarity="common"
        stats={COMMON_BULWARK}
        labels={labels}
      />
    );
    expect(screen.queryByText('Profil : Rempart')).toBeNull();
  });

  it('en anglais, mêmes chiffres, autres mots', () => {
    render(
      <TcgCardStatsLine
        stats={RARE_ASSAULT}
        labels={tcgCardStatsLabels(enPlayerTcg as typeof fr)}
        showProfile
      />
    );
    const line = screen.getByTestId('tcg-card-stats');
    expect(line.textContent).toContain('Lv. 4');
    expect(line.textContent).toContain('ATK 1800');
    expect(line.textContent).toContain('DEF 1200');
    expect(screen.getByText('Level 4, attack 1800, defense 1200')).toBeTruthy();
    expect(screen.getByText('Stance: Assault')).toBeTruthy();
  });

  it('sans chiffres (réponse d’avant) ou sans libellés : aucune ligne', () => {
    const { unmount } = render(
      <TcgCard
        subject={cardSubject(COLLECTION_PLAYER)}
        rarity="common"
        labels={labels}
      />
    );
    expect(screen.queryByTestId('tcg-card-stats')).toBeNull();
    unmount();
    const { stats: _omit, ...noStatsLabels } = labels;
    render(
      <TcgCard
        subject={cardSubject(COLLECTION_PLAYER)}
        rarity="common"
        stats={COMMON_BULWARK}
        labels={noStatsLabels}
      />
    );
    expect(screen.queryByTestId('tcg-card-stats')).toBeNull();
  });
});

describe('les projections font suivre `stats`', () => {
  it('collection → vitrine : les chiffres de l’exemplaire suivent l’étalement', () => {
    const showcase = collectionToShowcaseCard(COLLECTION_PLAYER);
    expect(showcase.stats).toEqual(COMMON_BULWARK);
    // La face, elle, ne porte pas les chiffres : ils passent à côté.
    expect(showcaseCardSubject(showcase)).not.toHaveProperty('stats');
  });

  it('révélation d’un paquet : la forme rendue par POST /packs', () => {
    const drawn: DrawnCard = {
      position: 0,
      kind: 'hero',
      slug: 'sigma',
      name: 'Sigma',
      role: 'Tank',
      rarity: 'epic',
      isFoil: false,
      isNew: true,
      stats: EPIC_BULWARK,
    };
    render(
      <TcgCard
        subject={cardSubject(drawn)}
        rarity={drawn.rarity}
        stats={drawn.stats}
        labels={labels}
      />
    );
    expect(screen.getByTestId('tcg-card-stats').textContent).toContain(
      'ATK 1600'
    );
  });

  it('échange : une carte demandée sans exemplaire n’a pas de chiffres', () => {
    const requested = {
      kind: 'map',
      slug: 'kings-row',
      name: "King's Row",
      imageUrl: null,
      rarity: null,
      isFoil: null,
      stats: null,
    } as TradeCardView;
    render(
      <TcgCard
        subject={subjectOf(requested)}
        rarity={requested.rarity ?? 'common'}
        stats={requested.stats ?? null}
        labels={labels}
      />
    );
    expect(screen.queryByTestId('tcg-card-stats')).toBeNull();
  });
});

describe('cartes qui ne sont pas un exemplaire : le même module pur', () => {
  it('fiche d’équipe, catalogue, association : les littéraux du barème', () => {
    expect(cardStats({ kind: 'team', rarity: 'legendary' })).toEqual(
      LEGENDARY_BALANCED
    );
    expect(cardStats({ kind: 'map', rarity: 'common' })).toEqual(
      COMMON_BULWARK
    );
    expect(cardStats({ kind: 'fanart', rarity: 'rare' })).toEqual(RARE_ASSAULT);
  });

  it('fiche joueuse : le rôle de SA figurine, la rareté de ses badges', () => {
    expect(
      cardStats({ kind: 'player', rarity: 'common', role: 'tank' })
    ).toEqual(COMMON_BULWARK);
    // Sans figurine (aucun rôle connu, ou retirée) : Équilibre.
    expect(
      cardStats({ kind: 'player', rarity: 'legendary', role: null })
    ).toEqual(LEGENDARY_BALANCED);
  });
});
