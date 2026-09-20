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
  BATTLENET_VERIFIED_COINS,
  CHECKIN_STREAK_COINS,
  MATCH_PREDICTION_COINS,
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
import { RATING_TIERS } from '../../utils/tcg/rarity';
import {
  STREAK_BADGE_MIN,
  PEAK_RATING_TIERS,
} from '../../utils/profile/achievements';

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
        'staff_welcome',
        'battlenet_verified',
        'collection_set',
        'match_prediction',
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

  it('fait apparaître un paquet dans toute source sauf le palmarès variable, la vérification Battle.net, les séries et les pronostics', () => {
    // Deux exceptions, et seulement deux. Le palmarès résout ses paquets par
    // rang ; la vérification Battle.net n'ouvre pas la porte du TCG (c'est le
    // rôle des cadeaux d'accueil), elle récompense un geste d'identité — et un
    // paquet aurait exigé d'élargir les deux contraintes de `tcg_packs`.
    for (const source of TCG_EARN_SOURCES) {
      if (source.key === 'tournament_placement') continue;
      if (source.key === 'battlenet_verified') {
        expect(source.packs).toBe(0);
        continue;
      }
      // Une série se complète EN OUVRANT des paquets : en rendre un nourrirait
      // la boucle qu'on récompense (cf. `COLLECTION_SET_COINS`).
      if (source.key === 'collection_set') {
        expect(source.packs).toBe(0);
        continue;
      }
      // Un paquet par match bien deviné pleuvrait sur qui ne joue pas
      // (cf. `MATCH_PREDICTION_COINS`).
      if (source.key === 'match_prediction') {
        expect(source.packs).toBe(0);
        continue;
      }
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

  it('tient la longueur de série DEPUIS le seuil des badges', () => {
    // CE TEST ÉTAIT UNE TAUTOLOGIE. Il assérait `CHECKIN_STREAK_LENGTH === 5`
    // en se présentant comme le rappel que ce nombre et le `streak >= 5` de
    // `achievements.ts` doivent bouger ensemble — alors qu'il ne pouvait RIEN
    // détecter : changer le seuil des badges l'aurait laissé vert, et changer
    // celui-ci l'aurait fait échouer en désignant le mauvais coupable.
    //
    // Le seuil est désormais exporté par `achievements.ts` et dérivé ici. Ce
    // qu'on vérifie n'est plus une valeur, c'est le LIEN : les deux ne peuvent
    // plus diverger, quelle que soit la valeur choisie là-bas.
    expect(CHECKIN_STREAK_LENGTH).toBe(STREAK_BADGE_MIN);
  });

  it('dérive les paliers de rareté d’équipe des paliers de badge', () => {
    // Même histoire : `RATING_TIERS` recopiait 2000/1800/1600 sous un
    // commentaire « si l'un bouge, l'autre doit bouger ». Les seuils viennent
    // maintenant de la même source, et la correspondance palier → rareté est
    // exhaustive par le type — ajouter un palier de badge ne compile plus tant
    // que le TCG n'a pas dit quelle rareté lui donner.
    expect(RATING_TIERS.map((t) => t.min)).toEqual(
      PEAK_RATING_TIERS.map((t) => t.min)
    );
    // Décroissant : le premier palier atteint est le plus haut, des deux côtés.
    const mins = RATING_TIERS.map((t) => t.min);
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
  });

  it('dérive chaque palier de palmarès de la victoire de match', () => {
    for (const tier of PLACEMENT_TIERS) {
      expect(tier.coins % MATCH_WIN_COINS).toBe(0);
      expect(tier.coins / MATCH_WIN_COINS).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('pronostic juste', () => {
  it('rapporte le montant du drop, dérivé du scrim, en pièces seules', () => {
    expect(MATCH_PREDICTION_COINS).toBe(
      Math.max(1, Math.round(SCRIM_WIN_COINS / 2))
    );
    expect(earnReward('match_prediction')).toEqual({
      packs: 0,
      coins: MATCH_PREDICTION_COINS,
    });
  });

  it('paie moins que jouer', () => {
    // Pronostiquer n'est pas jouer : sans cet ordre, suivre la compétition
    // paierait mieux que la disputer.
    expect(MATCH_PREDICTION_COINS).toBeLessThan(SCRIM_WIN_COINS);
  });

  it('attache la récompense au match, une fois par personne', () => {
    expect(getEarnSource('match_prediction')?.refKind).toBe('match');
    expect(getEarnSource('match_prediction')?.maxPerRef).toBe(1);
  });
});

describe('vérification Battle.net', () => {
  it('rapporte une victoire de match, en pièces seules', () => {
    expect(BATTLENET_VERIFIED_COINS).toBe(MATCH_WIN_COINS);
    expect(earnReward('battlenet_verified')).toEqual({
      packs: 0,
      coins: MATCH_WIN_COINS,
    });
  });

  it('n’achète pas un booster à elle seule', () => {
    // Un tiers de booster : elle rapproche du prochain paquet, elle ne l'offre
    // pas. Au-delà, un geste administratif paierait mieux que jouer.
    expect(BATTLENET_VERIFIED_COINS).toBeLessThan(BOOSTER_PRICE_COINS);
  });

  it('reste sous chacun des cadeaux d’accueil (même pièces, sans paquet)', () => {
    const welcome = earnReward('welcome_gift');
    expect(BATTLENET_VERIFIED_COINS).toBeLessThanOrEqual(welcome.coins);
    expect(welcome.packs).toBeGreaterThan(
      earnReward('battlenet_verified').packs
    );
  });

  it('attache la récompense au compte Blizzard prouvé', () => {
    expect(getEarnSource('battlenet_verified')?.refKind).toBe(
      'blizzard_account'
    );
    expect(getEarnSource('battlenet_verified')?.maxPerRef).toBe(1);
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

  it('attache les victoires au match, les scrims AU SCRIM, l’achat au paquet', () => {
    // Ce sont les clés utilisées en base par grantVictoryRewards et l'endpoint
    // booster. Un scrim est clé sur lui-même et PAS sur son match miroir, qui se
    // recrée sous un autre id : c'était une boucle de gains infinis (2026-09-15,
    // migration de données `tcg_scrim_win_stable_ref.sql`).
    expect(getEarnSource('match_win')?.refKind).toBe('match');
    expect(getEarnSource('scrim_win')?.refKind).toBe('scrim');
    expect(getEarnSource('booster_purchase')?.refKind).toBe('pack');
  });
});

describe('schemaReady', () => {
  it('ne déclare écrivables que les source_kind acceptés par le CHECK', () => {
    // CHECK (avec `tcg_earn_sources_drop_streak_placement.sql`) : match_win,
    // scrim_win, booster_purchase, admin_grant, card_recycled, twitch_drop,
    // welcome_gift, supporter_welcome, checkin_streak, tournament_placement.
    // `tcg_twitch_drop.sql` a levé le verrou du drop le 2026-09-13,
    // `tcg_welcome_gift.sql` et `tcg_supporter_welcome.sql` ceux des deux
    // cadeaux le 2026-09-14, et la migration du 2026-09-15 les deux derniers —
    // `tournament_placement` et `checkin_streak`, avec leurs écrivains
    // (`grantPlacementRewards`, `grantCheckinStreak`). Toutes les voies du
    // registre sont donc écrivables : la prochaine ajoutée devra refaire ce
    // chemin, migration ET bascule dans le même lot.
    //
    // Ce test est le rappel de lever chaque verrou AU BON MOMENT : basculer un
    // `schemaReady` sans migration ferait échouer l'écriture en production, et
    // migrer sans basculer laisserait la voie éteinte en silence.
    expect(
      writableEarnSources()
        .map((s) => s.key)
        .sort()
    ).toEqual([
      'battlenet_verified',
      'booster_purchase',
      'checkin_streak',
      // `tcg_collection_set.sql` (2026-09-15, NON appliquée à la rédaction) :
      // levé avec le code, comme `battlenet_verified` — sans la migration,
      // l'écriture est refusée et la lecture suivante des séries retente.
      'collection_set',
      // `match_predictions.sql` (appliquée le 2026-09-15) :
      // levé avec le code. Sans la migration, la table des pronostics n'existe
      // pas : aucun pronostic ne s'enregistre, donc aucun n'est dû.
      'match_prediction',
      'match_win',
      'scrim_win',
      // `tcg_staff_welcome.sql` (appliquée le 2026-09-20) : la porte d'entrée
      // d'un compte staff hors roster, qui n'en avait aucune.
      'staff_welcome',
      'supporter_welcome',
      'tournament_placement',
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
    expect(earnReward('supporter_welcome')).toEqual(earnReward('welcome_gift'));
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
