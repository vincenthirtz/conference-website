// Canvas du spike Women's Library (lots 1 et 3) : monte le contrôleur du
// moteur sur la salle demandée et affiche un HUD minimal (FPS, bascule
// « 30 bots » pour la mesure, choix de la salle).
// Chargé par next/dynamic({ ssr: false }) : rien ici ne tourne côté serveur.

import { useEffect, useRef, useState } from 'react';
import { DEMO_PLAYER_ID } from '../demoRoom';
import { LibraryController, type ControllerStats } from '../engine/controller';
import { LIBRARY_LAYOUTS, type LayoutId } from '../layouts';

const LAYOUT_IDS: LayoutId[] = ['demo', 'hall', 'reading'];

function statsLabel(s: ControllerStats | null): string {
  if (!s || s.fps === null) return `idle · ${s?.avatars ?? 1} avatars`;
  return `${Math.round(s.fps)} fps · ${s.frameMs.toFixed(2)} ms · ${s.avatars} avatars`;
}

const BUTTON =
  'rounded-md border border-[rgba(255,255,255,0.3)] bg-[rgba(0,0,0,0.6)] px-2 py-1 aria-pressed:bg-[#b14a7a]';

export default function LibrarySpikeCanvas({
  layout = 'demo',
}: {
  layout?: LayoutId;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctrlRef = useRef<LibraryController | null>(null);
  const [stats, setStats] = useState<ControllerStats | null>(null);
  const [sprites, setSprites] = useState<boolean | null>(null);
  const [bots, setBots] = useState(false);
  const botsRef = useRef(bots);
  botsRef.current = bots;
  const { room, playerStart, botCount } = LIBRARY_LAYOUTS[layout];

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctrl = new LibraryController(canvas, wrap, {
      room,
      playerId: DEMO_PLAYER_ID,
      playerStart,
      onStats: setStats,
      onManifest: setSprites,
    });
    ctrlRef.current = ctrl;
    if (botsRef.current) ctrl.setBots(botCount);
    return () => {
      ctrl.dispose();
      ctrlRef.current = null;
    };
  }, [room, playerStart, botCount]);

  useEffect(() => {
    ctrlRef.current?.setBots(bots ? botCount : 0);
  }, [bots, botCount]);

  // Page /dev/* : sans en-tête ni pied de page (appChrome « bare »), le
  // canvas prend tout l'écran.
  return (
    <div
      ref={wrapRef}
      className="relative h-[100dvh] min-h-[420px] w-full overflow-hidden bg-[#17131b]"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Library room"
        data-testid="library-canvas"
        data-room={layout}
        className="block h-full w-full cursor-pointer touch-none select-none"
      />
      <div className="pointer-events-none absolute top-3 right-3 flex flex-col items-end gap-2 font-mono text-[12px] text-[#f4eee6]">
        <output
          data-testid="library-fps"
          className="rounded-md bg-[rgba(0,0,0,0.6)] px-2 py-1"
        >
          {statsLabel(stats)}
        </output>
        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            data-testid="library-bots"
            aria-pressed={bots}
            onClick={() => setBots((b) => !b)}
            className={BUTTON}
          >
            {`${botCount + 1} bots`}
          </button>
          <button
            type="button"
            aria-label="Reset view"
            onClick={() => ctrlRef.current?.resetView()}
            className={BUTTON}
          >
            ⌖
          </button>
        </div>
        <nav aria-label="Rooms" className="pointer-events-auto flex gap-2">
          {LAYOUT_IDS.map((id) => (
            <a
              key={id}
              href={`?room=${id}`}
              data-testid={`library-room-${id}`}
              aria-current={id === layout ? 'page' : undefined}
              className={`${BUTTON} aria-[current=page]:bg-[#b14a7a]`}
            >
              {id}
            </a>
          ))}
        </nav>
        <span className="rounded-md bg-[rgba(0,0,0,0.45)] px-2 py-1 opacity-80">
          {sprites === null ? '…' : sprites ? 'sprites' : 'placeholders'}
        </span>
      </div>
    </div>
  );
}
