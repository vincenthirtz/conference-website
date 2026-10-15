// @vitest-environment happy-dom
//
// La carte HÉROS côté écran, contre les formes rendues par conference-api
// (`kind: 'hero'`, `slug`, `name`, `role` — cf. `tcgHeroCards.test.ts` côté
// API, mêmes valeurs).
//
// Ce que ces cas protègent :
//   - la face : la figurine du héros (la même route que celle des joueuses),
//     son nom, son rôle — traduit quand l'écran fournit `labels.roles`, le mot
//     du jeu sinon ; et AUCUN lien (un héros n'a pas de page) ;
//   - chaque projection de l'écran (collection, révélation, échanges, vitrine,
//     vue staff) garde le héros sous SON type — le travers des mascottes, qui
//     ressortaient « équipe » avec une clé `undefined` partagée ;
//   - le catalogue staff range les héros dans leur groupe « Héros ».

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { adminRequest } = vi.hoisted(() => ({ adminRequest: vi.fn() }));
vi.mock('@/utils/admin/adminHttp', () => ({ adminRequest }));
vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/admin/tcg', query: {}, push: vi.fn() }),
}));

import TcgCard, { type TcgCardProps } from '@/components/tcg/TcgCard';
import { showcaseCardSubject } from '@/components/tcg/TcgShowcaseSection';
import { collectionToShowcaseCard } from '@/components/tcg/TcgShowcaseEditor';
import TcgCataloguePanel from '@/components/admin/tcg/TcgCataloguePanel';
import {
  cardLabel,
  cardSubject,
  subjectKey,
  type CollectionCard,
  type DrawnCard,
} from '@/features/player/tcg/model';
import {
  keyOf,
  subjectOf,
  subjectRefOf,
  type TradeCardView,
} from '@/features/player/tcg/tradeModel';
import { normalizeTcgOverview } from '@/utils/tcg/overviewModel';
import { HERO_FIGURE_VERSION } from '@/utils/tcg/heroFigures';
import nsAdminTcgPage from '@/lib/i18n/locales/admin-fr/adminTcgPage';

beforeEach(() => {
  // happy-dom charge vraiment la source de chaque <img> (figurines) via
  // window.fetch : une réponse vide évite le bruit ECONNREFUSED en sortie.
  vi.spyOn(window, 'fetch').mockResolvedValue(
    new Response(null, { status: 204 })
  );
});

afterEach(() => {
  cleanup();
  adminRequest.mockReset();
  vi.restoreAllMocks();
});

const labels: TcgCardProps['labels'] = {
  rarity: {
    common: 'Commune',
    rare: 'Rare',
    epic: 'Épique',
    legendary: 'Légendaire',
  },
  foil: 'Brillante',
  copies: '×{count}',
};
const FIGURE = `/api/tcg/hero/v${HERO_FIGURE_VERSION}/junkerqueen.svg`;

/** Une carte héros de la collection, telle que la rend l'API. */
const COLLECTION_HERO: CollectionCard = {
  kind: 'hero',
  slug: 'junkerqueen',
  name: 'Junker Queen',
  role: 'Tank',
  rarity: 'rare',
  isFoil: false,
  count: 2,
  recyclable: { packId: 'p1', position: 4 },
};

describe('TcgCard — la face d’une carte héros', () => {
  it('montre la figurine du héros, son nom, son rôle, sans lien', () => {
    const { container } = render(
      <TcgCard
        subject={{
          kind: 'hero',
          slug: 'junkerqueen',
          name: 'Junker Queen',
          role: 'Tank',
        }}
        rarity="rare"
        labels={labels}
      />
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(FIGURE);
    expect(screen.getByText('Junker Queen')).toBeTruthy();
    expect(screen.getByText('Tank')).toBeTruthy();
    expect(screen.getByText('Rare')).toBeTruthy();
    // Aucune page par héros : la carte est un article, jamais un lien.
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('article')).not.toBeNull();
  });

  it('traduit le rôle quand l’écran fournit `labels.roles`', () => {
    render(
      <TcgCard
        subject={{
          kind: 'hero',
          slug: 'mercy',
          name: 'Mercy',
          role: 'Support',
        }}
        rarity="rare"
        labels={{
          ...labels,
          roles: { tank: 'Tank', damage: 'Dégâts', support: 'Soutien' },
        }}
      />
    );
    expect(screen.getByText('Soutien')).toBeTruthy();
    expect(screen.queryByText('Support')).toBeNull();
  });

  it('sans `labels.roles`, écrit le mot du jeu plutôt que rien', () => {
    render(
      <TcgCard
        subject={{
          kind: 'hero',
          slug: 'cassidy',
          name: 'Cassidy',
          role: 'Damage',
        }}
        rarity="rare"
        labels={labels}
      />
    );
    expect(screen.getByText('Damage')).toBeTruthy();
  });

  it('un héros sorti du registre retombe sur l’aplat, jamais sur une image cassée', () => {
    const { container } = render(
      <TcgCard
        subject={{ kind: 'hero', slug: 'disparu', name: null, role: null }}
        rarity="rare"
        labels={labels}
      />
    );
    for (const img of container.querySelectorAll('img')) {
      expect(img.getAttribute('src')).not.toContain('/api/tcg/hero/');
    }
  });
});

describe('les projections de l’écran gardent le héros sous SON type', () => {
  it('collection et révélation', () => {
    const drawn: DrawnCard = {
      position: 4,
      isNew: true,
      kind: 'hero',
      slug: 'junkerqueen',
      name: 'Junker Queen',
      role: 'Tank',
      rarity: 'rare',
      isFoil: false,
    };
    for (const card of [COLLECTION_HERO, drawn]) {
      expect(cardSubject(card)).toEqual({
        kind: 'hero',
        slug: 'junkerqueen',
        name: 'Junker Queen',
        role: 'Tank',
      });
      // Un préfixe propre au héros : jamais `t-undefined` partagé.
      expect(subjectKey(card)).toBe('h-junkerqueen');
    }
    expect(cardLabel(COLLECTION_HERO)).toBe('Junker Queen');
    expect(cardLabel({ ...COLLECTION_HERO, name: null })).toBe('junkerqueen');
  });

  it('échanges : clé, sujet proposé et face', () => {
    const card = {
      kind: 'hero',
      slug: 'sigma',
      name: 'Sigma',
      role: 'Tank',
      rarity: 'rare',
      isFoil: false,
    } as TradeCardView;
    expect(keyOf(card)).toBe('hero:sigma');
    expect(subjectRefOf(card)).toEqual({ kind: 'hero', id: 'sigma' });
    expect(subjectOf(card)).toEqual({
      kind: 'hero',
      slug: 'sigma',
      name: 'Sigma',
      role: 'Tank',
    });
  });

  it('vitrine : la clé serveur, et la face', () => {
    const showcase = collectionToShowcaseCard(COLLECTION_HERO as never);
    expect(showcase.key).toBe('hero:junkerqueen');
    expect(showcaseCardSubject(showcase)).toEqual({
      kind: 'hero',
      slug: 'junkerqueen',
      name: 'Junker Queen',
      role: 'Tank',
    });
  });

  it('vue staff : un héros n’est pas écarté, ni rendu cliquable', () => {
    const model = normalizeTcgOverview({
      topSubjects: [
        {
          kind: 'hero',
          slug: 'ana',
          name: 'Ana',
          imageUrl: '/api/tcg/hero/v1/ana.svg',
          count: 4,
          foilCount: 1,
        },
      ],
    });
    expect(model.topSubjects).toHaveLength(1);
    expect(model.topSubjects[0]).toMatchObject({
      kind: 'hero',
      id: 'ana',
      href: null,
    });
  });
});

describe('catalogue staff — le groupe « Héros »', () => {
  it('range les cartes héros sous leur propre titre', async () => {
    adminRequest.mockResolvedValue({
      cards: [
        {
          key: 'mascot:pachimari',
          kind: 'mascot',
          id: 'pachimari',
          label: 'Pachimari',
          imageUrl: '/api/tcg/mascot/v1/pachimari.svg',
          owned: false,
          holders: 3,
        },
        {
          key: 'hero:reinhardt',
          kind: 'hero',
          id: 'reinhardt',
          label: 'Reinhardt',
          role: 'Tank',
          imageUrl: '/api/tcg/hero/v1/reinhardt.svg',
          owned: false,
          holders: 0,
        },
      ],
      total: 2,
      ownedCount: 0,
      userId: null,
    });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <TcgCataloguePanel />
      </QueryClientProvider>
    );

    const t = nsAdminTcgPage.fr;
    expect(
      await screen.findByText(`${t.catalogueKindHeroes} · 1`)
    ).toBeTruthy();
    expect(screen.getByText(`${t.catalogueKindMascots} · 1`)).toBeTruthy();
    expect(screen.getByText('Reinhardt')).toBeTruthy();
  });
});
