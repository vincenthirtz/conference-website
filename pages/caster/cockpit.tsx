// pages/caster/cockpit.tsx
//
// Feature: Run-of-show — Lot 4.
// PWA Caster Cockpit. Mobile-first.
//
// Source de verite donnees :
//   - /api/caster/me : profil + prochaines assignations (24h)
//   - /api/caster/runs/current : event_run live + segments (avec checklist)
//   - /api/caster/briefing/[matchId] : briefing match (compos + H2H + news)
//
// Realtime : useEventRunRealtime (Lot 3) merge les changements event_runs +
// event_segments du run courant. Polling de secours toutes les 30s pour
// resilience si le canal saute (idem Director).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useToast } from '@/components/Toast';
import { useCasterSession } from '@/hooks/useCasterSession';
import { useEventRunRealtime } from '@/hooks/useEventRunRealtime';
import { useCockpitHeartbeat } from '@/hooks/useCockpitHeartbeat';
import { useCueStream } from '@/hooks/useCueStream';
import { useWakeLock } from '@/hooks/useWakeLock';
import { logger } from '@/utils/logger';
import type { EventRun, EventSegment } from '@/types/events';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { computeRunSchedule } from '@/utils/eventSchedule';

import CockpitHeader from '@/components/Caster/CockpitHeader';
import LiveSegmentBlock from '@/components/Caster/LiveSegmentBlock';
import CockpitChecklist from '@/components/Caster/CockpitChecklist';
import CockpitHotkeys from '@/components/Caster/CockpitHotkeys';
import BriefingPanel from '@/components/Caster/BriefingPanel';
import UpcomingAssignments from '@/components/Caster/UpcomingAssignments';
import CueBanner from '@/components/Caster/CueBanner';
import CueFeed from '@/components/Caster/CueFeed';
import UrgentCueModal from '@/components/Caster/UrgentCueModal';

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

function CockpitPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const session = useCasterSession();

  // Empêche l'écran de s'éteindre tant que le caster est sur le cockpit
  // (un BO3 peut durer 40 min sans frappe clavier — la mise en veille
  // automatique masquait l'overlay broadcast côté studio). Best-effort :
  // no-op sur Firefox / Safari < 16.4 / HTTP, ne casse rien.
  useWakeLock(true);

  const [run, setRun] = useState<EventRun | null>(null);
  const [segments, setSegments] = useState<EventSegment[]>([]);
  const [loadingRun, setLoadingRun] = useState(true);
  const [errorRun, setErrorRun] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1. Redirection si pas de session caster (apres premier check).
  useEffect(() => {
    if (session.loading) return;
    if (session.error === 'unauthenticated') {
      router.replace('/caster/login');
    }
  }, [router, session.error, session.loading]);

  // 2. Fetch run courant.
  const fetchRun = useCallback(async () => {
    if (!session.accessToken) {
      setLoadingRun(false);
      return;
    }
    try {
      const res = await fetch('/api/caster/runs/current', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (res.status === 401 || res.status === 403) {
        // session a saute — useCasterSession va trigger un re-check via
        // onAuthStateChange.
        setErrorRun(null);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `Erreur ${res.status}`);
      }
      const json = (await res.json()) as CurrentRunResponse;
      setRun(json.run);
      setSegments(json.segments ?? []);
      setErrorRun(null);
    } catch (err) {
      logger.error('[cockpit] fetchRun error', err);
      setErrorRun((err as Error)?.message || 'Erreur de chargement.');
    } finally {
      setLoadingRun(false);
    }
  }, [session.accessToken]);

  useEffect(() => {
    if (session.loading) return;
    if (session.error) return;
    setLoadingRun(true);
    fetchRun();
  }, [fetchRun, session.error, session.loading]);

  // 3. Polling de secours (visibility-gated).
  useEffect(() => {
    function tick() {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      )
        return;
      fetchRun();
    }
    pollRef.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchRun]);

  // 4. Realtime : merge des changements segments + run.
  useEventRunRealtime({
    enabled: !!run?.id,
    runId: run?.id ?? null,
    onSegmentChange: (eventType, partial) => {
      if (!partial.id) return;
      if (eventType === 'DELETE') {
        setSegments((prev) => prev.filter((s) => s.id !== partial.id));
        return;
      }
      setSegments((prev) => {
        const idx = prev.findIndex((s) => s.id === partial.id);
        if (idx === -1) {
          // INSERT : append puis sort by ord.
          const merged = [...prev, partial as EventSegment];
          merged.sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0));
          return merged;
        }
        // UPDATE : merge la row.
        const next = [...prev];
        next[idx] = { ...next[idx], ...(partial as EventSegment) };
        return next;
      });
    },
    onRunChange: (partial) => {
      setRun((prev) => {
        if (!prev) return (partial as EventRun) ?? null;
        return { ...prev, ...(partial as EventRun) };
      });
    },
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

  // Tick 1s pour les valeurs derivees du temps (countdown). Visibility-gated
  // pour epargner la batterie mobile : on n'avance pas quand l'onglet est
  // cache, on re-snap a Date.now() au retour visible.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      setNowMs(Date.now());
      timer = setInterval(() => setNowMs(Date.now()), 1000);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Planning calcule (meme source de verite que le Director). Recalcul a
  // chaque tick 1s pour que liveOverrunSec et les plannedStartAt restent
  // frais cote countdown. Le cout est negligeable (pure function sur N
  // segments, N petit).
  const schedule = useMemo(() => {
    if (!run) return null;
    return computeRunSchedule(run, segments, nowMs);
  }, [run, segments, nowMs]);

  // Run live attache (utilise pour cues + heartbeat). Si le run passe done,
  // on coupe le stream cue mais on continue le heartbeat avec runId=null
  // (presence "online sans run").
  const liveRunId = run?.status === 'live' ? run.id : null;

  // Heartbeat 20s (visibility-gated, body { event_run_id }).
  useCockpitHeartbeat({
    runId: liveRunId,
    accessToken: session.accessToken,
  });

  // Stream cues (polling 3s, visibility-gated). Pas de polling si pas de
  // run live (l API repond 409 si run!=live, useCueStream s arrete de seed).
  const cueStream = useCueStream({
    runId: liveRunId,
    accessToken: session.accessToken,
  });

  // Set local des cues info/warn "vus" par le caster (pas trace en DB pour
  // limiter le bruit). Reset quand le runId change.
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
    // Si segment en upcoming et un started_at planifie est proche (<30 min)
    // on affiche. En l absence de started_at planifie (event_run live mais
    // segments non temporises), on prend tout segment "upcoming" en tete de
    // file (next).
    if (candidate.started_at) {
      const t = Date.parse(candidate.started_at);
      if (Number.isFinite(t) && t - Date.now() < BRIEFING_THRESHOLD_MS) {
        return candidate.match_id;
      }
      return null;
    }
    // Pas de started_at : si c est le prochain en file ET qu un run est live,
    // on affiche quand meme — le caster a probablement besoin du briefing.
    if (candidate === nextSegment && run?.status === 'live') {
      return candidate.match_id;
    }
    return null;
  }, [currentSegment, nextSegment, run?.status]);

  // ---- Render ----

  if (session.loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-neutral-700 border-t-purple-400 rounded-full animate-spin mx-auto" />
          <div className="text-sm text-gray-400">Connexion au cockpit...</div>
        </div>
      </div>
    );
  }

  if (session.error === 'not_caster') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">Acces caster non actif</h1>
          <p className="text-sm text-gray-300">
            Ton compte est authentifie, mais aucune fiche caster active n y est
            liee dans ce tenant. Contacte un admin pour activer ton acces.
          </p>
          <button
            type="button"
            onClick={() => session.signOut()}
            className="px-4 py-2 rounded-md border border-white/15 text-sm hover:bg-white/10 transition"
          >
            Se deconnecter
          </button>
        </div>
      </div>
    );
  }

  if (session.error === 'network' || !session.caster) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">Erreur de connexion</h1>
          <p className="text-sm text-gray-300">
            Impossible de charger ton profil caster. Verifie ta connexion
            internet et reessaie.
          </p>
          <button
            type="button"
            onClick={() => session.refresh()}
            className="px-4 py-2 rounded-md bg-purple-500 hover:bg-purple-400 text-sm font-semibold transition"
          >
            Reessayer
          </button>
        </div>
      </div>
    );
  }

  const caster = session.caster;

  const handleSignOut = async () => {
    await session.signOut();
    addToast('Tu es deconnecte.', 'info');
    router.replace('/caster/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#080510] to-black text-white">
      <Head>
        <title>Cockpit caster | OW Women&apos;s Cup</title>
      </Head>
      <CockpitHeader caster={caster} onSignOut={handleSignOut} />

      <div className="px-4 pt-4 pb-12 max-w-2xl mx-auto space-y-4">
        {loadingRun ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-xs text-gray-400">
            Chargement de la run en cours...
          </div>
        ) : errorRun ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-900/15 p-4 text-xs text-red-100">
            {errorRun}
          </div>
        ) : null}

        {/* Banniere cues : sticky, visible si un cue recent n est pas vu. */}
        <CueBanner cues={cueStream.cues} seenLocally={seenLocally} />

        {/* Bloc segment en cours / prochain */}
        <LiveSegmentBlock
          run={run}
          currentSegment={currentSegment}
          nextSegment={nextSegment}
          schedule={schedule}
        />

        {/* Briefing match si pertinent */}
        {briefingMatchId && (
          <BriefingPanel
            matchId={briefingMatchId}
            accessToken={session.accessToken}
          />
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

        {/* Hotkeys (actives uniquement si segment en cours) */}
        <CockpitHotkeys
          segmentId={currentSegment?.id ?? nextSegment?.id ?? ''}
          accessToken={session.accessToken}
          disabled={!currentSegment}
        />

        {/* Prochaines assignations */}
        <UpcomingAssignments assignments={session.upcomingAssignments} />

        {/* PushOptIn (audience caster) — carte autonome */}
        <PushOptIn audience="caster" variant="card" loginPath="/caster/login" />
      </div>

      {/* Modal bloquante pour cue urgent non ack. FIFO si plusieurs. */}
      {cueStream.pendingUrgent && (
        <UrgentCueModal
          cue={cueStream.pendingUrgent}
          onAck={cueStream.ack}
        />
      )}
    </div>
  );
}

const seo: SeoProps = {
  title: 'Cockpit caster',
  noindex: true,
};

CockpitPage.seo = seo;

export default CockpitPage;
