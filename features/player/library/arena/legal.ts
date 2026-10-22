// features/player/library/arena/legal.ts — CE QUI EST PERMIS, en un seul
// endroit, pour les deux côtés d'un duel d'arène.
//
// Le moteur (`engine.ts`) refuse un geste de la joueuse avec ces contrôles,
// sur le plateau PROJETÉ qu'elle voit (`validateAction`) ; l'IA de la
// gardienne (`npc.ts`) ne propose que des gestes qui les passent ; le site
// les reçoit par la synchro pour PRÉVISUALISER ce que la joueuse peut faire
// (`legalActions`) — jamais pour décider : le serveur rejoue le contrôle.
//
// Ils ne lisent QUE ce que la joueuse voit déjà (sa main, les deux terrains,
// le tour) : aucune information secrète n'est nécessaire pour dire si un
// geste est permis, donc le même code sert des deux côtés du réseau.
//
// PUR, sans import à l'exécution hors des règles.

import {
  ARENA_POSITIONS,
  ARENA_ZONES,
  tributesForLevel,
  type ArenaAction,
  type ArenaActionError,
  type ArenaBoardView,
  type ArenaCard,
  type ArenaField,
  type ArenaMonster,
  type ArenaSummonAction,
} from './rules';

/** Ce qu'un contrôle lit du tour en cours. */
export type ArenaTurnView = { turn: number; summoned: boolean };
/** Ce qu'un contrôle lit de son propre côté. */
export type ArenaOwnView = { hand: readonly ArenaCard[]; field: ArenaField };
/** Ce qu'un contrôle lit du côté adverse. */
export type ArenaOpponentView = { field: ArenaField };

export function findMonster(
  field: ArenaField,
  uid: string
): { zone: number; monster: ArenaMonster } | null {
  for (let zone = 0; zone < field.length; zone += 1) {
    const monster = field[zone];
    if (monster && monster.card.uid === uid) return { zone, monster };
  }
  return null;
}

export function monstersOf(field: ArenaField): ArenaMonster[] {
  return field.filter((m): m is ArenaMonster => m !== null);
}

export function isFieldEmpty(field: ArenaField): boolean {
  return field.every((m) => m === null);
}

/** Zones libres une fois ces sacrifices partis, dans l'ordre. */
export function freeZonesAfter(
  field: ArenaField,
  tributes: readonly string[]
): number[] {
  const out: number[] = [];
  for (let zone = 0; zone < ARENA_ZONES; zone += 1) {
    const m = field[zone] ?? null;
    if (m === null || tributes.includes(m.card.uid)) out.push(zone);
  }
  return out;
}

/** La zone où l'invocation se pose : la demandée si libre, sinon la première. */
export function summonZone(
  field: ArenaField,
  tributes: readonly string[],
  wanted: number | undefined
): number | null {
  const free = freeZonesAfter(field, tributes);
  if (wanted === undefined) return free[0] ?? null;
  return free.includes(wanted) ? wanted : null;
}

export function checkSummon(
  t: ArenaTurnView,
  me: ArenaOwnView,
  action: ArenaSummonAction
): ArenaActionError | null {
  if (t.summoned) return 'already_summoned';
  const card = me.hand.find((c) => c.uid === action.card);
  if (!card) return 'card_not_in_hand';
  if (!(ARENA_POSITIONS as readonly string[]).includes(action.position)) {
    return 'invalid_position';
  }
  const tributes = action.tributes ?? [];
  if (new Set(tributes).size !== tributes.length) return 'invalid_tribute';
  for (const uid of tributes) {
    if (!findMonster(me.field, uid)) return 'invalid_tribute';
  }
  if (tributes.length !== tributesForLevel(card.level)) {
    return 'wrong_tribute_count';
  }
  const free = freeZonesAfter(me.field, tributes);
  if (free.length === 0) return 'no_free_zone';
  if (action.zone !== undefined && !free.includes(action.zone)) {
    return 'zone_occupied';
  }
  return null;
}

export function checkChangePosition(
  t: ArenaTurnView,
  me: ArenaOwnView,
  uid: string
): ArenaActionError | null {
  const found = findMonster(me.field, uid);
  if (!found) return 'monster_not_found';
  const m = found.monster;
  if (m.summonedTurn === t.turn) return 'just_summoned';
  if (m.positionChangedTurn === t.turn) return 'position_already_changed';
  if (m.attackedTurn === t.turn) return 'already_attacked';
  return null;
}

export function checkAttack(
  t: ArenaTurnView,
  me: ArenaOwnView,
  opp: ArenaOpponentView,
  attacker: string,
  target: string | null
): ArenaActionError | null {
  // Le tout premier tour du duel : personne n'attaque (celle qui commence n'a
  // pas encore pioché, l'autre n'a pas encore joué).
  if (t.turn === 1) return 'no_attack_first_turn';
  const found = findMonster(me.field, attacker);
  if (!found) return 'monster_not_found';
  const m = found.monster;
  if (m.position !== 'attack') return 'not_in_attack_position';
  if (m.attackedTurn === t.turn) return 'already_attacked';
  if (target === null) {
    return isFieldEmpty(opp.field) ? null : 'direct_attack_blocked';
  }
  return findMonster(opp.field, target) ? null : 'target_not_found';
}

/**
 * Le geste de la joueuse est-il permis sur ce plateau ? `null` = oui, sinon
 * le code du refus. Le tour et la partie en cours sont vérifiés ici aussi.
 */
export function validateAction(
  board: ArenaBoardView,
  action: ArenaAction
): ArenaActionError | null {
  if (board.status !== 'active') return 'duel_over';
  if (board.active !== 'player') return 'not_your_turn';
  const t = { turn: board.turn, summoned: board.summoned };
  switch (action.type) {
    case 'summon':
      return checkSummon(t, board.player, action);
    case 'change_position':
      return checkChangePosition(t, board.player, action.monster);
    case 'attack':
      return checkAttack(
        t,
        board.player,
        board.npc,
        action.attacker,
        action.target
      );
    case 'end_turn':
      return null;
    default:
      return 'invalid_action';
  }
}

/** Les combinaisons de `k` éléments, dans l'ordre d'entrée. */
export function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > items.length) return [];
  const out: T[][] = [];
  const pick = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i < items.length; i += 1) {
      acc.push(items[i]);
      pick(i + 1, acc);
      acc.pop();
    }
  };
  pick(0, []);
  return out;
}

/**
 * TOUS les gestes permis à la joueuse, la zone d'invocation laissée au
 * moteur (la première libre). Sert l'écran (boutons actifs, cibles proposées)
 * et les tests (chaque geste rendu ici doit passer `validateAction`).
 */
export function legalActions(board: ArenaBoardView): ArenaAction[] {
  if (board.status !== 'active' || board.active !== 'player') return [];
  const t = { turn: board.turn, summoned: board.summoned };
  const me = board.player;
  const out: ArenaAction[] = [];

  if (!t.summoned) {
    const fieldUids = monstersOf(me.field).map((m) => m.card.uid);
    for (const card of me.hand) {
      for (const tributes of combinations(
        fieldUids,
        tributesForLevel(card.level)
      )) {
        if (freeZonesAfter(me.field, tributes).length === 0) continue;
        for (const position of ARENA_POSITIONS) {
          out.push({ type: 'summon', card: card.uid, position, tributes });
        }
      }
    }
  }
  for (const m of monstersOf(me.field)) {
    if (!checkChangePosition(t, me, m.card.uid)) {
      out.push({ type: 'change_position', monster: m.card.uid });
    }
  }
  for (const m of monstersOf(me.field)) {
    const targets: (string | null)[] = isFieldEmpty(board.npc.field)
      ? [null]
      : monstersOf(board.npc.field).map((o) => o.card.uid);
    for (const target of targets) {
      if (!checkAttack(t, me, board.npc, m.card.uid, target)) {
        out.push({ type: 'attack', attacker: m.card.uid, target });
      }
    }
  }
  out.push({ type: 'end_turn' });
  return out;
}
