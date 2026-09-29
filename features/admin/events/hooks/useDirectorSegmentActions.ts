// features/admin/events/hooks/useDirectorSegmentActions.ts — actions du run
// (démarrer / terminer) et des segments (démarrer, passer, terminer,
// supprimer, réordonner, ajouter, enregistrer, assigner wave/station) du
// Director.
//
// Corps DÉPLACÉS À L'IDENTIQUE depuis pages/admin/events/[runId]/director.tsx
// (lot 9C) : seuls les accès à l'état et aux outils de la page deviennent des
// paramètres. La page reste propriétaire de tous les useState et du realtime.

import { useCallback, type RefObject } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import type {
  EventBroadcastMessage,
  EventCasterChecklistItem,
  EventRun,
  EventSegment,
  EventSegmentType,
} from '@/types/events';
import type {
  AddToast,
  Confirm,
  DirectorDict,
  Mutation,
  Setter,
} from './directorHookTypes';

/** Dernier reorder optimistic local (détection de reorder concurrent). */
export type LocalReorderRecord = {
  expected: Map<string, number>;
  at: number;
  conflictShown: boolean;
};

export type DirectorSegmentActionsDeps = {
  t: DirectorDict;
  runId: string | null;
  run: EventRun | null;
  segments: EventSegment[];
  selectedId: string | null;
  selectedSegment: EventSegment | null;
  setRun: Setter<EventRun | null>;
  setSegments: Setter<EventSegment[]>;
  setSelectedId: Setter<string | null>;
  setBusy: Setter<boolean>;
  setShowAddModal: Setter<boolean>;
  mutate: Mutation['mutate'];
  mutateJson: Mutation['mutateJson'];
  regenerate: Mutation['regenerate'];
  confirm: Confirm;
  addToast: AddToast;
  fetchData: () => Promise<void>;
  lastLocalReorderRef: RefObject<LocalReorderRecord | null>;
};

export function useDirectorSegmentActions(deps: DirectorSegmentActionsDeps) {
  const {
    t,
    runId,
    run,
    segments,
    selectedId,
    selectedSegment,
    setRun,
    setSegments,
    setSelectedId,
    setBusy,
    setShowAddModal,
    mutate,
    mutateJson,
    regenerate,
    confirm,
    addToast,
    fetchData,
    lastLocalReorderRef,
  } = deps;

  /* -----------------------------------------------------------
   * Actions: run-level
   * ---------------------------------------------------------*/

  async function handleStartRun() {
    if (!runId || !run) return;
    setBusy(true);
    regenerate();
    try {
      const res = await mutate(`/api/admin/events/${runId}/start`, {
        method: 'POST',
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          payload?.error ?? format(t.startFailedStatus, { status: res.status })
        );
      }
      if (payload?.alreadyStarted) {
        addToast(t.runAlreadyLive, 'info');
      } else {
        addToast(t.runStarted, 'success');
      }
      if (payload?.run) setRun(payload.run);
    } catch (err) {
      addToast((err as Error)?.message ?? t.startFailed, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleEndRun() {
    if (!runId || !run) return;
    const ok = await confirm({
      title: t.confirmEndRunTitle,
      subtitle: t.confirmEndRunSubtitle,
      variant: 'warning',
      confirmLabel: t.confirmEndRunLabel,
    });
    if (!ok) return;
    setBusy(true);
    regenerate();
    try {
      const res = await mutate(`/api/admin/events/${runId}/end`, {
        method: 'POST',
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          payload?.error ?? format(t.endFailedStatus, { status: res.status })
        );
      }
      addToast(
        payload?.alreadyEnded ? t.runAlreadyEnded : t.runEnded,
        payload?.alreadyEnded ? 'info' : 'success'
      );
      if (payload?.run) setRun(payload.run);
      // Refresh segments aussi (l'API les a force en done).
      fetchData();
    } catch (err) {
      addToast((err as Error)?.message ?? t.endFailed, 'error');
    } finally {
      setBusy(false);
    }
  }

  /* -----------------------------------------------------------
   * Actions: segment-level
   * ---------------------------------------------------------*/

  async function handleStartSegment(segment: EventSegment) {
    if (!runId) return;
    setBusy(true);
    regenerate();
    try {
      const res = await mutate(
        `/api/admin/events/${runId}/segments/${segment.id}/start`,
        { method: 'POST' }
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          payload?.error ?? format(t.startFailedStatus, { status: res.status })
        );
      }
      addToast(
        payload?.alreadyStarted ? t.segmentAlreadyLive : t.segmentStarted,
        payload?.alreadyStarted ? 'info' : 'success'
      );
      // Realtime mettra a jour les autres segments forces en done.
      if (payload?.segment) {
        setSegments((prev) =>
          prev.map((s) => (s.id === payload.segment.id ? payload.segment : s))
        );
      }
    } catch (err) {
      addToast((err as Error)?.message ?? t.startFailed, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleSkipSegment(segment: EventSegment) {
    if (!runId) return;
    const ok = await confirm({
      title: format(t.confirmSkipTitle, { title: segment.title }),
      subtitle: t.confirmSkipSubtitle,
      variant: 'warning',
      confirmLabel: t.confirmSkipLabel,
    });
    if (!ok) return;
    setBusy(true);
    regenerate();
    try {
      const res = await mutate(
        `/api/admin/events/${runId}/segments/${segment.id}/skip`,
        { method: 'POST' }
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          payload?.error ?? format(t.skipFailedStatus, { status: res.status })
        );
      }
      addToast(t.segmentSkipped, 'success');
      if (payload?.segment) {
        setSegments((prev) =>
          prev.map((s) => (s.id === payload.segment.id ? payload.segment : s))
        );
      }
    } catch (err) {
      addToast((err as Error)?.message ?? t.skipFailed, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleEndSegment(segment: EventSegment) {
    if (!runId) return;
    setBusy(true);
    regenerate();
    try {
      const res = await mutate(
        `/api/admin/events/${runId}/segments/${segment.id}/end`,
        { method: 'POST' }
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          payload?.error ?? format(t.endFailedStatus, { status: res.status })
        );
      }
      addToast(t.segmentEnded, 'success');
      if (payload?.segment) {
        setSegments((prev) =>
          prev.map((s) => (s.id === payload.segment.id ? payload.segment : s))
        );
      }
    } catch (err) {
      addToast((err as Error)?.message ?? t.endFailed, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSegment(segment: EventSegment) {
    if (!runId) return;
    const ok = await confirm({
      title: format(t.confirmDeleteSegTitle, { title: segment.title }),
      subtitle: t.confirmDeleteSegSubtitle,
      variant: 'danger',
      confirmLabel: t.confirmDeleteLabel,
    });
    if (!ok) return;
    setBusy(true);
    regenerate();
    try {
      const res = await mutate(
        `/api/admin/events/${runId}/segments/${segment.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          payload?.error ?? format(t.deleteFailedStatus, { status: res.status })
        );
      }
      addToast(t.segmentDeleted, 'success');
      setSegments((prev) => prev.filter((s) => s.id !== segment.id));
      if (selectedId === segment.id) setSelectedId(null);
    } catch (err) {
      addToast((err as Error)?.message ?? t.deleteFailed, 'error');
    } finally {
      setBusy(false);
    }
  }

  /* -----------------------------------------------------------
   * Reorder + add
   * ---------------------------------------------------------*/

  async function handleReorder(orderedIds: string[]) {
    if (!runId) return;
    // Optimistic UI : on a deja decale localement dans TimelineBuilder. Ici on
    // committe et rollback en cas d'erreur.
    const prevOrder = segments.map((s) => s.id);
    // Memorise l'ordre attendu (id -> index) pour detecter un reorder
    // concurrent d'un autre regisseur via le realtime (cf. handleSegmentChange).
    lastLocalReorderRef.current = {
      expected: new Map(orderedIds.map((id, idx) => [id, idx])),
      at: Date.now(),
      conflictShown: false,
    };
    // Update local state to match the new order (preserve ord values).
    setSegments((prev) => {
      const byId = new Map(prev.map((s) => [s.id, s]));
      return orderedIds
        .map((id, idx) => {
          const seg = byId.get(id);
          return seg ? { ...seg, ord: idx } : null;
        })
        .filter((s): s is EventSegment => s !== null);
    });

    setBusy(true);
    regenerate();
    try {
      const json = await mutateJson<{ segments: EventSegment[] }>(
        `/api/admin/events/${runId}/segments/reorder`,
        {
          method: 'POST',
          body: JSON.stringify({ orderedIds }),
        }
      );
      // L'API renvoie l'etat canonique — on l'applique. On realigne aussi
      // l'ordre attendu sur ce canonique : les echos realtime de NOTRE reorder
      // porteront ces `ord` et ne declencheront donc pas de faux conflit.
      if (json.segments) {
        setSegments(json.segments);
        const rec = lastLocalReorderRef.current;
        if (rec) {
          rec.expected = new Map(json.segments.map((s) => [s.id, s.ord]));
          rec.at = Date.now();
        }
      }
    } catch (err) {
      addToast((err as Error)?.message ?? t.reorderFailed, 'error');
      // Rollback : remet les segments dans l'ordre precedent.
      setSegments((prev) => {
        const byId = new Map(prev.map((s) => [s.id, s]));
        return prevOrder
          .map((id) => byId.get(id))
          .filter((s): s is EventSegment => !!s);
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleAddSegment(payload: {
    type: EventSegmentType;
    title: string;
    match_id?: string | null;
    duration_min?: number | null;
  }) {
    if (!runId) throw new Error(t.errorRunNotFound);
    regenerate();
    const json = await mutateJson<EventSegment>(
      `/api/admin/events/${runId}/segments`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    setSegments((prev) => {
      // Si realtime a deja insere, on ne duplique pas.
      if (prev.some((s) => s.id === json.id)) return prev;
      const next = [...prev, json];
      next.sort((a, b) => a.ord - b.ord);
      return next;
    });
    setShowAddModal(false);
    addToast(t.segmentAdded, 'success');
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleSaveSegment = useCallback(
    async (patch: {
      title?: string;
      duration_min?: number | null;
      planned_start_at?: string | null;
      broadcast_message?: EventBroadcastMessage | null;
      caster_checklist?: EventCasterChecklistItem[];
    }) => {
      if (!runId || !selectedSegment) throw new Error(t.errorNoSegment);
      regenerate();
      const json = await mutateJson<EventSegment>(
        `/api/admin/events/${runId}/segments/${selectedSegment.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(patch),
        }
      );
      setSegments((prev) => prev.map((s) => (s.id === json.id ? json : s)));
      addToast(t.segmentSaved, 'success');
    },
    [runId, selectedSegment, regenerate, mutateJson, addToast, t]
  );

  /* -----------------------------------------------------------
   * Assignation wave/station d'un segment (PATCH immediat).
   * ---------------------------------------------------------*/

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleAssignSegment = useCallback(
    async (patch: { wave_id?: string | null; station_id?: string | null }) => {
      if (!runId || !selectedSegment) throw new Error(t.errorNoSegment);
      regenerate();
      const json = await mutateJson<EventSegment>(
        `/api/admin/events/${runId}/segments/${selectedSegment.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(patch),
        }
      );
      setSegments((prev) => prev.map((s) => (s.id === json.id ? json : s)));
      addToast(t.assignmentUpdated, 'success');
    },
    [runId, selectedSegment, regenerate, mutateJson, addToast, t]
  );

  return {
    handleStartRun,
    handleEndRun,
    handleStartSegment,
    handleSkipSegment,
    handleEndSegment,
    handleDeleteSegment,
    handleReorder,
    handleAddSegment,
    handleSaveSegment,
    handleAssignSegment,
  };
}
