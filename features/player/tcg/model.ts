// features/player/tcg/model.ts — formes rendues par les routes TCG joueuse
// et projections PURES pour l'écran « Ma collection » (lot P14, extraites de
// pages/player/tcg.tsx). Aucun appel réseau, aucune base : importable par
// `ui/`, `hooks/` et `client.ts`.
//
// Les raretés et les faces sont des DONNÉES : leur rendu (couleurs comprises)
// reste celui de `components/tcg/TcgCard`, partagé avec la vitrine publique.

import type { TcgCardSubject } from '@/components/tcg/TcgCard';
import type { CardFigure } from '@/utils/tcg/roleFigures';
import type { LogoCredit } from '@/utils/teams/logoCredit';
import type { TcgRarity } from '@/utils/tcg/rarity';
import type { GameMascotSlug } from '@/utils/tcg/gameMascots';
import type nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';

export type Pack = {
  id: string;
  // `welcome` = cadeau d'accueil d'une édition. L'API rend `source_kind` brut ;
  // l'union doit donc suivre le CHECK de `tcg_packs`, sans quoi une origine
  // ajoutée en base retombe silencieusement sur le libellé d'à côté.
  // `drop`, `placement`, `streak` : paquets sans match (drop Twitch, palmarès
  // de tournoi, série de check-ins — `tcg_earn_sources_drop_streak_placement.sql`).
  source: 'victory' | 'purchase' | 'welcome' | 'drop' | 'placement' | 'streak';
  grantedAt: string;
  openedAt: string | null;
};

/**
 * D'où vient ce paquet, en toutes lettres.
 *
 * LA BRANCHE PAR DÉFAUT N'EST PAS DÉCORATIVE. L'API rend `source_kind` en
 * chaîne BRUTE, sans union fermée côté serveur : une origine ajoutée en base
 * arriverait ici sans que TypeScript s'en aperçoive. Sans ce repli, elle
 * prendrait le libellé de la branche voisine — c'est exactement ainsi qu'un
 * paquet de bienvenue se serait annoncé « Gagné en match ».
 */
export function packOriginLabel(
  source: Pack['source'],
  t: typeof nsPlayerTcg.fr
): string {
  switch (source) {
    case 'purchase':
      return t.packFromPurchase;
    case 'welcome':
      return t.packFromWelcome;
    case 'drop':
      return t.packFromDrop;
    case 'placement':
      return t.packFromPlacement;
    case 'streak':
      return t.packFromStreak;
    case 'victory':
      return t.packFromVictory;
    default:
      return t.packFromVictory;
  }
}

/**
 * L'exemplaire que l'API propose au recyclage — le MOINS précieux — ou `null`
 * quand il n'y a qu'un exemplaire : la route refuse de retirer le dernier, et
 * un bouton condamné au refus ne doit pas s'afficher.
 */
export type Recyclable = { packId: string; position: number } | null;

/**
 * Ce que la collection dit des échanges en attente, pour AVERTIR avant un
 * recyclage (cf. `utils/tcg/engagedCards.ts`). OPTIONNEL : une réponse d'API
 * antérieure ne le porte pas, et son absence vaut « rien à signaler ».
 */
export type Engagement = {
  /** Exemplaires de ce sujet promis dans mes propositions en attente. */
  engagedCopies?: number;
  /** L'exemplaire `recyclable` est-il lui-même promis ? */
  recyclableEngaged?: boolean;
};

export type CollectionCard = Engagement &
  (
    | {
        kind: 'player';
        userId: string;
        displayName: string | null;
        imageUrl: string | null;
        /** Figurine de rôle ; OPTIONNELLE pour les réponses d'avant. */
        figure?: CardFigure | null;
        rarity: TcgRarity;
        isFoil: boolean;
        count: number;
        recyclable?: Recyclable;
      }
    | {
        kind: 'team';
        teamId: string;
        name: string | null;
        slug: string | null;
        logoUrl: string | null;
        /** Illustration déposée par l'équipe ; `null` ⇒ la carte prend le logo. */
        cardImageUrl: string | null;
        /**
         * Crédit de l'artiste du logo. OPTIONNEL : un onglet ouvert avant le
         * déploiement peut encore recevoir une réponse qui ne le porte pas.
         */
        logoCredit?: LogoCredit | null;
        rarity: TcgRarity;
        isFoil: boolean;
        count: number;
        recyclable?: Recyclable;
      }
    | {
        kind: 'map';
        slug: string;
        name: string | null;
        imageUrl: string | null;
        rarity: TcgRarity;
        isFoil: boolean;
        count: number;
        recyclable?: Recyclable;
      }
    | {
        kind: 'fanart';
        fanartId: string;
        /** Le TITRE donné par l'autrice : c'est le nom de la carte. */
        title: string | null;
        artistName: string | null;
        artistUrl: string | null;
        imageUrl: string | null;
        /** `association` : visuel de l'association. Optionnel (réponse d'avant). */
        category?: 'fanart' | 'association';
        rarity: TcgRarity;
        isFoil: boolean;
        count: number;
        recyclable?: Recyclable;
      }
    | {
        kind: 'mascot';
        slug: string;
        name: string | null;
        rarity: TcgRarity;
        isFoil: boolean;
        count: number;
        recyclable?: Recyclable;
      }
  );

/**
 * Une carte tout juste tirée. Même forme que `CollectionCard` à `count` près,
 * plus `isNew` : rendu par le serveur, OPTIONNEL parce qu'une lecture en échec
 * l'omet (et qu'une réponse d'API antérieure ne le porte pas).
 */
export type DrawnCard = { position: number; isNew?: boolean } & (
  | {
      kind: 'player';
      userId: string;
      displayName: string | null;
      imageUrl: string | null;
      figure?: CardFigure | null;
      rarity: TcgRarity;
      isFoil: boolean;
    }
  | {
      kind: 'team';
      teamId: string;
      name: string | null;
      slug: string | null;
      logoUrl: string | null;
      cardImageUrl: string | null;
      /** Crédit du logo — optionnel pour la même raison que `CollectionCard`. */
      logoCredit?: LogoCredit | null;
      rarity: TcgRarity;
      isFoil: boolean;
    }
  | {
      kind: 'map';
      slug: string;
      name: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
    }
  | {
      kind: 'fanart';
      fanartId: string;
      title: string | null;
      artistName: string | null;
      artistUrl: string | null;
      imageUrl: string | null;
      category?: 'fanart' | 'association';
      rarity: TcgRarity;
      isFoil: boolean;
    }
  | {
      kind: 'mascot';
      slug: string;
      name: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
    }
);

export type Earn = {
  matchWin: number;
  scrimWin: number;
  /**
   * Barème du cadeau d'accueil. OPTIONNEL par prudence de lecture : la page
   * doit rester juste face à une réponse d'API antérieure à son ajout.
   */
  welcomeGift?: number;
  /**
   * Barème du drop en direct. OPTIONNEL : l'API ne le rend que si une chaîne
   * Twitch est connectée ET qu'une récompense lui est désignée. Absent, on
   * n'annonce rien — promettre un gain qui n'aboutirait jamais serait pire que
   * de le taire.
   */
  twitchDrop?: number;
};

export type PacksResponse = {
  packs: Pack[];
  unopened?: number;
  balance: number;
  boosterPrice: number;
  recycleRefund?: number;
  earn?: Earn;
  nextCursor?: string | null;
};

export type CollectionResponse = {
  cards: CollectionCard[];
  distinct: number;
  total: number;
  // Le vivier — combien de sujets EXISTENT. `null` quand la lecture a échoué :
  // la barre disparaît alors, plutôt que d'annoncer « 12 sur 0 ».
  pool?: { distinct: number } | null;
  nextCursor?: string | null;
};

/**
 * Clé d'un sujet, commune aux deux formes de carte.
 *
 * Pendant CLIENT de `utils/tcg/subjectKey.ts`, qui travaille sur des lignes de
 * base ; ici les cartes arrivent déjà mises en forme par l'API. Les préfixes
 * doivent rester distincts entre types, sinon une map et une équipe de même
 * identifiant se confondraient. Sert à dédoublonner deux pages de collection.
 */
export function subjectKey(card: DrawnCard | CollectionCard): string {
  if (card.kind === 'player') return `p-${card.userId}`;
  if (card.kind === 'map') return `m-${card.slug}`;
  if (card.kind === 'fanart') return `f-${card.fanartId}`;
  if (card.kind === 'mascot') return `x-${card.slug}`;
  return `t-${card.teamId}`;
}

/**
 * Le nom d'une carte, en une ligne.
 *
 * Repli sur l'identifiant plutôt que sur une chaîne vide : dans une liste où
 * l'on choisit ce qu'on va DÉTRUIRE, une ligne sans nom est pire qu'une ligne
 * laide.
 */
export function cardLabel(card: CollectionCard): string {
  if (card.kind === 'player') return card.displayName ?? card.userId;
  if (card.kind === 'team') return card.name ?? card.teamId;
  if (card.kind === 'map') return card.name ?? card.slug;
  if (card.kind === 'fanart') return card.title ?? card.fanartId;
  return card.name ?? card.slug;
}

/** La face à passer à `TcgCard`, pour les deux formes de carte. */
export function cardSubject(card: DrawnCard | CollectionCard): TcgCardSubject {
  if (card.kind === 'player') {
    return {
      kind: 'player',
      userId: card.userId,
      displayName: card.displayName,
      imageUrl: card.imageUrl,
      figure: card.figure ?? null,
    };
  }
  if (card.kind === 'map') {
    return {
      kind: 'map',
      slug: card.slug,
      name: card.name,
      imageUrl: card.imageUrl,
    };
  }
  if (card.kind === 'fanart') {
    return {
      kind: 'fanart',
      fanartId: card.fanartId,
      name: card.title,
      imageUrl: card.imageUrl,
      artistName: card.artistName,
      artistUrl: card.artistUrl,
      category: card.category,
    };
  }
  if (card.kind === 'mascot') {
    return {
      kind: 'mascot',
      slug: card.slug as GameMascotSlug,
      name: card.name,
    };
  }
  // `team` en DERNIER, et seulement pour `team`. Cette branche était le
  // fourre-tout : une carte mascotte en ressortait en équipe sans identifiant
  // — clé `t-undefined` partagée par toutes, donc deux mascottes confondues
  // dans la liste, sans la moindre erreur.
  return {
    kind: 'team',
    teamId: card.teamId,
    name: card.name,
    slug: card.slug,
    logoUrl: card.logoUrl,
    cardImageUrl: card.cardImageUrl,
    // Collection ET révélation passent par ici : un seul endroit à tenir pour
    // que le crédit ne manque sur aucune des deux.
    logoCredit: card.logoCredit ?? null,
  };
}

/** Le nom lisible d'une carte, ou `null` si la face n'en porte pas. */
export function cardName(card: DrawnCard | CollectionCard): string | null {
  if (card.kind === 'player') return card.displayName;
  // Une fan art porte un TITRE, pas un nom : c'est le même champ pour la
  // lectrice, et l'omettre laisserait la carte anonyme.
  if (card.kind === 'fanart') return card.title;
  return card.name;
}

/** Un mouvement du registre. `amount` est signé : gain positif, dépense négative. */
export type WalletEntry = {
  id: string;
  amount: number;
  sourceKind: string;
  sourceRef: string;
  /** Motif d'une correction de l'équipe ; `null` pour tout le reste. */
  note?: string | null;
  createdAt: string;
};

/** Réponse de GET /api/player/tcg/wallet. */
export type WalletResponse = {
  entries: WalletEntry[];
  shownTotal?: number;
  truncated: boolean;
};

/** Ce que la page lit de GET /api/player/tcg/trades/settings (pastille). */
export type TradeSettingsPending = {
  pending?: { received?: number | null };
};

/**
 * Libellé d'un mouvement. L'API rend le FAIT (`sourceKind`), l'écran le
 * formule. Une source inconnue — un `source_kind` ajouté plus tard — rend un
 * libellé neutre plutôt que rien : le montant et la date restent lisibles.
 */
export function walletSourceLabel(
  sourceKind: string,
  t: typeof nsPlayerTcg.fr
): string {
  switch (sourceKind) {
    case 'match_win':
      return t.walletMatchWin;
    case 'scrim_win':
      return t.walletScrimWin;
    case 'booster_purchase':
      return t.walletBoosterPurchase;
    case 'admin_grant':
      return t.walletAdminGrant;
    case 'card_recycled':
      return t.walletCardRecycled;
    case 'twitch_drop':
      // Sans ce cas, un drop tombait dans le repli neutre (« Mouvement ») :
      // des pièces arrivaient sans que la joueuse puisse les rattacher à
      // une action — le seul gain inexplicable de la liste.
      return t.walletTwitchDrop;
    case 'welcome_gift':
      // Même défaut, même correction : les deux cadeaux d'accueil
      // s'affichaient « Mouvement » alors que c'est souvent la PREMIÈRE
      // ligne de l'historique, celle qu'on cherche à comprendre.
      return t.walletWelcomeGift;
    case 'supporter_welcome':
      return t.walletSupporterWelcome;
    case 'checkin_streak':
      return t.walletCheckinStreak;
    case 'tournament_placement':
      return t.walletTournamentPlacement;
    case 'battlenet_verified':
      return t.walletBattlenetVerified;
    case 'collection_set':
      return t.walletCollectionSet;
    case 'match_prediction':
      return t.walletMatchPrediction;
    case 'public_mvp':
      return t.walletPublicMvp;
    default:
      return t.walletUnknownSource;
  }
}
