// @vitest-environment happy-dom
//
// Une carte de PARTENAIRE (catégorie « L'association ») porte un crédit qui
// renvoie sur le site du partenaire — sur les surfaces publiques qui lisent
// ces cartes elles-mêmes, hors du lecteur de faces de l'API :
//   - le catalogue `/tcg` (getStaticProps → `creditUrl`, grille et section
//     « L'association ») ;
//   - le bloc TCG de l'accueil (`homeCardSubject`).
// Targets : pages/tcg.tsx, components/tcg/landing/TcgAssociationSection.tsx,
//           components/Home/HomeTcgShowcase.tsx, utils/tcg/readHomeTcgShowcase.ts
//
// HTTPS SEULEMENT : `artist_url` est relu à travers
// `displayableLogoCreditUrl` (un `http:` écrit à la main ne devient pas un
// lien), et `LogoCredit` revérifie au rendu. Côté route, l'écriture est
// testée dans conference-api (`tcgAssociationPartners.test.ts`).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

type Result = { data?: unknown; count?: number | null; error: unknown };
const results: Record<string, Result> = {};

function chain(table: string) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'or', 'order', 'limit']) {
    q[m] = () => q;
  }
  q.then = (onOk: (r: Result) => unknown, onKo?: (e: unknown) => unknown) =>
    Promise.resolve(results[table] ?? { data: [], error: null }).then(
      onOk,
      onKo
    );
  return q;
}

vi.mock('@/utils/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => chain(table),
    storage: {
      from: () => ({
        getPublicUrl: (p: string) => ({
          data: { publicUrl: `https://cdn.test/${p}` },
        }),
      }),
    },
  },
}));
vi.mock('@/utils/tcg/readCardFaces', () => ({
  readTeamFaces: async () => new Map(),
}));
vi.mock('@/utils/tcg/readTeamRarity', () => ({
  readTeamRarities: async () => new Map(),
}));
vi.mock('@/utils/logger', () => ({
  logger: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));

import { getStaticProps } from '@/pages/tcg';
import TcgAssociationSection, {
  type AssociationCardView,
} from '@/components/tcg/landing/TcgAssociationSection';
import type { TcgCardProps } from '@/components/tcg/TcgCard';
import { homeCardSubject } from '@/components/Home/HomeTcgShowcase';
import type { HomeTcgCard } from '@/utils/tcg/readHomeTcgShowcase';

const labels: TcgCardProps['labels'] = {
  rarity: { common: 'C', rare: 'R', epic: 'E', legendary: 'L' },
  foil: 'F',
  copies: '×{count}',
  logoCredit: 'Logo : {artist}',
  associationCredit: 'Crédit : {artist}',
  association: 'L’association',
};

const ACME: AssociationCardView = {
  id: 'a1',
  name: 'Acme Esport',
  imageUrl: null,
  credit: 'Acme Esport',
  creditUrl: 'https://acme.example/',
  description: null,
  rarity: 'rare',
};

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  results.teams = { data: [], error: null };
  results.player_ratings = { data: null, count: 0, error: null };
});
afterEach(cleanup);

describe('/tcg — getStaticProps', () => {
  it('porte le lien https du crédit, jamais un http', async () => {
    results.tcg_fanart_cards = {
      data: [
        {
          id: 'a1',
          title: 'Acme Esport',
          artist_name: 'Acme Esport',
          artist_url: 'https://acme.example/',
          image_path: 'tcg-association/acme.png',
          rarity: 'rare',
          description: null,
        },
        {
          id: 'a2',
          title: 'Plain',
          artist_name: 'Plain',
          artist_url: 'http://plain.example/',
          image_path: 'tcg-association/plain.png',
          rarity: 'rare',
          description: null,
        },
        {
          id: 'a3',
          title: 'Le nœud',
          artist_name: 'L’association',
          artist_url: null,
          image_path: 'tcg-association/noeud.svg',
          rarity: 'epic',
          description: null,
        },
      ],
      error: null,
    };
    const r = (await getStaticProps({} as never)) as any;
    const byId = Object.fromEntries(
      r.props.cards
        .filter((c: { kind: string }) => c.kind === 'association')
        .map((c: { id: string }) => [c.id, c])
    );
    expect(byId.a1).toMatchObject({
      credit: 'Acme Esport',
      creditUrl: 'https://acme.example/',
    });
    expect(byId.a2.creditUrl).toBeNull();
    // `null`, pas `undefined` : Next refuse `undefined` dans des props ISR.
    expect(byId.a3.creditUrl).toBeNull();
  });
});

describe('TcgAssociationSection — crédit d’un partenaire', () => {
  it('le nom du partenaire est un lien vers son site', () => {
    render(<TcgAssociationSection cards={[ACME]} labels={labels} />);
    const link = screen.getByRole('link', { name: 'Acme Esport' });
    expect(link.getAttribute('href')).toBe('https://acme.example/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.closest('p')?.textContent).toBe('Crédit : Acme Esport');
  });

  it('sans lien (ou un lien non https) : le nom, sans lien', () => {
    const { container } = render(
      <TcgAssociationSection
        cards={[
          { ...ACME, id: 'a2', creditUrl: 'http://acme.example/' },
          { ...ACME, id: 'a3', creditUrl: undefined },
        ]}
        labels={labels}
      />
    );
    expect(container.querySelector('a[href]')).toBeNull();
    expect(screen.getAllByText('Acme Esport').length).toBeGreaterThan(0);
  });
});

describe('accueil — homeCardSubject', () => {
  const card: Extract<HomeTcgCard, { kind: 'association' }> = {
    kind: 'association',
    id: 'a1',
    name: 'Acme Esport',
    imageUrl: null,
    credit: 'Acme Esport',
    creditUrl: 'https://acme.example/',
    description: null,
    rarity: 'rare',
  };

  it('passe le lien du crédit à la carte', () => {
    expect(homeCardSubject(card)).toMatchObject({
      kind: 'fanart',
      category: 'association',
      artistName: 'Acme Esport',
      artistUrl: 'https://acme.example/',
    });
  });

  it('une réponse d’avant (sans lien) reste une carte sans lien', () => {
    const { creditUrl: _omit, ...legacy } = card;
    expect(homeCardSubject(legacy)).toMatchObject({ artistUrl: null });
  });
});
