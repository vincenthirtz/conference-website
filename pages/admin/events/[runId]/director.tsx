// pages/admin/events/[runId]/director.tsx
//
// Feature: Run-of-show — Lot 3 (admin UI).
// Page "Director" : pilotage live d'un event_run.
//
// Layout (desktop) : 3 colonnes — gauche 60% (timeline) / droite 40% repartie
// entre SegmentEditor (haut) et CasterStatusPanel (bas). Sur mobile, tout est
// empile.
//
// Realtime : segments + run abonnes via useEventRunRealtime, fallback refetch
// au focus / interval pour resilience (si le canal saute).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Breadcrumb from '@/components/admin/Breadcrumb';
import AlertBanner from '@/components/admin/AlertBanner';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import RunStatusHeader from '@/components/admin/director/RunStatusHeader';
import TimelineBuilder from '@/components/admin/director/TimelineBuilder';
import SegmentEditor from '@/components/admin/director/SegmentEditor';
import CasterStatusPanel from '@/components/admin/director/CasterStatusPanel';
import AddSegmentModal from '@/components/admin/director/AddSegmentModal';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useEventRunRealtime } from '@/hooks/useEventRunRealtime';
import { useToast } from '@/components/Toast';
import { withStaffPage } from '@/utils/staff';
import type { StaffProps } from '@/types/admin';
import type {
  EventBroadcastMessage,
  EventCasterChecklistItem,
  EventRun,
  EventRunWithSegments,
  EventSegment,
  EventSegmentType,
} from '@/types/events';

export const getServerSideProps = withStaffPage('manager');

const POLL_INTERVAL_MS = 30_000;

function DirectorPage(_props: StaffProps) {
  const router = useRouter();
  const runId =
    typeof router.query.runId === 'string' ? router.query.runId : null;

  const { adminFetchJson } = useAdminFetch();
  // Pour les mutations frequentes (start/skip/end/save), on n'autorise pas le
  // replay automatique sur la meme cle — chaque clic est une intention
  // distincte, on regenere apres chaque succes.
  const { mutate, mutateJson, regenerate } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [run, setRun] = useState<EventRun | null>(null);
  const [segments, setSegments] = useState<EventSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (!runId) return;
    try {
      const json = await adminFetchJson<EventRunWithSegments>(
        `/api/admin/events/${runId}`
      );
      setRun(json.run);
      setSegments(json.segments ?? []);
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg((err as Error)?.message ?? 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, runId]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Polling de secours : si realtime decroche, on rafraichit toutes les 30s
  // quand l'onglet est visible. Le realtime reste la source principale.
  useEffect(() => {
    function tick() {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      )
        return;
      fetchData();
    }
    pollRef.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchData]);

  // Realtime : merge des changements dans l'etat local.
  useEventRunRealtime({
    enabled: !!runId,
    runId,
    onSegmentChange: (eventType, partial) => {
      if (eventType === 'DELETE') {
        setSegments((prev) => prev.filter((s) => s.id !== partial.id));
        setSelectedId((prev) => (prev === partial.id ? null : prev));
        return;
      }
      // Pour INSERT/UPDATE, on remplace ou ajoute la row. On ne refetch pas
      // tout : on garde la stabilite UI.
      setSegments((prev) => {
        const existing = prev.findIndex((s) => s.id === partial.id);
        if (existing === -1) {
          // INSERT : ajout, on trie par ord apres.
          const next = [...prev, partial as EventSegment];
          next.sort((a, b) => a.ord - b.ord);
          return next;
        }
        const merged = { ...prev[existing], ...partial } as EventSegment;
        const next = [...prev];
        next[existing] = merged;
        next.sort((a, b) => a.ord - b.ord);
        return next;
      });
    },
    onRunChange: (partial) => {
      setRun((prev) =>
        prev ? ({ ...prev, ...partial } as EventRun) : (partial as EventRun)
      );
    },
  });

  const selectedSegment = useMemo(
    () => segments.find((s) => s.id === selectedId) ?? null,
    [segments, selectedId]
  );

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
        throw new Error(payload?.error ?? `Demarrage echoue (${res.status}).`);
      }
      if (payload?.alreadyStarted) {
        addToast('Le run etait deja en direct.', 'info');
      } else {
        addToast('Run demarre.', 'success');
      }
      if (payload?.run) setRun(payload.run);
    } catch (err) {
      addToast((err as Error)?.message ?? 'Demarrage echoue.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleEndRun() {
    if (!runId || !run) return;
    const ok = await confirm({
      title: 'Terminer ce run ?',
      subtitle:
        'Tous les segments non termines passeront en "done". Cette action est irreversible.',
      variant: 'warning',
      confirmLabel: 'Terminer',
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
        throw new Error(payload?.error ?? `Fin echouee (${res.status}).`);
      }
      addToast(
        payload?.alreadyEnded ? 'Le run etait deja termine.' : 'Run termine.',
        payload?.alreadyEnded ? 'info' : 'success'
      );
      if (payload?.run) setRun(payload.run);
      // Refresh segments aussi (l'API les a force en done).
      fetchData();
    } catch (err) {
      addToast((err as Error)?.message ?? 'Fin echouee.', 'error');
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
        throw new Error(payload?.error ?? `Demarrage echoue (${res.status}).`);
      }
      addToast(
        payload?.alreadyStarted ? 'Deja en direct.' : 'Segment demarre.',
        payload?.alreadyStarted ? 'info' : 'success'
      );
      // Realtime mettra a jour les autres segments forces en done.
      if (payload?.segment) {
        setSegments((prev) =>
          prev.map((s) => (s.id === payload.segment.id ? payload.segment : s))
        );
      }
    } catch (err) {
      addToast((err as Error)?.message ?? 'Demarrage echoue.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleSkipSegment(segment: EventSegment) {
    if (!runId) return;
    const ok = await confirm({
      title: `Passer "${segment.title}" ?`,
      subtitle:
        'Le segment sera marque "passe" et ne sera pas joue. Action irreversible.',
      variant: 'warning',
      confirmLabel: 'Passer',
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
        throw new Error(payload?.error ?? `Skip echoue (${res.status}).`);
      }
      addToast('Segment passe.', 'success');
      if (payload?.segment) {
        setSegments((prev) =>
          prev.map((s) => (s.id === payload.segment.id ? payload.segment : s))
        );
      }
    } catch (err) {
      addToast((err as Error)?.message ?? 'Skip echoue.', 'error');
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
        throw new Error(payload?.error ?? `Fin echouee (${res.status}).`);
      }
      addToast('Segment termine.', 'success');
      if (payload?.segment) {
        setSegments((prev) =>
          prev.map((s) => (s.id === payload.segment.id ? payload.segment : s))
        );
      }
    } catch (err) {
      addToast((err as Error)?.message ?? 'Fin echouee.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSegment(segment: EventSegment) {
    if (!runId) return;
    const ok = await confirm({
      title: `Supprimer "${segment.title}" ?`,
      subtitle: 'Le segment sera definitivement supprime.',
      variant: 'danger',
      confirmLabel: 'Supprimer',
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
          payload?.error ?? `Suppression echouee (${res.status}).`
        );
      }
      addToast('Segment supprime.', 'success');
      setSegments((prev) => prev.filter((s) => s.id !== segment.id));
      if (selectedId === segment.id) setSelectedId(null);
    } catch (err) {
      addToast((err as Error)?.message ?? 'Suppression echouee.', 'error');
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
      // L'API renvoie l'etat canonique — on l'applique.
      if (json.segments) setSegments(json.segments);
    } catch (err) {
      addToast(
        (err as Error)?.message ?? 'Reorder echoue, restauration.',
        'error'
      );
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
    if (!runId) throw new Error('Run introuvable.');
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
    addToast('Segment ajoute.', 'success');
  }

  async function handleSaveSegment(patch: {
    title?: string;
    duration_min?: number | null;
    broadcast_message?: EventBroadcastMessage | null;
    caster_checklist?: EventCasterChecklistItem[];
  }) {
    if (!runId || !selectedSegment)
      throw new Error('Aucun segment selectionne.');
    regenerate();
    const json = await mutateJson<EventSegment>(
      `/api/admin/events/${runId}/segments/${selectedSegment.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    );
    setSegments((prev) => prev.map((s) => (s.id === json.id ? json : s)));
    addToast('Segment sauvegarde.', 'success');
  }

  /* -----------------------------------------------------------
   * Render
   * ---------------------------------------------------------*/

  return (
    <>
      <Head>
        <title>Director – {run?.name ? `${run.name} · ` : ''}Run of show</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12 max-w-[1600px] mx-auto">
          <Breadcrumb
            items={[
              { label: 'Admin', href: '/admin' },
              { label: 'Run of show', href: '/admin/events' },
              { label: run?.name ?? 'Director' },
            ]}
          />

          {loading ? (
            <div className="py-24">
              <LoadingSpinner label="Chargement…" />
            </div>
          ) : !run ? (
            <AlertBanner
              message={errorMsg ?? 'Event introuvable.'}
              variant="error"
            />
          ) : (
            <div className="space-y-6">
              <RunStatusHeader
                run={run}
                segments={segments}
                onStartRun={handleStartRun}
                onEndRun={handleEndRun}
                busy={busy}
              />

              {errorMsg && (
                <AlertBanner
                  message={errorMsg}
                  variant="error"
                  onDismiss={() => setErrorMsg(null)}
                />
              )}

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Gauche : Timeline (60%) */}
                <div className="lg:col-span-3">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide">
                      Timeline
                    </h2>
                    <span className="text-xs text-neutral-500">
                      Glisse pour reordonner
                    </span>
                  </div>
                  <TimelineBuilder
                    segments={segments}
                    selectedId={selectedId}
                    busy={busy}
                    onSelect={(id) => setSelectedId(id)}
                    onReorder={handleReorder}
                    onStart={handleStartSegment}
                    onSkip={handleSkipSegment}
                    onEnd={handleEndSegment}
                    onDelete={handleDeleteSegment}
                    onAddClick={() => setShowAddModal(true)}
                  />
                </div>

                {/* Droite : Editor + Casters (40%) */}
                <div className="lg:col-span-2 space-y-6">
                  <div>
                    <h2 className="mb-3 text-sm font-semibold text-neutral-300 uppercase tracking-wide">
                      Edition
                    </h2>
                    <SegmentEditor
                      segment={selectedSegment}
                      busy={busy}
                      onSave={handleSaveSegment}
                    />
                  </div>
                  <div>
                    <h2 className="mb-3 text-sm font-semibold text-neutral-300 uppercase tracking-wide">
                      Casters
                    </h2>
                    <CasterStatusPanel segments={segments} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddSegmentModal
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddSegment}
        />
      )}

      {dialog}
    </>
  );
}

export default DirectorPage;
