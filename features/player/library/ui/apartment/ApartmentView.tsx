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
//
// MULTIJOUEUR (lot 5 phase B), facultatif : la même vue sert la visite d'une
// salle (`ui/room/RoomStage`) et l'appartement de sa propriétaire quand des
// visiteuses y entrent. Les autres joueuses (`remote`), ma bulle, mon repère
// « discrète » et les rappels (`onAvatarTap`, `onPlayerWalk`,
// `onPlayerArrive`) vont au contrôleur sans le remonter.
//
// SALLES COMMUNES (lot 7), facultatif : `fixed` remplace le décor
// d'appartement par celui du décor fixe (`roomStageModel.sceneOf`), avec sa
// hauteur de murs et l'arrivée ; `hotspots` / `onHotspotTap` sont les zones
// interactives (engine/hotspots.ts).
//
// MEUBLES (lot 15), facultatif : avec `furniture` (le réseau de la salle, ma
// dernière position, l'éditeur de look s'il y en a un), la vue propose les
// actions (s'asseoir, s'allonger, lire…), envoie la case visée et ma
// présence avec ma posture (`../room/usePlayerPosture`), et montre sous la
// scène ce que je fais et « Se lever » (`../room/PostureBar`). Tout cela vit
// dans ce chunk chargé à la demande, pas dans la page.

import {
  type KeyboardEvent,
  type MutableRefObject,
  useCallback,
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
  type AvatarTap,
  type ControllerMode,
  LibraryController,
  type TilePointer,
} from '../../engine/controller';
import type { GhostItem } from '../../engine/editOverlay';
import type { HotspotTap, LibraryHotspot } from '../../engine/hotspots';
import type { Direction } from '../../engine/motion';
import type { AvatarIntent, PlayerPosture } from '../../engine/postures';
import type { ScreenPoint, Tile } from '../../engine/projection';
import type { BubbleContent, RemoteAvatarInput } from '../../engine/remotes';
import type { EditItem } from '../../editing/layout';
import type { PlacementSpec } from '../../placement';
import type { LibraryApartmentRoom } from '../../responses';
import type { LibraryPosition } from '../../realtime/connection';
import type { LibraryRoomChannel } from '../../realtime/useLibraryRoomChannel';
import type { FixedScene } from '../../roomStageModel';
import PostureBar from '../room/PostureBar';
import { usePlayerPosture } from '../room/usePlayerPosture';

/** Sans salle (solo) : rien ne part. */
const NO_NETWORK: Pick<LibraryRoomChannel, 'sendMove' | 'updatePosition'> = {
  sendMove: () => 'refused',
  updatePosition: () => undefined,
};

/** Identifiant de la joueuse DANS le moteur (jamais un `userId` : ceux-là sont des UUID). */
const PLAYER_ENTITY = 'me';

export type ApartmentViewLabels = {
  canvas: string;
  loading: string;
  resetView: string;
};

/** Ce que l'écran peut demander au moteur monté. */
export type RoomEngineHandle = {
  /** Au-dessus de la tête d'une joueuse (px CSS du cadre) ; null si elle n'y est pas. */
  avatarAnchor: (userId: string) => ScreenPoint | null;
  /** Lot 15 : se relever (ou cesser de se servir d'un meuble). */
  standUp: () => void;
};

export type ApartmentViewProps = {
  /** L'appartement, ou la salle où l'on entre (même forme). */
  room: Pick<
    LibraryApartmentRoom,
    'id' | 'width' | 'depth' | 'decor' | 'version'
  >;
  items: readonly EditItem[];
  specs: ReadonlyMap<string, PlacementSpec>;
  avatarId: string;
  /** Mon look composé (lot 13, forme compacte) ; null : la feuille `avatarId`. */
  look?: string | null;
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
  /** Les autres joueuses de la salle (textes déjà traduits). */
  remote?: readonly RemoteAvatarInput[];
  /** Ma bulle (un signe parti) : une nouvelle valeur la montre. */
  playerBubble?: BubbleContent | null;
  /** Mon repère (« discrète ») ; null : aucun. */
  playerMarker?: string | null;
  /** Durée d'une bulle (ms). */
  bubbleMs?: number;
  onAvatarTap?: (tap: AvatarTap) => void;
  /** Je pars vers `goal` ; `intent` : ce que j'y ferai (lot 15). */
  onPlayerWalk?: (goal: Tile, intent?: AvatarIntent) => void;
  /** Je suis arrivée, ou ma posture a changé sur place (lot 15). */
  onPlayerArrive?: (
    tile: Tile,
    dir: Direction,
    posture?: PlayerPosture
  ) => void;
  /**
   * Lot 15 : les meubles. `room` : la case visée et ma présence (avec ma
   * posture) ; `posRef` : ma dernière position, reprise à la reconnexion ;
   * `onDress` : l'armoire ouvre l'éditeur de look (absent : pas proposée).
   */
  furniture?: {
    room: Pick<LibraryRoomChannel, 'sendMove' | 'updatePosition'>;
    posRef: MutableRefObject<LibraryPosition | null>;
    onDress?: () => void;
  } | null;
  /** Reçoit l'accès au moteur monté (null au démontage). */
  engineRef?: MutableRefObject<RoomEngineHandle | null>;
  /** Salle commune : décor fixe, hauteur des murs, arrivée (lot 7). */
  fixed?: FixedScene | null;
  /** Zones interactives (textes déjà traduits) et leur appui (lot 7). */
  hotspots?: readonly LibraryHotspot[];
  onHotspotTap?: (tap: HotspotTap) => void;
};

const NO_REMOTE: readonly RemoteAvatarInput[] = [];
const NO_HOTSPOTS: readonly LibraryHotspot[] = [];

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
  look = null,
  labels,
  mode = 'walk',
  ghost = null,
  selectedId = null,
  hiddenId = null,
  onPointer,
  onKeyDown,
  describedBy,
  remote = NO_REMOTE,
  playerBubble = null,
  playerMarker = null,
  bubbleMs,
  onAvatarTap,
  onPlayerWalk,
  onPlayerArrive,
  furniture = null,
  engineRef,
  fixed = null,
  hotspots = NO_HOTSPOTS,
  onHotspotTap,
}: ApartmentViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctrlRef = useRef<LibraryController | null>(null);
  const [sprites, setSprites] = useState<boolean | null>(null);
  // Lot 15 — les meubles : réseau, actions proposées, ma posture.
  const soloPos = useRef<LibraryPosition | null>(null);
  const standUp = useCallback(() => ctrlRef.current?.standUp(), []);
  const seat = usePlayerPosture({
    room: furniture?.room ?? NO_NETWORK,
    posRef: furniture?.posRef ?? soloPos,
    standUp,
    onDress: furniture?.onDress,
  });
  const interactions = furniture ? seat.interactions : null;
  // Valeurs du moment, lues à la création du contrôleur et par ses rappels.
  const now = {
    room,
    items,
    specs,
    avatarId,
    look,
    mode,
    onPointer,
    remote,
    playerMarker,
    bubbleMs,
    onAvatarTap,
    onPlayerWalk,
    onPlayerArrive,
    interactions,
    seat,
    engineRef,
    fixed,
    hotspots,
    onHotspotTap,
  };
  const latest = useRef(now);
  latest.current = now;

  // UN contrôleur par salle (identité et dimensions) : le reste se met à jour.
  // Créé par salle ; le reste passe par `latest` et les effets ci-dessous.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const cur = latest.current;
    const apartment = { room: cur.room, items: [...cur.items] };
    const model = apartmentRoomModel(apartment);
    const { fixed: scene } = cur;
    const ctrl = new LibraryController(canvas, wrap, {
      room: scene
        ? { ...model, wallHeight: scene.wallHeight, decor: scene.decor }
        : model,
      playerId: PLAYER_ENTITY,
      playerStart: scene?.start ?? apartmentStartTile(apartment, cur.specs),
      hotspots: cur.hotspots,
      onHotspotTap: (tap) => latest.current.onHotspotTap?.(tap),
      playerAvatarId: cur.avatarId,
      mode: cur.mode,
      bubbleMs: cur.bubbleMs,
      onManifest: setSprites,
      onTilePointer: (p) => latest.current.onPointer?.(p),
      // Sans rappel (solo), un appui sur une autre joueuse fait marcher.
      onAvatarTap: (tap) => {
        const handler = latest.current.onAvatarTap;
        if (!handler) return false;
        handler(tap);
        return true;
      },
      onPlayerWalk: (goal, intent) => {
        const l = latest.current;
        l.seat.onPlayerWalk(goal, intent);
        if (intent) l.onPlayerWalk?.(goal, intent);
        else l.onPlayerWalk?.(goal);
      },
      onPlayerArrive: (tile, dir, posture) => {
        const l = latest.current;
        l.seat.onPlayerArrive(tile, dir, posture);
        if (posture) l.onPlayerArrive?.(tile, dir, posture);
        else l.onPlayerArrive?.(tile, dir);
      },
      // Lot 15 : les meubles.
      interactions: cur.interactions ?? undefined,
      onPlayerPosture: (p) => latest.current.seat.onPlayerPosture(p),
      onFurnitureUse: (use) => latest.current.seat.onFurnitureUse(use),
    });
    ctrlRef.current = ctrl;
    // Un contrôleur neuf (autre salle) reprend l'état du moment.
    ctrl.syncRemoteAvatars(cur.remote);
    ctrl.setPlayerMarker(cur.playerMarker);
    ctrl.world.setLook(PLAYER_ENTITY, cur.look);
    const handle = cur.engineRef;
    if (handle)
      handle.current = {
        avatarAnchor: (id) => ctrl.avatarAnchor(id),
        standUp: () => ctrl.standUp(),
      };
    return () => {
      ctrl.dispose();
      ctrlRef.current = null;
      if (handle) handle.current = null;
    };
  }, [room.id, room.width, room.depth]);

  useEffect(() => {
    ctrlRef.current?.setRoomItems(toRoomItems(items));
  }, [items]);
  useEffect(() => {
    ctrlRef.current?.setDecor(fixed?.decor ?? apartmentDecor(room));
  }, [room, fixed]);
  useEffect(() => {
    ctrlRef.current?.hotspots.set(hotspots);
  }, [hotspots]);
  useEffect(() => {
    ctrlRef.current?.setInteractions(interactions);
  }, [interactions]);
  useEffect(() => {
    ctrlRef.current?.setPlayerAvatar(avatarId);
  }, [avatarId]);
  useEffect(() => {
    // Lot 13 : mon look enregistré, posé sur mon avatar sans remonter le moteur.
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    ctrl.world.setLook(PLAYER_ENTITY, look);
    ctrl.redraw();
  }, [look]);
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
  useEffect(() => {
    ctrlRef.current?.syncRemoteAvatars(remote);
  }, [remote]);
  useEffect(() => {
    if (playerBubble) ctrlRef.current?.showPlayerBubble(playerBubble);
  }, [playerBubble]);
  useEffect(() => {
    ctrlRef.current?.setPlayerMarker(playerMarker);
  }, [playerMarker]);

  const editing = mode === 'edit';
  return (
    <>
      {/* Le cadre du mode déco reçoit le clavier (flèches, R, Entrée, Suppr,
        Échap) ; les consignes sont en `aria-describedby`. */}
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
      {furniture && !editing && (
        <PostureBar posture={seat.posture} onStandUp={seat.standUp} />
      )}
    </>
  );
}
