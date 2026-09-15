// tests/unit/tcgTradeRules.test.ts
//
// Règles pures des échanges : forme d'une proposition et agrégation des
// exemplaires (quel exemplaire partirait, lesquels sont échangeables).

import { describe, expect, it } from 'vitest';

import {
  TRADEABLE_PACK_SOURCES,
  isTradeablePackSource,
  proposeTradeSchema,
  tradeActionSchema,
} from '../../utils/tcg/tradeRules';
import { summarizeCopies, type OwnedCopy } from '../../utils/tcg/trades';

const RECIPIENT = '9d4b7e21-3a6c-4f8d-b2e5-7c1a9f3d6e40';
const X = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

describe('proposeTradeSchema', () => {
  it('accepte une proposition carte contre carte', () => {
    const parsed = proposeTradeSchema.safeParse({
      recipientId: RECIPIENT.toUpperCase(),
      offered: [{ kind: 'player', id: X }],
      requested: [{ kind: 'map', id: 'ilios' }],
    });
    expect(parsed.success).toBe(true);
    // Normalisé : la comparaison « avec soi-même » ne dépend pas de la casse.
    expect(parsed.success && parsed.data.recipientId).toBe(RECIPIENT);
  });

  it('refuse un champ inconnu dans un sujet (pas de paquet ni de position glissés)', () => {
    const parsed = proposeTradeSchema.safeParse({
      recipientId: RECIPIENT,
      offered: [{ kind: 'player', id: X, packId: X }],
      requested: [{ kind: 'map', id: 'ilios' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('refuse un type de sujet inconnu', () => {
    const parsed = proposeTradeSchema.safeParse({
      recipientId: RECIPIENT,
      offered: [{ kind: 'coins', id: '100' }],
      requested: [{ kind: 'map', id: 'ilios' }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('tradeActionSchema', () => {
  it('ne connaît que accept, decline, cancel', () => {
    expect(tradeActionSchema.safeParse({ action: 'accept' }).success).toBe(
      true
    );
    expect(tradeActionSchema.safeParse({ action: 'gift' }).success).toBe(false);
  });
});

describe('origines échangeables', () => {
  it('exclut cadeaux, séries et drops', () => {
    expect([...TRADEABLE_PACK_SOURCES].sort()).toEqual(
      ['placement', 'purchase', 'trade', 'victory'].sort()
    );
    for (const s of ['welcome', 'streak', 'drop', null, undefined, '']) {
      expect(isTradeablePackSource(s)).toBe(false);
    }
  });
});

describe('summarizeCopies', () => {
  const copy = (over: Partial<OwnedCopy>): OwnedCopy => ({
    pack_id: 'p',
    position: 0,
    subject_kind: 'player',
    card_user_id: X,
    card_team_id: null,
    card_map_slug: null,
    rarity: 'common',
    is_foil: false,
    tradeable: true,
    ...over,
  });

  it('désigne l’exemplaire échangeable le MOINS précieux, et la meilleure rareté possédée', () => {
    const s = summarizeCopies([
      copy({ position: 0, rarity: 'epic' }),
      copy({ position: 1, rarity: 'common', is_foil: true }),
      copy({ position: 2, rarity: 'common', is_foil: false }),
      // La plus basse rareté, mais d'un paquet cadeau : ne partira jamais.
      copy({ position: 3, rarity: 'common', tradeable: false }),
    ]).get(`player:${X}`);
    expect(s).toMatchObject({
      copies: 4,
      tradeableCopies: 3,
      bestRarity: 'epic',
      worstTradeable: { rarity: 'common', foil: false },
    });
  });

  it('aucun exemplaire échangeable : worstTradeable null', () => {
    const s = summarizeCopies([copy({ tradeable: false })]).get(`player:${X}`);
    expect(s?.worstTradeable).toBeNull();
    expect(s?.tradeableCopies).toBe(0);
  });

  it('saute une ligne sans sujet (corruption) plutôt que d’inventer une clé', () => {
    const map = summarizeCopies([copy({ card_user_id: null })]);
    expect(map.size).toBe(0);
  });
});
