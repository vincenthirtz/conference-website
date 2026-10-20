// features/player/library/ui/apartment/decor/decorPreviewScene.ts — le dessin
// de l'aperçu du décor (lot 12), côté MOTEUR : chargé à la demande par
// DecorPreview (`import()` dans un effet), il reste hors du premier
// chargement de la page, comme la scène (`next/dynamic` d'ApartmentStage).
//
// La pièce est celle de la joueuse (dimensions), vide, avec le décor choisi
// posé par `apartmentDecor` : même sol, même style de mur, mêmes places de
// porte et de fenêtres que dans la scène (engine/decorRenderer.ts,
// `drawDecorScene`).

import { type LibraryDecorChoice, libraryWallOf } from '@/config/library/decor';
import { apartmentDecor } from '../../../apartmentModel';
import { ImageCache, type LibraryManifest } from '../../../engine/assets';
import {
  drawDecorScene,
  fitDecorCamera,
  PatternCache,
} from '../../../engine/decorRenderer';
import type { RoomModel } from '../../../engine/room';

/** Hauteur des murs rendus (m) : celle des sprites du pipeline. */
export const PREVIEW_WALL_HEIGHT_M = 2.8;

export type DecorPreviewInput = {
  width: number;
  depth: number;
  choice: LibraryDecorChoice;
  manifest: LibraryManifest | null;
};

/** La salle du moteur pour un choix de décor (sans meuble). */
export function previewRoom(input: DecorPreviewInput): RoomModel {
  const { width, depth, choice } = input;
  return {
    w: width,
    d: depth,
    wallHeight: PREVIEW_WALL_HEIGHT_M,
    items: [],
    decor: apartmentDecor({
      width,
      depth,
      decor: { ...choice, wall: libraryWallOf(choice.window) },
    }),
  };
}

/**
 * Un dessinateur par aperçu : ses images et ses motifs restent en cache d'un
 * choix à l'autre ; `onImage` redemande un rendu quand une image arrive.
 */
export function createDecorPreview(onImage: () => void) {
  const images = new ImageCache(onImage);
  const patterns = new PatternCache();
  return {
    /** Dessine ; false tant qu'un sprite manque (aplat d'attente). */
    draw(
      canvas: HTMLCanvasElement,
      cssW: number,
      cssH: number,
      dpr: number,
      input: DecorPreviewInput
    ): boolean {
      const ctx = canvas.getContext('2d');
      if (!ctx || cssW <= 0 || cssH <= 0) return false;
      const bw = Math.round(cssW * dpr);
      const bh = Math.round(cssH * dpr);
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;
      const room = previewRoom(input);
      const cam = fitDecorCamera(room, PREVIEW_WALL_HEIGHT_M, cssW, cssH);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, bw, bh);
      const s = dpr * cam.zoom;
      ctx.setTransform(s, 0, 0, s, dpr * cam.x, dpr * cam.y);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      return drawDecorScene(
        ctx,
        room,
        input.manifest?.decor ?? null,
        input.manifest?.pixelRatio ?? 1,
        images,
        patterns
      );
    },
  };
}
