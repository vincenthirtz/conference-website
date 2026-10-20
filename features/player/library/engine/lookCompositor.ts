// Le compositeur des avatars COMPOSÉS (lot 13) : charge l'index des calques,
// compose une bande par look et par usage dans un canvas hors écran (teinte
// par composition), la garde en cache (LRU, avatarLayers.ts) et la dessine
// à la place de la feuille entière de l'avatar.
//
// TEINTE : sur un canvas de travail, les images grises du calque, puis
// `multiply` de la couleur sur toute la surface, puis `destination-in` des
// mêmes images (l'alpha du calque sert de masque) ; le résultat est posé sur
// la bande. Le corps (en couleur) est posé tel quel. Ordre : corps, bas,
// haut, cheveux.
//
// PARESSE : l'index n'est lu qu'au premier look dessiné ; une feuille de
// calque n'est demandée au cache d'images (assets.ts, celui du moteur) qu'au
// moment de composer une bande qui en a besoin — la marche n'est décodée que
// si un avatar marche. Une image qui finit de se décoder réveille la boucle
// de rendu (`ImageCache.onChange`) : la bande est alors composée, d'un coup.
//
// REPLIS, dans l'ordre : la bande demandée ; pour la marche pas encore prête,
// la bande d'attente (même direction) ; sinon `false` — le renderer pose la
// feuille de l'`avatarId` (avatarSprites.ts), puis la silhouette.

import { decodeLibraryLook } from '@/config/library/avatarLook';
import {
  AVATAR_LAYERS_URL,
  type LayerIndex,
  type LookLayer,
  LOOK_CACHE_BYTES,
  lookLayers,
  LruBudget,
  parseLayerIndex,
  type StripCell,
  stripCellIndex,
  stripFrames,
  stripKeyOf,
  stripLayout,
} from './avatarLayers';
import { type AvatarPose, frameIndex } from './avatarSprites';
import { type Direction, isWalking } from './motion';
import { gridToScreen, METERS_PER_TILE } from './projection';
import type { AvatarEntity } from './world';

type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Un canvas hors écran (ou un double de test). */
export type LookCanvas = {
  width: number;
  height: number;
  getContext(kind: '2d'): Canvas2D | null;
};
export type LookCanvasFactory = (w: number, h: number) => LookCanvas | null;

/** Le sous-ensemble du cache d'images du moteur (assets.ts) qu'on utilise. */
export type LookImages = { get(src: string): CanvasImageSource | null };

type Fetcher = (
  url: string
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Une bande composée : son canvas et ses cellules. */
export type LookStrip = { canvas: LookCanvas; cells: StripCell[] };

/** Un canvas hors écran : OffscreenCanvas, sinon un <canvas> détaché. */
export function defaultLookCanvas(w: number, h: number): LookCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const css = (rgb: readonly [number, number, number]) =>
  `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

export class LookCompositor {
  private index: LayerIndex | null = null;
  private indexState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  /** Looks demandés avant l'index : leurs feuilles sont demandées à son arrivée. */
  private pending = new Set<string>();
  private strips: LruBudget<LookStrip>;
  private scratch: [LookCanvas | null, LookCanvas | null] = [null, null];
  private looks = new Map<string, ReturnType<typeof decodeLibraryLook>>();
  /** Horloge de l'image en cours du renderer (une par `draw`). */
  private frameTime = Number.NaN;
  /** Compositions faites (mesures, tests). */
  composed = 0;

  constructor(
    private images: LookImages,
    private makeCanvas: LookCanvasFactory = defaultLookCanvas,
    private fetcher: Fetcher = (u) => globalThis.fetch(u),
    budget = LOOK_CACHE_BYTES
  ) {
    this.strips = new LruBudget<LookStrip>(budget, (s) => {
      // Rend la mémoire tout de suite plutôt qu'au ramasse-miettes.
      s.canvas.width = 0;
      s.canvas.height = 0;
    });
  }

  /** Octets décodés des bandes en cache. */
  get cacheBytes(): number {
    return this.strips.bytes;
  }

  /** L'index : pas encore demandé, en cours, prêt, ou introuvable (repli `avatarId`). */
  get status(): 'idle' | 'loading' | 'ready' | 'failed' {
    return this.indexState;
  }

  /** Échelle des images de l'index (px d'image par px CSS). */
  get pixelRatio(): number {
    return this.index?.pixelRatio ?? 1;
  }

  /** L'index, lu une seule fois ; `null` tant qu'il n'est pas là. */
  private ensureIndex(code: string): LayerIndex | null {
    if (this.indexState === 'ready') return this.index;
    if (this.indexState === 'failed') return null;
    this.pending.add(code);
    if (this.indexState === 'loading') return null;
    this.indexState = 'loading';
    void this.fetcher(AVATAR_LAYERS_URL)
      .then(async (res) => (res.ok ? parseLayerIndex(await res.json()) : null))
      .catch(() => null)
      .then((index) => {
        this.index = index;
        this.indexState = index ? 'ready' : 'failed';
        if (!index) return;
        // Demander les feuilles réveillera le rendu quand elles seront prêtes.
        for (const c of this.pending) this.request(c, 'idle');
        this.pending.clear();
      });
    return null;
  }

  /** Demande (sans attendre) les feuilles d'un look pour une pose. */
  private request(code: string, pose: AvatarPose): void {
    const look = this.lookOf(code);
    if (!look || !this.index) return;
    for (const layer of lookLayers(look)) {
      const anim = this.index.layers[layer.id]?.[pose];
      if (anim) this.images.get(anim.sheet.src);
    }
  }

  /**
   * La bande d'un look pour une pose (et une direction pour la marche),
   * composée à la demande ; null si un calque manque ou n'est pas prêt.
   */
  strip(code: string, pose: AvatarPose, dir: Direction): LookStrip | null {
    const key = stripKeyOf(code, pose, dir);
    const hit = this.strips.get(key);
    if (hit) return hit;
    const index = this.ensureIndex(code);
    const look = index ? this.lookOf(code) : null;
    if (!index || !look) return null;
    const layers = lookLayers(look);
    const anims = layers.map((l) => index.layers[l.id]?.[pose]);
    if (anims.some((a) => !a)) return null;
    const frames = anims.map((a) => (a ? stripFrames(a, pose, dir) : null));
    if (frames.some((f) => !f)) return null;
    // Toutes les feuilles demandées d'un coup, puis composées si prêtes.
    const imgs = anims.map((a) => (a ? this.images.get(a.sheet.src) : null));
    if (imgs.some((i) => !i)) return null;
    // Une feuille qui n'a pas la taille annoncée : on découperait à côté.
    if (
      imgs.some((img, k) => {
        const ref = anims[k]?.sheet;
        const el = img as { naturalWidth?: number; naturalHeight?: number };
        return (
          ref &&
          el.naturalWidth !== undefined &&
          (el.naturalWidth !== ref.width || el.naturalHeight !== ref.height)
        );
      })
    )
      return null;
    const layout = stripLayout(
      frames as NonNullable<(typeof frames)[number]>[]
    );
    if (!layout) return null;
    const strip = this.compose(
      layout,
      layers,
      frames as NonNullable<(typeof frames)[number]>[],
      imgs as CanvasImageSource[]
    );
    if (!strip) return null;
    this.strips.set(key, strip, layout.width * layout.height * 4);
    return strip;
  }

  private scratchCanvas(k: 0 | 1, w: number, h: number): LookCanvas | null {
    let c = this.scratch[k];
    if (!c) {
      c = this.makeCanvas(w, h);
      this.scratch[k] = c;
      if (!c) return null;
    }
    if (c.width < w || c.height < h) {
      c.width = Math.max(c.width, w);
      c.height = Math.max(c.height, h);
    }
    return c;
  }

  private compose(
    layout: NonNullable<ReturnType<typeof stripLayout>>,
    layers: LookLayer[],
    frames: { x: number; y: number; w: number; h: number }[][],
    imgs: CanvasImageSource[]
  ): LookStrip | null {
    const { width: W, height: H } = layout;
    const canvas = this.makeCanvas(W, H);
    const out = canvas?.getContext('2d');
    if (!canvas || !out) return null;
    const paint = (ctx: Canvas2D, l: number) => {
      frames[l].forEach((r, i) => {
        const p = layout.placements[l][i];
        ctx.drawImage(imgs[l], r.x, r.y, r.w, r.h, p.dx, p.dy, r.w, r.h);
      });
    };
    for (let l = 0; l < layers.length; l++) {
      const tint = layers[l].tint;
      if (!tint) {
        paint(out, l);
        continue;
      }
      const grey = this.scratchCanvas(0, W, H);
      const tinted = this.scratchCanvas(1, W, H);
      const g = grey?.getContext('2d');
      const t = tinted?.getContext('2d');
      if (!grey || !tinted || !g || !t) return null;
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, W, H);
      paint(g, l);
      t.globalCompositeOperation = 'source-over';
      t.clearRect(0, 0, W, H);
      t.drawImage(grey as CanvasImageSource, 0, 0, W, H, 0, 0, W, H);
      t.globalCompositeOperation = 'multiply';
      t.fillStyle = css(tint);
      t.fillRect(0, 0, W, H);
      t.globalCompositeOperation = 'destination-in';
      t.drawImage(grey as CanvasImageSource, 0, 0, W, H, 0, 0, W, H);
      t.globalCompositeOperation = 'source-over';
      out.drawImage(tinted as CanvasImageSource, 0, 0, W, H, 0, 0, W, H);
    }
    this.composed++;
    return { canvas, cells: layout.cells };
  }

  /** Le look d'une forme compacte, mémorisé (une poignée par salle). */
  private lookOf(code: string) {
    let look = this.looks.get(code);
    if (look === undefined) {
      if (this.looks.size >= 256) this.looks.clear();
      look = decodeLibraryLook(code);
      this.looks.set(code, look);
    }
    return look;
  }

  /**
   * Dessine un avatar composé, posé par son ancre ; false s'il n'a pas de
   * look, que l'index ou une feuille manque, ou n'est pas encore prête.
   * `frameTime` (s) identifie l'image du renderer, `phase` décale l'horloge
   * de l'avatar.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    a: AvatarEntity,
    frameTime: number,
    phase = 0
  ): boolean {
    const code = a.look;
    if (!code) return false;
    if (frameTime !== this.frameTime) {
      this.frameTime = frameTime;
      this.strips.nextFrame();
    }
    const look = this.lookOf(code);
    if (!look) return false;
    const w = a.walker;
    const pose: AvatarPose = isWalking(w) ? 'walk' : 'idle';
    let used: AvatarPose = pose;
    // La marche se décode à la demande : en attendant, on glisse en attente.
    let strip = this.strip(code, pose, w.dir);
    if (!strip && pose === 'walk') {
      used = 'idle';
      strip = this.strip(code, 'idle', w.dir);
    }
    const index = this.index;
    if (!strip || !index) return false;
    const anim = index.layers[`body.${look.skin}`]?.[used];
    const frame =
      used === 'walk' && anim
        ? frameIndex(anim, strip.cells.length, true, {
            timeSec: frameTime + phase,
            travelledMeters: w.travelled * METERS_PER_TILE,
          })
        : 0;
    const cell = strip.cells[stripCellIndex(used, w.dir, frame)];
    if (!cell) return false;
    const pr = index.pixelRatio;
    const foot = gridToScreen(w.x, w.y);
    ctx.drawImage(
      strip.canvas as CanvasImageSource,
      cell.x,
      cell.y,
      cell.w,
      cell.h,
      foot.x - cell.ax / pr,
      foot.y - cell.ay / pr,
      cell.w / pr,
      cell.h / pr
    );
    return true;
  }

  /** Vide le cache des bandes (démontage). */
  dispose(): void {
    this.strips.clear();
    for (const c of this.scratch) {
      if (c) {
        c.width = 0;
        c.height = 0;
      }
    }
    this.scratch = [null, null];
  }
}

/** Un compositeur par cache d'images (donc par contrôleur). */
const byImages = new WeakMap<object, LookCompositor>();

export function lookCompositorFor(images: LookImages): LookCompositor {
  let c = byImages.get(images);
  if (!c) {
    c = new LookCompositor(images);
    byImages.set(images, c);
  }
  return c;
}

/**
 * L'appel du renderer : un avatar composé (look) dessiné depuis sa bande, ou
 * false (le renderer pose alors la feuille de son `avatarId`). `frameTime`
 * est l'horloge de l'image (la même pour tous les avatars), `phase` le
 * décalage propre à l'avatar.
 */
export function drawLookAvatar(
  ctx: CanvasRenderingContext2D,
  images: LookImages,
  a: AvatarEntity,
  frameTime: number,
  phase = 0
): boolean {
  if (!a.look) return false;
  return lookCompositorFor(images).draw(ctx, a, frameTime, phase);
}
