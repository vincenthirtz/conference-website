// @vitest-environment happy-dom
//
// Le TCG trouvable côté public : le bloc de l'accueil, et l'entrée « Cartes »
// de la navigation et du pied de page.
// Targets : components/Home/HomeTcgShowcase.tsx,
//           utils/tcg/readHomeTcgShowcase.ts (choix des cartes, purs),
//           components/Footer/footer.tsx, lib/i18n/locales/*/homeTcg.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

let mockUser: { id: string } | null = null;
vi.mock('@/hooks/useAuthSession', () => ({
  useAuthSession: () => ({ user: mockUser, loading: false }),
}));

import HomeTcgShowcase, {
  startCollectionHref,
} from '@/components/Home/HomeTcgShowcase';
import Footer from '@/components/Footer/footer';
import {
  HOME_TCG_COINS,
  pickAssociationRow,
  pickMapCard,
  pickTeamCard,
  type HomeTcgCard,
  type HomeTcgShowcase as ShowcaseData,
} from '@/utils/tcg/readHomeTcgShowcase';
import { MATCH_LOSS_COINS, MATCH_WIN_COINS } from '@/utils/tcg/economy';
import { TOURNAMENT_PARTICIPATION_COINS } from '@/utils/tcg/earnSources';
import nsHomeTcg from '@/lib/i18n/locales/fr/homeTcg';
import enHomeTcg from '@/lib/i18n/locales/en/homeTcg';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import enPlayerTcg from '@/lib/i18n/locales/en/playerTcg';

afterEach(cleanup);
beforeEach(() => {
  mockUser = null;
});

const TEAM: Extract<HomeTcgCard, { kind: 'team' }> = {
  kind: 'team',
  id: 't1',
  name: 'Chocomates',
  slug: 'chocomates',
  logoUrl: 'https://cdn.example/choco.png',
  cardImageUrl: null,
  logoCredit: null,
  rarity: 'epic',
};
const ARUKDO: Extract<HomeTcgCard, { kind: 'association' }> = {
  kind: 'association',
  id: 'a1',
  name: 'Arukdo',
  imageUrl: null,
  credit: 'Arukdo',
  description: null,
  rarity: 'rare',
};
const MAP = pickMapCard(new Date('2026-10-12T12:00:00Z'))!;

function showcase(over: Partial<ShowcaseData> = {}): ShowcaseData {
  return {
    cards: [TEAM, ARUKDO, MAP],
    totalCards: 1234,
    coins: HOME_TCG_COINS,
    ...over,
  };
}

describe('HomeTcgShowcase — rendu', () => {
  it('trois cartes réelles, dont la rare de l’association', () => {
    render(<HomeTcgShowcase showcase={showcase()} />);
    const list = screen.getByRole('list', { name: nsHomeTcg.fr.cardsAria });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getAllByText('Arukdo').length).toBeGreaterThan(0);
    expect(within(list).getByText(nsHomeTcg.fr.rarityRare)).toBeTruthy();
    // La carte d'équipe mène à sa fiche, comme sur le catalogue.
    expect(list.querySelector('a[href="/team/chocomates"]')).not.toBeNull();
  });

  it('annonce le total, formaté selon la langue', () => {
    render(<HomeTcgShowcase showcase={showcase()} />);
    const total = document.querySelector('[data-test="home-tcg-total"]');
    // fr-FR : espace insécable fine comme séparateur de milliers.
    expect(total?.textContent?.replace(/\s/g, ' ')).toMatch(
      /1 234 cartes à collectionner/
    );
  });

  it('dit le barème réel : victoire, défaite, participation, classement', () => {
    render(<HomeTcgShowcase showcase={showcase()} />);
    const text = document.body.textContent ?? '';
    expect(MATCH_LOSS_COINS).toBe(100);
    expect(text).toContain(`Une victoire rapporte ${MATCH_WIN_COINS} pièces`);
    expect(text).toContain(`une défaite aussi, ${MATCH_LOSS_COINS}`);
    expect(text.replace(/\s/g, ' ')).toContain(
      `en rapporte ${TOURNAMENT_PARTICIPATION_COINS.toLocaleString('fr-FR').replace(/\s/g, ' ')}`
    );
    expect(text).not.toMatch(/\{(win|loss|participation|top)\}/);
  });

  it('anonyme : CTA vers l’inscription avec retour au TCG, et lien de connexion', () => {
    render(<HomeTcgShowcase showcase={showcase()} />);
    const cta = screen.getByRole('link', { name: nsHomeTcg.fr.ctaStart });
    expect(cta.getAttribute('href')).toBe('/register?next=%2Fplayer%2Ftcg');
    const login = screen.getByRole('link', { name: nsHomeTcg.fr.ctaLogin });
    expect(login.getAttribute('href')).toBe('/login?next=%2Fplayer%2Ftcg');
    expect(
      screen
        .getByRole('link', { name: nsHomeTcg.fr.ctaCatalog })
        .getAttribute('href')
    ).toBe('/tcg');
  });

  it('connectée : CTA droit vers l’espace TCG, sans lien de connexion', () => {
    mockUser = { id: 'u1' };
    render(<HomeTcgShowcase showcase={showcase()} />);
    expect(
      screen
        .getByRole('link', { name: nsHomeTcg.fr.ctaStart })
        .getAttribute('href')
    ).toBe('/player/tcg');
    expect(screen.queryByRole('link', { name: nsHomeTcg.fr.ctaLogin })).toBe(
      null
    );
  });

  it('dégradé : sans cartes ni total, le bloc reste une porte d’entrée', () => {
    render(
      <HomeTcgShowcase showcase={showcase({ cards: [], totalCards: null })} />
    );
    expect(screen.queryByRole('list')).toBeNull();
    expect(document.querySelector('[data-test="home-tcg-total"]')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 2, name: nsHomeTcg.fr.title })
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: nsHomeTcg.fr.ctaStart })
    ).toBeTruthy();
  });

  it('startCollectionHref : la règle seule', () => {
    expect(startCollectionHref(true)).toBe('/player/tcg');
    expect(startCollectionHref(false)).toBe('/register?next=%2Fplayer%2Ftcg');
  });
});

describe('choix des cartes mises en avant', () => {
  it('l’association : Arukdo d’abord, sinon la plus rare', () => {
    const rows = [
      { title: 'Octobre Rose', rarity: 'epic' as const },
      { title: 'Arukdo', rarity: 'rare' as const },
    ];
    expect(pickAssociationRow(rows)?.title).toBe('Arukdo');
    expect(
      pickAssociationRow([
        { title: 'A', rarity: 'common' as const },
        { title: 'B', rarity: 'legendary' as const },
      ])?.title
    ).toBe('B');
    expect(pickAssociationRow([])).toBeNull();
  });

  it('l’équipe : la plus rare qui a un visuel, de façon stable', () => {
    const base = { ...TEAM };
    const picked = pickTeamCard([
      {
        ...base,
        id: 'x',
        name: 'Sans visuel',
        logoUrl: null,
        rarity: 'legendary',
      },
      { ...base, id: 'y', name: 'Zèbres', rarity: 'epic' },
      { ...base, id: 'z', name: 'Abeilles', rarity: 'epic' },
      { ...base, id: 'w', name: 'Commune', rarity: 'common' },
    ]);
    expect(picked?.id).toBe('z');
  });

  it('la map tourne d’un jour sur l’autre, stable dans la journée', () => {
    const slugs = ['a', 'b', 'c'];
    const d1 = new Date('2026-10-12T01:00:00Z');
    const d1b = new Date('2026-10-12T23:00:00Z');
    const d2 = new Date('2026-10-13T01:00:00Z');
    expect(pickMapCard(d1, slugs)?.id).toBe(pickMapCard(d1b, slugs)?.id);
    expect(pickMapCard(d1, slugs)?.id).not.toBe(pickMapCard(d2, slugs)?.id);
    expect(pickMapCard(d1, [])).toBeNull();
  });
});

describe('libellés de carte : copie surveillée de playerTcg', () => {
  const KEYS = [
    'rarityCommon',
    'rarityRare',
    'rarityEpic',
    'rarityLegendary',
    'foil',
    'copies',
    'logoCredit',
    'cardAssociation',
  ] as const;
  it.each(KEYS)('%s identique en fr et en en', (key) => {
    expect(nsHomeTcg.fr[key]).toBe(nsPlayerTcg.fr[key]);
    expect(enHomeTcg[key]).toBe(enPlayerTcg[key]);
  });
});

describe('pied de page', () => {
  it('porte un lien vers le catalogue des cartes', () => {
    render(<Footer />);
    const footer = document.querySelector('[data-test="footer"]')!;
    const link = footer.querySelector('a[href="/tcg"]');
    expect(link?.textContent).toBe('Cartes à collectionner');
  });
});
