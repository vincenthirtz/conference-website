// features/player/library/arena/viewModel.ts — fonctions PURES des écrans de
// l'arène (docs/PLAN-tcg-2.md, lot 12) : faces → `TcgCard`, construction du
// deck, gestes proposés, récit des événements. Aucun réseau, aucune horloge :
// testé seul.
//
// LE SERVEUR DÉCIDE. Les gestes proposés ici viennent de `legalActions`
// (moteur synchronisé depuis conference-api) : ils allument des boutons, ils
// ne décident de rien — le serveur rejoue le contrôle et répond `422` s'il
// le faut.

import type { TcgCardSubject } from '@/components/tcg/TcgCard';
import type { CardStatProfile, CardStats } from '@/utils/tcg/cardStats';
import type { GameMascotSlug } from '@/utils/tcg/gameMascots';
import type { TcgRarity } from '@/utils/tcg/rarity';
import { legalActions } from './legal';
import type {
  ArenaCollectionEntry,
  ArenaDeckCard,
  ArenaFace,
  ArenaFaces,
} from './responses';
import type {
  ArenaAction,
  ArenaBoardView,
  ArenaCard,
  ArenaEvent,
  ArenaMonster,
  ArenaPosition,
  ArenaSide,
} from './rules';

/**
 * Le `code` stable d'une erreur de l'API (`PlayerHttpError`), ou null — la
 * même lecture que `libraryErrorCode`, ici pour que l'écran de l'arène,
 * chargé à la demande, n'emporte pas le modèle de la Library.
 */
export function errorCodeOf(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { status?: unknown; code?: unknown };
  return typeof e.status === 'number' && typeof e.code === 'string'
    ? e.code
    : null;
}

/* ------------------------------------------------------------- les faces -- */

/** La face à passer à `TcgCard`. Une face manquante : une carte sans image. */
export function faceSubject(
  face: ArenaFace | undefined,
  key: string
): TcgCardSubject {
  const id = key.slice(key.indexOf(':') + 1);
  if (!face) {
    if (key.startsWith('hero:'))
      return { kind: 'hero', slug: id, name: null, role: null };
    if (key.startsWith('map:'))
      return { kind: 'map', slug: id, name: null, imageUrl: null };
    if (key.startsWith('mascot:')) {
      return { kind: 'mascot', slug: id as GameMascotSlug, name: null };
    }
    if (key.startsWith('player:')) {
      return { kind: 'player', userId: id, displayName: null, imageUrl: null };
    }
    if (key.startsWith('fanart:')) {
      return {
        kind: 'fanart',
        fanartId: id,
        name: null,
        imageUrl: null,
        artistName: null,
        artistUrl: null,
      };
    }
    return { kind: 'team', teamId: id, name: null, slug: null, logoUrl: null };
  }
  switch (face.kind) {
    case 'player':
      return {
        kind: 'player',
        userId: face.userId,
        displayName: face.displayName,
        imageUrl: face.imageUrl,
        figure: face.figure,
      };
    case 'map':
      return {
        kind: 'map',
        slug: face.slug,
        name: face.name,
        imageUrl: face.imageUrl,
      };
    case 'fanart':
      return {
        kind: 'fanart',
        fanartId: face.fanartId,
        name: face.title,
        imageUrl: face.imageUrl,
        artistName: face.artistName,
        artistUrl: face.artistUrl,
        category: face.category,
        description: face.description,
        target: face.target,
      };
    case 'mascot':
      return {
        kind: 'mascot',
        slug: face.slug as GameMascotSlug,
        name: face.name,
      };
    case 'hero':
      return {
        kind: 'hero',
        slug: face.slug,
        name: face.name,
        role: face.role,
      };
    default:
      return {
        kind: 'team',
        teamId: face.teamId,
        name: face.name,
        slug: face.slug,
        logoUrl: face.logoUrl,
        cardImageUrl: face.cardImageUrl,
        logoCredit: face.logoCredit,
      };
  }
}

/**
 * Le nom à DIRE d'une carte. Une joueuse sans nom (retirée du TCG, face
 * illisible) prend `anonymous` — jamais son identifiant.
 */
export function faceName(
  face: ArenaFace | undefined,
  key: string,
  anonymous: string
): string {
  if (face) {
    const name =
      face.kind === 'player'
        ? face.displayName
        : face.kind === 'fanart'
          ? face.title
          : face.name;
    if (name) return name;
  }
  if (key.startsWith('player:') || key.startsWith('fanart:')) return anonymous;
  const id = key.slice(key.indexOf(':') + 1);
  return id.replace(/[-_]+/g, ' ');
}

/**
 * Le nom anonyme (« une joueuse ») s'écrit pour le MILIEU d'une phrase. Une
 * phrase — ou une étiquette seule — qui s'ouvre sur lui prend la majuscule ;
 * tout autre début est rendu tel quel : un pseudo en minuscules reste le sien.
 */
export function capitalizeLead(text: string, anonymous: string): string {
  return anonymous && text.startsWith(anonymous)
    ? anonymous.charAt(0).toLocaleUpperCase() + text.slice(1)
    : text;
}

export function statsOf(
  card: Pick<ArenaCard, 'level' | 'attack' | 'defense' | 'profile'>
): CardStats {
  return {
    level: card.level,
    attack: card.attack,
    defense: card.defense,
    profile: card.profile,
  };
}

/** `2026-W43` → « semaine 43 » (gabarit `{n}`), la semaine telle quelle sinon. */
export function weekText(week: string, template: string): string {
  const m = /^\d{4}-W(\d{2})$/.exec(week);
  return m ? template.replace('{n}', String(Number(m[1]))) : week;
}

/* --------------------------------------------------------------- le deck -- */

export type DeckFilters = {
  rarity: TcgRarity | 'all';
  profile: CardStatProfile | 'all';
};

/** Combien de fois chaque clé est déjà dans le deck. */
export function countInDeck(deck: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const k of deck) out.set(k, (out.get(k) ?? 0) + 1);
  return out;
}

/** Exemplaires encore disponibles d'un sujet (possédés − déjà dans le deck). */
export function availableCopies(
  entry: ArenaCollectionEntry,
  deck: readonly string[]
): number {
  return Math.max(
    0,
    entry.copies.length - (countInDeck(deck).get(entry.key) ?? 0)
  );
}

/** La meilleure copie encore libre d'un sujet : celle que l'ajout prendra. */
export function nextCopy(
  entry: ArenaCollectionEntry,
  deck: readonly string[]
): ArenaDeckCard | null {
  const used = countInDeck(deck).get(entry.key) ?? 0;
  return entry.copies[used] ?? null;
}

/** Filtre de la collection : sur la meilleure copie libre (celle qu'on ajouterait). */
export function filterCollection(
  entries: readonly ArenaCollectionEntry[],
  filters: DeckFilters
): ArenaCollectionEntry[] {
  return entries.filter((e) => {
    const best = e.copies[0];
    if (!best) return false;
    if (
      filters.rarity !== 'all' &&
      !e.copies.some((c) => c.rarity === filters.rarity)
    ) {
      return false;
    }
    if (
      filters.profile !== 'all' &&
      !e.copies.some((c) => c.profile === filters.profile)
    ) {
      return false;
    }
    return true;
  });
}

/** Ajoute une clé si le deck a de la place et qu'un exemplaire est libre. */
export function addToDeck(
  deck: readonly string[],
  entry: ArenaCollectionEntry,
  size: number
): string[] {
  if (deck.length >= size || availableCopies(entry, deck) === 0)
    return [...deck];
  return [...deck, entry.key];
}

export function removeFromDeck(
  deck: readonly string[],
  index: number
): string[] {
  return deck.filter((_, i) => i !== index);
}

/**
 * Les cartes que jouerait ce deck (brouillon), dans l'ordre : chaque clé prend
 * la copie suivante de son sujet, les meilleures d'abord — la règle du
 * serveur au lancement. `null` : plus d'exemplaire (la carte sera écartée).
 */
export function previewDeck(
  deck: readonly string[],
  collection: readonly ArenaCollectionEntry[]
): (ArenaDeckCard | null)[] {
  const byKey = new Map(collection.map((e) => [e.key, e]));
  const used = new Map<string, number>();
  return deck.map((key) => {
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    return byKey.get(key)?.copies[n] ?? null;
  });
}

/* ---------------------------------------------------------------- le duel -- */

/** Où est cette carte sur le plateau visible (main, terrains, cimetières). */
export function findCard(board: ArenaBoardView, uid: string): ArenaCard | null {
  const pools: ArenaCard[][] = [
    board.player.hand,
    board.player.graveyard,
    board.npc.graveyard,
    board.player.field.flatMap((m) => (m ? [m.card] : [])),
    board.npc.field.flatMap((m) => (m ? [m.card] : [])),
  ];
  for (const pool of pools) {
    const hit = pool.find((c) => c.uid === uid);
    if (hit) return hit;
  }
  return null;
}

export type Selection =
  | { kind: 'hand'; uid: string }
  | { kind: 'monster'; uid: string }
  | null;

export type SummonOption = {
  position: ArenaPosition;
  /** Combinaisons de sacrifices permises (vide : sans sacrifice). */
  tributeSets: string[][];
};

/** Ce que la carte choisie permet, d'après les gestes légaux. */
export function optionsFor(
  board: ArenaBoardView,
  selection: Selection
): {
  summon: SummonOption[];
  /** Cibles d'attaque (`null` = directe). */
  targets: (string | null)[];
  canChangePosition: boolean;
} {
  const out = {
    summon: [] as SummonOption[],
    targets: [] as (string | null)[],
    canChangePosition: false,
  };
  if (!selection) return out;
  const actions = legalActions(board);
  if (selection.kind === 'hand') {
    for (const position of ['attack', 'defense'] as const) {
      const sets = actions
        .filter(
          (a): a is Extract<ArenaAction, { type: 'summon' }> =>
            a.type === 'summon' &&
            a.card === selection.uid &&
            a.position === position
        )
        .map((a) => a.tributes ?? []);
      if (sets.length > 0) out.summon.push({ position, tributeSets: sets });
    }
    return out;
  }
  for (const a of actions) {
    if (a.type === 'attack' && a.attacker === selection.uid)
      out.targets.push(a.target);
    if (a.type === 'change_position' && a.monster === selection.uid) {
      out.canChangePosition = true;
    }
  }
  return out;
}

/** Les sacrifices choisis forment-ils une combinaison permise ? */
export function isTributeSetAllowed(
  option: SummonOption,
  chosen: readonly string[]
): boolean {
  const key = [...chosen].sort().join(',');
  return option.tributeSets.some((s) => [...s].sort().join(',') === key);
}

export function monsterAt(
  board: ArenaBoardView,
  side: ArenaSide,
  zone: number
): ArenaMonster | null {
  return (
    (side === 'player' ? board.player.field : board.npc.field)[zone] ?? null
  );
}

/* ---------------------------------------------------------------- le récit -- */

/** Les gabarits du récit (namespace `playerLibraryArena.events`). */
export type EventWords = {
  turnStartYou: string;
  turnStartGuardian: string;
  drawYou: string;
  drawGuardian: string;
  summonYou: string;
  summonGuardian: string;
  tributes: string;
  positionYou: string;
  positionGuardian: string;
  attackDirectYou: string;
  attackDirectGuardian: string;
  attackWin: string;
  attackLose: string;
  attackRebound: string;
  attackTie: string;
  damageYou: string;
  damageGuardian: string;
  end: Record<'won' | 'lost' | 'draw' | 'abandoned', string>;
  positions: Record<ArenaPosition, string>;
  /** En minuscule, pour le milieu d'une phrase (cf. `capitalizeLead`). */
  anonymous: string;
};

export const fill = (
  template: string,
  values: Record<string, string | number>
) =>
  template.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in values ? String(values[k]) : m
  );

/**
 * La phrase d'un événement, pour le journal et la région `aria-live`. `board`
 * est le plateau APRÈS l'événement (les cartes détruites y sont au cimetière,
 * donc toujours nommables). `null` : rien à dire (fin de tour).
 */
export function narrate(
  event: ArenaEvent,
  board: ArenaBoardView,
  faces: ArenaFaces,
  w: EventWords
): string | null {
  const text = narrateEvent(event, board, faces, w);
  return text === null ? null : capitalizeLead(text, w.anonymous);
}

function narrateEvent(
  event: ArenaEvent,
  board: ArenaBoardView,
  faces: ArenaFaces,
  w: EventWords
): string | null {
  const name = (uid: string | null) => {
    if (!uid) return '';
    const card = findCard(board, uid);
    return card
      ? faceName(faces[card.key], card.key, w.anonymous)
      : w.anonymous;
  };
  const damage = (d: { side: ArenaSide; amount: number } | null) =>
    d
      ? fill(d.side === 'player' ? w.damageYou : w.damageGuardian, {
          amount: d.amount,
        })
      : '';
  switch (event.type) {
    case 'turn_start':
      return fill(
        event.side === 'player' ? w.turnStartYou : w.turnStartGuardian,
        {
          turn: event.turn,
        }
      );
    case 'draw':
      return event.side === 'player'
        ? fill(w.drawYou, { name: name(event.card) })
        : w.drawGuardian;
    case 'summon': {
      const base = fill(
        event.side === 'player' ? w.summonYou : w.summonGuardian,
        {
          name: name(event.card),
          position: w.positions[event.position],
        }
      );
      return event.tributes.length > 0
        ? base +
            fill(w.tributes, { names: event.tributes.map(name).join(', ') })
        : base;
    }
    case 'position':
      return fill(
        event.side === 'player' ? w.positionYou : w.positionGuardian,
        {
          name: name(event.monster),
          position: w.positions[event.position],
        }
      );
    case 'attack': {
      const c = event.combat;
      if (c.target === null) {
        return fill(
          event.side === 'player' ? w.attackDirectYou : w.attackDirectGuardian,
          {
            attacker: name(c.attacker),
            amount: c.damage?.amount ?? c.attackerAtk,
          }
        );
      }
      const values = {
        attacker: name(c.attacker),
        target: name(c.target),
        atk: c.attackerAtk,
        value: c.targetValue ?? 0,
      };
      let base: string;
      if (c.destroyed.includes(c.target)) base = fill(w.attackWin, values);
      else if (c.destroyed.includes(c.attacker))
        base = fill(w.attackLose, values);
      else if (c.damage) base = fill(w.attackRebound, values);
      else base = fill(w.attackTie, values);
      return base + damage(c.damage);
    }
    case 'duel_end':
      return w.end[event.status];
    default:
      return null;
  }
}
