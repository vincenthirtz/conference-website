// components/brand/PulseCanvas.tsx
//
// LE PULSE VIOLET DE LA CHARTE, détouré et rejoué en boucle.
//
// Deux crochets néon qui s'allument puis s'éteignent en 0,4 s, rejoués toutes
// les quelques secondes — un battement, pas un clignotement. Extrait de la
// navbar (`LiveLogoPulse`, qui ne l'affiche qu'en direct) pour servir aussi de
// source OBS autonome (`/overlay/logo`), sans condition de direct.
//
// POURQUOI UN CANVAS ET PAS `mix-blend-mode: screen`. Le rendu est un néon sur
// NOIR PUR. Le mode écran ferait disparaître ce noir, mais seulement s'il a
// quelque chose avec quoi se mélanger : dans la navbar (groupe isolé par son
// `backdrop-filter`) comme sur le fond transparent d'une source OBS, il laisse
// un rectangle noir. On détoure donc le noir nous-mêmes (luminance → alpha,
// `keyOutBlack`), image par image : aucun mode de fusion, aucun filtre SVG.
//
// Coût : ~0,4 s de décodage toutes les ~4 s, sur 288×198 px. Rien quand
// l'onglet est masqué.

import { useEffect, useRef, type CSSProperties } from 'react';

export const PULSE_SOURCES = [
  { src: '/overlay/tcg/pulse-horizontal.webm', type: 'video/webm' },
  { src: '/overlay/tcg/pulse-horizontal.mp4', type: 'video/mp4' },
] as const;

/** Silence entre deux battements (le motif lui-même dure 0,4 s). */
const REPLAY_GAP_MS = 3_600;

/** Zone utile du rendu 1920×1080 (les crochets + leur halo), en fractions. */
const CROP = { x: 0.25, y: 0.195, w: 0.5, h: 0.61 };

/** Taille du canvas (2× la taille affichée, pour les écrans haute densité). */
const CANVAS_W = 288;
const CANVAS_H = 198;

/**
 * Sous ce niveau : le bruit de compression du fond, et le halo très diffus du
 * rendu. Sur du noir ce halo est invisible ; détouré et ramené à pleine
 * couleur, il dessinait un VOILE RECTANGULAIRE aux bords du canvas — vérifié
 * au rendu. On ne garde que les crochets et leur lueur proche.
 */
const NOISE_FLOOR = 28;

/**
 * Détoure le fond noir d'une image RGBA, EN PLACE.
 *
 * Alpha = luminosité du pixel (sa composante max), et la couleur est
 * « dé-prémultipliée » (ramenée à pleine intensité) : un halo sombre devient
 * une couleur vive peu opaque, qui se pose sur n'importe quel fond comme la
 * lueur d'origine se posait sur le noir.
 */
export function keyOutBlack(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const alpha = Math.min(255, Math.max(0, (max - NOISE_FLOOR) * 1.6));
    if (alpha === 0) {
      data[i + 3] = 0;
      continue;
    }
    const gain = 255 / max;
    data[i] = data[i] * gain;
    data[i + 1] = data[i + 1] * gain;
    data[i + 2] = data[i + 2] * gain;
    data[i + 3] = alpha;
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function PulseCanvas({
  className,
  style,
  testId = 'brand-pulse',
  gapMs = REPLAY_GAP_MS,
}: {
  className?: string;
  /** Taille calculée (source OBS) : Tailwind ne sait pas faire d'arbitraire au
   *  moment du rendu, donc elle passe par le style en ligne. */
  style?: CSSProperties;
  testId?: string;
  /** Silence entre deux battements. Le motif lui-même dure 0,4 s. */
  gapMs?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;

    // Vidéo détachée du DOM : seul le canvas est affiché. `playsinline` en
    // attribut (et pas seulement en propriété) pour Safari iOS, qui sinon
    // tente le plein écran ou refuse la lecture.
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.preload = 'auto';
    const source = PULSE_SOURCES.find((s) => video.canPlayType(s.type) !== '');
    if (!source) return;
    video.src = source.src;

    let raf = 0;
    let replayTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const drawFrame = () => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw && vh) {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.drawImage(
          video,
          vw * CROP.x,
          vh * CROP.y,
          vw * CROP.w,
          vh * CROP.h,
          0,
          0,
          CANVAS_W,
          CANVAS_H
        );
        const frame = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
        keyOutBlack(frame.data);
        ctx.putImageData(frame, 0, 0);
      }
      if (!video.paused && !video.ended) raf = requestAnimationFrame(drawFrame);
    };

    const play = () => {
      if (disposed || document.visibilityState !== 'visible') return;
      video.currentTime = 0;
      // Lecture auto refusée (mode économie d'énergie iOS…) : pas de FX, et
      // c'est tout — c'est une décoration.
      video.play().catch(() => {});
    };

    const onPlaying = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(drawFrame);
    };
    const onEnded = () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      replayTimer = setTimeout(play, gapMs);
    };
    // Onglet masqué au moment du rejeu : on reprend au retour.
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && video.paused) play();
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('ended', onEnded);
    document.addEventListener('visibilitychange', onVisibility);
    play();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (replayTimer) clearTimeout(replayTimer);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('ended', onEnded);
      document.removeEventListener('visibilitychange', onVisibility);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [gapMs]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-test={testId}
      width={CANVAS_W}
      height={CANVAS_H}
      // Jamais la cible d'un clic — sur la navbar, le lien reste le logo.
      className={`pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 ${className ?? ''}`}
      style={style}
    />
  );
}
