// features/player/library/ui/apartment/ApartmentView.tsx — l'appartement dans
// le moteur isométrique (lot 4 de docs/PLAN-womens-library.md) : la salle, ses
// meubles posés, son décor et l'avatar de la joueuse.
//
//   - en VISITE (`mode: 'walk'`), un clic fait marcher l'avatar ;
//   - en MODE DÉCO (`mode: 'edit'`), un clic ne fait jamais marcher : le
//     contrôleur signale ce qui est sous le pointeur (`onPointer`) et la vue
//     affiche ce que l'éditeur décide — meubles posés, fantôme vert ou rouge,
//     sélection, meuble caché pendant qu'on le déplace. Le cadre prend le
//     focus (Tab) et ses touches vont à l'éditeur (`onKeyDown`).
//
// Chargé par next/dynamic({ ssr: false }) : le moteur ne tourne jamais côté
// serveur et reste hors du premier chargement de la page. Le contrôleur est
// créé UNE fois par salle ; meubles, décor, avatar et mode lui sont passés
// en direct (caméra et images restent en place).

import {
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  apartmentDecor,
  apartmentRoomModel,
  apartmentStartTile,
  toRoomItems,
} from '../../apartmentModel';
import {
  type ControllerMode,
  LibraryController,
  type TilePointer,
} from '../../engine/controller';
import type { GhostItem } from '../../engine/editOverlay';
import type { EditItem } from '../../editing/layout';
import type { PlacementSpec } from '../../placement';
import type { LibraryApartmentRoom } from '../../responses';

/** Identifiant de la joueuse DANS le moteur (une seule avatar en solo). */
const PLAYER_ENTITY = 'me';

export type ApartmentViewLabels = {
  canvas: string;
  loading: string;
  resetView: string;
};

export type ApartmentViewProps = {
  room: LibraryApartmentRoom;
  items: readonly EditItem[];
  specs: ReadonlyMap<string, PlacementSpec>;
  avatarId: string;
  labels: ApartmentViewLabels;
  mode?: ControllerMode;
  ghost?: (EditItem & { valid: boolean }) | null;
  selectedId?: string | null;
  /** Le meuble qu'on déplace, caché à sa place d'origine. */
  hiddenId?: string | null;
  onPointer?: (p: TilePointer) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** Consignes clavier du mode déco (id d'un élément de la page). */
  describedBy?: string;
};

function ghostOf(g: ApartmentViewProps['ghost']): GhostItem | null {
  if (!g) return null;
  const [item] = toRoomItems([g]);
  return { ...item, valid: g.valid };
}

export default function ApartmentView({
  room,
  items,
  specs,
  avatarId,
  labels,
  mode = 'walk',
  ghost = null,
  selectedId = null,
  hiddenId = null,
  onPointer,
  onKeyDown,
  describedBy,
}: ApartmentViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctrlRef = useRef<LibraryController | null>(null);
  const [sprites, setSprites] = useState<boolean | null>(null);
  // Valeurs du moment, lues à la création du contrôleur et par ses rappels.
  const latest = useRef({ room, items, specs, avatarId, mode, onPointer });
  latest.current = { room, items, specs, avatarId, mode, onPointer };

  // UN contrôleur par salle (identité et dimensions) : le reste se met à jour.
  // Créé par salle ; le reste passe par `latest` et les effets ci-dessous.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const now = latest.current;
    const apartment = { room: now.room, items: [...now.items] };
    const ctrl = new LibraryController(canvas, wrap, {
      room: apartmentRoomModel(apartment),
      playerId: PLAYER_ENTITY,
      playerStart: apartmentStartTile(apartment, now.specs),
      playerAvatarId: now.avatarId,
      mode: now.mode,
      onManifest: setSprites,
      onTilePointer: (p) => latest.current.onPointer?.(p),
    });
    ctrlRef.current = ctrl;
    return () => {
      ctrl.dispose();
      ctrlRef.current = null;
    };
  }, [room.id, room.width, room.depth]);

  useEffect(() => {
    ctrlRef.current?.setRoomItems(toRoomItems(items));
  }, [items]);
  useEffect(() => {
    ctrlRef.current?.setDecor(apartmentDecor(room));
  }, [room]);
  useEffect(() => {
    ctrlRef.current?.setPlayerAvatar(avatarId);
  }, [avatarId]);
  useEffect(() => {
    ctrlRef.current?.setMode(mode);
  }, [mode]);
  useEffect(() => {
    ctrlRef.current?.setGhost(ghostOf(ghost));
  }, [ghost]);
  useEffect(() => {
    ctrlRef.current?.setSelection(selectedId);
  }, [selectedId]);
  useEffect(() => {
    ctrlRef.current?.setHiddenItem(hiddenId);
  }, [hiddenId]);

  const editing = mode === 'edit';
  return (
    // Le cadre du mode déco reçoit le clavier (flèches, R, Entrée, Suppr,
    // Échap) ; les consignes sont en `aria-describedby`.
    <div
      ref={wrapRef}
      tabIndex={editing ? 0 : undefined}
      onKeyDown={editing ? onKeyDown : undefined}
      aria-describedby={editing ? describedBy : undefined}
      data-testid="library-apartment-frame"
      data-mode={mode}
      className={`relative h-[min(68vh,560px)] min-h-[320px] w-full overflow-hidden rounded-[var(--r-card,14px)] bg-[#17131b] outline-none ${
        editing
          ? 'ring-2 ring-[rgba(180,103,209,.55)] focus-visible:ring-4 focus-visible:ring-[var(--or,#b467d1)]'
          : ''
      }`}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={labels.canvas}
        data-testid="library-apartment-canvas"
        data-room-version={room.version}
        className={`block h-full w-full touch-none select-none ${editing ? 'cursor-crosshair' : 'cursor-pointer'}`}
      />
      {sprites === null && (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-[#f4eee6]/80">
          {labels.loading}
        </p>
      )}
      <button
        type="button"
        onClick={() => ctrlRef.current?.resetView()}
        aria-label={labels.resetView}
        title={labels.resetView}
        className="absolute top-3 right-3 rounded-md border border-[rgba(255,255,255,0.3)] bg-[rgba(0,0,0,0.6)] px-2 py-1 text-[#f4eee6] focus-visible:outline-2 focus-visible:outline-[var(--or,#b467d1)]"
      >
        <span aria-hidden>⌖</span>
      </button>
    </div>
  );
}
