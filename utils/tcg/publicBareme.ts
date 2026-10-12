// utils/tcg/publicBareme.ts
//
// Le barème du TCG tel que la VITRINE PUBLIQUE (`pages/tcg.tsx`) l'affiche.
// Module PUR (aucune I/O), comme `economy.ts` et `earnSources.ts` qu'il lit.
//
// POURQUOI UN MODULE DÉDIÉ plutôt que des chiffres dans les traductions. La
// page publique disait « jusqu'à trois paquets » pour le palmarès alors que le
// champion en reçoit désormais cinq : un barème recopié dans un texte diverge au
// premier réglage, sans qu'aucun test ne s'en aperçoive. Ici, AUCUN montant
// n'est écrit : tout vient de `earnReward` / des constantes, et les textes ne
// portent que des marqueurs (`{coins}`, `{packs}`…).
//
// POURQUOI CÔTÉ SERVEUR. `economy.ts` importe `computePlayerRatings` (pour le
// poids d'un scrim) : l'appeler depuis le composant embarquerait le calcul du
// rating dans le JavaScript de la page. `getStaticProps` construit donc ce
// barème et le passe en props — un objet de nombres, sérialisable tel quel.

import { BOOSTER_PRICE_COINS, MATCH_LOSS_COINS } from './economy';
import { PACK_SIZE } from './drawPack';
import {
  CHECKIN_STREAK_LENGTH,
  PLACEMENT_TIERS,
  earnReward,
  type TcgReward,
} from './earnSources';

export type PublicPlacementRow = TcgReward & {
  badgeKey: (typeof PLACEMENT_TIERS)[number]['badgeKey'];
  /** Rang maximal (inclus) du palier : 1, 2, 3, 8… */
  maxRank: number;
};

export type PublicTcgBareme = {
  /** Cartes par paquet. */
  packSize: number;
  /** Prix d'un booster, en pièces (valeur POSITIVE). */
  boosterPrice: number;
  /** Défaites de tournoi qu'il faut pour payer un booster. */
  lossesPerBooster: number;
  matchWin: TcgReward;
  matchLoss: TcgReward;
  scrimWin: TcgReward;
  checkinStreak: TcgReward & { length: number };
  /** Du meilleur palier au moins bon. */
  placements: PublicPlacementRow[];
  /** Participation d'une équipe sortie en DNF. */
  participation: TcgReward;
  welcomeGift: TcgReward;
  twitchDrop: TcgReward;
  prediction: TcgReward;
  publicMvp: TcgReward;
  battlenet: TcgReward;
  collectionSet: TcgReward;
};

/** Construit le barème public. Aucun argument : tout vient des constantes. */
export function buildPublicTcgBareme(): PublicTcgBareme {
  return {
    packSize: PACK_SIZE,
    boosterPrice: BOOSTER_PRICE_COINS,
    // `ceil` : si le prix cessait d'être un multiple exact de la défaite, la
    // page dirait le nombre de défaites qui SUFFIT, jamais un de moins.
    lossesPerBooster:
      MATCH_LOSS_COINS > 0
        ? Math.ceil(BOOSTER_PRICE_COINS / MATCH_LOSS_COINS)
        : 0,
    matchWin: earnReward('match_win'),
    matchLoss: earnReward('match_loss'),
    scrimWin: earnReward('scrim_win'),
    checkinStreak: {
      ...earnReward('checkin_streak'),
      length: CHECKIN_STREAK_LENGTH,
    },
    placements: PLACEMENT_TIERS.map((tier) => ({
      badgeKey: tier.badgeKey,
      maxRank: tier.maxRank,
      // Par `earnReward` et non `tier.coins` : la page affiche ce que la
      // distribution VERSERAIT pour ce rang, par le même chemin qu'elle.
      ...earnReward('tournament_placement', { rank: tier.maxRank }),
    })),
    participation: earnReward('tournament_participation'),
    welcomeGift: earnReward('welcome_gift'),
    twitchDrop: earnReward('twitch_drop'),
    prediction: earnReward('match_prediction'),
    publicMvp: earnReward('public_mvp'),
    battlenet: earnReward('battlenet_verified'),
    collectionSet: earnReward('collection_set'),
  };
}
