// tests/unit/tcgLogoCreditScreens.test.ts
//
// Le crédit du logo d'équipe sur TOUS les écrans où l'on voit des cartes TCG.
//
// POURQUOI UN FICHIER À PART DE `teamLogoCredit.test.ts`. Celui-là vérifie la
// règle (lecteur de faces, rendu de `TcgCard`). Celui-ci vérifie la TUYAUTERIE :
// chaque route et chaque helper recopie les champs de la face UN PAR UN vers sa
// propre forme de carte, et un champ oublié à une seule de ces recopies suffit
// à faire disparaître le crédit de l'écran où les joueuses regardent vraiment
// leurs cartes (collection, ouverture de paquet, catalogue, vitrine, échanges)
// — tout en laissant la fiche d'équipe et le test de la règle au vert. C'est
// exactement le trou que ce lot a comblé.
//
// Et la contrepartie : une carte de JOUEUSE, de MAP ou de FAN ART ne reçoit
// JAMAIS de crédit de logo. Un logo n'existe que sur une carte d'équipe ; une
// fan art a déjà son propre crédit d'autrice, qu'un second crédit brouillerait.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import {
  resetSupabaseMock,
  setAuthUser,
  store,
} from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { resolveShowcaseCards } from '../../utils/tcg/showcase';
import { readSubjectFaces } from '../../utils/tcg/trades';
import TcgCatalogPage, { getStaticProps } from '@/pages/tcg';
import TcgShowcaseSection from '@/components/tcg/TcgShowcaseSection';
import TcgCard from '@/components/tcg/TcgCard';

const TENANT = DEFAULT_TENANT_ID;
const OWNER = '11111111-1111-4111-8111-111111111111';
const PLAYER = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM = '33333333-3333-4333-8333-333333333333';
const PACK = '22222222-2222-4222-8222-222222222222';

const TWITCH = 'https://www.twitch.tv/madamekuma';
const CREDIT = { name: 'madamekuma', url: TWITCH };

/** Team Positivité, logo crédité — le cas réel de production. */
function seedTeam(over: Record<string, unknown> = {}) {
  store.teams = [
    {
      id: TEAM,
      tenant_id: TENANT,
      name: 'Team Positivité',
      short_name: 'POS',
      slug: 'team-positivite',
      logo_url: 'https://cdn.example.test/positivite.png',
      tcg_image_path: null,
      logo_credit_name: 'madamekuma',
      logo_credit_url: TWITCH,
      deleted_at: null,
      is_active: true,
      ...over,
    },
  ] as any;
}

function seedPlayer() {
  store.player_ratings = [
    {
      user_id: PLAYER,
      tenant_id: TENANT,
      display_name: 'Joueuse 1',
      avatar_url: null,
      battle_tag: null,
      rating: 1500,
      rd: 200,
      volatility: 0.06,
      peak_rating: 1500,
      games_played: 0,
      wins: 0,
      losses: 0,
    },
  ] as any;
}

/** Un paquet OUVERT de la propriétaire, avec une carte d'équipe et de joueuse. */
function seedOwnedCards() {
  store.tcg_packs = [
    {
      id: PACK,
      tenant_id: TENANT,
      user_id: OWNER,
      source_kind: 'victory',
      source_match_id: '55555555-5555-4555-8555-555555555555',
      granted_at: '2026-01-01T00:00:00.000Z',
      opened_at: '2026-01-02T00:00:00.000Z',
    },
  ] as any;
  store.tcg_pack_cards = [
    {
      pack_id: PACK,
      position: 1,
      subject_kind: 'team',
      card_user_id: null,
      card_team_id: TEAM,
      card_map_slug: null,
      card_fanart_id: null,
      rarity: 'rare',
      is_foil: false,
      recycled_at: null,
    },
    {
      pack_id: PACK,
      position: 2,
      subject_kind: 'player',
      card_user_id: PLAYER,
      card_team_id: null,
      card_map_slug: null,
      card_fanart_id: null,
      rarity: 'common',
      is_foil: false,
      recycled_at: null,
    },
  ] as any;
}

/** Aucune carte autre qu'une équipe ne porte de clé `logoCredit`. */
function expectNoCreditOutsideTeams(cards: Array<Record<string, unknown>>) {
  for (const card of cards) {
    if (card.kind === 'team') continue;
    expect(card).not.toHaveProperty('logoCredit');
  }
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: OWNER });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ---------------------------------------------------------------------------
 * Routes et helpers : le crédit voyage avec la face
 * ------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
 * Rendu serveur des écrans
 * ------------------------------------------------------------------------- */

describe('/tcg — catalogue public (getStaticProps)', () => {
  it('la carte d’équipe porte le crédit ; les maps non', async () => {
    seedTeam();

    const result = (await getStaticProps({} as any)) as any;
    const cards = result.props.cards as Array<Record<string, unknown>>;

    const team = cards.find((c) => c.kind === 'team');
    expect(team?.logoCredit).toEqual(CREDIT);
    expect(cards.some((c) => c.kind === 'map')).toBe(true);
    expectNoCreditOutsideTeams(cards);
  });
});

describe('vitrine — resolveShowcaseCards', () => {
  it('la carte d’équipe exposée garde le crédit ; la joueuse non', async () => {
    seedTeam();
    seedPlayer();
    seedOwnedCards();

    const resolved = await resolveShowcaseCards(TENANT, OWNER, [
      `team:${TEAM}`,
      `player:${PLAYER}`,
    ]);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const team = resolved.cards.find((c) => c.kind === 'team');
    expect(team && 'logoCredit' in team ? team.logoCredit : undefined).toEqual(
      CREDIT
    );
    expectNoCreditOutsideTeams(resolved.cards as any);
  });
});

describe('échanges — readSubjectFaces', () => {
  it('la carte d’équipe proposée garde le crédit ; joueuse et map non', async () => {
    seedTeam();
    seedPlayer();

    const compose = await readSubjectFaces(TENANT, [
      { kind: 'team', id: TEAM },
      { kind: 'player', id: PLAYER },
      { kind: 'map', id: 'kings-row' },
    ]);
    const base = { rarity: 'rare' as const, isFoil: false };

    const team = compose({ kind: 'team', id: TEAM }, base);
    expect(team.kind === 'team' ? team.logoCredit : undefined).toEqual(CREDIT);
    expectNoCreditOutsideTeams([
      compose({ kind: 'player', id: PLAYER }, base),
      compose({ kind: 'map', id: 'kings-row' }, base),
    ] as any);
  });
});

describe('rendu — « Logo : madamekuma » sur les écrans de cartes', () => {
  it('/tcg : la grille publique affiche le crédit, sans lien dans la carte-lien', async () => {
    seedTeam();
    const { props } = (await getStaticProps({} as any)) as any;

    const html = renderToString(createElement(TcgCatalogPage, props));

    // Le gabarit est coupé autour du nom (cf. `LogoCredit`) : « Logo : » puis
    // le nom dans son propre élément.
    expect(html).toMatch(/Logo : <span[^>]*>madamekuma<\/span>/);
    // La carte est un lien vers la fiche d'équipe : pas de `<a>` imbriqué.
    expect(html).not.toContain(`href="${TWITCH}"`);
  });

  it('vitrine publique : le crédit s’affiche', () => {
    const html = renderToString(
      createElement(TcgShowcaseSection, {
        cards: [
          {
            key: `team:${TEAM}`,
            kind: 'team',
            teamId: TEAM,
            name: 'Team Positivité',
            slug: 'team-positivite',
            logoUrl: 'https://cdn.example.test/positivite.png',
            cardImageUrl: null,
            logoCredit: CREDIT,
            rarity: 'rare',
            isFoil: false,
          },
        ],
      })
    );
    expect(html).toMatch(/Logo : <span[^>]*>madamekuma<\/span>/);
  });

  it('carte posée dans un bouton (échanges) : le nom, jamais un lien', () => {
    const html = renderToString(
      createElement(
        'button',
        { type: 'button' },
        createElement(TcgCard, {
          subject: {
            kind: 'team',
            teamId: TEAM,
            name: 'Team Positivité',
            slug: 'team-positivite',
            logoUrl: 'https://cdn.example.test/positivite.png',
            cardImageUrl: null,
            logoCredit: CREDIT,
          },
          rarity: 'rare',
          noLink: true,
          insideInteractive: true,
          labels: {
            rarity: {
              common: 'Commune',
              rare: 'Rare',
              epic: 'Épique',
              legendary: 'Légendaire',
            },
            foil: 'Brillante',
            copies: '×{count}',
            logoCredit: 'Logo : {artist}',
          },
        })
      )
    );
    expect(html).toContain('madamekuma');
    expect(html).not.toMatch(/<a\b/);
  });
});
