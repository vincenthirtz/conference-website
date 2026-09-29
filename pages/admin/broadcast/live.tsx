// pages/admin/broadcast/live.tsx
// Lot 7 — Live Broadcast Console.
// Single-pane view of the active event_run + current segment + casters +
// stream URL + overlay state. manage_broadcast edits on_air / lower_third / PiP.

import { useCallback, useEffect, useRef, useState } from 'react';
import { copyText } from '@/utils/clipboard';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useEventRunRealtime } from '@/hooks/useEventRunRealtime';
import { useVisiblePoll } from '@/hooks/useVisiblePoll';
import { useToast } from '@/components/Toast';
import LiveConsoleHeader from '@/components/admin/broadcast/LiveConsoleHeader';
import LiveConsoleHotkeys from '@/components/admin/broadcast/LiveConsoleHotkeys';
import { LIVE_SCENES, type LiveScene } from '@/utils/broadcast/liveScenes';
import AlertBanner from '@/components/admin/AlertBanner';
import TwitchStatusPanel from '@/components/admin/broadcast/TwitchStatusPanel';
import TcgDropHealthCard from '@/components/admin/broadcast/TcgDropHealthCard';
import TwitchDrivePanels from '@/components/admin/broadcast/TwitchDrivePanels';
import { liveUrls } from '@/features/admin/diffusion/liveClient';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useRouter } from 'next/router';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import Switch from '@/components/ui/Switch';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  LiveHud,
  LiveSection,
  SceneButton,
  liveInputClass,
} from '@/features/admin/diffusion/ui/LiveConsoleBlocks';
import type { StaffProps } from '@/types/admin';
import type { EventRun, EventSegment } from '@/types/events';
import nsAdminBroadcastLive from '@/lib/i18n/locales/admin-fr/adminBroadcastLive';
import nsAdminTwitchPredictions from '@/lib/i18n/locales/admin-fr/adminTwitchPredictions';

type Scene = LiveScene;
const SCENES = LIVE_SCENES;

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
  const t = useAdminT(nsAdminBroadcastLive);
  const tw = useAdminT(nsAdminTwitchPredictions);
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

  const canEdit = (staff.permissions ?? []).includes('manage_broadcast');
  const runId = data?.run?.id ?? null;

  // window.location.origin est indisponible côté SSR ; on le récupère après
  // hydratation pour éviter tout mismatch React.
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Retour du flux OAuth Twitch : live.tsx peut recevoir ?twitch=connected|error.
  // On affiche le toast correspondant puis on NETTOIE le query param (shallow,
  // sans re-fetch SSR) pour ne pas rejouer le toast au refresh.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dépendances choisies à dessein (exclusion reprise d’ESLint)
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
  }, [router.isReady, router.query.twitch]);

  // Numéro de lecture : une réponse de sondage partie AVANT un événement
  // temps réel (ou une lecture plus récente) arrive parfois après — elle
  // écrasait alors l'antenne fraîche. Seule la dernière lecture s'applique.
  const readSeq = useRef(0);
  const fetchState = useCallback(async () => {
    const seq = ++readSeq.current;
    try {
      const json = await adminFetchJson<LiveResponse>(liveUrls.broadcastState);
      if (seq !== readSeq.current) return;
      setError(null);
      setData(json);
      setLowerDraft((prev) =>
        prev === '' && json.state?.lower_third ? json.state.lower_third : prev
      );
    } catch (err) {
      if (seq !== readSeq.current) return;
      const e = err as AdminFetchError;
      setError(e.message || t.errorLoad);
    } finally {
      if (seq === readSeq.current) setLoading(false);
    }
  }, [adminFetchJson, t.errorLoad]);

  // Poll de secours (15 s, onglet visible), relecture au retour sur l'onglet.
  useVisiblePoll(fetchState, POLL_MS, { immediate: true });

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
          liveUrls.eventRun(runId)
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
      readSeq.current += 1; // toute lecture en vol est désormais périmée
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
        const json = await mutateJson<LiveResponse>(liveUrls.broadcastState, {
          method: 'POST',
          body: JSON.stringify(patch),
        });
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
      const json = await mutateJson<NextMatchResponse>(liveUrls.nextMatch, {
        method: 'POST',
      });
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
    if (await copyText(overlayUrl)) addToast(t.overlayCopied, 'success');
    else addToast(t.overlayCopyFailed, 'error');
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

      <div className="min-h-screen text-[var(--t1,#f4edf7)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-header pb-8">
          <LiveConsoleHeader
            heading={t.heading}
            subtitle={format(t.subtitle, { seconds: POLL_MS / 1000 })}
            realtimeConnected={realtimeConnected}
            connectedLabel={t.realtimeConnected}
            degradedLabel={t.realtimeDegraded}
            runId={data?.run?.id ?? null}
            directorLabel={t.director}
            refreshLabel={t.refresh}
            onRefresh={fetchState}
          />

          <AlertBanner message={error} variant="error" className="mb-4" />

          {/* Bloc Twitch, INDÉPENDANT du run et ordonné par urgence : la santé
              des drops d'abord (seule panne invisible ailleurs — Twitch coupe
              une souscription sans prévenir), puis le statut d'antenne, puis
              les deux panneaux d'écriture. Chacun porte son « pourquoi » dans
              son propre en-tête, et se masque seul quand il n'a rien à montrer
              ou que la permission manque — cette console admet le rôle
              `caster`, plus large que les routes qu'elle appelle. */}
          <TcgDropHealthCard />
          <TwitchStatusPanel />
          <TwitchDrivePanels />

          {loading && !data && (
            <div className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-4 py-10 text-center text-[var(--t3,#a39ba6)]">
              {t.loading}
            </div>
          )}

          {!loading && !data?.run && (
            <div className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-4 py-10 text-center text-sm text-[var(--t3,#a39ba6)]">
              {t.noRunPrefix} <span className="font-mono">live</span>{' '}
              {t.noRunSuffix}
            </div>
          )}

          {data?.run && (
            <>
              {/* HUD : on-air + segment + match, puis les casteuses */}
              <LiveHud
                onAir={!!state?.on_air}
                runSlug={data.run.slug}
                segment={data.currentSegment}
                match={data.match}
                casters={data.casters}
              />

              {/* Automatisation : régie auto + scènes + prochain match */}
              <LiveSection title={t.autoHeading}>
                {/* Auto-director switch */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="text-sm font-semibold">
                      {t.autoDirectorLabel}
                    </div>
                    <div className="text-xs text-[var(--t3,#a39ba6)] mt-0.5 max-w-xl">
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

                <LiveConsoleHotkeys
                  enabled={canEdit}
                  onAir={!!state?.on_air}
                  pipEnabled={!!state?.pip.enabled}
                  onPatch={applyPatch}
                />
                {/* Scene selector */}
                <div className="mb-4">
                  <div
                    className="text-xs text-[var(--t3,#a39ba6)] mb-2"
                    id="scene-selector-label"
                  >
                    {t.sceneLabel}
                  </div>
                  <div
                    role="group"
                    aria-labelledby="scene-selector-label"
                    className="flex flex-wrap gap-2"
                  >
                    {SCENES.map((s) => (
                      <SceneButton
                        key={s}
                        active={currentScene === s}
                        disabled={isPending(`scene:${s}`) || !canEdit}
                        onClick={() => applyPatch({ scene: s }, `scene:${s}`)}
                      >
                        {sceneLabels[s]}
                      </SceneButton>
                    ))}
                  </div>
                  <div className="text-xs text-[var(--t4,#807984)] mt-2">
                    {t.sceneHint}
                  </div>
                </div>

                {/* Prochain match */}
                <div className="flex flex-wrap items-center gap-3">
                  <AdminButton
                    variant="secondary"
                    disabled={advancing || !canEdit}
                    onClick={goNextMatch}
                  >
                    {advancing && (
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    )}
                    {advancing ? t.nextMatchLoading : t.nextMatch}
                  </AdminButton>
                  <span className="text-xs text-[var(--t4,#807984)]">
                    {t.nextMatchHint}
                  </span>
                </div>
              </LiveSection>

              {/* Overlay OBS : URL source navigateur */}
              <LiveSection title={t.overlayUrlHeading}>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={overlayUrl}
                    aria-label={t.overlayUrlHeading}
                    className={`${liveInputClass} font-mono`}
                  />
                  <AdminButton
                    size="sm"
                    disabled={!overlayUrl}
                    onClick={copyOverlayUrl}
                  >
                    {t.overlayCopy}
                  </AdminButton>
                </div>
                <div className="text-xs text-[var(--t4,#807984)] mt-2">
                  {t.overlayUrlHint}
                </div>
              </LiveSection>

              {/* Controls */}
              <LiveSection title={t.overlaysHeading}>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  {/* Prendre l'antenne = l'action verte ; la rendre = danger. */}
                  <AdminButton
                    variant={state?.on_air ? 'danger' : 'primary'}
                    disabled={isPending('on_air') || !canEdit}
                    onClick={() =>
                      applyPatch({ on_air: !state?.on_air }, 'on_air')
                    }
                  >
                    {state?.on_air ? t.goOffAir : t.goOnAir}
                  </AdminButton>

                  <label className="inline-flex items-center gap-2 text-sm text-[var(--t2,#c7bfca)]">
                    <input
                      type="checkbox"
                      className="accent-[var(--or,#b467d1)]"
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
                  <label className="block text-xs text-[var(--t3,#a39ba6)] mb-1">
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
                      className={liveInputClass}
                    />
                    <AdminButton
                      size="sm"
                      disabled={isPending('lower_third') || !canEdit}
                      onClick={() =>
                        applyPatch(
                          {
                            lower_third: lowerDraft.trim() || null,
                          },
                          'lower_third'
                        )
                      }
                    >
                      {t.push}
                    </AdminButton>
                    <AdminButton
                      size="sm"
                      disabled={isPending('lower_third') || !canEdit}
                      onClick={() => {
                        setLowerDraft('');
                        applyPatch({ lower_third: null }, 'lower_third');
                      }}
                    >
                      {t.clear}
                    </AdminButton>
                  </div>
                  {state?.lower_third && (
                    <div className="mt-2 text-xs text-[var(--lf-200,#b3e7a3)]">
                      {t.currentOnScreen}{' '}
                      <span className="italic">{state.lower_third}</span>
                    </div>
                  )}
                </div>
              </LiveSection>

              {!canEdit && (
                <div className="text-xs text-[var(--t4,#807984)]">
                  {t.readOnly}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {dialog}
    </>
  );
}

// Cache de requêtes (lot L10) : sert aux seules cartes sans temps réel
// (chaînes Twitch, santé du drop TCG). Le pupitre, lui, garde son état local.
export default withAdminQuery(BroadcastLivePage);
