// Rendu Canvas 2D d'une salle : sol, deux murs du fond, tapis et décor mural,
// case survolée, trajet de la joueuse, puis meubles et avatars triés par
// profondeur.
//
// HiDPI : le canvas a un tampon de cssW × devicePixelRatio px ; tout est
// tracé en px du MONDE sous la transformation (dpr × zoom, caméra).
// Les sprites pré-rendus (pixelRatio 2) sont posés par leur ancre ; à défaut,
// placeholders.ts dessine une boîte ou une silhouette. Sol et murs viennent
// du décor du manifeste (decorRenderer.ts) quand la salle en choisit un, sinon
// ils sont procéduraux. L'ombre au sol des avatars est toujours dessinée ici
// (elle n'est pas cuite dans les sprites).

import type { ImageCache, LibraryManifest, SpriteFrame } from './assets';
import {
  animationFor,
  avatarFrame,
  frameDestination,
  type SheetRef,
  sheetMatchesImage,
} from './avatarSprites';
import {
  drawFloorSprite,
  drawWallShade,
  drawWallSprites,
  PatternCache,
} from './decorRenderer';
import { type Box3, centerDepth, depthSort } from './depthSort';
import {
  drawFootprint,
  drawSelection,
  GHOST_ALPHA,
  type GhostItem,
} from './editOverlay';
import { isWalking, tileCenter } from './motion';
import {
  drawAvatarPlaceholder,
  drawAvatarShadow,
  drawFurniturePlaceholder,
} from './placeholders';
import {
  type Camera,
  gridToScreen,
  METERS_PER_TILE,
  metersToTiles,
  TILE_H,
  TILE_W,
} from './projection';
import {
  avatarBox,
  itemBox,
  itemTiles,
  layerOf,
  type RoomItem,
  type RoomModel,
  specOf,
} from './room';
import type { AvatarEntity, LibraryWorld } from './world';

type Ctx = CanvasRenderingContext2D;

type Drawable =
  | { kind: 'item'; box: Box3; item: RoomItem; ghost?: boolean }
  | { kind: 'avatar'; box: Box3; avatar: AvatarEntity };

export type RenderStats = { drawMs: number; objects: number; sprites: number };

const BG = '#17131b';
const FLOOR_A = '#7a5a43';
const FLOOR_B = '#82614a';
const FLOOR_LINE = 'rgba(40, 24, 16, 0.22)';
const FLOOR_EDGE_L = '#4c3527';
const FLOOR_EDGE_R = '#3a281d';
const WALL_L = '#d8cab3';
const WALL_R = '#c4b49b';
const WALL_CAP = '#efe5d3';
const WALL_END_L = '#b9a98f';
const WALL_END_R = '#a7977e';
const BASEBOARD_L = '#5b4232';
const BASEBOARD_R = '#4a3528';
/** Épaisseur des murs (au sol, en cases) ; hauteurs en mètres. */
const WALL_T = metersToTiles(0.15);
const FLOOR_T_M = 0.2;
const BASEBOARD_M = 0.12;

type Pt = readonly [number, number, number];

function iso(ctx: Ctx, pts: ReadonlyArray<Pt>): void {
  ctx.beginPath();
  pts.forEach(([x, y, z], k) => {
    const p = gridToScreen(x, y, z);
    if (k === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
}

function fillIso(ctx: Ctx, pts: ReadonlyArray<Pt>, color: string): void {
  iso(ctx, pts);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Tranche du plancher (la salle « flotte »), faces avant visibles. */
function drawFloorEdges(ctx: Ctx, room: RoomModel): void {
  const { w: W, d: D } = room;
  const T = FLOOR_T_M;
  fillIso(
    ctx,
    [
      [0, D, -T],
      [W, D, -T],
      [W, D, 0],
      [0, D, 0],
    ],
    FLOOR_EDGE_L
  );
  fillIso(
    ctx,
    [
      [W, 0, -T],
      [W, D, -T],
      [W, D, 0],
      [W, 0, 0],
    ],
    FLOOR_EDGE_R
  );
}

/** Sol procédural : damier par carrés de 1 m (2 × 2 cases) et lignes. */
function drawFloorChecker(ctx: Ctx, room: RoomModel): void {
  const { w: W, d: D } = room;
  const per = Math.max(1, Math.round(1 / METERS_PER_TILE));
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  for (const [parity, color] of [
    [0, FLOOR_A],
    [1, FLOOR_B],
  ] as const) {
    ctx.beginPath();
    for (let j = 0; j < D; j++) {
      for (let i = 0; i < W; i++) {
        if ((Math.floor(i / per) + Math.floor(j / per)) % 2 !== parity)
          continue;
        const a = gridToScreen(i, j);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + hw, a.y + hh);
        ctx.lineTo(a.x, a.y + 2 * hh);
        ctx.lineTo(a.x - hw, a.y + hh);
        ctx.closePath();
      }
    }
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.beginPath();
  for (let i = 0; i <= W; i++) {
    const a = gridToScreen(i, 0);
    const b = gridToScreen(i, D);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  for (let j = 0; j <= D; j++) {
    const a = gridToScreen(0, j);
    const b = gridToScreen(W, j);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.strokeStyle = FLOOR_LINE;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Murs du fond : gauche sur le plan gx = 0, droit sur gy = 0. */
function drawWalls(ctx: Ctx, room: RoomModel): void {
  const { w: W, d: D, wallHeight: H } = room;
  const t = WALL_T;
  const B = BASEBOARD_M;
  const T = FLOOR_T_M;
  fillIso(
    ctx,
    [
      [0, 0, 0],
      [0, D, 0],
      [0, D, H],
      [0, 0, H],
    ],
    WALL_L
  );
  fillIso(
    ctx,
    [
      [0, 0, 0],
      [W, 0, 0],
      [W, 0, H],
      [0, 0, H],
    ],
    WALL_R
  );
  fillIso(
    ctx,
    [
      [0, 0, 0],
      [0, D, 0],
      [0, D, B],
      [0, 0, B],
    ],
    BASEBOARD_L
  );
  fillIso(
    ctx,
    [
      [0, 0, 0],
      [W, 0, 0],
      [W, 0, B],
      [0, 0, B],
    ],
    BASEBOARD_R
  );
  // Arête verticale du coin.
  iso(ctx, [
    [0, 0, 0],
    [0, 0, H],
  ]);
  ctx.strokeStyle = 'rgba(60, 45, 35, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Épaisseur : chants des extrémités et dessus en L.
  fillIso(
    ctx,
    [
      [-t, D, -T],
      [0, D, -T],
      [0, D, H],
      [-t, D, H],
    ],
    WALL_END_L
  );
  fillIso(
    ctx,
    [
      [W, -t, -T],
      [W, 0, -T],
      [W, 0, H],
      [W, -t, H],
    ],
    WALL_END_R
  );
  fillIso(
    ctx,
    [
      [-t, D, H],
      [-t, -t, H],
      [W, -t, H],
      [W, 0, H],
      [0, 0, H],
      [0, D, H],
    ],
    WALL_CAP
  );
}

function drawTileHighlight(ctx: Ctx, i: number, j: number): void {
  iso(ctx, [
    [i, j, 0],
    [i + 1, j, 0],
    [i + 1, j + 1, 0],
    [i, j + 1, 0],
  ]);
  ctx.fillStyle = 'rgba(255, 245, 220, 0.25)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 245, 220, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawPathDots(ctx: Ctx, avatar: AvatarEntity): void {
  ctx.fillStyle = 'rgba(255, 214, 120, 0.7)';
  for (const t of avatar.walker.path) {
    const c = tileCenter(t);
    const p = gridToScreen(c.x, c.y);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Décalage d'horloge stable par avatar (les bots ne respirent pas en chœur). */
function phaseOffset(id: string): number {
  let h = 0;
  for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) >>> 0;
  return (h % 1000) / 1000;
}

export class LibraryRenderer {
  private ctx: Ctx;
  private dpr = 1;
  manifest: LibraryManifest | null = null;
  playerId: string | null = null;
  /** Mode déco : le meuble en cours de placement (transparent, teinté). */
  ghost: GhostItem | null = null;
  /** Mode déco : le meuble sélectionné (contour en pointillés). */
  selectedId: string | null = null;
  /** Le meuble qu'on déplace : caché à sa place d'origine. */
  hiddenId: string | null = null;
  /** Feuille d'avatar conforme à sa taille annoncée, par URL de feuille. */
  private sheetVerdict = new Map<string, boolean>();
  private patterns = new PatternCache();

  constructor(
    private canvas: HTMLCanvasElement,
    private images: ImageCache
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
  }

  /** Taille CSS du canvas et densité d'écran → tampon HiDPI. */
  resize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr > 0 ? dpr : 1;
    const w = Math.max(1, Math.round(cssW * this.dpr));
    const h = Math.max(1, Math.round(cssH * this.dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  private frameOf(item: RoomItem): SpriteFrame | null {
    const m = this.manifest;
    if (!m || !Object.hasOwn(m.furniture, item.key)) return null;
    return m.furniture[item.key].rotations[item.r] ?? null;
  }

  /**
   * Taille de la feuille chargée conforme au manifeste ? Vérifié une fois par
   * feuille (le verdict est gardé) ; une feuille non conforme est écartée et
   * signalée une seule fois — l'avatar garde sa silhouette pour cette pose.
   */
  private sheetUsable(ref: SheetRef, img: HTMLImageElement): boolean {
    const known = this.sheetVerdict.get(ref.src);
    if (known !== undefined) return known;
    const ok = sheetMatchesImage(ref, img);
    if (!ok)
      console.warn(
        `[library] avatar sheet ${ref.src}: ${img.naturalWidth}×${img.naturalHeight}, expected ${ref.width}×${ref.height}`
      );
    this.sheetVerdict.set(ref.src, ok);
    return ok;
  }

  /** Pose un sprite de meuble par son ancre ; false s'il n'est pas prêt. */
  private drawFurnitureSprite(item: RoomItem): boolean {
    const frame = this.frameOf(item);
    const pr = this.manifest?.pixelRatio ?? 1;
    const img = frame ? this.images.get(frame.src) : null;
    if (!frame || !img) return false;
    const o = gridToScreen(item.gx, item.gy);
    this.ctx.drawImage(
      img,
      o.x - frame.anchor.x / pr,
      o.y - frame.anchor.y / pr,
      frame.width / pr,
      frame.height / pr
    );
    return true;
  }

  /**
   * Image de l'avatar, posée par son ancre (miroir compris) ; false si
   * l'avatar n'a pas d'entrée, que la direction manque, ou que la feuille de
   * l'image n'est pas (encore) prête ou n'a pas la taille annoncée. Seule la
   * feuille de l'image dessinée est demandée au cache : celle de `sit` n'est
   * chargée que si un avatar s'assoit.
   */
  private drawAvatarSprite(a: AvatarEntity, timeSec: number): boolean {
    const m = this.manifest;
    if (!m || !a.avatarId || !Object.hasOwn(m.avatars, a.avatarId))
      return false;
    const sheet = m.avatars[a.avatarId];
    const w = a.walker;
    const pose = isWalking(w) ? 'walk' : 'idle';
    const f = avatarFrame(sheet, w.dir, pose, {
      timeSec: timeSec + phaseOffset(a.id),
      travelledMeters: w.travelled * METERS_PER_TILE,
    });
    if (!f) return false;
    const ref = animationFor(sheet, pose).anim.sheet;
    const img = this.images.get(f.src);
    if (!img || !this.sheetUsable(ref, img)) return false;
    const d = frameDestination(f, gridToScreen(w.x, w.y), m.pixelRatio);
    const { ctx } = this;
    if (!f.mirrored) {
      ctx.drawImage(img, f.sx, f.sy, f.sw, f.sh, d.x, d.y, d.w, d.h);
      return true;
    }
    ctx.save();
    ctx.translate(d.x + d.w, d.y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, f.sx, f.sy, f.sw, f.sh, 0, 0, d.w, d.h);
    ctx.restore();
    return true;
  }

  /** Un meuble, sprite ou remplaçant ; le fantôme en transparence. */
  private drawItem(item: RoomItem, box: Box3, ghost: boolean): boolean {
    const { ctx } = this;
    if (ghost) {
      ctx.save();
      ctx.globalAlpha = GHOST_ALPHA;
    }
    const sprite = this.drawFurnitureSprite(item);
    if (!sprite) drawFurniturePlaceholder(ctx, item.key, box, item.r);
    if (ghost) ctx.restore();
    return sprite;
  }

  draw(world: LibraryWorld, cam: Camera, timeSec = 0): RenderStats {
    const t0 = performance.now();
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const s = this.dpr * cam.zoom;
    ctx.setTransform(s, 0, 0, s, this.dpr * cam.x, this.dpr * cam.y);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const { room } = world;
    const decor = this.manifest?.decor;
    const pr = this.manifest?.pixelRatio ?? 1;
    drawFloorEdges(ctx, room);
    if (
      !decor ||
      !drawFloorSprite(ctx, room, decor, pr, this.images, this.patterns)
    )
      drawFloorChecker(ctx, room);
    drawWallShade(ctx, room);
    if (!decor || !drawWallSprites(ctx, room, decor, pr, this.images))
      drawWalls(ctx, room);

    // Tapis puis décor mural : sous tout le reste, triés entre eux. Le meuble
    // qu'on déplace est caché ; le fantôme prend place dans SON calque.
    let sprites = 0;
    const objects: { item: RoomItem; ghost: boolean }[] = [];
    const flat: { item: RoomItem; box: Box3; order: number; ghost: boolean }[] =
      [];
    const g = this.ghost;
    const placed = room.items
      .filter((item) => item.id !== this.hiddenId)
      .map((item) => ({ item, ghost: false }));
    if (g)
      placed.push({
        item: { id: g.id, key: g.key, gx: g.gx, gy: g.gy, r: g.r },
        ghost: true,
      });
    for (const { item, ghost } of placed) {
      const spec = specOf(world.catalog, item.key);
      const layer = layerOf(spec);
      if (layer === 'object') {
        objects.push({ item, ghost });
        continue;
      }
      const box = itemBox(item, spec);
      flat.push({
        item,
        box,
        ghost,
        order: (layer === 'wall' ? 1e6 : 0) + centerDepth(box),
      });
    }
    flat.sort((a, b) => a.order - b.order);
    for (const f of flat) if (this.drawItem(f.item, f.box, f.ghost)) sprites++;

    if (world.hover) drawTileHighlight(ctx, world.hover.i, world.hover.j);
    if (g) {
      const spec = specOf(world.catalog, g.key);
      drawFootprint(
        ctx,
        itemTiles({ id: g.id, key: g.key, gx: g.gx, gy: g.gy, r: g.r }, spec),
        g.valid
      );
    }
    const player = this.playerId ? world.avatar(this.playerId) : undefined;
    if (player) drawPathDots(ctx, player);

    const drawables: Drawable[] = [];
    for (const { item, ghost } of objects)
      drawables.push({
        kind: 'item',
        item,
        ghost,
        box: itemBox(item, specOf(world.catalog, item.key)),
      });
    for (const avatar of world.avatars)
      drawables.push({
        kind: 'avatar',
        avatar,
        box: avatarBox(avatar.walker.x, avatar.walker.y),
      });

    for (const d of depthSort(drawables)) {
      if (d.kind === 'item') {
        if (this.drawItem(d.item, d.box, d.ghost === true)) sprites++;
        continue;
      }
      const a = d.avatar;
      const w = a.walker;
      drawAvatarShadow(ctx, w.x, w.y, a.id === this.playerId);
      if (this.drawAvatarSprite(a, timeSec)) sprites++;
      else
        drawAvatarPlaceholder(ctx, w.x, w.y, {
          hue: a.hue,
          dir: w.dir,
          walking: isWalking(w),
          // Un cycle de jambes tous les ~0,7 m.
          phase: (w.travelled * METERS_PER_TILE * Math.PI * 2) / 0.7,
        });
    }

    // Contour de la sélection, par-dessus tout : visible même derrière un
    // autre meuble.
    const selected =
      this.selectedId && this.selectedId !== this.hiddenId
        ? room.items.find((i) => i.id === this.selectedId)
        : undefined;
    if (selected)
      drawSelection(
        ctx,
        itemBox(selected, specOf(world.catalog, selected.key))
      );
    return {
      drawMs: performance.now() - t0,
      objects: drawables.length + flat.length,
      sprites,
    };
  }
}
