// pages/admin/broadcast/live.tsx
// Lot 7 — Live Broadcast Console.
// Single-pane view of the active event_run + current segment + casters +
// stream URL + overlay state. Manager+ can edit on_air / lower_third / PiP.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useEventRunRealtime } from '@/hooks/useEventRunRealtime';
import { useToast } from '@/components/Toast';
import RealtimeStatusBadge from '@/components/admin/RealtimeStatusBadge';
import TwitchStatusPanel from '@/components/admin/broadcast/TwitchStatusPanel';
import TwitchPredictionsPanel from '@/components/admin/broadcast/TwitchPredictionsPanel';
import TwitchCommandsPanel from '@/components/admin/broadcast/TwitchCommandsPanel';
import { useRouter } from 'next/router';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import Switch from '@/components/ui/Switch';
import type { StaffProps } from '@/types/admin';
import type { EventRun, EventSegment } from '@/types/events';

type Scene = 'starting' | 'match' | 'pause' | 'results' | 'end' | 'custom';

const SCENES: Scene[] = [
  'starting',
  'match',
  'pause',
  'results',
  'end',
  'custom',
];

type BroadcastStateV1 = {
  v: 1;
  on_air: boolean;
  lower_third: string | null;
  pip: { enabled: boolean };
  scene: Scene;
  auto_director: boolean;
};

type NextMatchResponse = {
  segment: {
    id: string;
    ord: number;
    type: string;
    title: string;
    match_id: string | null;
  };
  alreadyStarted: boolean;
  runId: string;
};

type LiveResponse = {
  run: {
    id: string;
    name: string;
    slug: string;
    status: 'draft' | 'live' | 'done';
    startedAt: string | null;
    scheduledAt: string | null;
  } | null;
  currentSegment: {
    id: string;
    ord: number;
    type: string;
    title: string;
    status: string;
    match_id: string | null;
    duration_min: number | null;
  } | null;
  match: {
    matchId: string;
    team1: { id: string; name: string; shortName: string | null } | null;
    team2: { id: string; name: string; shortName: string | null } | null;
    team1Score: number | null;
    team2Score: number | null;
    streamUrl: string | null;
  } | null;
  casters: {
    castMemberId: string;
    displayName: string | null;
    discordUserId: string | null;
  }[];
  state: BroadcastStateV1;
  generatedAt: string;
};

const POLL_MS = 15_000;

export const getServerSideProps = withStaffPage('caster');

function BroadcastLivePage({ staff }: StaffProps) {
  const t = useAdminT('adminBroadcastLive');
  const tw = useAdminT('adminTwitchPredictions');
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation({
    autoRegenerateOnSuccess: true,
  });
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [data, setData] = useState<LiveResponse | null>(null);
  // Timeline complète du run live — sert UNIQUEMENT à résoudre la cible du
  // « prochain match » (finding #4) et à rester synchro via realtime
  // (finding #7). Chargée en best-effort pour les managers (l'endpoint events
  // est manager+ ; les casters ne peuvent de toute façon pas avancer).
  const [segments, setSegments] = useState<EventSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lowerDraft, setLowerDraft] = useState('');
  // Finding #11 : busy CIBLÉ par contrôle. Un seul `submitting` global gelait
  // tout le pupitre (auto-director + 6 scènes + on/off air + PiP + lower-third)
  // pendant chaque appel réseau. On piste ici les ids des seuls contrôles en
  // cours d'envoi ; chaque bouton ne se désactive que pour SA propre mutation.
  const [pendingControls, setPendingControls] = useState<Set<string>>(
    () => new Set()
  );
  const [advancing, setAdvancing] = useState(false);

  const isPending = useCallback(
    (id: string) => pendingControls.has(id),
    [pendingControls]
  );
  const [origin, setOrigin] = useState('');

  const canEdit = staff.role !== 'caster';
  const runId = data?.run?.id ?? null;

  // window.location.origin est indisponible côté SSR ; on le récupère après
  // hydratation pour éviter tout mismatch React.
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Retour du flux OAuth Twitch : live.tsx peut recevoir ?twitch=connected|error.
  // On affiche le toast correspondant puis on NETTOIE le query param (shallow,
  // sans re-fetch SSR) pour ne pas rejouer le toast au refresh.
  useEffect(() => {
    if (!router.isReady) return;
    const twitch = router.query.twitch;
    if (twitch !== 'connected' && twitch !== 'error') return;
    addToast(
      twitch === 'connected' ? tw.oauthConnected : tw.oauthError,
      twitch === 'connected' ? 'success' : 'error'
    );
    const { twitch: _omit, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, {
      shallow: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.twitch]);

  const fetchState = useCallback(async () => {
    setError(null);
    try {
      const json = await adminFetchJson<LiveResponse>(
        '/api/admin/broadcast/state'
      );
      setData(json);
      setLowerDraft((prev) =>
        prev === '' && json.state?.lower_third ? json.state.lower_third : prev
      );
    } catch (err) {
      const e = err as AdminFetchError;
      setError(e.message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, t.errorLoad]);

  // Poll de secours (15 s) — filet si le realtime décroche. On le VISIBILITY-GATE
  // (pas de fetch onglet caché) et on refetch au retour visible, comme le
  // Director/cockpit. Le realtime reste la source primaire de fraîcheur.
  useEffect(() => {
    fetchState();
    function tick() {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      )
        return;
      fetchState();
    }
    const handle = setInterval(tick, POLL_MS);
    function onVisible() {
      if (document.visibilityState === 'visible') fetchState();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(handle);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchState]);

  // Timeline complète du run : nécessaire pour nommer la cible du « prochain
  // match » dans la confirmation. Réservé aux managers (endpoint events =
  // manager+). Best-effort : en cas d'échec, la confirmation dégrade son
  // libellé (« … clore le run ? »).
  useEffect(() => {
    if (!runId || !canEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const json = await adminFetchJson<{ segments: EventSegment[] }>(
          `/api/admin/events/${runId}`
        );
        if (!cancelled) setSegments(json.segments ?? []);
      } catch {
        // On ignore : la cible sera juste « inconnue » dans la confirmation.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, canEdit, adminFetchJson]);

  // Realtime (finding #7) : deux opérateurs doivent converger instantanément.
  //   - event_runs.broadcast_state (on_air/scène/lower_third/pip) → merge direct
  //     dans data.state, sans round-trip réseau.
  //   - event_segments → merge dans la timeline locale ET refetch léger de
  //     l'état agrégé (currentSegment + match/score) qu'on ne peut pas dériver
  //     côté client. Les callbacks sont mémoïsés (deps vides / stables) pour ne
  //     pas re-souscrire en boucle.
  const handleRunChange = useCallback(
    (partial: Partial<EventRun> & { id?: string }) => {
      const raw = partial as Record<string, unknown>;
      const nextState = raw.broadcast_state as BroadcastStateV1 | undefined;
      const nextStatus = raw.status as EventRun['status'] | undefined;
      setData((prev) => {
        if (!prev || !prev.run) return prev;
        return {
          ...prev,
          run: nextStatus ? { ...prev.run, status: nextStatus } : prev.run,
          state: nextState && nextState.v === 1 ? nextState : prev.state,
        };
      });
      if (nextState?.lower_third != null) {
        setLowerDraft((cur) =>
          cur === '' ? (nextState.lower_third ?? '') : cur
        );
      }
    },
    []
  );

  const handleSegmentChange = useCallback(
    (
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      partial: Partial<EventSegment> & { id?: string }
    ) => {
      setSegments((prev) => {
        if (eventType === 'DELETE') {
          return prev.filter((s) => s.id !== partial.id);
        }
        const idx = prev.findIndex((s) => s.id === partial.id);
        if (idx === -1) {
          const next = [...prev, partial as EventSegment];
          next.sort((a, b) => a.ord - b.ord);
          return next;
        }
        const merged = { ...prev[idx], ...partial } as EventSegment;
        const next = [...prev];
        next[idx] = merged;
        next.sort((a, b) => a.ord - b.ord);
        return next;
      });
      // Le HUD (currentSegment + match/score) n'est pas dérivable localement :
      // on rafraîchit l'agrégat quand un segment bouge (transitions rares).
      fetchState();
    },
    [fetchState]
  );

  const { connected: realtimeConnected } = useEventRunRealtime({
    enabled: !!runId,
    runId,
    onRunChange: handleRunChange,
    onSegmentChange: handleSegmentChange,
  });

  // applyPatch(patch, controlId) — mutation d'un champ de broadcast_state.
  //   - busy CIBLÉ : seul `controlId` est marqué en cours (anti double-submit
  //     sur CE contrôle uniquement, le reste du pupitre reste cliquable).
  //   - optimistic : on reflète la valeur voulue tout de suite dans data.state
  //     (merge shallow ; pip/lower_third/scene sont remplacés en entier), puis
  //     on réconcilie avec la réponse serveur (source canonique). Le realtime
  //     converge de son côté. En cas d'échec, on refetch l'état canonique.
  const applyPatch = useCallback(
    async (patch: Partial<BroadcastStateV1>, controlId: string) => {
      if (!canEdit) return;
      // Anti double-submit ciblé : ignore un second clic sur le même contrôle
      // tant que sa mutation est en vol.
      if (pendingControls.has(controlId)) return;
      setPendingControls((prev) => {
        const next = new Set(prev);
        next.add(controlId);
        return next;
      });
      // Optimistic : refléter immédiatement la valeur voulue.
      setData((prev) =>
        prev && prev.state
          ? { ...prev, state: { ...prev.state, ...patch } }
          : prev
      );
      try {
        const json = await mutateJson<LiveResponse>(
          '/api/admin/broadcast/state',
          {
            method: 'POST',
            body: JSON.stringify(patch),
          }
        );
        setData(json);
        addToast(t.stateUpdated, 'success');
      } catch (err) {
        const e = err as AdminFetchError;
        const payloadError =
          typeof e.payload === 'object' && e.payload && 'error' in e.payload
            ? String((e.payload as { error: string }).error)
            : null;
        addToast(payloadError || e.message || t.failure, 'error');
        // Rollback : on récupère l'état canonique (l'optimistic était peut-être
        // faux). Le poll/realtime re-convergent également.
        await fetchState();
      } finally {
        setPendingControls((prev) => {
          const next = new Set(prev);
          next.delete(controlId);
          return next;
        });
      }
    },
    [canEdit, pendingControls, mutateJson, addToast, t, fetchState]
  );

  async function goNextMatch() {
    if (!canEdit) return;

    // Résolution client de la transition avant confirmation. La cible réplique
    // la logique serveur : prochain segment type='match' en status 'upcoming'
    // strictement après l'ord courant. Si la timeline n'est pas chargée (fetch
    // échoué / caster), la cible reste inconnue → libellé dégradé.
    const current = data?.currentSegment ?? null;
    const currentLabel = current
      ? `#${current.ord} · ${current.title}`
      : t.segmentNone;
    const target =
      current != null
        ? (segments
            .filter(
              (s) =>
                s.type === 'match' &&
                s.status === 'upcoming' &&
                s.ord > current.ord
            )
            .sort((a, b) => a.ord - b.ord)[0] ?? null)
        : null;

    const ok = await confirm({
      title: target
        ? format(t.confirmNextTitle, {
            current: currentLabel,
            next: `#${target.ord} · ${target.title}`,
          })
        : format(t.confirmNextTitleNoTarget, { current: currentLabel }),
      subtitle: target ? t.confirmNextSubtitle : t.confirmNextSubtitleNoTarget,
      variant: 'danger',
      confirmLabel: t.confirmNextLabel,
    });
    if (!ok) return;

    setAdvancing(true);
    try {
      const json = await mutateJson<NextMatchResponse>(
        '/api/admin/broadcast/next-match',
        { method: 'POST' }
      );
      addToast(
        json.alreadyStarted
          ? format(t.nextMatchAlready, { title: json.segment.title })
          : format(t.nextMatchSuccess, { title: json.segment.title }),
        'success'
      );
      await fetchState();
    } catch (err) {
      const e = err as AdminFetchError;
      const code =
        typeof e.payload === 'object' && e.payload && 'code' in e.payload
          ? String((e.payload as { code: string }).code)
          : null;
      const codeMap: Record<string, string> = {
        NO_LIVE_RUN: t.nextMatchNoLiveRun,
        NO_CURRENT_SEGMENT: t.nextMatchNoCurrentSegment,
        NO_NEXT_MATCH: t.nextMatchNoNextMatch,
        SEGMENT_NOT_UPCOMING: t.nextMatchSegmentNotUpcoming,
      };
      addToast((code && codeMap[code]) || e.message || t.failure, 'error');
    } finally {
      setAdvancing(false);
    }
  }

  async function copyOverlayUrl() {
    if (!overlayUrl) return;
    try {
      await navigator.clipboard.writeText(overlayUrl);
      addToast(t.overlayCopied, 'success');
    } catch {
      addToast(t.overlayCopyFailed, 'error');
    }
  }

  const state = data?.state;
  const currentScene: Scene = state?.scene ?? 'starting';
  const autoDirector = state?.auto_director ?? true;
  const overlayUrl =
    data?.run && origin ? `${origin}/overlay/${data.run.id}` : '';

  const sceneLabels: Record<Scene, string> = {
    starting: t.sceneStarting,
    match: t.sceneMatch,
    pause: t.scenePause,
    results: t.sceneResults,
    end: t.sceneEnd,
    custom: t.sceneCustom,
  };

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-black text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-extrabold tracking-tight">
                  {t.heading}
                </h1>
                <RealtimeStatusBadge
                  connected={realtimeConnected}
                  connectedLabel={t.realtimeConnected}
                  degradedLabel={t.realtimeDegraded}
                />
              </div>
              <p className="text-sm text-neutral-400 mt-1">
                {format(t.subtitle, { seconds: POLL_MS / 1000 })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {data?.run && (
                <Link
                  href={`/admin/events/${data.run.id}/director`}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
                >
                  {t.director}
                </Link>
              )}
              <button
                type="button"
                onClick={fetchState}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
              >
                {t.refresh}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {/* Statut Twitch (lecture seule) : indépendant du run, toujours visible
              pour que le régisseur surveille le live sans quitter la console. */}
          <TwitchStatusPanel />

          {/* Twitch Predictions (écriture) : connexion de la chaîne + pilotage des
              predictions. Indépendant du run, comme le statut ci-dessus. */}
          <TwitchPredictionsPanel />

          {/* Commandes Twitch (écriture) : Clip, message chat, modération et
              points de chaîne. Ne s'affiche que si la chaîne est connectée ;
              sinon l'invite à connecter est gérée par le panneau ci-dessus. */}
          <TwitchCommandsPanel />

          {loading && !data && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-10 text-center text-neutral-400">
              {t.loading}
            </div>
          )}

          {!loading && !data?.run && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-10 text-center text-sm text-neutral-500">
              {t.noRunPrefix} <span className="font-mono">live</span>{' '}
              {t.noRunSuffix}
            </div>
          )}

          {data?.run && (
            <>
              {/* HUD : on-air + segment + match */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                <div
                  className={`rounded-2xl border px-4 py-4 ${
                    state?.on_air
                      ? 'border-red-500/50 bg-red-900/30'
                      : 'border-neutral-800 bg-neutral-900/60'
                  }`}
                >
                  <div className="text-xs uppercase tracking-widest text-neutral-300">
                    {t.onAir}
                  </div>
                  <div className="text-3xl font-extrabold mt-1">
                    {state?.on_air ? t.live : t.off}
                  </div>
                  <div className="text-xs text-neutral-400 mt-1">
                    {t.runLabel}{' '}
                    <span className="font-mono">{data.run.slug}</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 px-4 py-4">
                  <div className="text-xs uppercase tracking-widest text-neutral-300">
                    {t.segmentHeading}
                  </div>
                  {data.currentSegment ? (
                    <>
                      <div className="text-lg font-bold mt-1">
                        #{data.currentSegment.ord} · {data.currentSegment.title}
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        {format(t.segmentType, {
                          type: data.currentSegment.type,
                          min: data.currentSegment.duration_min ?? '?',
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-neutral-500 mt-1 italic">
                      {t.segmentNone}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 px-4 py-4">
                  <div className="text-xs uppercase tracking-widest text-neutral-300">
                    {t.matchHeading}
                  </div>
                  {data.match ? (
                    <>
                      <div className="text-base font-semibold mt-1">
                        {data.match.team1?.name ?? '?'}{' '}
                        <span className="text-neutral-500">
                          {data.match.team1Score ?? '–'} ·{' '}
                          {data.match.team2Score ?? '–'}
                        </span>{' '}
                        {data.match.team2?.name ?? '?'}
                      </div>
                      {data.match.streamUrl ? (
                        <a
                          href={data.match.streamUrl}
                          target="_blank"
                          rel="noopener"
                          className="text-xs text-purple-300 hover:underline mt-1 inline-block"
                        >
                          {t.stream}
                        </a>
                      ) : (
                        <div className="text-xs text-neutral-500 mt-1">
                          {t.noStream}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-neutral-500 mt-1 italic">
                      {t.segmentNonMatch}
                    </div>
                  )}
                </div>
              </div>

              {/* Casters */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 mb-6">
                <div className="text-xs uppercase tracking-widest text-neutral-400 mb-2">
                  {t.castersHeading}
                </div>
                {data.casters.length === 0 ? (
                  <div className="text-sm text-neutral-500 italic">
                    {t.castersEmpty}
                  </div>
                ) : (
                  <ul className="text-sm space-y-1">
                    {data.casters.map((c) => (
                      <li key={c.castMemberId}>
                        <span className="font-medium">
                          {c.displayName ?? t.casterNoName}
                        </span>
                        {c.discordUserId && (
                          <span className="ml-2 text-xs text-neutral-500 font-mono">
                            {c.discordUserId}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Automatisation : régie auto + scènes + prochain match */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 px-4 py-4 mb-6">
                <div className="text-xs uppercase tracking-widest text-neutral-400 mb-3">
                  {t.autoHeading}
                </div>

                {/* Auto-director switch */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="text-sm font-semibold">
                      {t.autoDirectorLabel}
                    </div>
                    <div className="text-xs text-neutral-400 mt-0.5 max-w-xl">
                      {autoDirector
                        ? t.autoDirectorOnHint
                        : t.autoDirectorOffHint}
                    </div>
                  </div>
                  <Switch
                    checked={autoDirector}
                    onChange={() =>
                      applyPatch(
                        { auto_director: !autoDirector },
                        'auto_director'
                      )
                    }
                    disabled={isPending('auto_director') || !canEdit}
                    label={t.autoDirectorLabel}
                    size="md"
                  />
                </div>

                {/* Scene selector */}
                <div className="mb-4">
                  <div
                    className="text-xs text-neutral-400 mb-2"
                    id="scene-selector-label"
                  >
                    {t.sceneLabel}
                  </div>
                  <div
                    role="group"
                    aria-labelledby="scene-selector-label"
                    className="flex flex-wrap gap-2"
                  >
                    {SCENES.map((s) => {
                      const active = currentScene === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={active}
                          disabled={isPending(`scene:${s}`) || !canEdit}
                          onClick={() => applyPatch({ scene: s }, `scene:${s}`)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            active
                              ? 'bg-purple-600 border-purple-500 text-white'
                              : 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-neutral-200'
                          }`}
                        >
                          {sceneLabels[s]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-xs text-neutral-500 mt-2">
                    {t.sceneHint}
                  </div>
                </div>

                {/* Prochain match */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={advancing || !canEdit}
                    onClick={goNextMatch}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {advancing && (
                      <span className="inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    )}
                    {advancing ? t.nextMatchLoading : t.nextMatch}
                  </button>
                  <span className="text-xs text-neutral-500">
                    {t.nextMatchHint}
                  </span>
                </div>
              </div>

              {/* Overlay OBS : URL source navigateur */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 px-4 py-4 mb-6">
                <div className="text-xs uppercase tracking-widest text-neutral-400 mb-3">
                  {t.overlayUrlHeading}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={overlayUrl}
                    aria-label={t.overlayUrlHeading}
                    className="flex-1 min-w-0 rounded-md bg-neutral-950 border border-neutral-700 px-2 py-2 text-sm font-mono text-neutral-200"
                  />
                  <button
                    type="button"
                    disabled={!overlayUrl}
                    onClick={copyOverlayUrl}
                    className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t.overlayCopy}
                  </button>
                </div>
                <div className="text-xs text-neutral-500 mt-2">
                  {t.overlayUrlHint}
                </div>
              </div>

              {/* Controls */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 px-4 py-4 mb-6">
                <div className="text-xs uppercase tracking-widest text-neutral-400 mb-3">
                  {t.overlaysHeading}
                </div>

                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <button
                    type="button"
                    disabled={isPending('on_air') || !canEdit}
                    onClick={() =>
                      applyPatch({ on_air: !state?.on_air }, 'on_air')
                    }
                    className={`px-4 py-2 rounded-lg text-sm font-bold ${
                      state?.on_air
                        ? 'bg-red-600 hover:bg-red-500'
                        : 'bg-emerald-600 hover:bg-emerald-500'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {state?.on_air ? t.goOffAir : t.goOnAir}
                  </button>

                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!state?.pip.enabled}
                      disabled={isPending('pip') || !canEdit}
                      onChange={(e) =>
                        applyPatch(
                          { pip: { enabled: e.target.checked } },
                          'pip'
                        )
                      }
                    />
                    {t.pipEnabled}
                  </label>
                </div>

                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    {t.lowerThirdLabel}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={lowerDraft}
                      onChange={(e) => setLowerDraft(e.target.value)}
                      disabled={!canEdit}
                      maxLength={500}
                      placeholder={t.lowerThirdPlaceholder}
                      className="flex-1 rounded-md bg-neutral-950 border border-neutral-700 px-2 py-2 text-sm disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={isPending('lower_third') || !canEdit}
                      onClick={() =>
                        applyPatch(
                          {
                            lower_third: lowerDraft.trim() || null,
                          },
                          'lower_third'
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium disabled:opacity-40"
                    >
                      {t.push}
                    </button>
                    <button
                      type="button"
                      disabled={isPending('lower_third') || !canEdit}
                      onClick={() => {
                        setLowerDraft('');
                        applyPatch({ lower_third: null }, 'lower_third');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium disabled:opacity-40"
                    >
                      {t.clear}
                    </button>
                  </div>
                  {state?.lower_third && (
                    <div className="mt-2 text-xs text-emerald-300">
                      {t.currentOnScreen}{' '}
                      <span className="italic">{state.lower_third}</span>
                    </div>
                  )}
                </div>
              </div>

              {!canEdit && (
                <div className="text-xs text-neutral-500">{t.readOnly}</div>
              )}
            </>
          )}
        </div>
      </div>
      {dialog}
    </>
  );
}

export default BroadcastLivePage;
