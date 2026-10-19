// État vivant d'une salle, sans réseau ni DOM : meubles, grille de marche,
// avatars (la joueuse et des bots qui flânent pour mesurer les FPS).

import {
  advanceWalker,
  createWalker,
  headingTile,
  isWalking,
  setWalkerPath,
  walkerTile,
  type Walker,
} from './motion';
import type { RoomDecor } from './decor';
import { boxContainsScreenPoint, centerDepth, depthSort } from './depthSort';
import { findPath, isWalkable, type WalkGrid } from './pathfinding';
import { metersToTiles, type Tile } from './projection';
import {
  buildWalkGrid,
  inRoom,
  itemBox,
  layerOf,
  specOf,
  type FurnitureCatalog,
  type RoomItem,
  type RoomModel,
} from './room';

export type AvatarEntity = {
  id: string;
  walker: Walker;
  /** Feuille de sprites (clé `avatars` du manifeste) ; null = silhouette. */
  avatarId: string | null;
  /** Teinte de la tenue de la silhouette de remplacement. */
  hue: number;
  isBot: boolean;
  /** Pause restante (s) avant que le bot ne reparte. */
  wait: number;
};

/** PRNG déterministe (mulberry32) : bots reproductibles d'un rendu à l'autre. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bots : entre 1,0 et 1,5 m/s, pour ne pas marcher au pas. */
const BOT_SPEED_MPS: readonly [number, number] = [1.0, 1.5];

export class LibraryWorld {
  /**
   * La salle VIVANTE : une copie de celle reçue (meubles compris), que
   * `setRoomItems` / `setDecor` remplacent sans toucher à l'objet de
   * l'appelant.
   */
  room: RoomModel;
  catalog: FurnitureCatalog;
  grid: WalkGrid;
  avatars: AvatarEntity[] = [];
  hover: Tile | null = null;
  /** Avatars disponibles dans le manifeste (vide = silhouettes). */
  avatarIds: string[] = [];
  private rand: () => number;

  constructor(room: RoomModel, catalog: FurnitureCatalog, seed = 42) {
    this.room = { ...room, items: room.items.map((i) => ({ ...i })) };
    this.catalog = catalog;
    this.grid = buildWalkGrid(this.room, catalog);
    this.rand = mulberry32(seed);
  }

  /** Change de catalogue (manifeste chargé) : les empreintes peuvent bouger. */
  setCatalog(catalog: FurnitureCatalog): void {
    this.catalog = catalog;
    this.grid = buildWalkGrid(this.room, catalog);
  }

  /**
   * Remplace les meubles posés (mode déco, enregistrement) : la grille de
   * marche est reconstruite. Un avatar qui se retrouve sur une case
   * désormais occupée n'est pas déplacé : il en ressort au prochain trajet.
   */
  setRoomItems(items: readonly RoomItem[]): void {
    this.room = { ...this.room, items: items.map((i) => ({ ...i })) };
    this.grid = buildWalkGrid(this.room, this.catalog);
  }

  /** Change le sol et les murs (réglages de l'appartement). */
  setDecor(decor: RoomDecor | undefined): void {
    this.room = { ...this.room, decor };
  }

  /**
   * Le meuble dont l'IMAGE (sa boîte projetée) est sous le point `(sx, sy)`
   * du monde, ou null : l'objet le plus en avant, sinon un meuble mural,
   * sinon un tapis. `skip` : un meuble à ignorer (celui qu'on déplace).
   */
  itemAtScreen(
    sx: number,
    sy: number,
    skip: string | null = null
  ): RoomItem | null {
    const hits: Record<
      'object' | 'wall' | 'floor',
      { item: RoomItem; box: ReturnType<typeof itemBox> }[]
    > = {
      object: [],
      wall: [],
      floor: [],
    };
    for (const item of this.room.items) {
      if (item.id === skip) continue;
      const spec = specOf(this.catalog, item.key);
      const box = itemBox(item, spec);
      if (boxContainsScreenPoint(box, sx, sy))
        hits[layerOf(spec)].push({ item, box });
    }
    if (hits.object.length) return depthSort(hits.object).at(-1)?.item ?? null;
    for (const layer of ['wall', 'floor'] as const) {
      const list = hits[layer];
      if (!list.length) continue;
      list.sort((a, b) => centerDepth(a.box) - centerDepth(b.box));
      return list.at(-1)?.item ?? null;
    }
    return null;
  }

  /**
   * Avatars du manifeste. Un avatar sans identifiant valide en reçoit un :
   * la joueuse le premier (ordre stable), les bots au hasard.
   */
  setAvatarIds(ids: string[]): void {
    this.avatarIds = [...ids];
    for (const a of this.avatars) {
      if (a.avatarId && ids.includes(a.avatarId)) continue;
      a.avatarId = a.isBot ? this.pickAvatarId() : (ids[0] ?? null);
    }
  }

  private pickAvatarId(): string | null {
    const ids = this.avatarIds;
    return ids.length ? ids[Math.floor(this.rand() * ids.length)] : null;
  }

  addAvatar(
    id: string,
    tile: Tile,
    hue: number,
    isBot = false,
    avatarId: string | null = null
  ): AvatarEntity {
    const [lo, hi] = BOT_SPEED_MPS;
    const speed = isBot
      ? metersToTiles(lo + this.rand() * (hi - lo))
      : undefined;
    const a: AvatarEntity = {
      id,
      walker: createWalker(tile, speed),
      avatarId,
      hue,
      isBot,
      wait: isBot ? this.rand() * 1.5 : 0,
    };
    this.avatars.push(a);
    return a;
  }

  avatar(id: string): AvatarEntity | undefined {
    return this.avatars.find((a) => a.id === id);
  }

  /** Envoie un avatar vers une case. false si elle est inaccessible. */
  walkTo(id: string, goal: Tile): boolean {
    const a = this.avatar(id);
    if (!a || !inRoom(this.room, goal)) return false;
    const from = headingTile(a.walker);
    const path = findPath(this.grid, from, goal);
    if (!path) return false;
    setWalkerPath(a.walker, path);
    return true;
  }

  randomFreeTile(): Tile | null {
    for (let k = 0; k < 50; k++) {
      const t = {
        i: Math.floor(this.rand() * this.room.w),
        j: Math.floor(this.rand() * this.room.d),
      };
      if (isWalkable(this.grid, t.i, t.j)) return t;
    }
    return null;
  }

  spawnBots(count: number): void {
    for (let n = 0; n < count; n++) {
      const t = this.randomFreeTile();
      if (!t) return;
      const hue = Math.floor(this.rand() * 360);
      this.addAvatar(`bot-${n}`, t, hue, true, this.pickAvatarId());
    }
  }

  clearBots(): void {
    this.avatars = this.avatars.filter((a) => !a.isBot);
  }

  /** Quelque chose bouge ou va bouger : la boucle de rendu doit tourner. */
  isActive(): boolean {
    return this.avatars.some(
      (a) => isWalking(a.walker) || (a.isBot && a.wait > 0)
    );
  }

  /** Avance la simulation de dt secondes. Renvoie true si l'image a changé. */
  update(dt: number): boolean {
    let changed = false;
    for (const a of this.avatars) {
      if (advanceWalker(a.walker, dt)) {
        changed = true;
        if (a.isBot && !isWalking(a.walker)) a.wait = 0.4 + this.rand() * 2;
        continue;
      }
      if (!a.isBot) continue;
      a.wait -= dt;
      if (a.wait > 0) continue;
      const goal = this.randomFreeTile();
      if (!goal || !this.walkTo(a.id, goal)) a.wait = 0.5;
      // Cible = sa propre case : on retente plus tard.
      else if (!isWalking(a.walker)) a.wait = 0.5;
    }
    return changed;
  }

  /** Case occupée par la joueuse (debug et tests e2e). */
  tileOf(id: string): Tile | null {
    const a = this.avatar(id);
    return a ? walkerTile(a.walker) : null;
  }
}
