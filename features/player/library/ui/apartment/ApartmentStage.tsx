// features/player/library/ui/apartment/ApartmentStage.tsx — l'appartement et
// son mode déco (lot 4, phase B) : le bouton « Décorer », le moteur (chargé à
// la demande) et, en mode déco, les commandes (EditPanel). L'éditeur
// (`useApartmentEditor`) applique chaque geste tout de suite et l'enregistre
// en différé ; pointeur et clavier passent par les mêmes actions.

import dynamic from 'next/dynamic';
import { type KeyboardEvent, useCallback, useId, useMemo, useRef } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import { Button } from '@/features/ruban';
import type { TilePointer } from '../../engine/controller';
import { editorKeyAction, editorPointerActions } from '../../editing/editor';
import type { Specs } from '../../editing/layout';
import { useApartmentEditor } from '../../hooks/useApartmentEditor';
import type {
  LibraryApartmentResponse,
  LibraryInventoryItem,
} from '../../responses';
import type { SaveApartmentItemsInput } from '../../schemas';
import EditPanel from './EditPanel';

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
  inventory,
  label,
  saveItems,
  onSaved,
  onConflict,
}: {
  apartment: LibraryApartmentResponse;
  specs: Specs;
  avatarId: string;
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
      <ApartmentView
        room={apartment.room}
        items={state.items}
        specs={specs}
        avatarId={avatarId}
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
      />
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
    </div>
  );
}
