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

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Breadcrumb from '@/components/admin/Breadcrumb';
import AlertBanner from '@/components/admin/AlertBanner';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import RunStatusHeader from '@/components/admin/director/RunStatusHeader';
import TimelineBuilder from '@/components/admin/director/TimelineBuilder';
import SegmentEditor from '@/components/admin/director/SegmentEditor';
import CasterStatusPanel from '@/components/admin/director/CasterStatusPanel';
import CueComposer from '@/components/admin/director/CueComposer';
import CueFeed from '@/components/admin/director/CueFeed';
import AddSegmentModal from '@/components/admin/director/AddSegmentModal';
import WaveBoard, {
  type WaveFormPatch,
} from '@/components/admin/director/WaveBoard';
import StationBoard, {
  type StationFormPatch,
} from '@/components/admin/director/StationBoard';
import ScheduleConflictsBanner from '@/components/admin/director/ScheduleConflictsBanner';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useEventRunRealtime } from '@/hooks/useEventRunRealtime';
import { useOverrunWatcher } from '@/hooks/useOverrunWatcher';
import { useToast } from '@/components/Toast';
import { withStaffPage } from '@/utils/staff';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { computeRunSchedule } from '@/utils/eventSchedule';
import {
  detectTeamScheduleConflicts,
  type MatchTeams,
} from '@/utils/eventScheduleConflicts';
import type { StaffProps } from '@/types/admin';
import type {
  EventBroadcastMessage,
  EventCasterChecklistItem,
  EventCue,
  EventRun,
  EventRunWithSegments,
  EventSegment,
  EventSegmentType,
  EventStation,
  EventStationStatus,
  EventWave,
  EventWaveStatus,
} from '@/types/events';

export const getServerSideProps = withStaffPage('manager');

const POLL_INTERVAL_MS = 30_000;

/* -----------------------------------------------------------
 * PERF — la page tick `nowMs` toutes les 1s (drift/timing) et se re-rend en
 * entier. Seuls RunStatusHeader + TimelineBuilder consomment `schedule`/`nowMs`
 * et DOIVENT se rafraichir chaque seconde. Les panels ci-dessous n'en dependent
 * pas : on les memoise pour couper leur reconciliation par seconde. Leurs
 * handlers sont stabilises via useCallback dans le composant (props stables ->
 * memo effectif). CasterStatusPanel est deja memoise a la source.
 * (Les fichiers WaveBoard/StationBoard/SegmentEditor sont hors perimetre ; on
 * memoise donc au niveau du consumer.)
 * ---------------------------------------------------------*/
const WaveBoardMemo = memo(WaveBoard);
const StationBoardMemo = memo(StationBoard);
const SegmentEditorMemo = memo(SegmentEditor);

function DirectorPage(_props: StaffProps) {
  const t = useAdminT('adminEventDirector');
  const router = useRouter();
  const runId =
    typeof router.query.runId === 'string' ? router.query.runId : null;

  const { adminFetch, adminFetchJson } = useAdminFetch();
  // Pour les mutations frequentes (start/skip/end/save), on n'autorise pas le
  // replay automatique sur la meme cle — chaque clic est une intention
  // distincte, on regenere apres chaque succes.
  const { mutate, mutateJson, regenerate } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [run, setRun] = useState<EventRun | null>(null);
  const [segments, setSegments] = useState<EventSegment[]>([]);
  const [waves, setWaves] = useState<EventWave[]>([]);
  const [stations, setStations] = useState<EventStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Comms : cue tout juste cree (optimistic, on l'affiche dans le feed avant le poll).
  const [optimisticCue, setOptimisticCue] = useState<EventCue | null>(null);
  // Liste reduite "id + name" des casters ASSIGNES a ce run, remontee par
  // CasterStatusPanel (derivee des cast_assignments, source d'autorite — PAS
  // de la presence) et consommee par CueFeed pour calculer "qui doit ack / qui
  // n'a PAS ack" sur les cues urgent. La presence ne sert qu'aux badges de
  // connexion dans le panel, jamais a etablir ce total attendu.
  const [casters, setCasters] = useState<
    Array<{ cast_member_id: string; name: string }>
  >([]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (!runId) return;
    try {
      const json = await adminFetchJson<EventRunWithSegments>(
        `/api/admin/events/${runId}`
      );
      setRun(json.run);
      setSegments(json.segments ?? []);
      setWaves(json.waves ?? []);
      setStations(json.stations ?? []);
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg((err as Error)?.message ?? t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, runId, t.errorLoad]);

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
  //
  // Les 4 handlers sont memoises avec useCallback (deps vides : ils
  // n'utilisent que des setters d'etat, stables). Sans ca, leur identite
  // changerait a chaque render, ce qui ferait resouscrire les 4 canaux
  // Supabase (removeChannel + subscribe) en boucle — cf. deps `onChange`
  // dans useRealtimeChannel.
  const handleSegmentChange = useCallback(
    (
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      partial: Partial<EventSegment> & { id?: string }
    ) => {
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
    []
  );

  const handleRunChange = useCallback(
    (partial: Partial<EventRun> & { id?: string }) => {
      setRun((prev) =>
        prev ? ({ ...prev, ...partial } as EventRun) : (partial as EventRun)
      );
    },
    []
  );

  const handleWaveChange = useCallback(
    (
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      partial: Partial<EventWave> & { id?: string }
    ) => {
      if (eventType === 'DELETE') {
        setWaves((prev) => prev.filter((w) => w.id !== partial.id));
        return;
      }
      setWaves((prev) => {
        const existing = prev.findIndex((w) => w.id === partial.id);
        if (existing === -1) {
          const next = [...prev, partial as EventWave];
          next.sort((a, b) => a.ord - b.ord);
          return next;
        }
        const merged = { ...prev[existing], ...partial } as EventWave;
        const next = [...prev];
        next[existing] = merged;
        next.sort((a, b) => a.ord - b.ord);
        return next;
      });
    },
    []
  );

  const handleStationChange = useCallback(
    (
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      partial: Partial<EventStation> & { id?: string }
    ) => {
      if (eventType === 'DELETE') {
        setStations((prev) => prev.filter((s) => s.id !== partial.id));
        return;
      }
      setStations((prev) => {
        const existing = prev.findIndex((s) => s.id === partial.id);
        if (existing === -1) {
          const next = [...prev, partial as EventStation];
          next.sort((a, b) => a.ord - b.ord);
          return next;
        }
        const merged = { ...prev[existing], ...partial } as EventStation;
        const next = [...prev];
        next[existing] = merged;
        next.sort((a, b) => a.ord - b.ord);
        return next;
      });
    },
    []
  );

  useEventRunRealtime({
    enabled: !!runId,
    runId,
    onSegmentChange: handleSegmentChange,
    onRunChange: handleRunChange,
    onWaveChange: handleWaveChange,
    onStationChange: handleStationChange,
  });

  const selectedSegment = useMemo(
    () => segments.find((s) => s.id === selectedId) ?? null,
    [segments, selectedId]
  );

  /* -----------------------------------------------------------
   * Lot 6 — timing/drift
   *
   * On tick `nowMs` toutes les 1s pour que :
   *   - le drift gauge se decale (segments deja faits OK, mais surtout le
   *     marqueur "real now" du gauge avance en continu vs "planned now"),
   *   - le `liveOverrunSec` calcule dans schedule s'incremente,
   *   - le useOverrunWatcher hook re-evalue ses thresholds.
   * 1s c'est tres bon marche (re-render leger d'un seul composant header +
   * timeline), pas besoin de throttle plus loin.
   * ---------------------------------------------------------*/
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const schedule = useMemo(
    () => (run ? computeRunSchedule(run, segments, nowMs) : null),
    [run, segments, nowMs]
  );

  /* -----------------------------------------------------------
   * Roadmap #04 — detection des conflits de planning d'equipe.
   *
   * Une equipe programmee sur 2 matchs dont les plages horaires PLANIFIEES se
   * chevauchent = conflit. On a besoin des equipes par match ; les segments ne
   * portent que match_id. On resout donc match_id -> equipes via l'endpoint
   * admin existant /api/admin/matches/[matchId] (lecture seule, role manager,
   * pas de modif d'API). Fetch UNIQUE par match (cache dans matchTeams) : on ne
   * refetch que les match_ids nouvellement apparus, jamais a chaque tick 1s.
   * ---------------------------------------------------------*/
  const [matchTeams, setMatchTeams] = useState<Map<string, MatchTeams>>(
    () => new Map()
  );

  // Ids distincts des segments-match (non skipped) a resoudre. Memoise sur
  // `segments` -> ref stable tant que la liste ne change pas.
  const matchIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of segments) {
      if (s.type === 'match' && s.match_id && s.status !== 'skipped') {
        ids.add(s.match_id);
      }
    }
    return Array.from(ids).sort();
  }, [segments]);

  useEffect(() => {
    if (!runId || matchIds.length === 0) return;
    // On ne fetch que les ids pas encore connus (evite tout refetch inutile ;
    // quand matchTeams se met a jour, l'effet re-run mais `missing` est vide).
    const missing = matchIds.filter((id) => !matchTeams.has(id));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const resolved = await Promise.all(
        missing.map(async (id) => {
          try {
            const json = await adminFetchJson<{
              match: {
                id: string;
                team1_id: string | null;
                team2_id: string | null;
                team1?: { name?: string | null } | null;
                team2?: { name?: string | null } | null;
              };
            }>(`/api/admin/matches/${id}`);
            const m = json.match;
            const entry: MatchTeams = {
              team1Id: m.team1_id ?? null,
              team2Id: m.team2_id ?? null,
              team1Name: m.team1?.name ?? null,
              team2Name: m.team2?.name ?? null,
            };
            return [id, entry] as const;
          } catch {
            // Match introuvable / erreur : on ignore ce match pour la detection
            // (pas de blocage du Director).
            return null;
          }
        })
      );
      if (cancelled) return;
      setMatchTeams((prev) => {
        const next = new Map(prev);
        for (const r of resolved) {
          if (r) next.set(r[0], r[1]);
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [runId, matchIds, matchTeams, adminFetchJson]);

  /* -----------------------------------------------------------
   * Conflits : calcules sur les HORAIRES PLANIFIES uniquement (plannedStart/
   * plannedEnd), qui NE dependent PAS de nowMs. On recalcule donc un schedule
   * dedie avec nowMs=0 (fige) memoise sur [run, segments] -> pas de recompute
   * chaque seconde. Puis la detection memoise sur [scheduleForConflicts,
   * segments, matchTeams].
   * ---------------------------------------------------------*/
  const scheduleForConflicts = useMemo(
    () => (run ? computeRunSchedule(run, segments, 0) : null),
    [run, segments]
  );

  const scheduleConflicts = useMemo(
    () =>
      scheduleForConflicts
        ? detectTeamScheduleConflicts(
            scheduleForConflicts,
            segments,
            matchTeams
          )
        : [],
    [scheduleForConflicts, segments, matchTeams]
  );

  /* -----------------------------------------------------------
   * Lot 6 — auto-cue overrun T+5min.
   *
   * Deux mecanismes complementaires, PAS redondants :
   *   - Idempotency-Key (header) : cache 24h cote DB (admin_idempotency).
   *     Protege contre les RETRIES RESEAU du MEME caller (ex. re-mount du
   *     watcher dans le meme onglet, double-click). Clef stable par segment.
   *   - dedup_key (body) : partial UNIQUE INDEX cote DB (event_cues).
   *     Protege contre les ecritures CONCURRENTES de callers DIFFERENTS —
   *     ici client (ce hook) vs cron server-side `overrun-watcher-cron` qui
   *     ecrit le meme cue si l'onglet Director est ferme. Le second writer
   *     prend un 23505 cote handler, qui retourne 200 dedupReplayed=true.
   *     Pour nous, c'est aussi un succes (res.ok = true).
   * ---------------------------------------------------------*/
  const sendOverrunAutoCue = useCallback(
    async (segmentId: string, body: string) => {
      if (!runId) return;
      const dedupKey = `auto-overrun:${runId}:${segmentId}`;
      const res = await adminFetch(`/api/admin/events/${runId}/cues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': dedupKey,
        },
        body: JSON.stringify({
          severity: 'urgent',
          body,
          dedup_key: dedupKey,
        }),
      });
      if (!res.ok) {
        let msg = format(t.autoCueFailed, { status: res.status });
        try {
          const payload = await res.json();
          if (payload?.error) msg = String(payload.error);
        } catch {
          // ignore parse error
        }
        throw new Error(msg);
      }
    },
    [adminFetch, runId, t.autoCueFailed]
  );

  useOverrunWatcher({
    runId,
    schedule,
    segments,
    sendAutoCue: sendOverrunAutoCue,
    enabled: !!run && run.status === 'live',
  });

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

  /* -----------------------------------------------------------
   * Waves — CRUD + statut + reorder. Toutes les mutations regenerent la clef
   * d'idempotence (intentions distinctes) et maj l'etat local depuis la
   * reponse canonique de l'API.
   * ---------------------------------------------------------*/

  const handleCreateWave = useCallback(
    async (patch: WaveFormPatch) => {
      if (!runId) return;
      setBusy(true);
      regenerate();
      try {
        const json = await mutateJson<{ wave: EventWave }>(
          `/api/admin/events/${runId}/waves`,
          {
            method: 'POST',
            body: JSON.stringify({
              title: patch.title,
              planned_start_at: patch.planned_start_at,
              duration_min: patch.duration_min,
            }),
          }
        );
        setWaves((prev) => [...prev, json.wave].sort((a, b) => a.ord - b.ord));
        addToast(t.waveCreated, 'success');
      } catch (err) {
        addToast((err as Error)?.message ?? t.createFailed, 'error');
      } finally {
        setBusy(false);
      }
    },
    [runId, regenerate, mutateJson, addToast, t]
  );

  const handleUpdateWave = useCallback(
    async (waveId: string, patch: Partial<WaveFormPatch>) => {
      if (!runId) return;
      setBusy(true);
      regenerate();
      try {
        const json = await mutateJson<{ wave: EventWave }>(
          `/api/admin/events/${runId}/waves/${waveId}`,
          { method: 'PATCH', body: JSON.stringify(patch) }
        );
        setWaves((prev) =>
          prev
            .map((w) => (w.id === json.wave.id ? json.wave : w))
            .sort((a, b) => a.ord - b.ord)
        );
        addToast(t.waveUpdated, 'success');
      } catch (err) {
        addToast((err as Error)?.message ?? t.updateFailed, 'error');
      } finally {
        setBusy(false);
      }
    },
    [runId, regenerate, mutateJson, addToast, t]
  );

  const handleSetWaveStatus = useCallback(
    async (wave: EventWave, status: EventWaveStatus) => {
      if (!runId) return;
      if (status === 'skipped') {
        const ok = await confirm({
          title: format(t.confirmSkipWaveTitle, { title: wave.title }),
          subtitle: t.confirmSkipWaveSubtitle,
          variant: 'warning',
          confirmLabel: t.skipWaveLabel,
        });
        if (!ok) return;
      }
      setBusy(true);
      regenerate();
      try {
        const json = await mutateJson<{ wave: EventWave }>(
          `/api/admin/events/${runId}/waves/${wave.id}`,
          { method: 'PATCH', body: JSON.stringify({ status }) }
        );
        setWaves((prev) =>
          prev.map((w) => (w.id === json.wave.id ? json.wave : w))
        );
        addToast(t.waveStatusUpdated, 'success');
      } catch (err) {
        addToast((err as Error)?.message ?? t.statusChangeFailed, 'error');
      } finally {
        setBusy(false);
      }
    },
    [runId, confirm, regenerate, mutateJson, addToast, t]
  );

  const handleDeleteWave = useCallback(
    async (wave: EventWave) => {
      if (!runId) return;
      const ok = await confirm({
        title: format(t.confirmDeleteWaveTitle, { title: wave.title }),
        subtitle: t.confirmDeleteWaveSubtitle,
        variant: 'danger',
        confirmLabel: t.confirmDeleteLabel,
      });
      if (!ok) return;
      setBusy(true);
      regenerate();
      try {
        const res = await mutate(`/api/admin/events/${runId}/waves/${wave.id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(
            payload?.error ??
              format(t.deleteFailedStatus, { status: res.status })
          );
        }
        setWaves((prev) => prev.filter((w) => w.id !== wave.id));
        // Les segments rattaches ont wave_id remis a NULL cote DB (FK SET NULL).
        setSegments((prev) =>
          prev.map((s) => (s.wave_id === wave.id ? { ...s, wave_id: null } : s))
        );
        addToast(t.waveDeleted, 'success');
      } catch (err) {
        addToast((err as Error)?.message ?? t.deleteFailed, 'error');
      } finally {
        setBusy(false);
      }
    },
    [runId, confirm, regenerate, mutate, addToast, t]
  );

  const handleReorderWaves = useCallback(
    async (orderedIds: string[]) => {
      if (!runId) return;
      const prev = waves;
      // Optimistic : reassigne ord selon la nouvelle position.
      setWaves(() =>
        orderedIds
          .map((id, idx) => {
            const w = prev.find((x) => x.id === id);
            return w ? { ...w, ord: idx } : null;
          })
          .filter((w): w is EventWave => w !== null)
      );
      setBusy(true);
      regenerate();
      try {
        const json = await mutateJson<{ waves: EventWave[] }>(
          `/api/admin/events/${runId}/waves/reorder`,
          {
            method: 'POST',
            body: JSON.stringify({
              order: orderedIds.map((id, idx) => ({ id, ord: idx })),
            }),
          }
        );
        if (json.waves) setWaves(json.waves);
      } catch (err) {
        addToast((err as Error)?.message ?? t.reorderFailed, 'error');
        setWaves(prev);
      } finally {
        setBusy(false);
      }
    },
    [runId, waves, regenerate, mutateJson, addToast, t]
  );

  /* -----------------------------------------------------------
   * Stations — CRUD + statut.
   * ---------------------------------------------------------*/

  const handleCreateStation = useCallback(
    async (patch: StationFormPatch) => {
      if (!runId) return;
      setBusy(true);
      regenerate();
      try {
        const json = await mutateJson<{ station: EventStation }>(
          `/api/admin/events/${runId}/stations`,
          { method: 'POST', body: JSON.stringify(patch) }
        );
        setStations((prev) =>
          [...prev, json.station].sort((a, b) => a.ord - b.ord)
        );
        addToast(t.stationCreated, 'success');
      } catch (err) {
        addToast((err as Error)?.message ?? t.createFailed, 'error');
      } finally {
        setBusy(false);
      }
    },
    [runId, regenerate, mutateJson, addToast, t]
  );

  const handleUpdateStation = useCallback(
    async (stationId: string, patch: Partial<StationFormPatch>) => {
      if (!runId) return;
      setBusy(true);
      regenerate();
      try {
        const json = await mutateJson<{ station: EventStation }>(
          `/api/admin/events/${runId}/stations/${stationId}`,
          { method: 'PATCH', body: JSON.stringify(patch) }
        );
        setStations((prev) =>
          prev.map((s) => (s.id === json.station.id ? json.station : s))
        );
        addToast(t.stationUpdated, 'success');
      } catch (err) {
        addToast((err as Error)?.message ?? t.updateFailed, 'error');
      } finally {
        setBusy(false);
      }
    },
    [runId, regenerate, mutateJson, addToast, t]
  );

  const handleSetStationStatus = useCallback(
    async (station: EventStation, status: EventStationStatus) => {
      if (!runId) return;
      setBusy(true);
      regenerate();
      try {
        const json = await mutateJson<{ station: EventStation }>(
          `/api/admin/events/${runId}/stations/${station.id}`,
          { method: 'PATCH', body: JSON.stringify({ status }) }
        );
        setStations((prev) =>
          prev.map((s) => (s.id === json.station.id ? json.station : s))
        );
      } catch (err) {
        addToast((err as Error)?.message ?? t.statusChangeFailed, 'error');
      } finally {
        setBusy(false);
      }
    },
    [runId, regenerate, mutateJson, addToast, t]
  );

  const handleDeleteStation = useCallback(
    async (station: EventStation) => {
      if (!runId) return;
      const ok = await confirm({
        title: format(t.confirmDeleteStationTitle, { name: station.name }),
        subtitle: t.confirmDeleteStationSubtitle,
        variant: 'danger',
        confirmLabel: t.confirmDeleteLabel,
      });
      if (!ok) return;
      setBusy(true);
      regenerate();
      try {
        const res = await mutate(
          `/api/admin/events/${runId}/stations/${station.id}`,
          { method: 'DELETE' }
        );
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(
            payload?.error ??
              format(t.deleteFailedStatus, { status: res.status })
          );
        }
        setStations((prev) => prev.filter((s) => s.id !== station.id));
        setSegments((prev) =>
          prev.map((s) =>
            s.station_id === station.id ? { ...s, station_id: null } : s
          )
        );
        addToast(t.stationDeleted, 'success');
      } catch (err) {
        addToast((err as Error)?.message ?? t.deleteFailed, 'error');
      } finally {
        setBusy(false);
      }
    },
    [runId, confirm, regenerate, mutate, addToast, t]
  );

  /* -----------------------------------------------------------
   * Render
   * ---------------------------------------------------------*/

  return (
    <>
      <Head>
        <title>
          {run?.name
            ? format(t.pageTitleWithRun, { name: run.name })
            : t.pageTitleNoRun}
        </title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12 max-w-[1600px] mx-auto">
          <Breadcrumb
            items={[
              { label: t.breadcrumbAdmin, href: '/admin' },
              { label: t.breadcrumbRunOfShow, href: '/admin/events' },
              { label: run?.name ?? t.breadcrumbDirectorFallback },
            ]}
          />

          {loading ? (
            <div className="py-24">
              <LoadingSpinner label={t.loading} />
            </div>
          ) : !run ? (
            <AlertBanner
              message={errorMsg ?? t.eventNotFound}
              variant="error"
            />
          ) : (
            <div className="space-y-6">
              <RunStatusHeader
                run={run}
                segments={segments}
                schedule={schedule}
                nowMs={nowMs}
                onStartRun={handleStartRun}
                onEndRun={handleEndRun}
                busy={busy}
              />

              <ScheduleConflictsBanner conflicts={scheduleConflicts} />

              {errorMsg && (
                <AlertBanner
                  message={errorMsg}
                  variant="error"
                  onDismiss={() => setErrorMsg(null)}
                />
              )}

              {/*
                Layout desktop (lg+) : 3 colonnes 40/30/30 via grid-cols-10.
                Layout mobile : tout empile (Timeline → Editor → Comms →
                Casters). L'ordre est expose via `order-*` classes en mobile,
                pas via le DOM (le DOM reste : timeline, editor+casters,
                comms, ce qui correspond a l'ordre desktop).
              */}
              <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
                {/* Gauche : Timeline (40%) */}
                <div className="lg:col-span-4 order-1">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide">
                      {t.timelineHeading}
                    </h2>
                    <span className="text-xs text-neutral-500">
                      {t.dragToReorder}
                    </span>
                  </div>
                  <TimelineBuilder
                    segments={segments}
                    selectedId={selectedId}
                    busy={busy}
                    schedule={schedule}
                    onSelect={(id) => setSelectedId(id)}
                    onReorder={handleReorder}
                    onStart={handleStartSegment}
                    onSkip={handleSkipSegment}
                    onEnd={handleEndSegment}
                    onDelete={handleDeleteSegment}
                    onAddClick={() => setShowAddModal(true)}
                  />
                </div>

                {/* Centre : Editor + Casters (30%) */}
                <div className="lg:col-span-3 space-y-6 order-2 lg:order-2">
                  <div>
                    <h2 className="mb-3 text-sm font-semibold text-neutral-300 uppercase tracking-wide">
                      {t.editionHeading}
                    </h2>
                    <SegmentEditorMemo
                      segment={selectedSegment}
                      run={run}
                      busy={busy}
                      waves={waves}
                      stations={stations}
                      onSave={handleSaveSegment}
                      onAssign={handleAssignSegment}
                    />
                  </div>
                  <div className="order-4 lg:order-none">
                    <h2 className="mb-3 text-sm font-semibold text-neutral-300 uppercase tracking-wide">
                      {t.castersHeading}
                    </h2>
                    <CasterStatusPanel
                      segments={segments}
                      runId={runId ?? ''}
                      onAssignedCastersChange={setCasters}
                    />
                  </div>
                </div>

                {/* Droite : Comms (30%) — composer sticky + feed scrollable */}
                <div className="lg:col-span-3 space-y-6 order-3 lg:order-3">
                  <div>
                    <h2 className="mb-3 text-sm font-semibold text-neutral-300 uppercase tracking-wide">
                      {t.commsHeading}
                    </h2>
                    <div className="lg:sticky lg:top-20">
                      <CueComposer
                        runId={runId ?? ''}
                        runStatus={run.status}
                        onCueCreated={setOptimisticCue}
                      />
                    </div>
                  </div>
                  <CueFeed
                    runId={runId ?? ''}
                    casters={casters}
                    optimisticCue={optimisticCue}
                  />
                </div>
              </div>

              {/* Waves + Stations — regroupements logiques et postes de prod. */}
              <div>
                <h2 className="mb-3 text-sm font-semibold text-neutral-300 uppercase tracking-wide">
                  {t.wavesStationsHeading}
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <WaveBoardMemo
                    waves={waves}
                    segments={segments}
                    busy={busy}
                    onCreate={handleCreateWave}
                    onUpdate={handleUpdateWave}
                    onSetStatus={handleSetWaveStatus}
                    onDelete={handleDeleteWave}
                    onReorder={handleReorderWaves}
                  />
                  <StationBoardMemo
                    stations={stations}
                    segments={segments}
                    busy={busy}
                    onCreate={handleCreateStation}
                    onUpdate={handleUpdateStation}
                    onSetStatus={handleSetStationStatus}
                    onDelete={handleDeleteStation}
                  />
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
