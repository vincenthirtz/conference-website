// Les PERSONNAGES NON JOUEURS dans la scène — lot 16 de
// docs/PLAN-womens-library.md : le fantôme d'Halloween du hall.
//
// Un PNJ n'est ni un avatar (pas de présence, pas de menu, rien sur le
// réseau) ni un meuble (pas au catalogue, il ne bloque pas la marche). Le
// monde le porte (`world.npc`) ; ce module fait tout le reste, pour garder le
// contrôleur, le monde et le rendu sous leur plafond de taille :
//   - SA POSITION vient de l'heure (`halloween/ghostRoute.ts`) : toutes les
//     joueuses le voient au même endroit. Il flotte (hauteur de vol et
//     balancement ; sans balancement si la joueuse refuse les animations) ;
//   - LE DESSIN : une ombre douce au sol, qui rétrécit et pâlit quand il
//     monte (aucune n'est cuite dans ses images), puis son image, triée en
//     profondeur avec les meubles et les avatars (`renderer.ts`) ;
//   - « BOUH ! » : quand il passe à 1,5 m d'un avatar visible, une bulle
//     au-dessus de lui (`halloween/boo.ts`, une attente par avatar), dessinée
//     avec celles des avatars (`avatarOverlays.ts`) ;
//   - L'APPUI : il est visé APRÈS une autre joueuse et AVANT les zones
//     déclarées (`hotspots.ts`) ; son appui part comme celui d'une zone
//     (`onHotspotTap`, id `opts.spotId`) — dans le hall, la même que la
//     citrouille : l'inscription en un clic ;
//   - LA BOUCLE DE RENDU reste éveillée tant qu'il est À L'ÉCRAN, à ~30 images
//     par seconde quand rien d'autre ne bouge ; hors de l'écran, elle dort et
//     une minuterie d'une seconde vient voir s'il est revenu (effacée à la
//     fin, `dispose`).
// CHARGÉ À LA DEMANDE (`npcHost.ts`) : ce module, la ronde, les « bouh » et
// l'index des images ne partent que si la salle a un PNJ — le hall, pendant
// l'événement.

import { type BooMemory, booTargets, EMPTY_BOO_MEMORY } from '../halloween/boo';
import { isHalloweenActive } from '../halloween/event';
import {
  GHOST_HOVER_M,
  type GhostPose,
  ghostPoseAt,
  hallGhostRoute,
  halloweenGhostAt,
} from '../halloween/ghostRoute';
import type { ImageCache } from './assets';
import type { AvatarOverlay } from './avatarOverlays';
import { type Box3, boxContainsScreenPoint, centerDepth } from './depthSort';
import { loadNpcIndex, type NpcSheet, npcFrame } from './npcSprites';
import {
  type Camera,
  gridToScreen,
  metersToTiles,
  PX_PER_METER,
  type ScreenPoint,
  worldToCanvas,
  Z_PX,
} from './projection';
import type { AvatarEntity } from './world';

/** Ce que l'écran demande : un PNJ et ses textes, déjà traduits. */
export type NpcOptions = {
  /** Le PNJ : aujourd'hui le seul, le fantôme d'Halloween du hall. */
  kind: 'halloween';
  /** Le texte de sa bulle (« Bouh ! »). */
  booText: string;
  /** Son nom au survol (infobulle). */
  label?: string;
  /** L'id de zone que reçoit `onHotspotTap` quand on l'appuie. */
  spotId: string;
  /** Pas de balancement ; défaut : `prefers-reduced-motion`. */
  reducedMotion?: boolean;
  /** Développement : il reste même hors de l'affiche de l'événement. */
  ignoreWindow?: boolean;
  /** Horloge murale (ms) ; défaut `Date.now`. */
  now?: () => number;
  /** Index des images (tests). */
  indexUrl?: string;
};

/** ~30 images/s quand seul le PNJ bouge. */
const FRAME_MS = 33;
/** Hors de l'écran : on revient voir toutes les secondes. */
const WAKE_MS = 1_000;
/** Opacité de son image : un drap, pas tout à fait opaque. */
const NPC_ALPHA = 0.92;
/** Au-delà de cette hauteur (m), l'ombre est à sa plus petite taille. */
const SHADOW_FADE_M = 1;
/** Ombre un peu plus large que son drap : elle dépasse sous l'ourlet. */
const SHADOW_SPREAD = 1.15;
const BUBBLE_GLYPH = '👻';
/** Demi-largeur de sa boîte de TRI (cases), celle d'un avatar à peu près. */
const SORT_HALF = 0.45;
/** Marge (px CSS) autour de lui pour le dire « à l'écran » (sa bulle comprise). */
const SCREEN_MARGIN = 80;

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

type NpcBubble = { key: string; text: string; expiresAt: number };

export class NpcLayer {
  /** Où il est à la dernière image (null : pas de PNJ maintenant). */
  pose: GhostPose | null = null;
  private sheet: NpcSheet | null = null;
  private pixelRatio = 1;
  private bubble: NpcBubble | null = null;
  private memory: BooMemory = EMPTY_BOO_MEMORY;
  private visible = false;
  private lastDraw = Number.NEGATIVE_INFINITY;
  private wake: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly still: boolean;
  private readonly now: () => number;

  constructor(
    private opts: NpcOptions,
    private images: ImageCache,
    private loop: { request(): void }
  ) {
    this.still = opts.reducedMotion ?? prefersReducedMotion();
    this.now = opts.now ?? (() => Date.now());
    // Hors de l'affiche, pas de fantôme : rien à charger.
    if (!opts.ignoreWindow && !isHalloweenActive(this.now())) return;
    void loadNpcIndex(opts.indexUrl).then((index) => {
      const sheet = index?.npcs.ghost;
      if (this.disposed || !index || !sheet) return;
      this.sheet = sheet;
      this.pixelRatio = index.pixelRatio;
      for (const f of sheet.frames) images.get(f.src);
      loop.request();
    });
  }

  /** Avance à l'heure : position, « bouh » des avatars proches, bulle échue. */
  step(world: { avatars: readonly AvatarEntity[]; bubbleMs: number }): void {
    const now = this.now();
    const pose = !this.sheet
      ? null
      : this.opts.ignoreWindow
        ? ghostRouteAt(now)
        : halloweenGhostAt(now);
    this.pose =
      pose && this.still ? { ...pose, z: GHOST_HOVER_M, bob: 0 } : pose;
    if (this.bubble && this.bubble.expiresAt <= now) this.bubble = null;
    const near = booTargets(
      this.pose,
      world.avatars.map((a) => ({ id: a.id, x: a.walker.x, y: a.walker.y })),
      now,
      this.memory
    );
    this.memory = near.memory;
    if (near.boo.length)
      this.bubble = {
        key: `npc:boo:${now}`,
        text: this.opts.booText,
        expiresAt: now + world.bubbleMs,
      };
  }

  /** Boîte de TRI (au plus près de son axe, comme un avatar), ou null. */
  box(): Box3 | null {
    const p = this.pose;
    const s = this.sheet;
    if (!p || !s) return null;
    return {
      minX: p.x - SORT_HALF,
      maxX: p.x + SORT_HALF,
      minY: p.y - SORT_HALF,
      maxY: p.y + SORT_HALF,
      minZ: p.z,
      maxZ: p.z + s.height,
    };
  }

  /** Boîte d'APPUI : tout son drap. */
  private hitBox(): Box3 | null {
    const p = this.pose;
    const s = this.sheet;
    if (!p || !s) return null;
    const r = metersToTiles(s.radius);
    return {
      minX: p.x - r,
      maxX: p.x + r,
      minY: p.y - r,
      maxY: p.y + r,
      minZ: p.z,
      maxZ: p.z + s.height,
    };
  }

  /** L'ombre au sol, avant les meubles et les avatars. */
  drawShadow(ctx: CanvasRenderingContext2D): void {
    const p = this.pose;
    const s = this.sheet;
    if (!p || !s) return;
    const k = Math.max(0.5, 1 - p.z / SHADOW_FADE_M);
    const r = s.radius * PX_PER_METER * SHADOW_SPREAD * k;
    const foot = gridToScreen(p.x, p.y, 0);
    ctx.save();
    ctx.translate(foot.x, foot.y);
    ctx.scale(1, 0.5);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(0, 0, 0, ${(0.5 * k).toFixed(3)})`);
    g.addColorStop(0.6, `rgba(0, 0, 0, ${(0.25 * k).toFixed(3)})`);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Son image, à sa hauteur de vol ; false si elle n'est pas (encore) prête. */
  draw(ctx: CanvasRenderingContext2D): boolean {
    const p = this.pose;
    const s = this.sheet;
    if (!p || !s) return false;
    const f = npcFrame(s, p.dir);
    const img = this.images.get(f.src);
    if (!img) return false;
    const pr = this.pixelRatio;
    const o = gridToScreen(p.x, p.y, p.z);
    ctx.save();
    ctx.globalAlpha = NPC_ALPHA;
    ctx.drawImage(
      img,
      o.x - f.anchor.x / pr,
      o.y - f.anchor.y / pr,
      f.width / pr,
      f.height / pr
    );
    ctx.restore();
    return true;
  }

  /** Sa bulle, au-dessus de sa tête (px CSS), avec celles des avatars. */
  overlay(cam: Camera): AvatarOverlay | null {
    const p = this.pose;
    const s = this.sheet;
    const box = this.box();
    if (!p || !s || !box || !this.bubble) return null;
    return {
      id: 'npc',
      head: worldToCanvas(gridToScreen(p.x, p.y, p.z + s.height + 0.1), cam),
      depth: centerDepth(box),
      label: null,
      marker: null,
      bubble: { glyph: BUBBLE_GLYPH, text: this.bubble.text },
    };
  }

  /**
   * Lui, sous un point du MONDE (`hotspots.ts` le vise avant les zones) :
   * l'id de zone de son appui, son nom et le haut de sa tête.
   */
  spotAt(
    sx: number,
    sy: number
  ): { id: string; label?: string; top: ScreenPoint } | null {
    const box = this.hitBox();
    const p = this.pose;
    if (!box || !p || !boxContainsScreenPoint(box, sx, sy)) return null;
    return {
      id: this.opts.spotId,
      label: this.opts.label,
      top: gridToScreen(p.x, p.y, box.maxZ),
    };
  }

  /** Après le dessin : est-il dans le cadre (`cssW` × `cssH`, px CSS) ? */
  markVisible(cam: Camera, cssW: number, cssH: number): void {
    const p = this.pose;
    const s = this.sheet;
    if (!p || !s || cssW <= 0 || cssH <= 0) {
      this.visible = false;
      return;
    }
    const foot = worldToCanvas(gridToScreen(p.x, p.y, p.z), cam);
    const half = (s.radius * PX_PER_METER + SCREEN_MARGIN) * cam.zoom;
    const tall = (s.height * Z_PX + SCREEN_MARGIN) * cam.zoom;
    this.visible =
      foot.x + half >= 0 &&
      foot.x - half <= cssW &&
      foot.y + SCREEN_MARGIN >= 0 &&
      foot.y - tall <= cssH;
  }

  /**
   * Avant le dessin : true pour SAUTER cette image (seul le PNJ bouge et la
   * précédente date de moins de 33 ms).
   */
  throttle(active: boolean): boolean {
    const t = performance.now();
    if (this.pose && !active && t - this.lastDraw < FRAME_MS) return true;
    this.lastDraw = t;
    return false;
  }

  /**
   * Après le dessin : la boucle doit-elle continuer pour lui ? Oui s'il est à
   * l'écran ; sinon une minuterie revient voir dans une seconde.
   */
  awake(): boolean {
    if (this.disposed || !this.pose) return false;
    if (this.visible) {
      this.clearWake();
      return true;
    }
    if (this.wake === null)
      this.wake = setTimeout(() => {
        this.wake = null;
        if (!this.disposed) this.loop.request();
      }, WAKE_MS);
    return false;
  }

  private clearWake(): void {
    if (this.wake !== null) clearTimeout(this.wake);
    this.wake = null;
  }

  dispose(): void {
    this.disposed = true;
    this.clearWake();
  }
}

/** La ronde du hall à `now`, sans regarder l'affiche (développement). */
function ghostRouteAt(now: number): GhostPose | null {
  const route = hallGhostRoute();
  return route ? ghostPoseAt(route, now) : null;
}
