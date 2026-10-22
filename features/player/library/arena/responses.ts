// features/player/library/arena/responses.ts — formes rendues par les routes
// de l'arène de la Women's Library (docs/PLAN-tcg-2.md, lot 12). Types seuls :
// le site les reçoit par la synchro.
//
// LES CARTES N'ONT PAS DE FACE, LES FACES SONT À PART. Une carte (de deck, de
// duel) porte sa clé de sujet et ses chiffres ; la face (nom, image) vit dans
// `faces`, indexée par clé, RELUE à chaque réponse par le lecteur de faces —
// une joueuse retirée du TCG y est anonyme, sur le plateau comme ailleurs.

import type { CardStatProfile } from '../../../../utils/tcg/cardStats';
import type { FanartTargetView } from '../../../../utils/tcg/fanart';
import type { OverwatchRole } from '../../../../utils/heroes/overwatch';
import type { CardFigure } from '../../../../utils/tcg/roleFigures';
import type { TcgCardKind } from '../../../../utils/tcg/subjectKey';
import type { LogoCredit } from '../../../../utils/teams/logoCredit';
import type {
  ArenaBoardView,
  ArenaCardInput,
  ArenaEndReason,
  ArenaOpponentId,
  ArenaStatus,
  ArenaStep,
} from './rules';

/** Codes de refus propres à l'arène (en plus des codes d'un geste). */
export const ARENA_ERROR_CODES = {
  notOwned: 'not_owned',
  deckIncomplete: 'deck_incomplete',
  deckTooSmall: 'deck_too_small',
  duelActive: 'duel_active',
  duelNotFound: 'duel_not_found',
  duelOver: 'duel_over',
  staleState: 'stale_state',
  duelOutdated: 'duel_outdated',
  collectionUnreadable: 'collection_unreadable',
} as const;

/** La face d'une carte, par type — les champs de la collection (`TcgCard`). */
export type ArenaFace =
  | {
      kind: 'player';
      userId: string;
      displayName: string | null;
      imageUrl: string | null;
      figure: CardFigure | null;
    }
  | {
      kind: 'team';
      teamId: string;
      name: string | null;
      slug: string | null;
      logoUrl: string | null;
      cardImageUrl: string | null;
      logoCredit: LogoCredit | null;
    }
  | { kind: 'map'; slug: string; name: string | null; imageUrl: string | null }
  | {
      kind: 'fanart';
      fanartId: string;
      title: string | null;
      artistName: string | null;
      artistUrl: string | null;
      imageUrl: string | null;
      category: 'fanart' | 'association';
      description: string | null;
      target: FanartTargetView | null;
    }
  | { kind: 'mascot'; slug: string; name: string | null }
  | {
      kind: 'hero';
      slug: string;
      name: string | null;
      role: OverwatchRole | null;
    };

/** Faces par clé de sujet. */
export type ArenaFaces = Record<string, ArenaFace>;

/** Une carte de deck : sujet, rareté, chiffres de l'exemplaire qui jouera. */
export type ArenaDeckCard = ArenaCardInput;

/** Un sujet de sa collection, ses exemplaires les meilleurs d'abord. */
export type ArenaCollectionEntry = {
  key: string;
  kind: TcgCardKind;
  copies: ArenaDeckCard[];
};

/** Les règles chiffrées, rendues par l'API (l'écran ne les recopie pas). */
export type ArenaRulesView = {
  rulesVersion: number;
  deckSize: number;
  minDeckAtStart: number;
  handSize: number;
  startingLp: number;
  zones: number;
  turnLimit: number;
};

/** `GET` / `PUT /api/player/library/arena/deck`. */
export type ArenaDeckResponse = {
  /** Le deck ENREGISTRÉ, tel quel (clés). */
  deck: { cards: string[]; updatedAt: string | null };
  /** Les cartes qui joueraient aujourd'hui, dans l'ordre du deck. */
  resolved: ArenaDeckCard[];
  /** Les références sans exemplaire (une entrée par référence). */
  dropped: string[];
  /** Sa collection, pour construire le deck. */
  collection: ArenaCollectionEntry[];
  faces: ArenaFaces;
  rules: ArenaRulesView;
};

/** Un défi de la gardienne. */
export type ArenaOpponentView = {
  id: ArenaOpponentId;
  /** Le profil dominant du deck (Rempart, Assaut, Équilibre). */
  profile: CardStatProfile;
  /** Sa carte signature (la légendaire), avec ses chiffres ; face dans `faces`. */
  signature: ArenaDeckCard;
  cardCount: number;
};

/** La semaine en cours : son paquet d'arène est-il déjà gagné ? */
export type ArenaWeekly = { week: string; claimed: boolean };

export type ArenaRewardStatus = 'granted' | 'week_already';

/** Un duel de MON historique (privé). */
export type ArenaHistoryEntry = {
  id: string;
  opponent: string;
  status: ArenaStatus;
  endReason: ArenaEndReason | null;
  finalTurn: number | null;
  playerLp: number | null;
  npcLp: number | null;
  reward: ArenaRewardStatus | null;
  startedAt: string;
  endedAt: string | null;
};

/** `GET /api/player/library/arena/duels` — le salon de l'arène. */
export type ArenaLobbyResponse = {
  opponents: ArenaOpponentView[];
  weekly: ArenaWeekly;
  /**
   * Le duel en cours, s'il y en a un (un seul à la fois). `expiresAt` : sans
   * coup d'ici là, il sera clos comme un abandon (`ARENA_IDLE_EXPIRY_MS`).
   */
  active: {
    id: string;
    opponent: string;
    startedAt: string;
    expiresAt: string;
  } | null;
  /** Le deck enregistré compte-t-il 20 cartes ? */
  deckReady: boolean;
  deckCount: number;
  history: ArenaHistoryEntry[];
  faces: ArenaFaces;
  rules: ArenaRulesView;
};

/**
 * La récompense d'un duel GAGNÉ ; `null` pour tout autre. `pending` : la
 * victoire est écrite mais le paquet n'a pas pu l'être (panne) — relire le
 * duel la retente.
 */
export type ArenaReward =
  | { status: 'granted'; week: string; packId: string | null }
  | { status: 'week_already'; week: string }
  | { status: 'pending'; week: string };

export type ArenaDuelView = {
  id: string;
  opponent: string;
  startedAt: string;
  endedAt: string | null;
  board: ArenaBoardView;
  reward: ArenaReward | null;
  weekly: ArenaWeekly;
};

/** Lancement, état, geste, abandon : le duel, ses faces, ses étapes. */
export type ArenaDuelResponse = {
  duel: ArenaDuelView;
  faces: ArenaFaces;
  /** Ce qui vient de se passer, pas à pas (vide pour une simple lecture). */
  steps: ArenaStep[];
  /** Au lancement : les références du deck écartées (plus possédées). */
  dropped?: string[];
};
