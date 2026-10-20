// features/player/library/ui/avatar/LookPreview.tsx — l'aperçu ANIMÉ d'un
// avatar composé (lot 13) : il tourne sur lui-même, marche sur place, ou se
// tient face à la caméra. Chargé à la demande (`next/dynamic`, `ssr: false`) :
// il tire le compositeur du moteur (engine/lookCompositor.ts), avec son
// propre cache d'images — mêmes URL que le moteur, donc déjà en cache HTTP.
//
// Mouvement réduit (`prefers-reduced-motion`) : rien ne bouge tout seul ; le
// parent fait tourner l'avatar pas à pas (`dir`). Le canvas est une image
// décrite (`label`) : les choix, eux, sont des champs du formulaire.

import { useEffect, useRef, useState } from 'react';
import { ImageCache } from '../../engine/assets';
import { LookCompositor } from '../../engine/lookCompositor';
import type { Direction } from '../../engine/motion';

export type LookPreviewMode = 'turn' | 'walk' | 'still';

/** Px CSS par px d'image (à l'échelle de l'index) : un avatar de ~165 px tient dans `height`. */
const AVATAR_CSS_HEIGHT = 175;
/** Une direction de plus toutes les … ms quand l'avatar tourne. */
const TURN_MS = 700;
const FPS = 10;

export default function LookPreview({
  code,
  mode,
  dir,
  label,
  loadingLabel,
  unavailableLabel,
  height = 220,
}: {
  /** Look compact (config/library/avatarLook.ts). */
  code: string;
  mode: LookPreviewMode;
  /** Direction de départ (0 = haut de l'écran, sens horaire, 4 = face). */
  dir: Direction;
  label: string;
  loadingLabel: string;
  unavailableLabel: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setTick] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const width = Math.round(height * 0.62);
  const engine = useRef<{ images: ImageCache; looks: LookCompositor } | null>(
    null
  );
  if (!engine.current) {
    const images = new ImageCache(() => setTick((n) => n + 1));
    engine.current = { images, looks: new LookCompositor(images) };
  }

  useEffect(() => {
    const looks = engine.current?.looks;
    return () => looks?.dispose();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const looks = engine.current?.looks;
    if (!canvas || !looks) return undefined;
    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const started = performance.now();

    const draw = () => {
      const elapsed = reduced ? 0 : performance.now() - started;
      const turning = mode === 'turn';
      const pose = mode === 'walk' && !reduced ? 'walk' : 'idle';
      const d = (
        turning ? (dir + Math.floor(elapsed / TURN_MS)) % 8 : dir
      ) as Direction;
      const strip = looks.strip(code, pose, d);
      if (looks.status === 'failed') setState('failed');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!strip) return;
      setState('ready');
      const frame =
        pose === 'walk' ? Math.floor((elapsed / 1000) * FPS) % 8 : 0;
      const cell = strip.cells[pose === 'walk' ? frame : d];
      if (!cell) return;
      const scale =
        (dpr * height) / (AVATAR_CSS_HEIGHT * looks.pixelRatio * 1.15);
      const footX = canvas.width / 2;
      const footY = canvas.height - 10 * dpr;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // Ombre au sol, comme dans le moteur.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(footX, footY, 26 * dpr, 9 * dpr, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(
        strip.canvas as CanvasImageSource,
        cell.x,
        cell.y,
        cell.w,
        cell.h,
        footX - cell.ax * scale,
        footY - cell.ay * scale,
        cell.w * scale,
        cell.h * scale
      );
    };

    draw();
    const id = setInterval(draw, 1000 / FPS);
    return () => clearInterval(id);
  }, [code, mode, dir, width, height]);

  return (
    <div
      className="relative flex items-end justify-center rounded-[var(--r-card,14px)] bg-[#17131b]"
      style={{ width, height }}
      data-testid="library-look-preview"
      data-state={state}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        style={{ width, height }}
        className="block"
      />
      {state !== 'ready' && (
        <p className="pointer-events-none absolute inset-x-2 bottom-3 text-center text-xs text-[#f4eee6]/80">
          {state === 'failed' ? unavailableLabel : loadingLabel}
        </p>
      )}
    </div>
  );
}
