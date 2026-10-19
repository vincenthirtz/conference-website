// features/player/library/hooks/useApartmentEditor.ts — le mode déco de
// « Mon appartement » (lot 4, phase B) : l'état édité (editing/editor.ts),
// appliqué TOUT DE SUITE à l'écran, et son enregistrement DIFFÉRÉ.
//
// ENREGISTRER = ENVOYER L'ÉTAT COMPLET (`PUT …/apartment/items`, version lue),
// 800 ms après le dernier geste : une série de déplacements part en une
// requête. Un geste pendant l'envoi est enregistré à la suite.
//   - 409 `room_conflict` : un autre onglet a enregistré. On relit
//     l'appartement, ses meubles REMPLACENT l'état local, et on le dit ;
//   - 400 `placement_invalid` : les meubles fautifs reprennent leur place
//     enregistrée (ou retournent à l'inventaire), on dit lesquels, et le
//     reste est renvoyé UNE fois ;
//   - autre panne : l'état local reste, un bouton relance l'envoi.
// Quitter le mode déco envoie aussitôt ce qui attend.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  editorReduce,
  ghostProblems,
  initialEditor,
  type EditorAction,
  type EditorContext,
  type EditorState,
} from '../editing/editor';
import { isDirty, toSavePayload } from '../editing/diff';
import type { EditItem, Specs } from '../editing/layout';
import { libraryErrorCode, libraryErrorField } from '../model';
import type { LibraryApartmentResponse } from '../responses';
import type { SaveApartmentItemsInput } from '../schemas';

export const SAVE_DELAY_MS = 800;

export type SaveStatus =
  | { kind: 'idle' | 'pending' | 'saving' | 'saved' | 'conflict' | 'error' }
  | { kind: 'invalid'; ids: string[] };

export function itemsOf(apartment: LibraryApartmentResponse): EditItem[] {
  return apartment.items.map((i) => ({
    inventoryId: i.inventoryId,
    key: i.key,
    gx: i.gx,
    gy: i.gy,
    rotation: i.rotation,
  }));
}

export function useApartmentEditor({
  apartment,
  specs,
  save,
  onSaved,
  onConflict,
  delayMs = SAVE_DELAY_MS,
}: {
  apartment: LibraryApartmentResponse;
  specs: Specs;
  save: (body: SaveApartmentItemsInput) => Promise<LibraryApartmentResponse>;
  onSaved: (res: LibraryApartmentResponse) => void;
  onConflict: () => void;
  delayMs?: number;
}) {
  const { width, depth } = apartment.room;
  const ctx = useMemo<EditorContext>(
    () => ({ room: { width, depth }, specs }),
    [width, depth, specs]
  );
  const [state, setState] = useState<EditorState>(() =>
    initialEditor(itemsOf(apartment))
  );
  const [editing, setEditingState] = useState(false);
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

  // Le dernier état connu, lu par les rappels du moteur et les minuteries.
  const live = useRef({ state, ctx });
  live.current = { state, ctx };
  const baseline = useRef<EditItem[]>(itemsOf(apartment));
  const version = useRef(apartment.room.version);
  const roomId = useRef(apartment.room.id);
  const saving = useRef(false);
  const resetPending = useRef(false);
  const invalidStreak = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ save, onSaved, onConflict });
  callbacks.current = { save, onSaved, onConflict };

  const dispatch = useCallback((...actions: EditorAction[]) => {
    setState((s) =>
      actions.reduce((acc, a) => editorReduce(acc, a, live.current.ctx), s)
    );
  }, []);

  // L'appartement du serveur a changé (autre salle, conflit relu, autre
  // onglet) : il remplace l'état local s'il n'y a rien en attente, ou si l'on
  // attendait justement cette relecture.
  useEffect(() => {
    const changedRoom = apartment.room.id !== roomId.current;
    const changedVersion = apartment.room.version !== version.current;
    if (!changedRoom && !changedVersion) return;
    if (saving.current) return;
    const dirty = isDirty(baseline.current, live.current.state.items);
    if (dirty && !resetPending.current && !changedRoom) return;
    resetPending.current = false;
    roomId.current = apartment.room.id;
    version.current = apartment.room.version;
    baseline.current = itemsOf(apartment);
    setState(initialEditor(baseline.current));
  }, [apartment]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (saving.current) return;
    const items = live.current.state.items;
    if (!isDirty(baseline.current, items)) {
      setStatus((s) => (s.kind === 'pending' ? { kind: 'saved' } : s));
      return;
    }
    saving.current = true;
    setStatus({ kind: 'saving' });
    try {
      const res = await callbacks.current.save(
        toSavePayload(version.current, items)
      );
      version.current = res.room.version;
      baseline.current = itemsOf(res);
      invalidStreak.current = 0;
      callbacks.current.onSaved(res);
      saving.current = false;
      if (isDirty(baseline.current, live.current.state.items)) {
        setStatus({ kind: 'pending' });
        timer.current = setTimeout(() => void flush(), delayMs);
      } else setStatus({ kind: 'saved' });
    } catch (err) {
      saving.current = false;
      const code = libraryErrorCode(err);
      if (code === 'room_conflict') {
        resetPending.current = true;
        setStatus({ kind: 'conflict' });
        callbacks.current.onConflict();
        return;
      }
      if (code === 'placement_invalid') {
        const issues = libraryErrorField(err, 'issues');
        const ids = Array.isArray(issues)
          ? [
              ...new Set(
                issues
                  .map((i) => (i as { inventoryId?: unknown }).inventoryId)
                  .filter((id): id is string => typeof id === 'string')
              ),
            ]
          : [];
        invalidStreak.current += 1;
        if (invalidStreak.current > 1 || ids.length === 0) {
          // Deuxième refus d'affilée : on revient à l'état enregistré.
          setState(initialEditor(baseline.current));
        } else {
          dispatch({ type: 'revert', ids, baseline: baseline.current });
        }
        setStatus({ kind: 'invalid', ids });
        return;
      }
      setStatus({ kind: 'error' });
    }
  }, [delayMs, dispatch]);

  // Chaque geste repousse l'envoi ; rien d'autre ne le déclenche.
  useEffect(() => {
    if (!isDirty(baseline.current, state.items)) return;
    setStatus((s) =>
      s.kind === 'invalid' || s.kind === 'conflict' ? s : { kind: 'pending' }
    );
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), delayMs);
  }, [state.items, delayMs, flush]);

  // Démonté avec des gestes en attente : on les envoie.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void flush();
      }
    },
    [flush]
  );

  const setEditing = useCallback(
    (on: boolean) => {
      setEditingState(on);
      if (!on) {
        dispatch({ type: 'cancel' }, { type: 'cancel' });
        void flush();
      }
    },
    [dispatch, flush]
  );

  const problems = ghostProblems(state, ctx);
  return {
    state,
    ctx,
    editing,
    setEditing,
    dispatch,
    status,
    retry: flush,
    ghostValid: state.ghost !== null && problems.length === 0,
    ghostProblems: problems,
    /** La salle telle qu'enregistrée a-t-elle des changements locaux ? */
    dirty: isDirty(baseline.current, state.items),
    live,
  };
}
