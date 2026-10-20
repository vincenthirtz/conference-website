// features/player/library/ui/apartment/decor/DecorPreview.tsx — l'aperçu du
// décor choisi (lot 12) : la pièce entière, vide, dessinée par le moteur avec
// les mêmes sprites et la même pose de porte et de fenêtres que la scène.
// Se redessine à chaque choix, AVANT l'enregistrement.
//
// Le moteur arrive par `import()` dans un effet (./decorPreviewScene) : hors
// du premier chargement de la page, et jamais côté serveur. Canvas sans
// contexte 2D (vieux navigateur, tests) : le cadre reste, rien n'est dessiné.

import { useEffect, useRef, useState } from 'react';
import type { LibraryDecorChoice } from '@/config/library/decor';
import type { LibraryManifest } from '../../../engine/assets';

type Scene = ReturnType<
  typeof import('./decorPreviewScene').createDecorPreview
>;

export default function DecorPreview({
  width,
  depth,
  choice,
  manifest,
  label,
}: {
  width: number;
  depth: number;
  choice: LibraryDecorChoice;
  manifest: LibraryManifest | null;
  /** Description de l'aperçu (lue par les lecteurs d'écran). */
  label: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [tick, setTick] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Le moteur, une fois.
  useEffect(() => {
    let alive = true;
    import('./decorPreviewScene')
      .then((m) => {
        if (alive) setScene(m.createDecorPreview(() => setTick((n) => n + 1)));
      })
      .catch(() => {
        // Chunk introuvable (déploiement en cours) : l'aperçu reste vide.
      });
    return () => {
      alive = false;
    };
  }, []);

  // Taille du cadre (largeur fluide, mobile compris).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () =>
      setSize({ w: wrap.clientWidth, h: wrap.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // `tick` redessine quand une image arrive.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    scene.draw(canvas, size.w, size.h, window.devicePixelRatio || 1, {
      width,
      depth,
      choice,
      manifest,
    });
  }, [scene, width, depth, choice, manifest, size, tick]);

  return (
    <div
      ref={wrapRef}
      className="relative h-[220px] w-full overflow-hidden rounded-[var(--r-card,14px)] bg-[#17131b] sm:h-[260px]"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        data-testid="library-decor-preview"
        className="block h-full w-full"
      />
    </div>
  );
}
