// Les gestes de LA JOUEUSE sur les meubles (lot 15), pour le contrôleur : un
// appui sur un meuble interactif la fait marcher vers sa case d'accès puis
// s'asseoir, s'allonger ou s'en servir ; un appui sur le sol la relève et la
// fait marcher ; « Se lever » la relève sur place. Et les rappels qui en
// découlent, pour que l'écran parle au réseau et ouvre son interface :
//   - `onPlayerWalk(case, intention?)` : elle part (un appui = un message) ;
//   - `onPlayerArrive(case, direction, posture?)` : elle est arrivée, OU sa
//     posture a changé sur place (assise tout de suite, relevée, meuble
//     déplacé) — la présence suit ;
//   - `onPlayerPosture(posture | null)` : pour le bouton sous la scène ;
//   - `onFurnitureUse({ activity, itemId, anchor })` : elle se sert d'un
//     meuble (l'armoire ouvre l'éditeur de look, là où il y en a un).
// Les meubles PROPOSÉS sont ceux dont l'écran nomme l'action (`labels`,
// traduits : le moteur n'a pas d'i18n) ; sans `labels`, aucun.

import type { LibraryHotspot } from './hotspots';
import {
  type InteractionKind,
  interactionOf,
  type UseActivity,
} from './interactions';
import { type Direction, isWalking, walkerTile } from './motion';
import {
  type AvatarIntent,
  planFurniture,
  type PlayerPosture,
  type Posture,
  publicPosture,
} from './postures';
import {
  type Camera,
  gridToScreen,
  type ScreenPoint,
  type Tile,
  worldToCanvas,
} from './projection';
import { itemBox, type RoomItem, specOf } from './room';
import type { LibraryWorld } from './world';

export type InteractionOptions = {
  /** Le nom (traduit) de chaque action PROPOSÉE ; une absente ne l'est pas. */
  labels: Partial<Record<InteractionKind, string>>;
  /** Le pictogramme de chaque activité, au-dessus de qui s'en sert. */
  glyphs?: Partial<Record<UseActivity, string>>;
};

/** Elle se sert d'un meuble ; `anchor` : au-dessus de lui, px CSS du conteneur. */
export type FurnitureUse = {
  activity: UseActivity;
  itemId: string;
  anchor: ScreenPoint;
};

export type PlayerCallbacks = {
  onPlayerWalk?: (goal: Tile, intent?: AvatarIntent) => void;
  onPlayerArrive?: (
    tile: Tile,
    dir: Direction,
    posture?: PlayerPosture
  ) => void;
  onPlayerPosture?: (posture: PlayerPosture | null) => void;
  onFurnitureUse?: (use: FurnitureUse) => void;
};

export class PlayerActions {
  private options: InteractionOptions | null = null;
  /** La dernière posture signalée (changement = rappels). */
  private last: Posture | null = null;

  constructor(
    private world: LibraryWorld,
    private playerId: string,
    private callbacks: () => PlayerCallbacks,
    private camera: () => Camera,
    options?: InteractionOptions
  ) {
    this.set(options ?? null);
  }

  /** Les actions proposées et leurs pictogrammes (null : aucune). */
  set(options: InteractionOptions | null): void {
    this.options = options;
    this.world.activityGlyphs = { ...(options?.glyphs ?? {}) };
  }

  /** Le meuble interactif dont l'image est sous un point du MONDE. */
  private hit(
    sx: number,
    sy: number
  ): { item: RoomItem; kind: InteractionKind } | null {
    const labels = this.options?.labels;
    if (!labels) return null;
    const item = this.world.itemAtScreen(sx, sy);
    const kind = item ? interactionOf(item, this.world.catalog) : null;
    return item && kind && labels[kind] ? { item, kind } : null;
  }

  /** Survol (point du MONDE) : le meuble comme une zone — main, nom, contour. */
  hoverAt = (sx: number, sy: number): LibraryHotspot | null => {
    const h = this.hit(sx, sy);
    return h
      ? {
          id: `furniture:${h.item.id}`,
          label: this.options?.labels[h.kind],
          shape: { kind: 'item', itemId: h.item.id },
        }
      : null;
  };

  /** Un appui (point du MONDE) : true s'il visait un meuble interactif. */
  tap(sx: number, sy: number): boolean {
    const h = this.hit(sx, sy);
    if (!h) return false;
    const plan = planFurniture(this.world, this.playerId, h.item, h.kind, {
      x: sx,
      y: sy,
    });
    if (plan && this.world.interact(this.playerId, plan))
      this.departed(plan.goal, plan.intent);
    this.notify(false);
    return true;
  }

  /** Un appui sur le sol : relevée, elle y marche. false : inaccessible. */
  walk(goal: Tile): boolean {
    if (!this.world.walkTo(this.playerId, goal)) return false;
    this.departed(goal, null);
    this.notify(false);
    return true;
  }

  /** « Se lever » / « Arrêter » : relevée sur place. */
  standUp(): void {
    if (this.world.standUp(this.playerId)) this.notify(false);
  }

  /** Un appui = un message : seulement si elle part vraiment. */
  private departed(goal: Tile, intent: AvatarIntent | null): void {
    const me = this.world.avatar(this.playerId);
    if (!me || !isWalking(me.walker)) return;
    const cb = this.callbacks();
    if (intent) cb.onPlayerWalk?.(goal, intent);
    else cb.onPlayerWalk?.(goal);
  }

  /** Après une image ou un geste : l'arrivée, la posture changée → rappels. */
  notify(arrived: boolean): void {
    const me = this.world.avatar(this.playerId);
    if (!me) return;
    const p = me.posture;
    const changed = p !== this.last;
    this.last = p;
    const pub = publicPosture(p);
    const cb = this.callbacks();
    if (changed) cb.onPlayerPosture?.(pub);
    if (arrived || (changed && !isWalking(me.walker))) {
      const tile = walkerTile(me.walker);
      if (pub) cb.onPlayerArrive?.(tile, me.walker.dir, pub);
      else cb.onPlayerArrive?.(tile, me.walker.dir);
    }
    if (changed && p?.kind === 'use')
      cb.onFurnitureUse?.({
        activity: p.activity,
        itemId: p.itemId,
        anchor: this.anchorOf(p.itemId),
      });
  }

  /** Au-dessus du milieu d'un meuble, px CSS du conteneur. */
  private anchorOf(itemId: string): ScreenPoint {
    const item = this.world.room.items.find((i) => i.id === itemId);
    if (!item) return { x: 0, y: 0 };
    const b = itemBox(item, specOf(this.world.catalog, item.key));
    const top = gridToScreen(
      (b.minX + b.maxX) / 2,
      (b.minY + b.maxY) / 2,
      b.maxZ
    );
    return worldToCanvas(top, this.camera());
  }
}
