// features/player/library/ui/apartment/ApartmentStage.tsx — l'appartement et
// son mode déco (lot 4, phase B) : le bouton « Décorer », le moteur (chargé à
// la demande) et, en mode déco, les commandes (EditPanel). L'éditeur
// (`useApartmentEditor`) applique chaque geste tout de suite et l'enregistre
// en différé ; pointeur et clavier passent par les mêmes actions.
//
// VISITEUSES (lot 5 phase B) : ouvert à toutes, l'appartement est aussi une
// salle. Sa propriétaire rejoint son canal et y voit qui entre — avatars dans
// la vue, « Présentes dans la salle », signes, menu (bloquer, signaler,
// expulser). Privé, aucune connexion. Une entrée refusée (Library
// indisponible, 503…) : l'appartement reste solo, comme avant, sans message.

import dynamic from 'next/dynamic';
import { type KeyboardEvent, useCallback, useId, useMemo, useRef } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import { Button } from '@/features/ruban';
import type { TilePointer } from '../../engine/controller';
import { editorKeyAction, editorPointerActions } from '../../editing/editor';
import type { Specs } from '../../editing/layout';
import { useApartmentEditor } from '../../hooks/useApartmentEditor';
import type { LibraryPosition } from '../../realtime/connection';
import { LIBRARY_BUBBLE_MS } from '../../realtime/social';
import { useLibraryRoomChannel } from '../../realtime/useLibraryRoomChannel';
import type {
  LibraryApartmentResponse,
  LibraryInventoryItem,
} from '../../responses';
import { roomStartPosition } from '../../roomStageModel';
import type { SaveApartmentItemsInput } from '../../schemas';
import { useLibrarySocialDeps } from '../../socialContext';
import { socialNoticeOf } from '../../socialModel';
import LibraryChat from '../chat/LibraryChat';
import { useChatBubbles } from '../chat/useChatBubbles';
import RoomOverlays from '../room/RoomOverlays';
import RoomSocialPanel from '../room/RoomSocialPanel';
import { useRoomSocial } from '../room/useRoomSocial';
import SocialNotice from '../social/SocialNotice';
import EditPanel from './EditPanel';
import type { RoomEngineHandle } from './ApartmentView';

const ApartmentView = dynamic(() => import('./ApartmentView'), {
  ssr: false,
  loading: () => (
    <div className="h-[min(68vh,560px)] min-h-[320px] w-full animate-pulse rounded-[var(--r-card,14px)] bg-[#17131b]" />
  ),
});

export default function ApartmentStage({
  apartment,
  specs,
  avatarId,
  look = null,
  inventory,
  label,
  saveItems,
  onSaved,
  onConflict,
}: {
  apartment: LibraryApartmentResponse;
  specs: Specs;
  avatarId: string;
  /** Mon look composé (lot 13, forme compacte) : la vue et ma présence. */
  look?: string | null;
  inventory: readonly LibraryInventoryItem[];
  label: string;
  saveItems: (
    body: SaveApartmentItemsInput
  ) => Promise<LibraryApartmentResponse>;
  onSaved: (res: LibraryApartmentResponse) => void;
  onConflict: () => void;
}) {
  const t = useT(nsPlayerLibrary);
  const hintId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const editor = useApartmentEditor({
    apartment,
    specs,
    save: saveItems,
    onSaved,
    onConflict,
  });
  const { state, editing, dispatch, live } = editor;

  // Les visiteuses : le canal de MA salle, seulement si elle est ouverte.
  const deps = useLibrarySocialDeps();
  const posRef = useRef<LibraryPosition | null>(null);
  const startRef = useRef({ apartment, specs });
  startRef.current = { apartment, specs };
  const room = useLibraryRoomChannel(
    apartment.room.access === 'open' ? apartment.room.id : null,
    {
      position: () =>
        posRef.current ??
        roomStartPosition(startRef.current.apartment, startRef.current.specs),
      realtime: deps.realtime,
      social: deps.enter,
      look,
    }
  );
  const frameRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RoomEngineHandle | null>(null);
  const social = useRoomSocial({
    room,
    actionsClient: deps.actions,
    frameRef,
    engineRef,
  });
  // Lot 6 — le chat de MON appartement ouvert : ses messages en bulles.
  const bubbles = useChatBubbles({
    roomId: room.enter?.room.id ?? null,
    remote: social.remote,
    playerBubble: social.playerBubble,
  });
  const connected = room.phase === 'connected' && room.enter !== null;
  const notice = room.phase === 'evicted' ? socialNoticeOf(room) : null;

  const onPointer = useCallback(
    (p: TilePointer) => {
      const actions = editorPointerActions(
        p,
        live.current.state,
        live.current.ctx
      );
      if (actions.length) dispatch(...actions);
    },
    [dispatch, live]
  );
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const action = editorKeyAction(e.key, live.current.state);
      if (!action) return;
      e.preventDefault();
      dispatch(action);
    },
    [dispatch, live]
  );
  const focusFrame = useCallback(() => {
    stageRef.current
      ?.querySelector<HTMLElement>('[data-testid="library-apartment-frame"]')
      ?.focus();
  }, []);

  const ghost = useMemo(
    () =>
      editing && state.ghost
        ? { ...state.ghost, valid: editor.ghostValid }
        : null,
    [editing, state.ghost, editor.ghostValid]
  );

  return (
    <div ref={stageRef} className="flex flex-col gap-3">
      {notice && <SocialNotice notice={notice} autoFocus={false} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant={editing ? 'primary' : 'secondary'}
          size="sm"
          aria-pressed={editing}
          data-testid="library-decorate"
          onClick={() => {
            editor.setEditing(!editing);
            if (!editing) requestAnimationFrame(focusFrame);
          }}
        >
          {editing ? t.edit.done : t.edit.toggle}
        </Button>
      </div>
      <div ref={frameRef} tabIndex={-1} className="relative outline-none">
        <ApartmentView
          room={apartment.room}
          items={state.items}
          specs={specs}
          avatarId={avatarId}
          look={look}
          mode={editing ? 'edit' : 'walk'}
          ghost={ghost}
          selectedId={editing ? state.selectedId : null}
          hiddenId={
            editing && state.ghost?.source === 'move'
              ? state.ghost.inventoryId
              : null
          }
          onPointer={onPointer}
          onKeyDown={onKeyDown}
          describedBy={hintId}
          labels={{
            canvas: editing ? t.edit.canvasLabel : label,
            loading: t.apartmentLoading,
            resetView: t.apartmentResetView,
          }}
          remote={connected ? bubbles.remote : undefined}
          playerBubble={bubbles.playerBubble}
          bubbleMs={LIBRARY_BUBBLE_MS}
          onAvatarTap={connected ? social.onAvatarTap : undefined}
          onPlayerWalk={(goal) => room.sendMove(goal.i, goal.j)}
          onPlayerArrive={(tile, dir) => {
            posRef.current = { gx: tile.i, gy: tile.j, dir };
            room.updatePosition(posRef.current);
          }}
          engineRef={engineRef}
        />
        {room.enter && <RoomOverlays social={social} room={room.enter.room} />}
      </div>
      {editing && (
        <EditPanel
          state={state}
          dispatch={dispatch}
          status={editor.status}
          ghostValid={editor.ghostValid}
          ghostProblems={editor.ghostProblems}
          inventory={inventory}
          onRetry={() => void editor.retry()}
          hintId={hintId}
          focusFrame={focusFrame}
        />
      )}
      {connected && !editing && room.enter && (
        <RoomSocialPanel
          room={room}
          social={social}
          kind={room.enter.room.kind}
        />
      )}
      {connected && !editing && room.enter && (
        <LibraryChat roomId={room.enter.room.id} kind={room.enter.room.kind} />
      )}
    </div>
  );
}
