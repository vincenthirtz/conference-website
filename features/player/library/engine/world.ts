// État vivant d'une salle, sans réseau ni DOM : meubles, grille de marche,
// avatars — la joueuse (`player`), les AUTRES joueuses de la salle (`remote`,
// lot 5 phase B : `syncRemoteAvatars`) et des bots qui flânent pour mesurer
// les FPS (`bot`). Bulles d'emote et de phrase au-dessus des têtes, datées
// sur l'horloge de l'appelant (ms) : le monde ne lit aucune horloge.

import {
  advanceWalker,
  createWalker,
  type Direction,
  headingTile,
  isWalking,
  setWalkerPath,
  tileCenter,
  walkerTile,
  type Walker,
} from './motion';
import type { RoomDecor } from './decor';
import { boxContainsScreenPoint, centerDepth, depthSort } from './depthSort';
import { findPath, isWalkable, type WalkGrid } from './pathfinding';
import { metersToTiles, type Tile } from './projection';
import {
  type BubbleContent,
  hueOf,
  planRemoteStep,
  type RemoteAvatarInput,
  type RemoteStep,
} from './remotes';
import {
  avatarBox,
  buildWalkGrid,
  inRoom,
  itemBox,
  layerOf,
  specOf,
  type FurnitureCatalog,
  type RoomItem,
  type RoomModel,
} from './room';

export type AvatarKind = 'player' | 'remote' | 'bot';

/** Une bulle affichée, jusqu'à `expiresAt` (ms, horloge de l'appelant). */
export type AvatarBubble = BubbleContent & { expiresAt: number };

export type AvatarEntity = {
  id: string;
  kind: AvatarKind;
  walker: Walker;
  /** Feuille de sprites (clé `avatars` du manifeste) ; null = silhouette. */
  avatarId: string | null;
  /**
   * Look composé, forme compacte (lot 13, lookCompositor.ts) ; null : la
   * feuille `avatarId`, qui reste aussi le repli tant que le look n'est pas prêt.
   */
  look: string | null;
  /** Teinte de la tenue de la silhouette de remplacement. */
  hue: number;
  /** Raccourci de `kind === 'bot'`. */
  isBot: boolean;
  /** Pause restante (s) avant que le bot ne reparte. */
  wait: number;
  /** Pseudo affiché au-dessus de la tête (les autres joueuses) ; null : aucun. */
  label: string | null;
  /** Petit repère au-dessus de la joueuse (« discrète ») ; null : aucun. */
  marker: string | null;
  bubble: AvatarBubble | null;
  /** Autre joueuse : `receivedAt` de la dernière case visée suivie. */
  lastTargetAt: number | null;
};

/** Durée d'une bulle par défaut (celle du temps réel : LIBRARY_BUBBLE_MS). */
export const DEFAULT_BUBBLE_MS = 4_000;

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
  /** Durée d'affichage d'une bulle (ms). */
  bubbleMs = DEFAULT_BUBBLE_MS;
  private rand: () => number;
  /** La joueuse est arrivée au bout de son trajet (vidé par `takeArrivals`). */
  private arrivals: string[] = [];

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
   * la joueuse et les autres joueuses le premier (ordre stable), les bots au
   * hasard.
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

  /** Un identifiant d'avatar connu du manifeste (le premier à défaut), tant qu'il est chargé. */
  private knownAvatarId(id: string | null): string | null {
    const ids = this.avatarIds;
    if (!ids.length || (id && ids.includes(id))) return id;
    return ids[0] ?? null;
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
    return this.pushAvatar({
      id,
      kind: isBot ? 'bot' : 'player',
      walker: createWalker(tile, speed),
      avatarId,
      hue,
      isBot,
      wait: isBot ? this.rand() * 1.5 : 0,
    });
  }

  private pushAvatar(
    a: Omit<
      AvatarEntity,
      'label' | 'marker' | 'bubble' | 'lastTargetAt' | 'look'
    >
  ): AvatarEntity {
    const full: AvatarEntity = {
      ...a,
      look: null,
      label: null,
      marker: null,
      bubble: null,
      lastTargetAt: null,
    };
    this.avatars.push(full);
    return full;
  }

  avatar(id: string): AvatarEntity | undefined {
    return this.avatars.find((a) => a.id === id);
  }

  /**
   * Les AUTRES joueuses de la salle, à chaque changement de l'état temps réel
   * (`now` : ms, l'horloge de leurs `receivedAt`). Une nouvelle apparaît sur
   * sa case de présence ; une partie disparaît tout de suite ; la case visée
   * et la présence se réconcilient par `planRemoteStep` (remotes.ts). Une
   * entrée hors de la salle est ignorée ; la joueuse et les bots ne sont
   * jamais touchés, même à identifiant égal.
   */
  syncRemoteAvatars(list: readonly RemoteAvatarInput[], now: number): void {
    const wanted = new Set(list.map((r) => r.id));
    this.avatars = this.avatars.filter(
      (a) => a.kind !== 'remote' || wanted.has(a.id)
    );
    for (const input of list) {
      if (!inRoom(this.room, input.tile)) continue;
      let a = this.avatar(input.id);
      if (a && a.kind !== 'remote') continue;
      if (!a) {
        a = this.pushAvatar({
          id: input.id,
          kind: 'remote',
          walker: createWalker(input.tile, undefined, input.dir),
          avatarId: null,
          hue: hueOf(input.id),
          isBot: false,
          wait: 0,
        });
      }
      a.label = input.nickname;
      a.avatarId = this.knownAvatarId(input.avatarId);
      a.look = input.look ?? null;
      a.bubble = this.bubbleFrom(input.bubble, a.bubble, now);
      const plan = planRemoteStep({
        current: walkerTile(a.walker),
        walking: isWalking(a.walker),
        lastTargetAt: a.lastTargetAt,
        input,
        now,
      });
      a.lastTargetAt = plan.lastTargetAt;
      this.applyStep(a, plan.step);
    }
  }

  private applyStep(a: AvatarEntity, step: RemoteStep): void {
    if (step.kind === 'none') return;
    if (step.kind === 'walk' && this.walkTo(a.id, step.tile)) return;
    this.placeAvatar(a.id, step.tile);
  }

  /** Pose un avatar sur une case, sans marcher (trajet effacé). */
  placeAvatar(id: string, tile: Tile, dir?: Direction): boolean {
    const a = this.avatar(id);
    if (!a || !inRoom(this.room, tile)) return false;
    const c = tileCenter(tile);
    a.walker.x = c.x;
    a.walker.y = c.y;
    a.walker.path = [];
    if (dir !== undefined) a.walker.dir = dir;
    return true;
  }

  private bubbleFrom(
    b: RemoteAvatarInput['bubble'],
    prev: AvatarBubble | null,
    now: number
  ): AvatarBubble | null {
    if (!b) return null;
    const expiresAt = b.shownAt + this.bubbleMs;
    if (expiresAt <= now) return null;
    if (prev && prev.key === b.key && prev.text === b.text) return prev;
    return { key: b.key, glyph: b.glyph, text: b.text, expiresAt };
  }

  /** Montre une bulle au-dessus d'un avatar (la joueuse : son propre signe) ; null l'efface. */
  showBubble(id: string, content: BubbleContent | null, now: number): void {
    const a = this.avatar(id);
    if (!a) return;
    a.bubble = content ? { ...content, expiresAt: now + this.bubbleMs } : null;
  }

  /** Retire les bulles échues. true si l'image change. */
  pruneBubbles(now: number): boolean {
    let changed = false;
    for (const a of this.avatars) {
      if (a.bubble && a.bubble.expiresAt <= now) {
        a.bubble = null;
        changed = true;
      }
    }
    return changed;
  }

  /** La prochaine échéance de bulle (ms), ou null s'il n'y en a aucune. */
  nextBubbleExpiry(): number | null {
    let next: number | null = null;
    for (const a of this.avatars)
      if (a.bubble && (next === null || a.bubble.expiresAt < next))
        next = a.bubble.expiresAt;
    return next;
  }

  /** Repère au-dessus d'un avatar (« discrète ») ; null l'efface. */
  /** Look composé d'un avatar (la joueuse : celui qu'elle a enregistré) ; null : sa feuille. */
  setLook(id: string, look: string | null): void {
    const a = this.avatar(id);
    if (a) a.look = look;
  }

  setMarker(id: string, text: string | null): void {
    const a = this.avatar(id);
    if (a) a.marker = text;
  }

  /**
   * L'avatar dont la boîte projetée est sous le point `(sx, sy)` du monde, le
   * plus en avant ; seulement parmi `kinds` (par défaut : les autres
   * joueuses). Passe AVANT les meubles et le sol : une joueuse à moitié
   * cachée par un rayonnage reste visable.
   */
  avatarAtScreen(
    sx: number,
    sy: number,
    kinds: readonly AvatarKind[] = ['remote']
  ): AvatarEntity | null {
    let best: AvatarEntity | null = null;
    let bestDepth = Number.NEGATIVE_INFINITY;
    for (const a of this.avatars) {
      if (!kinds.includes(a.kind)) continue;
      const box = avatarBox(a.walker.x, a.walker.y);
      if (!boxContainsScreenPoint(box, sx, sy)) continue;
      const depth = centerDepth(box);
      if (depth > bestDepth) {
        best = a;
        bestDepth = depth;
      }
    }
    return best;
  }

  /** Les avatars `player` arrivés au bout de leur trajet depuis le dernier appel. */
  takeArrivals(): string[] {
    const out = this.arrivals;
    this.arrivals = [];
    return out;
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
        if (a.kind === 'player' && !isWalking(a.walker))
          this.arrivals.push(a.id);
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
