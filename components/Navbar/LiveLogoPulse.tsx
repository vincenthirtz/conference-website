// components/Navbar/LiveLogoPulse.tsx
//
// FX « pulse » de la charte autour du logo de la navbar, tant que la chaîne
// Twitch `womens_cup` est en direct. Même motif que l'annonce TCG de l'overlay
// OBS (`/overlay/tcg/pulse-horizontal.*`) : deux crochets néon qui s'allument
// puis s'éteignent en 0,4 s — rejoué toutes les quelques secondes, comme un
// battement, pour signaler le direct sans clignoter en continu.
//
// POURQUOI UN CANVAS ET PAS `mix-blend-mode: screen` COMME L'OVERLAY. Le rendu
// est un néon sur NOIR PUR. Dans l'overlay, le mode écran fait disparaître ce
// noir. Mais la navbar est `fixed` avec un `z-index` et un `backdrop-filter` :
// c'est un groupe isolé, et le mode écran n'y mélange la vidéo qu'avec le fond
// de la navbar — TRANSPARENT tant qu'on n'a pas défilé. Résultat vérifié au
// rendu : un rectangle noir opaque autour du logo. On détoure donc le noir
// nous-mêmes (luminance → alpha, `keyOutBlack`), image par image, ce qui ne
// dépend d'aucun mode de fusion ni du support d'un filtre SVG sur une vidéo.
//
// Coût : ~0,4 s de décodage toutes les ~4 s, sur 288×198 px. Rien quand la
// chaîne est hors ligne (le composant ne monte même pas de vidéo), rien quand
// l'onglet est masqué, rien avec `prefers-reduced-motion`.

import { useEffect, useRef, useState } from 'react';
import { useTwitchLive } from '@/components/Home/useTwitchLive';

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

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function PulseCanvas() {
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
      replayTimer = setTimeout(play, REPLAY_GAP_MS);
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
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-test="nav-logo-live-pulse"
      width={CANVAS_W}
      height={CANVAS_H}
      // Centré sur le logo (64 px) : les crochets l'encadrent à ~45 px de part
      // et d'autre du centre — assez près pour que le crochet gauche reste à
      // l'écran quand le logo colle au bord (gouttière de 16 px, ≤ 1280 px).
      // Jamais la cible d'un clic — le lien reste le logo.
      className="pointer-events-none absolute left-1/2 top-1/2 h-[88px] w-[128px] max-w-none -translate-x-1/2 -translate-y-1/2"
    />
  );
}

/**
 * À poser dans un conteneur `relative` qui contient le logo. Ne rend rien tant
 * que la chaîne n'est pas en direct, ni si l'utilisateur limite les animations.
 */
export default function LiveLogoPulse() {
  const { live } = useTwitchLive();
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(prefersReducedMotion());
  }, []);

  if (!live || reducedMotion) return null;
  return <PulseCanvas />;
}
