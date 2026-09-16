// Lot 1 du rapport : « rendre l'offre lisible et gagnable ».
// Targets : utils/billing/nonprofitGrant.ts, utils/marketing/platformProof.ts,
//           utils/billing/planFeatures.ts (entryPlanPrice).
//
// CE QUE CES CAS PROTÈGENT, par ordre d'importance :
//   1. ON NE RÉCLAME PAS D'ARGENT À QUI ON A PROMIS LA GRATUITÉ. Une
//      association vérifiée sur le palier d'entrée ne doit être ni relancée ni
//      passée en impayé — une relance pour une somme qu'on ne demande pas ruine
//      la promesse commerciale plus sûrement qu'un oubli de facturation.
//   2. LA GRATUITÉ NE DÉBORDE PAS SUR LE CATALOGUE : une association qui
//      choisit Régie ou Circuit paie son plan comme tout le monde.
//   3. ON NE GONFLE PAS LES CHIFFRES, ET ON SE TAIT QUAND ILS SONT PETITS.
//      Un compteur sous son plancher ne s'affiche pas, et une section famélique
//      disparaît entièrement.
//   4. LE PRIX ANNONCÉ EN RECHERCHE SORT DU BARÈME, jamais d'une constante
//      recopiée : c'est ce qui l'a fait mentir (« à partir de 290 € » pour un
//      palier à 100 €).

import { describe, it, expect } from 'vitest';

import {
  isBillableTenant,
  nonprofitDiscoveryIsFree,
} from '../../utils/billing/nonprofitGrant';
import {
  MIN_TILES_TO_RENDER,
  PROOF_THRESHOLDS,
  selectProofTiles,
  type PlatformProofCounts,
} from '../../utils/marketing/platformProof';
import {
  PLAN_PRICES_EUR,
  entryPlanPrice,
} from '../../utils/billing/planFeatures';

const VERIFIED = '2026-09-16T08:00:00.000Z';

describe('Découverte offerte aux associations vérifiées', () => {
  it('offre le palier d’entrée à une association vérifiée', () => {
    expect(
      nonprofitDiscoveryIsFree({
        plan: 'discovery',
        nonprofit_verified_at: VERIFIED,
      })
    ).toBe(true);
  });

  it('ne l’offre pas sans vérification', () => {
    expect(
      nonprofitDiscoveryIsFree({
        plan: 'discovery',
        nonprofit_verified_at: null,
      })
    ).toBe(false);
  });

  it('ne déborde pas sur les plans payants', () => {
    // Le point qui fait tenir la grille : la gratuité porte sur l'entrée de
    // gamme, pas sur le catalogue.
    for (const plan of ['regie', 'circuit', 'editor'] as const) {
      expect(
        nonprofitDiscoveryIsFree({ plan, nonprofit_verified_at: VERIFIED })
      ).toBe(false);
      expect(isBillableTenant({ plan, nonprofit_verified_at: VERIFIED })).toBe(
        true
      );
    }
  });

  it('exclut de la facturation exactement ce qui est offert', () => {
    expect(
      isBillableTenant({ plan: 'discovery', nonprofit_verified_at: VERIFIED })
    ).toBe(false);
    expect(
      isBillableTenant({ plan: 'discovery', nonprofit_verified_at: null })
    ).toBe(true);
  });
});

describe('preuve chiffrée de /organisateurs', () => {
  const full: PlatformProofCounts = {
    editions: 3,
    teams: 10,
    players: 72,
    scheduledMatches: 69,
    playedMatches: 9,
  };

  it('tait un chiffre sous son plancher, garde les autres', () => {
    const tiles = selectProofTiles(full);
    expect(tiles.map((t) => t.metric)).toEqual([
      'editions',
      'teams',
      'players',
      'scheduledMatches',
    ]);
    // 9 matchs joués sur une page qui vend de l'organisation de compétitions
    // prouverait le contraire de ce qu'on veut dire.
    expect(tiles.some((t) => t.metric === 'playedMatches')).toBe(false);
  });

  it('fait disparaître la section entière quand il reste trop peu à dire', () => {
    const thin: PlatformProofCounts = {
      editions: 3,
      teams: 10,
      players: 2,
      scheduledMatches: 1,
      playedMatches: 0,
    };
    expect(selectProofTiles(thin)).toEqual([]);
  });

  it('rend exactement le seuil, pas une unité de moins', () => {
    const atThreshold: PlatformProofCounts = {
      editions: PROOF_THRESHOLDS.editions,
      teams: PROOF_THRESHOLDS.teams,
      players: PROOF_THRESHOLDS.players,
      scheduledMatches: PROOF_THRESHOLDS.scheduledMatches - 1,
      playedMatches: null,
    };
    const tiles = selectProofTiles(atThreshold);
    expect(tiles).toHaveLength(MIN_TILES_TO_RENDER);
    expect(tiles.some((t) => t.metric === 'scheduledMatches')).toBe(false);
  });

  it('ignore une lecture impossible plutôt que d’afficher zéro', () => {
    // `null` = la requête a échoué. Afficher « 0 équipe » serait un mensonge
    // par panne.
    const broken: PlatformProofCounts = {
      editions: null,
      teams: null,
      players: null,
      scheduledMatches: null,
      playedMatches: null,
    };
    expect(selectProofTiles(broken)).toEqual([]);
  });
});

describe('prix d’entrée annoncé', () => {
  it('sort du barème et désigne le plan le moins cher', () => {
    const entry = entryPlanPrice();
    expect(entry).not.toBeNull();
    expect(entry?.plan).toBe('discovery');
    expect(entry?.yearly).toBe(PLAN_PRICES_EUR.discovery);
  });

  it('ignore les paliers gratuits et sur devis', () => {
    // `foundation` est à 0 (offerte par mission) et `editor` à `null` (sur
    // devis) : ni l'un ni l'autre n'est un prix d'entrée.
    const entry = entryPlanPrice();
    expect(entry?.plan).not.toBe('foundation');
    expect(entry?.plan).not.toBe('editor');
  });
});
