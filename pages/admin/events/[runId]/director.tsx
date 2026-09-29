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
import WaveBoard from '@/components/admin/director/WaveBoard';
import StationBoard from '@/components/admin/director/StationBoard';
import ScheduleConflictsBanner from '@/components/admin/director/ScheduleConflictsBanner';
import DirectorToolbar from '@/features/admin/events/ui/DirectorToolbar';
import DirectorWorkspace from '@/features/admin/events/ui/DirectorWorkspace';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useEventRunRealtime } from '@/hooks/useEventRunRealtime';
import { useVisiblePoll } from '@/hooks/useVisiblePoll';
import { sendOverrunAutoCue } from '@/components/admin/events/overrunAutoCue';
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
  EventCue,
  EventRun,
  EventRunWithSegments,
  EventSegment,
  EventStation,
  EventWave,
} from '@/types/events';
import {
  useDirectorSegmentActions,
  type LocalReorderRecord,
} from '@/features/admin/events/hooks/useDirectorSegmentActions';
import { useDirectorWaveStationActions } from '@/features/admin/events/hooks/useDirectorWaveStationActions';
import nsAdminEventDirector from '@/lib/i18n/locales/admin-fr/adminEventDirector';

export const getServerSideProps = withStaffPage({
  permission: 'manage_broadcast',
});

const POLL_INTERVAL_MS = 30_000;

// Fenetre pendant laquelle un changement d'ordre realtime divergent est
// interprete comme un reorder concurrent d'un autre regisseur (Finding #14).
const REORDER_CONFLICT_WINDOW_MS = 10_000;

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
  const t = useAdminT(nsAdminEventDirector);
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

  // --- Detection de reorder concurrent (Finding #14) --------------------------
  // Quand on reordonne en optimistic, on memorise l'ordre attendu (id -> index)
  // et l'instant. Si, dans la fenetre qui suit, un changement realtime d'ordre
  // arrive d'un AUTRE regisseur et diverge de cet ordre attendu, on previent
  // l'utilisateur (toast) et on laisse le merge realtime realigner sur le
  // serveur, plutot que d'ecraser silencieusement. L'echo realtime de NOTRE
  // propre reorder porte les memes `ord` que l'ordre attendu -> aucun faux
  // positif. On passe par des refs pour ne PAS reabonner les canaux realtime
  // (handleSegmentChange doit garder des deps vides).
  const lastLocalReorderRef = useRef<LocalReorderRecord | null>(null);
  const addToastRef = useRef(addToast);
  const reorderConflictMsgRef = useRef('');
  useEffect(() => {
    addToastRef.current = addToast;
  }, [addToast]);
  useEffect(() => {
    reorderConflictMsgRef.current = t.reorderConflict;
  }, [t.reorderConflict]);

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

  // Polling de secours (30 s, onglet visible) et relecture au retour sur
  // l'onglet. Le realtime reste la source principale.
  useVisiblePoll(fetchData, POLL_INTERVAL_MS);

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
      // Detection de reorder concurrent : un UPDATE d'ordre qui diverge de
      // notre dernier reorder optimistic signifie qu'un autre regisseur a
      // reordonne en meme temps. On previent une seule fois ; le merge ci-dessous
      // realigne l'UI sur l'ordre serveur.
      if (eventType === 'UPDATE' && typeof partial.ord === 'number') {
        const rec = lastLocalReorderRef.current;
        if (
          rec &&
          !rec.conflictShown &&
          partial.id &&
          Date.now() - rec.at < REORDER_CONFLICT_WINDOW_MS
        ) {
          const expected = rec.expected.get(partial.id);
          if (expected !== undefined && expected !== partial.ord) {
            rec.conflictShown = true;
            addToastRef.current(reorderConflictMsgRef.current, 'warning');
          }
        }
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

  const { connected: realtimeConnected } = useEventRunRealtime({
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
   * Lot 6 — auto-cue overrun T+5min. Mécanique et garde-fous d'idempotence :
   * cf. components/admin/events/overrunAutoCue.ts.
   * ---------------------------------------------------------*/
  const sendAutoCue = useCallback(
    (segmentId: string, body: string) =>
      runId
        ? sendOverrunAutoCue({
            adminFetch,
            runId,
            segmentId,
            body,
            failedTemplate: t.autoCueFailed,
          })
        : Promise.resolve(),
    [adminFetch, runId, t.autoCueFailed]
  );

  useOverrunWatcher({
    runId,
    schedule,
    segments,
    sendAutoCue,
    enabled: !!run && run.status === 'live',
  });

  /* -----------------------------------------------------------
   * Actions run / segments / waves / stations — corps déplacés à l'identique
   * dans features/admin/events/hooks/ (lot 9C). La page garde l'état.
   * ---------------------------------------------------------*/
  const {
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
  } = useDirectorSegmentActions({
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
  });

  const {
    handleCreateWave,
    handleUpdateWave,
    handleSetWaveStatus,
    handleDeleteWave,
    handleReorderWaves,
    handleCreateStation,
    handleUpdateStation,
    handleSetStationStatus,
    handleDeleteStation,
  } = useDirectorWaveStationActions({
    t,
    runId,
    waves,
    setWaves,
    setStations,
    setSegments,
    setBusy,
    mutate,
    mutateJson,
    regenerate,
    confirm,
    addToast,
  });

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
      <div className="min-h-screen text-[var(--t1,#f4edf7)]">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-header pb-12 max-w-[1600px] mx-auto">
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
              <DirectorToolbar
                runId={runId}
                connected={realtimeConnected}
                connectedLabel={t.realtimeConnected}
                degradedLabel={t.realtimeDegraded}
              />
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

              <DirectorWorkspace
                timeline={
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
                }
                editor={
                  <SegmentEditorMemo
                    segment={selectedSegment}
                    run={run}
                    busy={busy}
                    waves={waves}
                    stations={stations}
                    onSave={handleSaveSegment}
                    onAssign={handleAssignSegment}
                  />
                }
                casters={
                  <CasterStatusPanel
                    segments={segments}
                    runId={runId ?? ''}
                    onAssignedCastersChange={setCasters}
                  />
                }
                composer={
                  <CueComposer
                    runId={runId ?? ''}
                    runStatus={run.status}
                    onCueCreated={setOptimisticCue}
                  />
                }
                feed={
                  <CueFeed
                    runId={runId ?? ''}
                    casters={casters}
                    optimisticCue={optimisticCue}
                  />
                }
                waves={
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
                }
                stations={
                  <StationBoardMemo
                    stations={stations}
                    segments={segments}
                    busy={busy}
                    onCreate={handleCreateStation}
                    onUpdate={handleUpdateStation}
                    onSetStatus={handleSetStationStatus}
                    onDelete={handleDeleteStation}
                  />
                }
              />
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
