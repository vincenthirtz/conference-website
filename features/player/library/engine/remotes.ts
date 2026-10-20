// Les AUTRES joueuses dans le moteur (lot 5 phase B de
// docs/PLAN-womens-library.md) : ce que l'écran passe au monde à chaque
// changement de la salle (`LibraryWorld.syncRemoteAvatars`), et la règle qui
// réconcilie la case VISÉE (broadcast `move`) et la case ANNONCÉE (présence).
//
// Pur : aucune horloge (l'heure est passée en argument), aucun DOM, aucun
// réseau. Les textes (pseudo, bulle) arrivent DÉJÀ traduits : le moteur n'a
// pas d'i18n.
//
// LA RÈGLE (`planRemoteStep`) :
//   1. une case visée plus RÉCENTE que la dernière suivie (par `receivedAt`)
//      → l'avatar y marche (A* depuis la case où il va) ; inaccessible, il y
//      est posé directement ;
//   2. sinon, à l'arrêt, s'il n'est pas sur la case de sa présence ET que
//      cette présence ne peut pas être une annonce EN RETARD (aucune case
//      visée, ou la dernière reçue il y a plus de PRESENCE_GRACE_MS) → il la
//      rejoint : à pied tout près (NEAR_TILES), posé directement au-delà
//      (reconnexion, broadcast perdu) ;
//   3. sinon rien.
// Pourquoi ce délai de grâce : la présence part au plus chaque seconde, à
// l'ARRIVÉE ; une joueuse qui reclique aussitôt envoie la case suivante AVANT
// la présence de l'arrivée précédente. Sans délai, l'avatar repartirait en
// arrière vers une case déjà quittée.

import type { Direction } from './motion';
import type { Tile } from './projection';

/** Une bulle au-dessus d'une tête : pictogramme (emote) et mot, traduits. */
export type BubbleContent = {
  /** Identité de la bulle : une nouvelle clé la (re)montre. */
  key: string;
  glyph: string | null;
  text: string;
};

/** Une autre joueuse, telle que l'écran la décrit au moteur. */
export type RemoteAvatarInput = {
  /** Identifiant de l'entité (le `userId` de la présence). */
  id: string;
  nickname: string;
  /** Feuille de sprites (clé `avatars` du manifeste) ; null = silhouette. */
  avatarId: string | null;
  /** Look composé annoncé (forme compacte, lot 13) ; absent : la feuille `avatarId`. */
  look?: string | null;
  /** Case annoncée dans la présence. */
  tile: Tile;
  dir: Direction;
  /** Dernière case visée, datée à la RÉCEPTION (ms, horloge de l'appelant). */
  target: { tile: Tile; receivedAt: number } | null;
  /** Bulle en cours, datée à la réception ; le moteur la retire à échéance. */
  bubble: (BubbleContent & { shownAt: number }) | null;
};

/** Une présence qui contredit une case visée reçue depuis moins que ça est tenue pour en retard. */
export const PRESENCE_GRACE_MS = 2_000;
/** Jusqu'à cette distance (en cases), l'avatar rejoint sa présence à pied. */
export const NEAR_TILES = 3;

export type RemoteStep =
  | { kind: 'none' }
  /** Marcher vers la case (A*) ; inaccessible : y être posé. */
  | { kind: 'walk'; tile: Tile }
  /** Être posé sur la case, sans marcher. */
  | { kind: 'place'; tile: Tile };

const sameTile = (a: Tile, b: Tile) => a.i === b.i && a.j === b.j;

/** Distance de Tchebychev (pas en diagonale compris). */
export function tileDistance(a: Tile, b: Tile): number {
  return Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j));
}

/**
 * Que faire d'un avatar distant à cette synchronisation ? Rend le geste et
 * le `receivedAt` de la dernière case visée désormais suivie.
 */
export function planRemoteStep(s: {
  /** Case sous ses pieds. */
  current: Tile;
  walking: boolean;
  /** `receivedAt` de la dernière case visée suivie (null : aucune). */
  lastTargetAt: number | null;
  input: Pick<RemoteAvatarInput, 'tile' | 'target'>;
  now: number;
}): { step: RemoteStep; lastTargetAt: number | null } {
  const { target, tile } = s.input;
  if (target && (s.lastTargetAt === null || target.receivedAt > s.lastTargetAt))
    return {
      step: { kind: 'walk', tile: target.tile },
      lastTargetAt: target.receivedAt,
    };
  const keep = { lastTargetAt: s.lastTargetAt };
  if (s.walking || sameTile(s.current, tile))
    return { step: { kind: 'none' }, ...keep };
  if (target && s.now - target.receivedAt < PRESENCE_GRACE_MS)
    return { step: { kind: 'none' }, ...keep };
  return {
    step:
      tileDistance(s.current, tile) > NEAR_TILES
        ? { kind: 'place', tile }
        : { kind: 'walk', tile },
    ...keep,
  };
}

/** Teinte stable de la silhouette d'une joueuse (avant le chargement des sprites). */
export function hueOf(id: string): number {
  let h = 0;
  for (let k = 0; k < id.length; k++) h = (h * 33 + id.charCodeAt(k)) >>> 0;
  return h % 360;
}
