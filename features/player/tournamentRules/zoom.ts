// features/player/tournamentRules/zoom.ts — le zoom de la liseuse et les
// plafonds de mémoire du rendu. Pur, sans React ni pdf.js (testé à part).
//
// LE ZOOM est relatif à la LARGEUR AJUSTÉE (100 % = la page occupe la largeur
// de la zone, plafonnée à MAX_PAGE_CSS_WIDTH) : sur téléphone, 100 % est
// trop petit pour lire une page A4, d'où 125 % → 300 %.
//
// LA MÉMOIRE (un PDF de 30-60 pages à 300 % sur mobile) :
//   - chaque page est rendue UNE fois à la largeur ajustée × devicePixelRatio
//     (≤ MAX_BASE_PIXEL_WIDTH de large) : c'est ce rendu de base que le
//     déblocage de la case attend ; il est gardé en PNG (compressé) ;
//   - zoomée, seules les pages près de la vue (au plus MAX_SHARP_PAGES) sont
//     re-rendues en haute résolution ; une page qui s'éloigne rend son image
//     HD (URL révoquée) et retombe sur son image de base, agrandie et floue
//     — hors de vue ;
//   - un seul canevas à la fois (rendu séquentiel), vidé aussitôt, et jamais
//     plus de MAX_CANVAS_PIXELS par canevas : sous la limite d'iOS Safari
//     (16,7 Mpx), ~32 Mo en RGBA.
// Pire cas tenu en mémoire hors PNG de base : 3 × 32 Mo, quel que soit le
// nombre de pages.

/** Niveaux de zoom, relatifs à la largeur ajustée (1 = ajusté). */
export const ZOOM_STEPS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
export const ZOOM_MIN: number = ZOOM_STEPS[0];
export const ZOOM_MAX: number = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/** Largeur CSS maximale d'une page à 100 % (bureau). */
export const MAX_PAGE_CSS_WIDTH = 900;
/** Largeur maximale du rendu de base, en pixels réels. */
export const MAX_BASE_PIXEL_WIDTH = 1800;
/** Pixels d'un canevas au plus (largeur × hauteur). */
export const MAX_CANVAS_PIXELS = 8_000_000;
/** Pages rendues en haute résolution en même temps, au plus. */
export const MAX_SHARP_PAGES = 3;

/** Niveau suivant (borné au maximum). */
export function zoomIn(zoom: number): number {
  return ZOOM_STEPS.find((s) => s > zoom + 1e-9) ?? ZOOM_MAX;
}

/** Niveau précédent (borné au minimum). */
export function zoomOut(zoom: number): number {
  return [...ZOOM_STEPS].reverse().find((s) => s < zoom - 1e-9) ?? ZOOM_MIN;
}

/** « 150 » pour 1,5. */
export function zoomPercent(zoom: number): number {
  return Math.round(zoom * 100);
}

/**
 * Largeur de rendu en pixels réels, plafonnée pour que le canevas ne
 * dépasse pas MAX_CANVAS_PIXELS (`pageWidth` × `pageHeight` : dimensions de la
 * page à l'échelle 1, seul leur rapport compte).
 */
export function cappedPixelWidth(
  pageWidth: number,
  pageHeight: number,
  wanted: number
): number {
  const ratio = pageWidth > 0 && pageHeight > 0 ? pageHeight / pageWidth : 1;
  const byArea = Math.floor(Math.sqrt(MAX_CANVAS_PIXELS / ratio));
  return Math.max(1, Math.min(Math.round(wanted), byArea));
}
