// Le dessin d'UN avatar (sorti de renderer.ts au lot 15) : son ombre au sol,
// puis son image — le look composé (lookCompositor.ts), sinon la feuille de
// son `avatarId` (avatarSprites.ts), sinon la silhouette (placeholders.ts).
//
// POSE (lot 15, engine/stance.ts) : debout (marche, attente) sur sa case, ou
// sur la place d'un meuble — assise, assise basse, allongée —, avec les
// replis de `poseChain` et le décalage `restLift`. La pose réellement
// dessinée est notée sur l'avatar (`renderedPose`) : sa boîte et sa tête en
// dépendent. OMBRE : debout, sous ses pieds ; assise, sous la place (le
// renderer la pose AVANT le meuble, qui la recouvre) ; allongée, aucune.

import type { ImageCache, LibraryManifest } from './assets';
import {
  animationFor,
  avatarFrame,
  frameDestination,
  restLift,
  type SheetRef,
  sheetMatchesImage,
} from './avatarSprites';
import { drawLookAvatar } from './lookCompositor';
import { isWalking } from './motion';
import { drawAvatarPlaceholder, drawAvatarShadow } from './placeholders';
import { gridToScreen, METERS_PER_TILE } from './projection';
import { stanceOf } from './stance';
import type { AvatarEntity } from './world';

type Ctx = CanvasRenderingContext2D;

/** Décalage d'horloge stable par avatar (les bots ne respirent pas en chœur). */
export function phaseOffset(id: string): number {
  let h = 0;
  for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) >>> 0;
  return (h % 1000) / 1000;
}

export class AvatarPainter {
  /** Feuille d'avatar conforme à sa taille annoncée, par URL de feuille. */
  private sheetVerdict = new Map<string, boolean>();

  constructor(
    private ctx: Ctx,
    private images: ImageCache,
    private manifest: () => LibraryManifest | null
  ) {}

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

  /** L'ombre au sol (aucune pour une avatar allongée). */
  shadow(a: AvatarEntity, isPlayer: boolean): void {
    const s = stanceOf(a);
    if (s.pose === 'lie') return;
    drawAvatarShadow(this.ctx, s.x, s.y, isPlayer);
  }

  /**
   * Image de l'avatar, posée par son ancre (miroir compris) ; false si
   * l'avatar n'a pas d'entrée, que la direction manque, ou que la feuille de
   * l'image n'est pas (encore) prête ou n'a pas la taille annoncée. Seule la
   * feuille de l'image dessinée est demandée au cache : celle de `sit` n'est
   * chargée que si un avatar s'assoit.
   */
  private sprite(a: AvatarEntity, timeSec: number): boolean {
    const m = this.manifest();
    if (!m || !a.avatarId || !Object.hasOwn(m.avatars, a.avatarId))
      return false;
    const sheet = m.avatars[a.avatarId];
    const w = a.walker;
    const st = stanceOf(a);
    const f = avatarFrame(sheet, st.dir, st.pose, {
      timeSec: timeSec + phaseOffset(a.id),
      travelledMeters: w.travelled * METERS_PER_TILE,
    });
    if (!f) return false;
    const { name, anim } = animationFor(sheet, st.pose);
    const img = this.images.get(f.src);
    if (!img || !this.sheetUsable(anim.sheet, img)) return false;
    const lift = st.surfaceM === null ? 0 : restLift(st.surfaceM, name);
    const d = frameDestination(f, gridToScreen(st.x, st.y, lift), m.pixelRatio);
    a.renderedPose = name;
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

  /** L'image de l'avatar (sans l'ombre) ; true si c'est un sprite. */
  body(a: AvatarEntity, timeSec: number): boolean {
    // Avatar composé (lot 13), sinon la feuille de son `avatarId`.
    if (
      drawLookAvatar(this.ctx, this.images, a, timeSec, phaseOffset(a.id)) ||
      this.sprite(a, timeSec)
    )
      return true;
    const st = stanceOf(a);
    const w = a.walker;
    a.renderedPose = 'idle';
    drawAvatarPlaceholder(this.ctx, st.x, st.y, {
      hue: a.hue,
      dir: st.dir,
      walking: isWalking(w),
      // Un cycle de jambes tous les ~0,7 m.
      phase: (w.travelled * METERS_PER_TILE * Math.PI * 2) / 0.7,
    });
    return false;
  }
}
