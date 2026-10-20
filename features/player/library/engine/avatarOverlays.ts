// Ce qui flotte AU-DESSUS des avatars (lot 5 phase B), dessiné en DERNIER —
// aucun meuble ni avatar ne le couvre — et en px CSS fixes, lisible à tout
// zoom :
//   - le PSEUDO des autres joueuses : pastille sombre, texte clair, lisible
//     sur tout sol ; élidé (« … ») au-delà de LABEL_MAX_W ;
//   - le repère de la joueuse (« discrète ») : même pastille, bord pointillé ;
//   - la BULLE d'une emote ou d'une phrase, au-dessus du pseudo : pastille
//     claire, pictogramme puis mot traduit, petite pointe vers la tête ;
//   - la bulle d'un MESSAGE du chat (lot 6, clé `chat:<id>`) : plus large
//     (CHAT_BUBBLE_MAX_W), sur une ligne, élidée — le fil sous la scène garde
//     le texte entier. Texte brut, dessiné tel quel.
// Les textes arrivent traduits (le moteur n'a pas d'i18n). Ordre : du fond
// vers l'avant, pour que la pastille d'une avatar placée devant passe devant.

import { isChatBubbleKey } from '../realtime/chatBubble';
import { centerDepth } from './depthSort';
import {
  type Camera,
  gridToScreen,
  type ScreenPoint,
  worldToCanvas,
} from './projection';
import { AVATAR_HEIGHT, avatarBox } from './room';
import type { AvatarEntity, LibraryWorld } from './world';

type Ctx = CanvasRenderingContext2D;

export const LABEL_FONT_PX = 12;
export const BUBBLE_FONT_PX = 13;
export const GLYPH_FONT_PX = 16;
/** Largeur maximale du TEXTE d'un pseudo, d'une bulle (px CSS). */
export const LABEL_MAX_W = 120;
export const BUBBLE_MAX_W = 168;
/** Largeur maximale du texte d'une bulle de CHAT (px CSS). */
export const CHAT_BUBBLE_MAX_W = 220;

const LABEL_H = 18;
const LABEL_PAD = 7;
const BUBBLE_H = 26;
const BUBBLE_PAD = 9;
const GLYPH_GAP = 5;
const TAIL = 5;
const GAP = 4;
/** Au-dessus du crâne (cheveux compris), en mètres. */
const HEAD_CLEARANCE_M = 0.1;
const HEAD_GAP = 4;

const LABEL_BG = 'rgba(16, 8, 18, 0.84)';
const LABEL_BORDER = 'rgba(255, 255, 255, 0.22)';
const LABEL_TEXT = '#f4edf7';
const MARKER_BORDER = 'rgba(222, 163, 246, 0.9)';
const MARKER_TEXT = '#eec4ff';
const BUBBLE_BG = '#fffaf2';
const BUBBLE_BORDER = 'rgba(29, 20, 32, 0.35)';
const BUBBLE_TEXT = '#1d1420';
const EMOJI_FONTS =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/**
 * `text` tronqué pour tenir dans `maxW` (« … » compris), selon `measure`.
 * Coupe par points de code : un emoji ou un accent n'est jamais coupé en deux.
 */
export function elideText(
  text: string,
  maxW: number,
  measure: (s: string) => number
): string {
  if (measure(text) <= maxW) return text;
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length;
  // Le plus long préfixe p tel que p + « … » tienne.
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${chars.slice(0, mid).join('').trimEnd()}…`) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return `${chars.slice(0, lo).join('').trimEnd()}…`;
}

/** Ce qu'il faut dessiner au-dessus d'un avatar, et où (px CSS du canvas). */
export type AvatarOverlay = {
  id: string;
  head: ScreenPoint;
  depth: number;
  label: string | null;
  marker: string | null;
  /** `chat` : la bulle d'un message du chat (plus large). */
  bubble: { glyph: string | null; text: string; chat?: true } | null;
};

/** Le point au-dessus de la tête d'un avatar, en px CSS du canvas. */
export function headPoint(a: AvatarEntity, cam: Camera): ScreenPoint {
  return worldToCanvas(
    gridToScreen(a.walker.x, a.walker.y, AVATAR_HEIGHT + HEAD_CLEARANCE_M),
    cam
  );
}

/** Les avatars qui portent quelque chose, du fond vers l'avant. */
export function avatarOverlays(
  world: LibraryWorld,
  cam: Camera
): AvatarOverlay[] {
  const out: AvatarOverlay[] = [];
  for (const a of world.avatars) {
    if (!a.label && !a.marker && !a.bubble) continue;
    out.push({
      id: a.id,
      head: headPoint(a, cam),
      depth: centerDepth(avatarBox(a.walker.x, a.walker.y)),
      label: a.label,
      marker: a.marker,
      bubble: a.bubble
        ? {
            glyph: a.bubble.glyph,
            text: a.bubble.text,
            ...(isChatBubbleKey(a.bubble.key) ? { chat: true as const } : {}),
          }
        : null,
    });
  }
  return out.sort((p, q) => p.depth - q.depth);
}

/** Textes élidés gardés d'une image à l'autre (mesurer coûte). */
export class ElideCache {
  private map = new Map<string, string>();

  get(ctx: Ctx, font: string, text: string, maxW: number): string {
    const k = `${font}|${maxW}|${text}`;
    const hit = this.map.get(k);
    if (hit !== undefined) return hit;
    ctx.font = font;
    const out = elideText(text, maxW, (s) => ctx.measureText(s).width);
    if (this.map.size > 256) this.map.clear();
    this.map.set(k, out);
    return out;
  }
}

function pill(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string,
  dashed = false
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = stroke;
  if (dashed) ctx.setLineDash([3, 2]);
  ctx.stroke();
  if (dashed) ctx.setLineDash([]);
}

/** Pastille de pseudo (ou de repère) centrée sur `cx`, posée sur `bottom`. Rend son haut. */
function drawTag(
  ctx: Ctx,
  cache: ElideCache,
  family: string,
  text: string,
  cx: number,
  bottom: number,
  marker: boolean
): number {
  const font = `${marker ? 'italic 600' : '600'} ${LABEL_FONT_PX}px ${family}`;
  const shown = cache.get(ctx, font, text, LABEL_MAX_W);
  ctx.font = font;
  const w = ctx.measureText(shown).width + 2 * LABEL_PAD;
  const top = bottom - LABEL_H;
  pill(
    ctx,
    cx - w / 2,
    top,
    w,
    LABEL_H,
    LABEL_BG,
    marker ? MARKER_BORDER : LABEL_BORDER,
    marker
  );
  ctx.fillStyle = marker ? MARKER_TEXT : LABEL_TEXT;
  ctx.fillText(shown, cx - w / 2 + LABEL_PAD, top + LABEL_H / 2 + 0.5);
  return top;
}

/** Bulle (pictogramme + mot, ou message du chat) centrée sur `cx`, sa pointe sur `bottom`. */
function drawBubble(
  ctx: Ctx,
  cache: ElideCache,
  family: string,
  bubble: { glyph: string | null; text: string; chat?: true },
  cx: number,
  bottom: number
): void {
  // Un message se lit en graisse normale : on le distingue d'un signe.
  const font = `${bubble.chat ? '500' : '600'} ${BUBBLE_FONT_PX}px ${family}`;
  const glyphFont = `${GLYPH_FONT_PX}px ${EMOJI_FONTS}`;
  const text = cache.get(
    ctx,
    font,
    bubble.text,
    bubble.chat ? CHAT_BUBBLE_MAX_W : BUBBLE_MAX_W
  );
  ctx.font = font;
  const textW = ctx.measureText(text).width;
  let glyphW = 0;
  if (bubble.glyph) {
    ctx.font = glyphFont;
    glyphW = ctx.measureText(bubble.glyph).width + GLYPH_GAP;
  }
  const w = glyphW + textW + 2 * BUBBLE_PAD;
  const top = bottom - TAIL - BUBBLE_H;
  const left = cx - w / 2;
  ctx.beginPath();
  ctx.roundRect(left, top, w, BUBBLE_H, 9);
  ctx.moveTo(cx - TAIL, top + BUBBLE_H);
  ctx.lineTo(cx, bottom);
  ctx.lineTo(cx + TAIL, top + BUBBLE_H);
  ctx.fillStyle = BUBBLE_BG;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = BUBBLE_BORDER;
  ctx.stroke();
  const mid = top + BUBBLE_H / 2 + 0.5;
  if (bubble.glyph) {
    ctx.font = glyphFont;
    ctx.fillStyle = BUBBLE_TEXT;
    ctx.fillText(bubble.glyph, left + BUBBLE_PAD, mid);
  }
  ctx.font = font;
  ctx.fillStyle = BUBBLE_TEXT;
  ctx.fillText(text, left + BUBBLE_PAD + glyphW, mid);
}

/**
 * Dessine pseudos, repères et bulles par-dessus la scène. Remet la
 * transformation en px CSS (× dpr) : l'appelant la repose à l'image suivante.
 */
export function drawAvatarOverlays(
  ctx: Ctx,
  dpr: number,
  overlays: readonly AvatarOverlay[],
  family: string,
  cache: ElideCache
): void {
  if (!overlays.length) return;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const o of overlays) {
    let bottom = o.head.y - HEAD_GAP;
    const tag = o.label ?? o.marker;
    if (tag)
      bottom =
        drawTag(ctx, cache, family, tag, o.head.x, bottom, !o.label) - GAP;
    if (o.bubble) drawBubble(ctx, cache, family, o.bubble, o.head.x, bottom);
  }
  ctx.restore();
}
