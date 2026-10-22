// features/player/library/arena/rules.ts — LES RÈGLES de l'arène de la Women's
// Library (docs/PLAN-tcg-2.md, lot 12, conference-website) : constantes,
// formes de l'état d'un duel, gestes et événements.
//
// PUR, SANS IMPORT À L'EXÉCUTION : le site le reçoit par la synchro (il
// prévisualise les gestes permis avec `legal.ts`, il ne décide jamais rien).
//
// UNE ÉDITION DE RÈGLES PAR DUEL. `ARENA_RULES_VERSION` est écrit sur chaque
// duel (`library_arena_duels.rules_version`) : retoucher une règle — ou le
// barème du lot 11, gelé dès l'ouverture de l'arène — fait une édition 2, et
// un duel commencé en édition 1 se finit en édition 1 ou s'abandonne. On ne
// corrige pas un duel en cours sous les pieds de la joueuse.

import type { CardStatProfile } from '../../../../utils/tcg/cardStats';
import type { TcgRarity } from '../../../../utils/tcg/rarity';

export const ARENA_RULES_VERSION = 1;

/** Cartes d'un deck enregistré complet. */
export const ARENA_DECK_SIZE = 20;
/**
 * Cartes qu'il doit RESTER au lancement, une fois écartées celles qui ont
 * quitté la collection (échange, recyclage, forge). En dessous, le duel ne
 * part pas : un deck de six cartes finirait en deck-out au quatrième tour.
 */
export const ARENA_MIN_DECK_AT_START = 10;
/** Main de départ. */
export const ARENA_HAND_SIZE = 5;
/** Points de vie de départ. */
export const ARENA_STARTING_LP = 4000;
/** Zones de monstres par côté. */
export const ARENA_ZONES = 3;
/**
 * Tours du duel, les deux côtés comptés (15 chacune). Après le dernier, la
 * plus haute réserve de points de vie gagne ; égalité = match nul. Avec un
 * deck de 20, aucune des deux ne tombe en deck-out avant cette borne : le
 * deck-out ne frappe qu'un deck amputé.
 */
export const ARENA_TURN_LIMIT = 30;

/**
 * Un duel sans AUCUN coup accepté depuis 48 h est clos comme un abandon
 * (défaite, aucune récompense) — décision du 2026-10-22. Compté depuis le
 * dernier coup (`updated_at`), vérifié à la demande (salon, lancement, lecture,
 * geste) : aucune tâche planifiée. Sans cette borne, un duel oublié restait
 * « en cours » pour toujours.
 */
export const ARENA_IDLE_EXPIRY_MS = 48 * 60 * 60 * 1000;

/**
 * Sacrifices exigés par niveau : 3–4 libres, 5–6 un, 7 et plus deux — les
 * trois classes d'invocation de Yu-Gi-Oh, où tombent exactement les niveaux
 * du barème (3, 4, 6, 8 ; `CARD_LEVEL_BY_RARITY`).
 */
export function tributesForLevel(level: number): 0 | 1 | 2 {
  if (level >= 7) return 2;
  if (level >= 5) return 1;
  return 0;
}

/**
 * Les trois défis de la gardienne (decks fixes, `npcDecks.ts`). Ici, et non
 * avec les decks : les schémas et le site n'ont besoin que des noms, pas des
 * registres de héros que les decks importent.
 */
export const ARENA_OPPONENTS = ['remparts', 'assaut', 'harmonie'] as const;
export type ArenaOpponentId = (typeof ARENA_OPPONENTS)[number];

export function isArenaOpponent(value: unknown): value is ArenaOpponentId {
  return (ARENA_OPPONENTS as readonly unknown[]).includes(value);
}

export const ARENA_SIDES = ['player', 'npc'] as const;
export type ArenaSide = (typeof ARENA_SIDES)[number];

export function otherSide(side: ArenaSide): ArenaSide {
  return side === 'player' ? 'npc' : 'player';
}

export const ARENA_POSITIONS = ['attack', 'defense'] as const;
/** Face visible, toujours : pas de pose face cachée en v1. */
export type ArenaPosition = (typeof ARENA_POSITIONS)[number];

/**
 * Une carte EN DUEL : son sujet et ses chiffres, figés au lancement. JAMAIS
 * sa face (nom, image) : la face est relue à chaque réponse par le lecteur
 * de faces, seul porteur du consentement (une joueuse retirée reste anonyme).
 */
export type ArenaCard = {
  /** Identifiant dans CE duel : `p1`…`p20` (joueuse), `n1`…`n20` (gardienne). */
  uid: string;
  /** Clé de sujet (`hero:tracer`, `player:<uuid>`…, cf. `subjectKey.ts`). */
  key: string;
  rarity: TcgRarity;
  /** Variante d'impression : ne donne rien (cf. `cardStats.ts`). */
  foil: boolean;
  level: number;
  attack: number;
  defense: number;
  profile: CardStatProfile;
};

/** Une carte à mettre dans un deck, avant que le duel lui donne un `uid`. */
export type ArenaCardInput = Omit<ArenaCard, 'uid'>;

export type ArenaMonster = {
  card: ArenaCard;
  position: ArenaPosition;
  /** Tour de son invocation : pas de changement de position ce tour-là. */
  summonedTurn: number;
  positionChangedTurn: number | null;
  attackedTurn: number | null;
};

/** Trois zones, `null` = libre. */
export type ArenaField = (ArenaMonster | null)[];

export type ArenaSideState = {
  lp: number;
  /** Le haut du deck est l'indice 0. SECRET : jamais rendu. */
  deck: ArenaCard[];
  /** Secret pour la gardienne (seul son nombre est rendu). */
  hand: ArenaCard[];
  field: ArenaField;
  graveyard: ArenaCard[];
};

/** Statut vu DE LA JOUEUSE. */
export const ARENA_STATUSES = [
  'active',
  'won',
  'lost',
  'draw',
  'abandoned',
] as const;
export type ArenaStatus = (typeof ARENA_STATUSES)[number];

export const ARENA_END_REASONS = [
  'lp',
  'deck_out',
  'turn_limit',
  'abandon',
] as const;
export type ArenaEndReason = (typeof ARENA_END_REASONS)[number];

export type ArenaDuelState = {
  v: typeof ARENA_RULES_VERSION;
  /** Tour courant, 1 au premier ; les deux côtés comptés. */
  turn: number;
  active: ArenaSide;
  /** Qui a commencé (pile ou face). */
  first: ArenaSide;
  /** L'invocation du tour est faite. */
  summoned: boolean;
  sides: Record<ArenaSide, ArenaSideState>;
  status: ArenaStatus;
  endReason: ArenaEndReason | null;
  /** Gestes acceptés : le numéro que le prochain geste doit citer. */
  seq: number;
};

/* ------------------------------------------------------------------------
 * Gestes de la joueuse
 * --------------------------------------------------------------------- */

export type ArenaSummonAction = {
  type: 'summon';
  /** `uid` d'une carte de sa main. */
  card: string;
  position: ArenaPosition;
  /** Zone voulue (0–2) ; absente = la première libre. */
  zone?: number;
  /** `uid` de ses monstres sacrifiés. */
  tributes?: string[];
};

export type ArenaAction =
  | ArenaSummonAction
  | { type: 'change_position'; monster: string }
  | {
      type: 'attack';
      attacker: string;
      /** `uid` d'un monstre adverse, ou `null` pour l'attaque directe. */
      target: string | null;
    }
  | { type: 'end_turn' };

export const ARENA_ACTION_TYPES = [
  'summon',
  'change_position',
  'attack',
  'end_turn',
] as const;

/** Refus d'un geste : un code stable, que l'interface traduit. */
export const ARENA_ACTION_ERRORS = [
  'duel_over',
  'not_your_turn',
  'invalid_action',
  'invalid_position',
  'card_not_in_hand',
  'already_summoned',
  'wrong_tribute_count',
  'invalid_tribute',
  'no_free_zone',
  'zone_occupied',
  'monster_not_found',
  'just_summoned',
  'position_already_changed',
  'already_attacked',
  'not_in_attack_position',
  'no_attack_first_turn',
  'target_not_found',
  'direct_attack_blocked',
] as const;
export type ArenaActionError = (typeof ARENA_ACTION_ERRORS)[number];

/* ------------------------------------------------------------------------
 * Événements (ce que l'écran rejoue pas à pas)
 * --------------------------------------------------------------------- */

export type ArenaCombat = {
  attacker: string;
  /** `null` : attaque directe. */
  target: string | null;
  attackerAtk: number;
  /** Position de la cible au moment du coup. */
  targetPosition: ArenaPosition | null;
  /** ATK (cible en attaque) ou DEF (cible en défense) opposée. */
  targetValue: number | null;
  /** Monstres détruits par le coup. */
  destroyed: string[];
  /** Points de vie perdus, et par qui. */
  damage: { side: ArenaSide; amount: number } | null;
};

export type ArenaEvent =
  | { type: 'turn_start'; side: ArenaSide; turn: number }
  /** `card` : la carte piochée, `null` pour la gardienne (sa main est secrète). */
  | { type: 'draw'; side: ArenaSide; card: string | null }
  | {
      type: 'summon';
      side: ArenaSide;
      card: string;
      zone: number;
      position: ArenaPosition;
      tributes: string[];
    }
  | {
      type: 'position';
      side: ArenaSide;
      monster: string;
      position: ArenaPosition;
    }
  | {
      type: 'attack';
      side: ArenaSide;
      combat: ArenaCombat;
      lp: Record<ArenaSide, number>;
    }
  | { type: 'turn_end'; side: ArenaSide; turn: number }
  | {
      type: 'duel_end';
      status: Exclude<ArenaStatus, 'active'>;
      reason: ArenaEndReason;
    };

/* ------------------------------------------------------------------------
 * Le plateau PROJETÉ : ce que la joueuse a le droit de voir
 * --------------------------------------------------------------------- */

export type ArenaBoardView = {
  rulesVersion: number;
  turn: number;
  turnLimit: number;
  active: ArenaSide;
  first: ArenaSide;
  summoned: boolean;
  status: ArenaStatus;
  endReason: ArenaEndReason | null;
  seq: number;
  player: {
    lp: number;
    deckCount: number;
    hand: ArenaCard[];
    field: ArenaField;
    graveyard: ArenaCard[];
  };
  npc: {
    lp: number;
    deckCount: number;
    /** Le nombre seul : la main de la gardienne est secrète. */
    handCount: number;
    field: ArenaField;
    graveyard: ArenaCard[];
  };
};

/** Un événement et le plateau juste après lui. */
export type ArenaStep = { event: ArenaEvent; board: ArenaBoardView };
