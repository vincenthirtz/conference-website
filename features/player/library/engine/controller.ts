// Chef d'orchestre du canvas : monde, rendu, boucle, caméra et entrées
// (clic pour marcher, glisser pour déplacer la vue, molette ou pincement pour
// zoomer entre 0,5 et 2). Vit hors de ui/ : il touche au DOM et charge le
// manifeste, le composant React ne fait que le monter et afficher le HUD.
//
// DEUX MODES (lot 4, phase B) :
//   - `walk` (défaut) : un clic sur le sol fait marcher la joueuse ;
//   - `edit` (mode déco) : un clic ne fait JAMAIS marcher. Le contrôleur dit
//     seulement ce qui est sous le pointeur (`onTilePointer` : case du sol,
//     point d'un mur du fond, meuble visé par son image) ; l'appelant décide
//     (poser, sélectionner) et rend la scène par `setRoomItems`, `setGhost`,
//     `setSelection`, `setHiddenItem`. Le survol (`hover`) n'existe qu'à la
//     souris : au doigt, tout passe par `tap`.
// Les mises à jour (`setRoomItems`, `setDecor`, `setPlayerAvatar`) se font
// SANS remonter le contrôleur : caméra, avatar et images restent en place.
//
// MULTIJOUEUR (lot 5 phase B) : `syncRemoteAvatars` reçoit les autres
// joueuses, `showPlayerBubble` / `setPlayerMarker` habillent la joueuse.
// En `walk`, un appui vise, DANS L'ORDRE : une autre joueuse → `onAvatarTap` ;
// le PNJ (lot 16, npcLayer.ts) puis une zone (lot 7) → `onHotspotTap` ; un meuble
// interactif (lot 15, engine/playerActions.ts : s'asseoir, s'allonger, s'en
// servir) ; sinon le sol → marche + `onPlayerWalk` ; l'arrivée →
// `onPlayerArrive`. En `edit`, aucune interaction (la joueuse se relève).

import {
  avatarIdsOf,
  ImageCache,
  type LibraryManifest,
  loadManifest,
  mergeCatalog,
  PLACEHOLDER_CATALOG,
} from './assets';
import type { RoomDecor } from './decor';
import { DebugMarks } from './debugMarks';
import { wallPlanIssues } from './decorRenderer';
import type { GhostItem } from './editOverlay';
import { headPoint } from './avatarOverlays';
import { HotspotLayer, type HotspotTap, type LibraryHotspot } from './hotspots';
import { FrameLoop, type FrameStats } from './loop';
import { attachNpc, type NpcOptions } from './npcHost';
import {
  type InteractionOptions,
  PlayerActions,
  type PlayerCallbacks,
} from './playerActions';
import {
  canvasToWorld,
  centerCamera,
  clampZoom,
  gridToScreen,
  pickTile,
  pickWall,
  wallFootTile,
  zoomAt,
  type Camera,
  type ScreenPoint,
  type Tile,
  type WallHit,
} from './projection';
import type { BubbleContent, RemoteAvatarInput } from './remotes';
import { LibraryRenderer } from './renderer';
import { layoutIssues, type RoomItem, type RoomModel } from './room';
import { DEFAULT_BUBBLE_MS, LibraryWorld } from './world';

export type ControllerStats = FrameStats & { avatars: number };

export type ControllerMode = 'walk' | 'edit';

/** Ce qui est sous le pointeur, en mode déco. */
export type TilePointer = {
  /** `hover` : la souris passe (sans bouton) ; `tap` : clic ou toucher ; `leave` : sortie. */
  kind: 'hover' | 'tap' | 'leave';
  /** Case du sol ; sur un mur, la case à son pied ; null hors de la salle. */
  tile: Tile | null;
  /** Le point visé est sur un mur du fond (null : sur le sol ou hors salle). */
  wall: WallHit | null;
  /** Le meuble dont l'image est sous le pointeur (celui qu'on déplace exclu). */
  itemId: string | null;
  pointerType: string;
};

export type ControllerOptions = PlayerCallbacks & {
  room: RoomModel;
  playerId: string;
  playerStart: Tile;
  playerHue?: number;
  /** Feuille d'avatar de la joueuse (clé `avatars` du manifeste). */
  playerAvatarId?: string | null;
  manifestUrl?: string;
  mode?: ControllerMode;
  onStats?: (s: ControllerStats) => void;
  /** true : sprites du manifeste ; false : remplaçants (absent ou autre case). */
  onManifest?: (loaded: boolean) => void;
  /** Mode déco : survol, toucher, sortie du pointeur. */
  onTilePointer?: (p: TilePointer) => void;
  /** `walk` : appui sur une AUTRE joueuse (au lieu de marcher) ; `false` : on marche quand même. */
  onAvatarTap?: (tap: AvatarTap) => boolean | undefined;
  /** Lot 15 : les meubles proposés (noms traduits) et les pictogrammes. */
  interactions?: InteractionOptions;
  /** Durée d'une bulle (ms) ; défaut DEFAULT_BUBBLE_MS. */
  bubbleMs?: number;
  /** Horloge des bulles (ms) : celle des `receivedAt` du temps réel. */
  now?: () => number;
  /** `walk` : zones interactives (engine/hotspots.ts) ; un appui → `onHotspotTap`. */
  hotspots?: readonly LibraryHotspot[];
  onHotspotTap?: (tap: HotspotTap) => void;
  /** Lot 16 : un PNJ (npcLayer.ts) ; son appui → `onHotspotTap`. */
  npc?: NpcOptions | null;
};

/** Un appui sur une autre joueuse ; `anchor` : au-dessus de sa tête, px CSS du conteneur. */
export type AvatarTap = { userId: string; anchor: ScreenPoint };

/** Au-delà de ce déplacement (px CSS), un appui devient un glisser. */
const CLICK_SLOP = 5;

type Drag = { start: ScreenPoint; last: ScreenPoint; moved: boolean };
type Pinch = { dist: number; mid: ScreenPoint };

const sameTile = (a: Tile | null, b: Tile | null) =>
  a === b || (!!a && !!b && a.i === b.i && a.j === b.j);

export class LibraryController {
  readonly world: LibraryWorld;
  private renderer: LibraryRenderer;
  private images: ImageCache;
  private loop: FrameLoop;
  private cam: Camera = { x: 0, y: 0, zoom: 1 };
  private centered = false;
  private cssW = 0;
  private cssH = 0;
  private ro: ResizeObserver | null = null;
  private pointers = new Map<number, ScreenPoint>();
  private drag: Drag | null = null;
  private pinch: Pinch | null = null;
  private disposed = false;
  private debug: DebugMarks;
  private mode: ControllerMode;
  private manifest: LibraryManifest | null = null;
  /** Dernier survol signalé (évite d'appeler l'appelant à chaque pixel). */
  private lastHover = '';
  private now: () => number;
  /** Prochaine échéance de bulle (réveille la boucle de rendu à la demande). */
  private bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Zones interactives (`ctrl.hotspots.set(...)`) : après les avatars, avant le sol. */
  readonly hotspots: HotspotLayer;
  /** Les gestes de la joueuse sur les meubles et le sol (lot 15). */
  private actions: PlayerActions;

  constructor(
    private canvas: HTMLCanvasElement,
    private container: HTMLElement,
    private opts: ControllerOptions
  ) {
    this.mode = opts.mode ?? 'walk';
    this.now = opts.now ?? (() => Date.now());
    canvas.dataset.mode = this.mode;
    this.debug = new DebugMarks(canvas);
    this.world = new LibraryWorld(opts.room, PLACEHOLDER_CATALOG);
    this.world.bubbleMs = opts.bubbleMs ?? DEFAULT_BUBBLE_MS;
    this.world.addAvatar(
      opts.playerId,
      opts.playerStart,
      opts.playerHue ?? 330,
      false,
      opts.playerAvatarId ?? null
    );
    this.images = new ImageCache(() => this.loop.request());
    this.renderer = new LibraryRenderer(canvas, this.images);
    this.renderer.playerId = opts.playerId;
    this.hotspots = new HotspotLayer(canvas, opts.hotspots, this);
    this.actions = new PlayerActions(
      this.world,
      opts.playerId,
      () => this.opts,
      () => this.cam,
      opts.interactions
    );
    this.loop = new FrameLoop(
      (dt) => this.tick(dt),
      (s) => {
        // Repères e2e : cadence et temps JS d'une image animée.
        canvas.dataset.fps = s.fps === null ? '' : s.fps.toFixed(0);
        canvas.dataset.frameMs = s.frameMs.toFixed(2);
        this.opts.onStats?.({ ...s, avatars: this.world.avatars.length });
      }
    );
    attachNpc(this.world, opts.npc, this.images, this.loop);

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('resize', this.onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(this.onResize);
      this.ro.observe(container);
    }
    this.onResize();

    void loadManifest(opts.manifestUrl).then((manifest) => {
      if (this.disposed) return;
      this.opts.onManifest?.(manifest !== null);
      if (!manifest) return;
      this.manifest = manifest;
      this.renderer.manifest = manifest;
      const catalog = mergeCatalog(manifest);
      this.world.setCatalog(catalog);
      // Les empreintes viennent du manifeste : on signale une disposition
      // qui ne tient plus (chevauchement, débordement) sans la corriger.
      const issues = layoutIssues(opts.room, catalog);
      if (issues.length)
        console.warn('[library] layout overlaps or overflows:', issues);
      const wallIssues = wallPlanIssues(opts.room, manifest.decor);
      if (wallIssues.length)
        console.warn('[library] wall plan issues:', wallIssues);
      this.world.setAvatarIds(avatarIdsOf(manifest));
      this.images.preloadDecor(manifest, opts.room);
      this.images.preload(manifest, new Set(opts.room.items.map((i) => i.key)));
      this.loop.request();
    });
  }

  private draw(): void {
    this.renderer.draw(this.world, this.cam, performance.now() / 1000);
  }

  /** Remplace les bots par `count` nouveaux (0 = aucun). */
  setBots(count: number): void {
    this.world.clearBots();
    if (count > 0) this.world.spawnBots(count);
    this.loop.request();
  }

  /** Redessine au prochain cadre (après un changement fait de l'extérieur). */
  redraw(): void {
    this.loop.request();
  }

  getMode(): ControllerMode {
    return this.mode;
  }

  /** `walk` : un clic fait marcher ; `edit` : un clic est signalé, sans marcher. */
  setMode(mode: ControllerMode): void {
    if (mode === this.mode) return;
    if (mode === 'edit') this.actions.standUp();
    this.mode = mode;
    this.canvas.dataset.mode = mode;
    this.lastHover = '';
    this.loop.request();
  }

  /** Meubles posés remplacés (grille de marche reconstruite, sprites chargés). */
  setRoomItems(items: readonly RoomItem[]): void {
    this.world.setRoomItems(items);
    if (this.manifest)
      this.images.preload(this.manifest, new Set(items.map((i) => i.key)));
    this.loop.request();
  }

  /** Sol et murs de la salle (décor du manifeste). */
  setDecor(decor: RoomDecor | undefined): void {
    this.world.setDecor(decor);
    if (this.manifest) this.images.preloadDecor(this.manifest, this.world.room);
    this.loop.request();
  }

  /** Avatar de la joueuse (gardé tant que le manifeste le connaît). */
  setPlayerAvatar(avatarId: string | null): void {
    const me = this.world.avatar(this.opts.playerId);
    if (!me) return;
    me.avatarId =
      avatarId && (!this.manifest || this.world.avatarIds.includes(avatarId))
        ? avatarId
        : (this.world.avatarIds[0] ?? avatarId);
    this.loop.request();
  }

  /** Le meuble en cours de placement (null : aucun). */
  setGhost(ghost: GhostItem | null): void {
    this.renderer.ghost = ghost;
    if (ghost && this.manifest) this.images.preload(this.manifest, [ghost.key]);
    this.loop.request();
  }

  setSelection(id: string | null): void {
    this.renderer.selectedId = id;
    this.loop.request();
  }

  /** Cache un meuble posé (celui qu'on déplace) ; null : aucun. */
  setHiddenItem(id: string | null): void {
    this.renderer.hiddenId = id;
    this.loop.request();
  }

  /** Les autres joueuses de la salle (lot 5) : la boucle se réveille. */
  syncRemoteAvatars(list: readonly RemoteAvatarInput[]): void {
    this.world.syncRemoteAvatars(list, this.now());
    this.scheduleBubbleExpiry();
    this.loop.request();
  }

  /** La bulle de la joueuse (son propre signe, parti) ; null l'efface. */
  showPlayerBubble(content: BubbleContent | null): void {
    this.world.showBubble(this.opts.playerId, content, this.now());
    this.scheduleBubbleExpiry();
    this.loop.request();
  }

  /** Repère au-dessus de la joueuse (« discrète ») ; null l'efface. */
  setPlayerMarker(text: string | null): void {
    this.world.setMarker(this.opts.playerId, text);
    this.loop.request();
  }

  /** Lot 15 : les meubles proposés (noms traduits) ; null : aucun. */
  setInteractions(options: InteractionOptions | null): void {
    this.actions.set(options);
    this.loop.request();
  }

  /** « Se lever » / « Arrêter » (lot 15). */
  standUp(): void {
    this.actions.standUp();
    this.loop.request();
  }

  /** Au-dessus de la tête d'un avatar, en px CSS du conteneur ; null s'il n'est pas là. */
  avatarAnchor(id: string): ScreenPoint | null {
    const a = this.world.avatar(id);
    return a ? headPoint(a, this.cam) : null;
  }

  /** Une seule minuterie : la prochaine bulle échue redemande une image. */
  private scheduleBubbleExpiry(): void {
    if (this.bubbleTimer !== null) clearTimeout(this.bubbleTimer);
    this.bubbleTimer = null;
    const next = this.world.nextBubbleExpiry();
    if (next === null || this.disposed) return;
    this.bubbleTimer = setTimeout(
      () => {
        this.bubbleTimer = null;
        if (this.world.pruneBubbles(this.now())) this.loop.request();
        this.scheduleBubbleExpiry();
      },
      Math.max(0, next - this.now()) + 16
    );
  }

  /** Ce qui est sous un point du canvas (px CSS) : sol, mur, meuble. */
  pointerAt(
    p: ScreenPoint,
    kind: TilePointer['kind'],
    pointerType: string
  ): TilePointer {
    const { room } = this.world;
    const tile = pickTile(p.x, p.y, this.cam, room);
    const wall = tile
      ? null
      : pickWall(p.x, p.y, this.cam, room, room.wallHeight);
    const w = canvasToWorld(p, this.cam);
    const item = this.world.itemAtScreen(w.x, w.y, this.renderer.hiddenId);
    return {
      kind,
      tile: tile ?? (wall ? wallFootTile(wall) : null),
      wall,
      itemId: item?.id ?? null,
      pointerType,
    };
  }

  resetView(): void {
    this.cam = this.fitCamera();
    this.loop.request();
  }

  dispose(): void {
    this.disposed = true;
    this.loop.stop();
    this.world.npc?.dispose();
    if (this.bubbleTimer !== null) clearTimeout(this.bubbleTimer);
    this.bubbleTimer = null;
    this.ro?.disconnect();
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onCancel);
    c.removeEventListener('pointerleave', this.onLeave);
    c.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('resize', this.onResize);
  }

  private tick(dt: number): { keepGoing: boolean; frameMs: number } {
    const t0 = performance.now();
    this.world.update(dt);
    this.world.pruneBubbles(this.now());
    if (!this.world.npc?.throttle(this.world.isActive())) this.draw();
    this.debug.sync(this.cam, this.world, this.opts.playerId);
    this.actions.notify(this.world.takeArrivals().includes(this.opts.playerId));
    return {
      keepGoing: this.world.isActive() || !!this.world.npc?.awake(),
      frameMs: performance.now() - t0,
    };
  }

  /** Zoom qui fait tenir la salle et ses murs, centrée. */
  private fitCamera(): Camera {
    const { room } = this.world;
    const width = gridToScreen(room.w, 0).x - gridToScreen(0, room.d).x;
    const height =
      gridToScreen(room.w, room.d).y - gridToScreen(0, 0, room.wallHeight).y;
    const zoom = clampZoom(
      Math.min(this.cssW / (width + 48), this.cssH / (height + 48))
    );
    return centerCamera(room, room.wallHeight, this.cssW, this.cssH, zoom);
  }

  private onResize = (): void => {
    if (this.disposed) return;
    const r = this.container.getBoundingClientRect();
    this.cssW = r.width;
    this.cssH = r.height;
    if (!this.centered && r.width > 0 && r.height > 0) {
      this.cam = this.fitCamera();
      this.centered = true;
    }
    this.renderer.resize(r.width, r.height, window.devicePixelRatio || 1);
    // Redimensionner vide le tampon : on redessine tout de suite.
    this.draw();
    this.debug.sync(this.cam, this.world, this.opts.playerId);
  };

  private local(e: { clientX: number; clientY: number }): ScreenPoint {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private pinchState(): Pinch {
    const [a, b] = [...this.pointers.values()];
    return {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }

  private setHover(t: Tile | null): void {
    if (sameTile(t, this.world.hover)) return;
    this.world.hover = t;
    this.loop.request();
  }

  private onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      this.drag = { start: p, last: p, moved: false };
    } else if (this.pointers.size === 2) {
      this.drag = null;
      this.pinch = this.pinchState();
    }
  };

  private onMove = (e: PointerEvent): void => {
    const p = this.local(e);
    if (!this.pointers.has(e.pointerId)) {
      if (e.pointerType !== 'mouse') return;
      if (this.mode === 'edit') {
        const info = this.pointerAt(p, 'hover', e.pointerType);
        this.setHover(info.wall ? null : info.tile);
        const key = `${info.tile?.i},${info.tile?.j},${info.wall?.side},${info.itemId}`;
        if (key !== this.lastHover) {
          this.lastHover = key;
          this.opts.onTilePointer?.(info);
        }
        return;
      }
      this.setHover(
        this.hotspots.hover(this.world, this.cam, p, this.actions.hoverAt)
      );
      return;
    }
    this.pointers.set(e.pointerId, p);
    if (this.pinch && this.pointers.size >= 2) {
      const next = this.pinchState();
      const cam = zoomAt(
        this.cam,
        next.mid.x,
        next.mid.y,
        next.dist / this.pinch.dist
      );
      cam.x += next.mid.x - this.pinch.mid.x;
      cam.y += next.mid.y - this.pinch.mid.y;
      this.cam = cam;
      this.pinch = next;
      this.loop.request();
      return;
    }
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) > CLICK_SLOP)
      d.moved = true;
    if (d.moved) {
      this.cam = {
        ...this.cam,
        x: this.cam.x + p.x - d.last.x,
        y: this.cam.y + p.y - d.last.y,
      };
      this.loop.request();
    }
    d.last = p;
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.local(e);
    const click = this.pointers.size === 1 && !!this.drag && !this.drag.moved;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 1) {
      // Fin d'un pincement : le doigt qui reste glisse, il ne clique pas.
      const rest = [...this.pointers.values()][0];
      this.drag = { start: rest, last: rest, moved: true };
      this.pinch = null;
      return;
    }
    if (this.pointers.size === 0) {
      this.drag = null;
      this.pinch = null;
    }
    if (!click) return;
    if (this.mode === 'edit') {
      // Mode déco : on signale, on ne marche jamais. Au doigt, la case
      // touchée s'allume (pas de survol pour la montrer).
      const info = this.pointerAt(p, 'tap', e.pointerType);
      if (e.pointerType !== 'mouse')
        this.setHover(info.wall ? null : info.tile);
      this.opts.onTilePointer?.(info);
      return;
    }
    // Une autre joueuse d'abord (son image passe devant le sol et les meubles).
    const w = canvasToWorld(p, this.cam);
    const other = this.opts.onAvatarTap
      ? this.world.avatarAtScreen(w.x, w.y)
      : null;
    if (
      other &&
      this.opts.onAvatarTap?.({
        userId: other.id,
        anchor: headPoint(other, this.cam),
      }) !== false
    )
      return;
    const spot = this.hotspots.at(this.world, this.cam, p);
    if (spot && this.opts.onHotspotTap) return this.opts.onHotspotTap(spot);
    // Un meuble interactif : y aller, puis s'asseoir ou s'en servir.
    if (this.actions.tap(w.x, w.y)) return this.loop.request();
    const t = pickTile(p.x, p.y, this.cam, this.world.room);
    if (!t) return;
    if (e.pointerType !== 'mouse') this.setHover(t);
    if (this.actions.walk(t)) this.loop.request();
  };

  private onCancel = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.drag = null;
    this.pinch = null;
  };

  private onLeave = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse' || this.pointers.size !== 0) return;
    this.hotspots.hover(this.world, this.cam, null);
    this.setHover(null);
    if (this.mode === 'edit') {
      this.lastHover = '';
      this.opts.onTilePointer?.({
        kind: 'leave',
        tile: null,
        wall: null,
        itemId: null,
        pointerType: e.pointerType,
      });
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.local(e);
    const k = e.deltaMode === 1 ? 0.05 : 0.0015;
    this.cam = zoomAt(this.cam, p.x, p.y, Math.exp(-e.deltaY * k));
    this.loop.request();
  };
}
