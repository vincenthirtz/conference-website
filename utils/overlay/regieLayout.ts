// utils/overlay/regieLayout.ts — la MISE EN PAGE de la source OBS `/overlay/regie`
// (plein écran 1920×1080) : où poser chaque élément, à quelle taille, et s'il
// s'affiche. Réglée depuis Admin › Diffusion › Overlays, lue par la source à
// chaque rafraîchissement (`/api/overlay/alerts` → `layout`).
//
// UN ÉLÉMENT = un ANCRAGE (9 positions : coins, bords, centre), un DÉCALAGE en
// pixels de la scène 1920×1080 depuis cet ancrage, une ÉCHELLE, un
// interrupteur. L'ancrage garde l'élément collé à son bord quand sa taille
// change (un vote à 3 ou à 8 candidates, un bandeau de 2 ou 6 partenaires) ;
// le décalage l'affine.
//
// DÉFAUTS = la mise en page d'avant ce réglage, à l'identique : alertes au
// centre, sondage en haut, partenaires en bas, QR en bas à droite. Une ligne
// absente ou partielle retombe dessus élément par élément.
//
// Pur et sans dépendance : partagé par la source, l'API et l'éditeur admin,
// testé seul (tests/unit/regieLayout.test.ts).

import type { CSSProperties } from 'react';

export const REGIE_ELEMENTS = ['alerts', 'mvp', 'partners', 'don'] as const;
export type RegieElement = (typeof REGIE_ELEMENTS)[number];

export const REGIE_ANCHORS = [
  'tl',
  'tc',
  'tr',
  'ml',
  'mc',
  'mr',
  'bl',
  'bc',
  'br',
] as const;
export type RegieAnchor = (typeof REGIE_ANCHORS)[number];

export type RegieSlot = {
  anchor: RegieAnchor;
  /** Décalage horizontal (px de la scène 1920), vers la droite si positif. */
  x: number;
  /** Décalage vertical (px de la scène 1080), vers le bas si positif. */
  y: number;
  /** Échelle propre à l'élément (× l'échelle globale `?scale=`). */
  scale: number;
  visible: boolean;
};

export type RegieLayout = Record<RegieElement, RegieSlot>;

export const SCENE_W = 1920;
export const SCENE_H = 1080;
export const SCALE_MIN = 0.4;
export const SCALE_MAX = 2;

export const DEFAULT_REGIE_LAYOUT: RegieLayout = {
  alerts: { anchor: 'mc', x: 0, y: 0, scale: 1, visible: true },
  mvp: { anchor: 'tc', x: 0, y: 0, scale: 0.85, visible: true },
  partners: { anchor: 'bc', x: 0, y: 0, scale: 1, visible: true },
  // Au-dessus du bandeau partenaires : à sa hauteur d'origine, le QR
  // recouvrait la dernière pastille partenaire.
  don: { anchor: 'br', x: -40, y: -240, scale: 1, visible: true },
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

function slotOf(raw: unknown, fallback: RegieSlot): RegieSlot {
  const r = (raw ?? {}) as Partial<Record<keyof RegieSlot, unknown>>;
  const num = (v: unknown, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : d;
  return {
    anchor: (REGIE_ANCHORS as readonly string[]).includes(r.anchor as string)
      ? (r.anchor as RegieAnchor)
      : fallback.anchor,
    x: Math.round(clamp(num(r.x, fallback.x), -SCENE_W, SCENE_W)),
    y: Math.round(clamp(num(r.y, fallback.y), -SCENE_H, SCENE_H)),
    scale:
      Math.round(
        clamp(num(r.scale, fallback.scale), SCALE_MIN, SCALE_MAX) * 100
      ) / 100,
    visible: typeof r.visible === 'boolean' ? r.visible : fallback.visible,
  };
}

/** Mise en page complète et bornée, quelle que soit la forme reçue. */
export function normalizeRegieLayout(raw: unknown): RegieLayout {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    alerts: slotOf(src.alerts, DEFAULT_REGIE_LAYOUT.alerts),
    mvp: slotOf(src.mvp, DEFAULT_REGIE_LAYOUT.mvp),
    partners: slotOf(src.partners, DEFAULT_REGIE_LAYOUT.partners),
    don: slotOf(src.don, DEFAULT_REGIE_LAYOUT.don),
  };
}

/** Composantes de l'ancrage : vertical (t/m/b) et horizontal (l/c/r). */
export function anchorParts(anchor: RegieAnchor): {
  v: 't' | 'm' | 'b';
  h: 'l' | 'c' | 'r';
} {
  return {
    v: anchor[0] as 't' | 'm' | 'b',
    h: anchor[1] as 'l' | 'c' | 'r',
  };
}

/**
 * Style CSS d'un emplacement dans la scène (conteneur `position: absolute`,
 * l'élément y prend sa taille naturelle). `k` convertit les pixels de la scène
 * 1920×1080 vers le rendu réel (1 dans OBS, <1 dans l'aperçu admin).
 *
 * UN AXE CENTRÉ S'ÉTEND SUR TOUTE LA SCÈNE et centre l'élément en flex, au
 * lieu d'un `left: 50%` + translation : ce dernier ne laisse à l'élément que
 * la MOITIÉ de la largeur, et un bandeau de partenaires passerait à la ligne
 * au milieu de l'écran.
 */
export function slotStyle(
  slot: RegieSlot,
  opts: { k?: number; globalScale?: number } = {}
): CSSProperties {
  const k = opts.k ?? 1;
  const s = slot.scale * (opts.globalScale ?? 1);
  const { v, h } = anchorParts(slot.anchor);
  const style: CSSProperties = { position: 'absolute', display: 'flex' };
  let dx = 0;
  let dy = 0;

  // TOUJOURS la largeur de la scène : un conteneur réduit à son contenu
  // ferait passer à la ligne un élément qui s'étale (bandeau de partenaires).
  if (h === 'l') {
    style.left = slot.x * k;
    style.width = '100%';
    style.justifyContent = 'flex-start';
  } else if (h === 'r') {
    style.right = -slot.x * k;
    style.width = '100%';
    style.justifyContent = 'flex-end';
  } else {
    style.left = 0;
    style.right = 0;
    style.justifyContent = 'center';
    dx = slot.x * k;
  }
  if (v === 't') {
    style.top = slot.y * k;
    style.alignItems = 'flex-start';
  } else if (v === 'b') {
    style.bottom = -slot.y * k;
    style.alignItems = 'flex-end';
  } else {
    style.top = 0;
    style.bottom = 0;
    style.alignItems = 'center';
    dy = slot.y * k;
  }

  const tx: string[] = [];
  if (dx !== 0 || dy !== 0) tx.push(`translate(${dx}px, ${dy}px)`);
  if (s !== 1) tx.push(`scale(${s})`);
  if (tx.length > 0) style.transform = tx.join(' ');
  // L'échelle part de l'ancrage : un élément en bas à droite grandit vers le
  // haut et la gauche, sans sortir de l'écran.
  style.transformOrigin = `${h === 'l' ? 'left' : h === 'r' ? 'right' : 'center'} ${
    v === 't' ? 'top' : v === 'b' ? 'bottom' : 'center'
  }`;
  return style;
}

/**
 * Style du CONTENU d'un emplacement : sa largeur naturelle. Sans lui, un
 * composant qui s'étire (`w-full`) et se centre lui-même ignorerait
 * l'ancrage — un sondage « en haut à droite » finirait au milieu.
 */
export const SLOT_CONTENT_STYLE: CSSProperties = {
  width: 'max-content',
  maxWidth: '100%',
};
