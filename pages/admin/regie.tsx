// pages/admin/regie.tsx
//
// Feature: Run-of-show — Cockpit Régie, version intégrée à la chrome admin.
//
// Cette page reprend À L'IDENTIQUE la logique du cockpit caster historique
// (ex-`/caster/cockpit`) : session staff (useCasterSession), realtime run +
// segments (useEventRunRealtime), stream de cues (useCueStream), heartbeat
// (useCockpitHeartbeat), wake-lock, déblocage audio, bandeau « session perdue »,
// indicateur de connexion, LiveSegmentBlock, CueBanner/CueFeed, checklist,
// hotkeys, briefing, assignations à venir, PushOptIn, modale cue urgente, tick
// et polling de secours. AUCUNE de ces features n'est régressée.
//
// Différences avec le cockpit plein écran :
//   - Plus de layout personnel plein écran ni de CockpitHeader dédié : la page
//     s'intègre dans la chrome admin (préfixe `/admin` dans `_app.tsx`). On
//     rend un en-tête de page admin sobre (titre « Régie » + indicateur de
//     connexion + Director + déconnexion) et un fond neutre cohérent avec les
//     autres pages `/admin` (cf. `pages/admin/broadcast/live.tsx`).
//   - Un panneau « Nouveau run » (admin/owner uniquement) permet de créer puis
//     démarrer un run quand aucun run n'est live.
//
// Gate SSR : tout staff, `withStaffPage('caster')`. Démarrer, clore et piloter
// un run suivent le DROIT `manage_broadcast` (celui des routes), pas le rôle.

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useRouter } from 'next/router';

import { useToast } from '@/components/Toast';
import { useCasterSession } from '@/hooks/useCasterSession';
import { useEventRunRealtime } from '@/hooks/useEventRunRealtime';
import { useVisiblePoll } from '@/hooks/useVisiblePoll';
import { useCockpitHeartbeat } from '@/hooks/useCockpitHeartbeat';
import { useCueStream } from '@/hooks/useCueStream';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import type { AdminFetchError } from '@/hooks/useAdminFetch';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { logger } from '@/utils/logger';
import { unlockAudio } from '@/utils/playChime';
import type { EventRun, EventSegment } from '@/types/events';
import type { StaffProps } from '@/types/admin';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { computeRunSchedule } from '@/utils/eventSchedule';
import { useT, format } from '@/lib/i18n/useT';
import { withStaffPage } from '@/utils/staff';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

import LiveSegmentBlock from '@/components/Caster/LiveSegmentBlock';
import NewRunPanel from '@/components/Caster/NewRunPanel';
import StartPreparedPanel from '@/features/admin/diffusion/StartPreparedPanel';
import ObsSegmentBridge from '@/components/Caster/ObsSegmentBridge';
import CockpitChecklist from '@/components/Caster/CockpitChecklist';
import CockpitHotkeys from '@/components/Caster/CockpitHotkeys';
import BriefingPanel from '@/components/Caster/BriefingPanel';
import UpcomingAssignments from '@/components/Caster/UpcomingAssignments';
import CueBanner from '@/components/Caster/CueBanner';
import CueFeed from '@/components/Caster/CueFeed';
import UrgentCueModal from '@/components/Caster/UrgentCueModal';
import RegieHeader, { type Connection } from '@/components/Caster/RegieHeader';
import nsAdminRegie from '@/lib/i18n/locales/fr/adminRegie';
import nsCasterCockpit from '@/lib/i18n/locales/fr/casterCockpit';
import { liveUrls } from '@/features/admin/diffusion/liveClient';

// PushOptIn est dynamic (no-SSR) : il depend de Notification / serviceWorker.
const PushOptIn = dynamic(() => import('@/components/shared/PushOptIn'), {
  ssr: false,
});

const POLL_INTERVAL_MS = 30_000;
const BRIEFING_THRESHOLD_MS = 30 * 60_000; // 30 min

type CurrentRunResponse = {
  run: EventRun | null;
  segments: EventSegment[];
};

/**
 * Panneau « Nouveau run » — admin/owner uniquement, affiché quand aucun run
 * n'est live. Crée un event_run (draft) via POST /api/admin/events puis le
 * démarre via POST /api/admin/events/{id}/start (rôle 'admin'). Tournoi
 * optionnel : un run peut être 100 % libre, l'endpoint ne demande pas de lien.
 */

function RegiePage({ staff }: StaffProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const session = useCasterSession();
  const t = useT(nsCasterCockpit);
  const tr = useT(nsAdminRegie);

  // Le panneau « Nouveau run » exige l'endpoint /start (rôle 'admin') : réservé
  // aux admin/owner. Un caster ne le voit pas. L'endpoint /end est lui aussi
  // 'admin' → on réutilise le même gate pour « Terminer le run ».
  // Le droit des routes start/end, pas le rôle : une casteuse à qui l'on a
  // accordé `manage_broadcast` pilote, un admin sans lui ne verrait rien.
  const canStartRun = (staff.permissions ?? []).includes('manage_broadcast');

  // Confirmation + mutation idempotente pour « Terminer le run ».
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { mutateJson } = useIdempotentMutation();
  const [endingRun, setEndingRun] = useState(false);
  // Busy ciblé pour la barre d'actions segment (end / startNext), afin de
  // désactiver les deux boutons pendant qu'une transition est en cours.
  const [segAction, setSegAction] = useState<'end' | 'startNext' | null>(null);

  // Empêche l'écran de s'éteindre tant que l'opérateur est sur la régie.
  const { supported: wakeLockSupported } = useWakeLock(true);

  // Connectivite : navigator online/offline. Combine plus bas avec l'etat du
  // canal realtime et du heartbeat pour la pastille de statut.
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (typeof navigator === 'undefined') return undefined;
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const [run, setRun] = useState<EventRun | null>(null);
  const [segments, setSegments] = useState<EventSegment[]>([]);
  const [loadingRun, setLoadingRun] = useState(true);
  const [errorRun, setErrorRun] = useState<string | null>(null);
  // Session perdue en plein live : le fetch renvoie 401/403 mais on garde les
  // dernieres donnees a l ecran + un bandeau "reconnexion" pendant un refresh.
  const [sessionLost, setSessionLost] = useState(false);

  // Debloque le contexte audio Web Audio des la premiere interaction.
  useEffect(() => {
    let done = false;
    const unlock = () => {
      if (done) return;
      done = true;
      unlockAudio();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // 1. Redirection si pas de session (apres premier check).
  useEffect(() => {
    if (session.loading) return;
    if (session.error === 'unauthenticated') {
      router.replace('/admin/login?next=/admin/regie');
    }
  }, [router, session.error, session.loading]);

  // 2. Fetch run courant.
  const { accessToken: sessionToken, refresh: refreshSession } = session;
  const fetchRun = useCallback(async () => {
    if (!sessionToken) {
      setLoadingRun(false);
      return;
    }
    try {
      const res = await fetch('/api/caster/runs/current', {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (res.status === 401 || res.status === 403) {
        setSessionLost(true);
        setErrorRun(null);
        void refreshSession();
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          body?.error || format(t.errorWithStatus, { status: res.status })
        );
      }
      const json = (await res.json()) as CurrentRunResponse;
      setRun(json.run);
      setSegments(json.segments ?? []);
      setErrorRun(null);
      setSessionLost(false);
    } catch (err) {
      logger.error('[regie] fetchRun error', err);
      setErrorRun((err as Error)?.message || t.loadError);
    } finally {
      setLoadingRun(false);
    }
  }, [sessionToken, refreshSession, t]);

  useEffect(() => {
    if (session.loading) return;
    if (session.error) return;
    setLoadingRun(true);
    fetchRun();
  }, [fetchRun, session.error, session.loading]);

  // 3. Polling de secours, onglet visible, et relecture au retour.
  useVisiblePoll(fetchRun, POLL_INTERVAL_MS);

  // 4. Realtime : merge des changements segments + run (callbacks memoises).
  const handleSegmentChange = useCallback(
    (
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      partial: Partial<EventSegment> & { id?: string }
    ) => {
      if (!partial.id) return;
      if (eventType === 'DELETE') {
        setSegments((prev) => prev.filter((s) => s.id !== partial.id));
        return;
      }
      setSegments((prev) => {
        const idx = prev.findIndex((s) => s.id === partial.id);
        if (idx === -1) {
          const merged = [...prev, partial as EventSegment];
          merged.sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0));
          return merged;
        }
        const next = [...prev];
        next[idx] = { ...next[idx], ...(partial as EventSegment) };
        return next;
      });
    },
    []
  );

  const handleRunChange = useCallback(
    (partial: Partial<EventRun> & { id?: string }) => {
      setRun((prev) => {
        if (!prev) return (partial as EventRun) ?? null;
        return { ...prev, ...(partial as EventRun) };
      });
    },
    []
  );

  const { connected: realtimeConnected } = useEventRunRealtime({
    enabled: !!run?.id,
    runId: run?.id ?? null,
    onSegmentChange: handleSegmentChange,
    onRunChange: handleRunChange,
  });

  // 5. Derived state.
  const currentSegment = useMemo(() => {
    return segments.find((s) => s.status === 'live') ?? null;
  }, [segments]);

  const nextSegment = useMemo(() => {
    return (
      segments
        .filter((s) => s.status === 'upcoming')
        .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))[0] ?? null
    );
  }, [segments]);

  const schedule = useMemo(() => {
    if (!run) return null;
    return computeRunSchedule(run, segments, 0);
  }, [run, segments]);

  const liveRunId = run?.status === 'live' ? run.id : null;

  const { healthy } = useCockpitHeartbeat({
    runId: liveRunId,
    accessToken: session.accessToken,
  });

  const connection = useMemo<Connection>(() => {
    if (!online) return { level: 'offline', seen: false };
    const realtimeOk = !run?.id || realtimeConnected;
    if (!realtimeOk || healthy === false) {
      return { level: 'reconnecting', seen: false };
    }
    return { level: 'online', seen: healthy === true };
  }, [online, run?.id, realtimeConnected, healthy]);

  const cueStream = useCueStream({
    runId: liveRunId,
    accessToken: session.accessToken,
  });

  const [seenLocally, setSeenLocally] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setSeenLocally(new Set());
  }, [liveRunId]);
  const markSeen = useCallback((cueId: string) => {
    setSeenLocally((prev) => {
      if (prev.has(cueId)) return prev;
      const next = new Set(prev);
      next.add(cueId);
      return next;
    });
  }, []);

  const briefingMatchId = useMemo(() => {
    const candidate = currentSegment ?? nextSegment;
    if (!candidate) return null;
    if (candidate.type !== 'match') return null;
    if (!candidate.match_id) return null;
    if (candidate.status === 'live') return candidate.match_id;
    if (candidate.started_at) {
      const ts = Date.parse(candidate.started_at);
      if (Number.isFinite(ts) && ts - Date.now() < BRIEFING_THRESHOLD_MS) {
        return candidate.match_id;
      }
      return null;
    }
    if (candidate === nextSegment && run?.status === 'live') {
      return candidate.match_id;
    }
    return null;
  }, [currentSegment, nextSegment, run?.status]);

  const handleSignOut = async () => {
    await session.signOut();
    addToast(t.signedOut, 'info');
    router.replace('/admin/login');
  };

  // Terminer le run live : confirmation danger → POST /end (live→done, segments
  // non-done → done) → toast + refetch (l'écran repasse à « pas de run »).
  const handleEndRun = useCallback(async () => {
    if (!liveRunId || endingRun) return;
    const ok = await confirm({
      title: tr.endRunConfirmTitle,
      subtitle: tr.endRunConfirmBody,
      variant: 'danger',
      confirmLabel: tr.endRunConfirmCta,
    });
    if (!ok) return;
    setEndingRun(true);
    try {
      await mutateJson(liveUrls.endRun(liveRunId), {
        method: 'POST',
      });
      addToast(tr.endRunSuccess, 'success');
      await fetchRun();
    } catch (err) {
      const e2 = err as AdminFetchError;
      const payloadError =
        typeof e2.payload === 'object' && e2.payload && 'error' in e2.payload
          ? String((e2.payload as { error: string }).error)
          : null;
      addToast(payloadError || e2.message || tr.endRunError, 'error');
    } finally {
      setEndingRun(false);
    }
  }, [liveRunId, endingRun, confirm, tr, mutateJson, addToast, fetchRun]);

  // Terminer le segment en cours : confirmation légère (warning, non bloquante)
  // → POST .../{seg}/end → toast + refetch. Le realtime recale aussi l'écran.
  const handleEndSegment = useCallback(async () => {
    if (!liveRunId || !currentSegment || segAction) return;
    const ok = await confirm({
      title: tr.endSegmentConfirmTitle,
      subtitle: tr.endSegmentConfirmBody,
      variant: 'warning',
      confirmLabel: tr.endSegmentConfirmCta,
    });
    if (!ok) return;
    setSegAction('end');
    try {
      await mutateJson(liveUrls.endSegment(liveRunId, currentSegment.id), {
        method: 'POST',
      });
      addToast(tr.endSegmentSuccess, 'success');
      await fetchRun();
    } catch (err) {
      const e2 = err as AdminFetchError;
      const payloadError =
        typeof e2.payload === 'object' && e2.payload && 'error' in e2.payload
          ? String((e2.payload as { error: string }).error)
          : null;
      addToast(payloadError || e2.message || tr.endSegmentError, 'error');
    } finally {
      setSegAction(null);
    }
  }, [
    liveRunId,
    currentSegment,
    segAction,
    confirm,
    tr,
    mutateJson,
    addToast,
    fetchRun,
  ]);

  // Démarrer le prochain segment : démarrer TERMINE automatiquement le segment
  // live courant (invariant single-live côté transitionToSegment), donc un
  // simple POST .../{next}/start suffit — pas besoin d'enchaîner un end.
  const handleStartNext = useCallback(async () => {
    if (!liveRunId || !nextSegment || segAction) return;
    setSegAction('startNext');
    try {
      await mutateJson(liveUrls.startSegment(liveRunId, nextSegment.id), {
        method: 'POST',
      });
      addToast(tr.startNextSuccess, 'success');
      await fetchRun();
    } catch (err) {
      const e2 = err as AdminFetchError;
      const payloadError =
        typeof e2.payload === 'object' && e2.payload && 'error' in e2.payload
          ? String((e2.payload as { error: string }).error)
          : null;
      addToast(payloadError || e2.message || tr.startNextError, 'error');
    } finally {
      setSegAction(null);
    }
  }, [liveRunId, nextSegment, segAction, tr, mutateJson, addToast, fetchRun]);

  // ---- Render ----

  // En-tête partagé par tous les états : onglets Diffusion, titre, actions.
  const header = (
    <RegieHeader
      connection={connection}
      liveRunId={liveRunId}
      canEndRun={Boolean(liveRunId && canStartRun)}
      endingRun={endingRun}
      onEndRun={handleEndRun}
      onSignOut={handleSignOut}
    />
  );

  // Conteneur TOUJOURS large (6xl, comme les autres écrans de la diffusion) :
  // il changeait de largeur au démarrage d'un run, et l'en-tête et les onglets
  // sautaient avec lui. C'est le CONTENU qui reste étroit (2xl) hors direct —
  // une colonne suffit à un formulaire —, et passe en deux colonnes en direct.
  const shell = (children: React.ReactNode) => (
    <>
      <Head>
        <title>{tr.docTitle}</title>
      </Head>
      <div className="min-h-screen text-[var(--t1,#f4edf7)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-header pb-12">
          {children}
        </div>
      </div>
    </>
  );

  if (session.loading) {
    return shell(
      <div className="max-w-2xl rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-10 text-center text-sm text-[var(--t3,#a39ba6)] flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-[var(--s3,#2f2732)] border-t-[var(--or,#b467d1)] rounded-full animate-spin" />
        {t.connecting}
      </div>
    );
  }

  if (session.error === 'not_caster') {
    return shell(
      <>
        {header}
        <div className="max-w-2xl rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6 text-center space-y-4">
          <h2 className="text-[19px]">{t.accessInactiveTitle}</h2>
          <p className="text-sm text-[var(--t2,#c7bfca)]">
            {t.accessInactiveBody}
          </p>
          <AdminButton size="sm" onClick={() => session.signOut()}>
            {t.signOut}
          </AdminButton>
        </div>
      </>
    );
  }

  if (session.error === 'network' || !session.caster) {
    return shell(
      <>
        {header}
        <div className="max-w-2xl rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6 text-center space-y-4">
          <h2 className="text-[19px]">{t.connectionErrorTitle}</h2>
          <p className="text-sm text-[var(--t2,#c7bfca)]">
            {t.connectionErrorBody}
          </p>
          <AdminButton
            variant="primary"
            size="sm"
            onClick={() => session.refresh()}
          >
            {t.retry}
          </AdminButton>
        </div>
      </>
    );
  }

  return shell(
    <>
      {header}

      <div className={liveRunId ? 'space-y-4' : 'max-w-2xl space-y-4'}>
        {/* Rappel discret : le navigateur ne peut pas garder l'ecran eveille. */}
        {!wakeLockSupported && (
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--t4,#807984)] px-1">
            <svg
              className="w-3.5 h-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
            {t.wakeLockUnsupported}
          </p>
        )}

        {/* Bandeau non bloquant : session perdue, reconnexion en cours. */}
        {sessionLost && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-[var(--r-card,14px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.1)] p-3 text-xs text-[#ffd9a3] flex items-center gap-2"
          >
            <span
              aria-hidden="true"
              className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0"
            />
            {t.sessionExpired}
          </div>
        )}

        {loadingRun ? (
          <div className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6 text-center text-xs text-[var(--t3,#a39ba6)]">
            {t.loadingRun}
          </div>
        ) : errorRun ? (
          <div className="rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] p-4 text-xs text-[#ffc2c2]">
            {errorRun}
          </div>
        ) : null}

        {/* Aucun run live (admin/owner) : lancer un run préparé (draft) OU en
            créer un à blanc. Le panneau « préparé » ne s'affiche que s'il existe
            au moins un draft. */}
        {!loadingRun && !liveRunId && canStartRun && (
          <>
            <StartPreparedPanel onStarted={fetchRun} />
            <NewRunPanel onStarted={fetchRun} />
          </>
        )}

        {/* Banniere cues : sticky, visible si un cue recent n est pas vu.
            Hors grille : elle doit barrer toute la largeur. */}
        <CueBanner cues={cueStream.cues} seenLocally={seenLocally} />

        {/* Deux colonnes dès lg quand un run est live : à gauche ce qu'on
            conduit (timer, transitions, cues, checklist), à droite ce qu'on
            consulte (briefing, raccourcis, assignations). Une seule colonne
            en dessous de lg et hors direct — `contents` neutralise la grille
            sans dupliquer le sous-arbre. */}
        <div
          className={
            liveRunId
              ? 'grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-4 items-start'
              : 'contents'
          }
        >
          <div className={liveRunId ? 'space-y-4 min-w-0' : 'contents'}>
            {/* Bloc segment en cours / prochain */}
            <LiveSegmentBlock
              run={run}
              currentSegment={currentSegment}
              nextSegment={nextSegment}
              schedule={schedule}
            />

            {/* Barre d'actions segment (admin/owner uniquement) : piloter les
            transitions depuis la régie sans passer par le Director. Les
            endpoints segments exigent le rôle 'admin' → accessibles à
            admin/owner (jamais à un caster). */}
            {liveRunId && canStartRun && (currentSegment || nextSegment) && (
              <div
                className="flex flex-wrap items-center gap-2"
                data-testid="regie-segment-actions"
              >
                {currentSegment && (
                  <AdminButton
                    size="sm"
                    onClick={handleEndSegment}
                    disabled={!!segAction}
                    data-testid="regie-end-segment"
                  >
                    {segAction === 'end' && (
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    )}
                    {segAction === 'end' ? tr.endingSegment : tr.endSegment}
                  </AdminButton>
                )}
                {nextSegment && (
                  <AdminButton
                    variant="secondary"
                    size="sm"
                    onClick={handleStartNext}
                    disabled={!!segAction}
                    data-testid="regie-start-next"
                  >
                    {segAction === 'startNext' && (
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    )}
                    {segAction === 'startNext' ? tr.startingNext : tr.startNext}
                  </AdminButton>
                )}
              </div>
            )}

            {/* Feed cues Director (au-dessus de la checklist : actionnable). */}
            {liveRunId && (
              <CueFeed
                cues={cueStream.cues}
                onAck={cueStream.ack}
                seenLocally={seenLocally}
                onMarkSeen={markSeen}
              />
            )}

            {/* Pont OBS : bascule la scène liée au démarrage du segment. */}
            {liveRunId && (
              <ObsSegmentBridge
                runId={liveRunId}
                currentSegment={currentSegment ?? null}
                nextSegment={nextSegment ?? null}
                canEdit={canStartRun}
                onSegmentUpdated={(updated) => {
                  setSegments((prev) => {
                    const idx = prev.findIndex((sg) => sg.id === updated.id);
                    if (idx === -1) return prev;
                    const next = [...prev];
                    next[idx] = updated;
                    return next;
                  });
                }}
              />
            )}

            {/* Checklist du segment courant (ou prochain si pas de courant) */}
            {(() => {
              const segForChecklist = currentSegment ?? nextSegment;
              if (!segForChecklist) return null;
              return (
                <CockpitChecklist
                  segment={segForChecklist}
                  accessToken={session.accessToken}
                  onUpdated={(updated) => {
                    setSegments((prev) => {
                      const idx = prev.findIndex((s) => s.id === updated.id);
                      if (idx === -1) return prev;
                      const next = [...prev];
                      next[idx] = updated;
                      return next;
                    });
                  }}
                />
              );
            })()}
          </div>

          <div className={liveRunId ? 'space-y-4 min-w-0' : 'contents'}>
            {/* Briefing match si pertinent */}
            {briefingMatchId && (
              <BriefingPanel
                matchId={briefingMatchId}
                accessToken={session.accessToken}
              />
            )}

            {/* Hotkeys (actives uniquement si segment en cours) */}
            <CockpitHotkeys
              segmentId={currentSegment?.id ?? nextSegment?.id ?? ''}
              accessToken={session.accessToken}
              disabled={!currentSegment}
            />

            {/* Prochaines assignations */}
            <UpcomingAssignments assignments={session.upcomingAssignments} />

            {/* PushOptIn (audience caster) — carte autonome */}
            <PushOptIn
              audience="caster"
              variant="card"
              loginPath="/admin/login"
            />
          </div>
        </div>
      </div>

      {/* Modal bloquante pour cue urgent non ack. FIFO si plusieurs. */}
      {cueStream.pendingUrgent && (
        <UrgentCueModal
          cue={cueStream.pendingUrgent}
          onAck={cueStream.ack}
          onDeferAck={cueStream.deferAck}
        />
      )}

      {/* Confirmation « Terminer le run ». */}
      {confirmDialog}
    </>
  );
}

const seo: SeoProps = {
  title: {
    fr: 'Régie',
    en: 'Control room',
  },
  noindex: true,
};

RegiePage.seo = seo;

export default RegiePage;

/**
 * Gate SSR : tout staff (caster/admin/owner). Le gate fait main qui excluait
 * `manager` n'avait plus de raison d'être depuis le retrait de ce rôle, et il
 * privait la page des permissions effectives (d'où des boutons décidés sur le
 * rôle). `withStaffPage` renvoie aussi `next=` vers la page demandée.
 */
export const getServerSideProps = withStaffPage('caster');
