// Registre des façons de gagner un paquet ou des pièces.
// Target: utils/tcg/earnSources.ts
//
// CE QUE CES TESTS PROTÈGENT. Le registre n'a le droit d'énoncer aucun montant
// à lui : chaque valeur doit se RECALCULER depuis `economy.ts`. Les tests
// réécrivent donc les dérivations à la main — si quelqu'un remplace
// `Math.round(SCRIM_WIN_COINS / 2)` par « 25 », le test reste vert tant que le
// barème ne bouge pas, mais casse dès qu'il bouge, ce qui est exactement le
// moment où la divergence deviendrait invisible autrement.
//
// Ils protègent aussi la HIÉRARCHIE des sources (regarder < scrim < match <
// palmarès), qui est la vraie décision produit : sans elle, suivre un live
// paierait mieux que jouer.

import { describe, expect, it } from 'vitest';

import {
  BOOSTER_PRICE_COINS,
  MATCH_WIN_COINS,
  SCRIM_WIN_COINS,
} from '../../utils/tcg/economy';
import {
  CHECKIN_STREAK_COINS,
  CHECKIN_STREAK_LENGTH,
  PLACEMENT_TIERS,
  TCG_EARN_SOURCES,
  TWITCH_DROP_COINS,
  earnReward,
  getEarnSource,
  isEarnSourceKey,
  placementTier,
  writableEarnSources,
} from '../../utils/tcg/earnSources';

describe('intégrité du registre', () => {
  it('décrit toutes les voies attendues, une seule fois chacune', () => {
    const keys = TCG_EARN_SOURCES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(keys)).toEqual(
      new Set([
        'match_win',
        'scrim_win',
        'booster_purchase',
        'twitch_drop',
        'checkin_streak',
        'tournament_placement',
        'welcome_gift',
        'supporter_welcome',
      ])
    );
  });

  it('rend des montants entiers', () => {
    // Un solde fractionnaire n'a pas de sens : les pièces se comptent.
    for (const source of TCG_EARN_SOURCES) {
      if (source.coins !== null) {
        expect(Number.isInteger(source.coins)).toBe(true);
      }
      expect(Number.isInteger(source.packs)).toBe(true);
      expect(source.packs).toBeGreaterThanOrEqual(0);
    }
  });

  it('plafonne chaque source à une occurrence par référence', () => {
    // Le jour où une source voudra dépasser 1, ce test la forcera à
    // s'expliquer : c'est la contrainte UNIQUE qui applique la limite, et elle
    // ne sait faire que « une fois ».
    for (const source of TCG_EARN_SOURCES) {
      expect(source.maxPerRef).toBe(1);
    }
  });

  it('ne compte qu’une seule dépense : l’achat', () => {
    const debits = TCG_EARN_SOURCES.filter(
      (s) => s.coins !== null && s.coins < 0
    );
    expect(debits.map((s) => s.key)).toEqual(['booster_purchase']);
    expect(debits[0].coins).toBe(-BOOSTER_PRICE_COINS);
  });

  it('fait apparaître un paquet dans toute source sauf le palmarès variable', () => {
    for (const source of TCG_EARN_SOURCES) {
      if (source.key === 'tournament_placement') continue;
      expect(source.packs).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('montants dérivés', () => {
  it('dérive le drop Twitch du gain de scrim', () => {
    // Si MATCH_WIN_COINS bouge, SCRIM_WIN_COINS suit, et le drop aussi.
    expect(TWITCH_DROP_COINS).toBe(
      Math.max(1, Math.round(SCRIM_WIN_COINS / 2))
    );
  });

  it('ne rend jamais un drop nul, même sur un barème écrasé', () => {
    // Le plancher à 1 est un garde-fou, pas une coïncidence de la valeur
    // courante : une récompense à zéro est pire qu'une récompense absente.
    expect(TWITCH_DROP_COINS).toBeGreaterThanOrEqual(1);
  });

  it('aligne la série de check-ins sur le gain de scrim', () => {
    expect(CHECKIN_STREAK_COINS).toBe(SCRIM_WIN_COINS);
  });

  it('garde la longueur de série sur le seuil des badges', () => {
    // `achievements.ts` : « série de victoires consécutives >= 5 ». Le seuil y
    // est écrit en clair et non exporté — ce test est le rappel que les deux
    // doivent bouger ensemble.
    expect(CHECKIN_STREAK_LENGTH).toBe(5);
  });

  it('dérive chaque palier de palmarès de la victoire de match', () => {
    for (const tier of PLACEMENT_TIERS) {
      expect(tier.coins % MATCH_WIN_COINS).toBe(0);
      expect(tier.coins / MATCH_WIN_COINS).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('hiérarchie des récompenses', () => {
  it('fait valoir regarder moins que jouer', () => {
    // Sans cet ordre, suivre un live paierait mieux qu'un match.
    expect(TWITCH_DROP_COINS).toBeLessThan(SCRIM_WIN_COINS);
    expect(SCRIM_WIN_COINS).toBeLessThan(MATCH_WIN_COINS);
  });

  it('fait valoir un tournoi gagné plus qu’un match gagné', () => {
    const champion = placementTier(1);
    expect(champion?.coins).toBeGreaterThan(MATCH_WIN_COINS);
    // Et plus qu'un booster : le palmarès est le sommet du barème.
    expect(champion?.coins).toBeGreaterThan(BOOSTER_PRICE_COINS);
  });

  it('décroît strictement du meilleur rang au moins bon', () => {
    for (let i = 1; i < PLACEMENT_TIERS.length; i++) {
      expect(PLACEMENT_TIERS[i].maxRank).toBeGreaterThan(
        PLACEMENT_TIERS[i - 1].maxRank
      );
      expect(PLACEMENT_TIERS[i].coins).toBeLessThan(
        PLACEMENT_TIERS[i - 1].coins
      );
      expect(PLACEMENT_TIERS[i].packs).toBeLessThanOrEqual(
        PLACEMENT_TIERS[i - 1].packs
      );
    }
  });
});

describe('limites anti-abus', () => {
  it('attache le drop Twitch au direct, un seul par personne', () => {
    // C'est `source_ref = identifiant du live` + UNIQUE qui applique la règle ;
    // le registre doit la DIRE, sinon l'implémenteur choisira une autre clé.
    const drop = getEarnSource('twitch_drop');
    expect(drop?.refKind).toBe('stream');
    expect(drop?.maxPerRef).toBe(1);
  });

  it('attache le palmarès au tournoi, la série à sa fenêtre', () => {
    expect(getEarnSource('tournament_placement')?.refKind).toBe('tournament');
    expect(getEarnSource('checkin_streak')?.refKind).toBe('streak_window');
  });

  it('attache victoires et scrims au match, l’achat au paquet', () => {
    // Ce sont les clés déjà utilisées en base par grantVictoryRewards et
    // l'endpoint booster : les changer casserait l'idempotence existante.
    expect(getEarnSource('match_win')?.refKind).toBe('match');
    expect(getEarnSource('scrim_win')?.refKind).toBe('match');
    expect(getEarnSource('booster_purchase')?.refKind).toBe('pack');
  });
});

describe('schemaReady', () => {
  it('ne déclare écrivables que les source_kind acceptés par le CHECK', () => {
    // CHECK actuel : match_win, scrim_win, booster_purchase, admin_grant,
    // card_recycled, twitch_drop, welcome_gift, supporter_welcome.
    // `tcg_twitch_drop.sql` a levé le verrou du drop le 2026-09-13,
    // `tcg_welcome_gift.sql` celui du cadeau d'édition et
    // `tcg_supporter_welcome.sql` celui du cadeau supportrice le 2026-09-14 ;
    // `tournament_placement` et `checkin_streak` restent interdits d'écriture —
    // ni origine acceptée, ni écrivain.
    //
    // Ce test est le rappel de lever chaque verrou AU BON MOMENT : basculer un
    // `schemaReady` sans migration ferait échouer l'écriture en production, et
    // migrer sans basculer laisserait la voie éteinte en silence.
    expect(
      writableEarnSources()
        .map((s) => s.key)
        .sort()
    ).toEqual([
      'booster_purchase',
      'match_win',
      'scrim_win',
      'supporter_welcome',
      'twitch_drop',
      'welcome_gift',
    ]);
  });
});

describe('les deux cadeaux d’accueil', () => {
  it('ne partagent PAS la même unité : édition contre compte', () => {
    // C'est la seule raison d'être de deux clés plutôt qu'une. L'unicité du
    // registre est `(tenant, user, source_kind, source_ref)` : faire porter à
    // une même clé un ref « tournoi » et un ref « tenant » rendrait « une
    // fois » ambigu, et l'un des deux cadeaux deviendrait rejouable.
    expect(getEarnSource('welcome_gift')?.refKind).toBe('tournament');
    expect(getEarnSource('supporter_welcome')?.refKind).toBe('tenant');
    expect(getEarnSource('supporter_welcome')?.maxPerRef).toBe(1);
  });

  it('offrent la même chose : accueillir ne dépend pas de savoir jouer', () => {
    expect(earnReward('supporter_welcome')).toEqual(
      earnReward('welcome_gift')
    );
    // Et un paquet, comme toute source du registre : c'est l'ouverture qui
    // fait le TCG.
    expect(earnReward('supporter_welcome').packs).toBe(1);
  });

  it('reste très en dessous d’un booster — la porte, pas la collection', () => {
    // Sans cette borne, s'inscrire « supportrice » deviendrait un raccourci
    // vers un booster gratuit, et le cadeau remplacerait le fait de jouer.
    expect(earnReward('supporter_welcome').coins).toBeLessThan(
      BOOSTER_PRICE_COINS
    );
  });
});

describe('placementTier', () => {
  it('applique les seuils des badges', () => {
    expect(placementTier(1)?.badgeKey).toBe('champion');
    expect(placementTier(2)?.badgeKey).toBe('finalist');
    expect(placementTier(3)?.badgeKey).toBe('podium');
    expect(placementTier(4)?.badgeKey).toBe('top_cut');
    expect(placementTier(8)?.badgeKey).toBe('top_cut');
  });

  it('s’arrête au top cut', () => {
    expect(placementTier(9)).toBeNull();
    expect(placementTier(50)).toBeNull();
  });

  it('refuse un rang aberrant plutôt que de récompenser dessus', () => {
    expect(placementTier(0)).toBeNull();
    expect(placementTier(-1)).toBeNull();
    expect(placementTier(1.5)).toBeNull();
    expect(placementTier(Number.NaN)).toBeNull();
    expect(placementTier(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('earnReward', () => {
  it('rend le montant fixe des sources non variables', () => {
    expect(earnReward('match_win')).toEqual({
      packs: 1,
      coins: MATCH_WIN_COINS,
    });
    expect(earnReward('scrim_win')).toEqual({
      packs: 1,
      coins: SCRIM_WIN_COINS,
    });
    expect(earnReward('twitch_drop')).toEqual({
      packs: 1,
      coins: TWITCH_DROP_COINS,
    });
    expect(earnReward('checkin_streak')).toEqual({
      packs: 1,
      coins: CHECKIN_STREAK_COINS,
    });
    expect(earnReward('booster_purchase')).toEqual({
      packs: 1,
      coins: -BOOSTER_PRICE_COINS,
    });
  });

  it('ignore un rang fourni à une source qui n’en a pas l’usage', () => {
    // L'appelant est souvent générique : un paramètre en trop ne doit pas le
    // faire échouer.
    expect(earnReward('match_win', { rank: 1 })).toEqual(
      earnReward('match_win')
    );
  });

  it('résout le palmarès selon le rang', () => {
    expect(earnReward('tournament_placement', { rank: 1 })).toEqual({
      packs: 3,
      coins: 5 * MATCH_WIN_COINS,
    });
    expect(earnReward('tournament_placement', { rank: 3 })).toEqual({
      packs: 1,
      coins: 2 * MATCH_WIN_COINS,
    });
  });

  it('ne donne rien pour un palmarès sans rang ou hors barème', () => {
    const nothing = { packs: 0, coins: 0 };
    expect(earnReward('tournament_placement')).toEqual(nothing);
    expect(earnReward('tournament_placement', { rank: 9 })).toEqual(nothing);
    expect(earnReward('tournament_placement', { rank: 0 })).toEqual(nothing);
    expect(earnReward('tournament_placement', { rank: Number.NaN })).toEqual(
      nothing
    );
  });

  it('rend « rien » sur une source inconnue plutôt que de lever', () => {
    // Un source_kind ajouté en base sans entrée ici ne doit pas casser un
    // lecteur d'historique.
    expect(earnReward('admin_grant')).toEqual({ packs: 0, coins: 0 });
    expect(earnReward('')).toEqual({ packs: 0, coins: 0 });
  });

  it('rend un objet neuf à chaque appel', () => {
    // Un appelant qui muterait le résultat ne doit pas contaminer le suivant.
    const a = earnReward('inconnue');
    a.coins = 999;
    expect(earnReward('inconnue')).toEqual({ packs: 0, coins: 0 });
  });
});

describe('getEarnSource / isEarnSourceKey', () => {
  it('retype une chaîne venue de la base', () => {
    expect(isEarnSourceKey('match_win')).toBe(true);
    expect(isEarnSourceKey('admin_grant')).toBe(false);
    expect(isEarnSourceKey(null)).toBe(false);
    expect(isEarnSourceKey(42)).toBe(false);
    expect(isEarnSourceKey(undefined)).toBe(false);
  });

  it('rend null sur une clé inconnue', () => {
    expect(getEarnSource('card_recycled')).toBeNull();
  });
});
