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
import { unlockAudio } from '@/utils/playChime';
import type { EventRun, EventSegment } from '@/types/events';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { computeRunSchedule } from '@/utils/eventSchedule';
import { useT, format } from '@/lib/i18n/useT';

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
  const t = useT('casterCockpit');

  // Empêche l'écran de s'éteindre tant que le caster est sur le cockpit
  // (un BO3 peut durer 40 min sans frappe clavier — la mise en veille
  // automatique masquait l'overlay broadcast côté studio). Best-effort :
  // no-op sur Firefox / Safari < 16.4 / HTTP, ne casse rien. `supported` sert a
  // afficher un rappel discret quand le navigateur ne peut PAS tenir l'ecran
  // eveille (l'operateur risque une mise en veille en plein live).
  const { supported: wakeLockSupported } = useWakeLock(true);

  // Connectivite : navigator online/offline. Combine plus bas avec l'etat du
  // canal realtime (useEventRunRealtime) et du heartbeat (useCockpitHeartbeat)
  // pour la pastille de statut du header.
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
  // dernieres donnees a l ecran (pas de plein ecran d erreur) + un bandeau
  // "reconnexion" pendant qu on tente un refresh. Se l 4ve des qu un fetch
  // repasse.
  const [sessionLost, setSessionLost] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Debloque le contexte audio Web Audio des la premiere interaction. Les
  // navigateurs mobiles bloquent l autoplay audio tant que l utilisateur n a
  // pas interagi : sans ca, un cue urgent (playChime dans UrgentCueModal /
  // CueFeed) peut arriver SANS aucun son. Best-effort, idempotent, no-op si
  // non supporte. On se desabonne apres le premier geste.
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

  // 1. Redirection si pas de session caster (apres premier check).
  useEffect(() => {
    if (session.loading) return;
    if (session.error === 'unauthenticated') {
      router.replace('/admin/login?next=/caster/cockpit');
    }
  }, [router, session.error, session.loading]);

  // 2. Fetch run courant. On extrait accessToken / refresh pour des deps
  // stables (eviter de re-creer fetchRun a chaque changement de l objet
  // session).
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
        // Session a saute en plein live. onAuthStateChange ne se declenche PAS
        // si le refresh token echoue silencieusement (reseau / token revoque),
        // laissant le cockpit fige sur des donnees perimees sans indicateur.
        // On affiche donc un bandeau NON bloquant et on tente activement un
        // refresh. On garde les dernieres donnees affichees (pas d erreur
        // plein ecran) et on n ecrase pas errorRun.
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
      // Le fetch repasse : la session est repartie, on retire le bandeau.
      setSessionLost(false);
    } catch (err) {
      logger.error('[cockpit] fetchRun error', err);
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

  // 4. Realtime : merge des changements segments + run. Les callbacks sont
  // memoises ([] deps, corps = setters stables) : sans ca, ils changeaient
  // d'identite a chaque render, ce qui faisait desabonner/reabonner les
  // canaux Supabase (event_segments + event_runs) a chaque render — et le
  // tick countdown re-rendait la page ~1x/s. Cette re-souscription en boucle
  // ouvrait une fenetre ou un postgres_changes (ex. passage d'un segment en
  // live) pouvait etre perdu, laissant le caster sur le mauvais segment
  // jusqu'au poll de secours (30s). cf. Director, deja memoise.
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

  // Planning calcule (meme source de verite que le Director). Pas de tick 1s
  // au niveau page : le seul champ consomme par LiveSegmentBlock est
  // `plannedStartAt`, qui ne depend PAS de l'horloge (seuls driftSec /
  // liveOverrunSec en dependent, et le cockpit ne les lit pas). Le countdown
  // affiche est pilote par le tick 1s *interne* de LiveSegmentBlock, ce qui
  // evite de re-rendre toute la page chaque seconde. On fige donc nowMs a 0 :
  // le memo ne recalcule que sur changement de run/segments.
  const schedule = useMemo(() => {
    if (!run) return null;
    return computeRunSchedule(run, segments, 0);
  }, [run, segments]);

  // Run live attache (utilise pour cues + heartbeat). Si le run passe done,
  // on coupe le stream cue mais on continue le heartbeat avec runId=null
  // (presence "online sans run").
  const liveRunId = run?.status === 'live' ? run.id : null;

  // Heartbeat 20s (visibility-gated, body { event_run_id }). `healthy` = le
  // dernier ping a-t-il abouti (« vu par la regie »).
  const { healthy } = useCockpitHeartbeat({
    runId: liveRunId,
    accessToken: session.accessToken,
  });

  // Statut de connexion agrege pour la pastille du header.
  //   - Le canal realtime n'existe QUE s'il y a un run attache : sans run, on
  //     ne le considere pas comme « tombe » (pas de mode degrade a signaler).
  //   - healthy === false = heartbeat en echec reseau -> reconnexion.
  const connection = useMemo(() => {
    if (!online) return { level: 'offline' as const, seen: false };
    const realtimeOk = !run?.id || realtimeConnected;
    if (!realtimeOk || healthy === false) {
      return { level: 'reconnecting' as const, seen: false };
    }
    return { level: 'online' as const, seen: healthy === true };
  }, [online, run?.id, realtimeConnected, healthy]);

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
          <div className="text-sm text-gray-400">{t.connecting}</div>
        </div>
      </div>
    );
  }

  if (session.error === 'not_caster') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">{t.accessInactiveTitle}</h1>
          <p className="text-sm text-gray-300">{t.accessInactiveBody}</p>
          <button
            type="button"
            onClick={() => session.signOut()}
            className="px-4 py-2 rounded-md border border-white/15 text-sm hover:bg-white/10 transition"
          >
            {t.signOut}
          </button>
        </div>
      </div>
    );
  }

  if (session.error === 'network' || !session.caster) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">{t.connectionErrorTitle}</h1>
          <p className="text-sm text-gray-300">{t.connectionErrorBody}</p>
          <button
            type="button"
            onClick={() => session.refresh()}
            className="px-4 py-2 rounded-md bg-purple-500 hover:bg-purple-400 text-sm font-semibold transition"
          >
            {t.retry}
          </button>
        </div>
      </div>
    );
  }

  const caster = session.caster;

  const handleSignOut = async () => {
    await session.signOut();
    addToast(t.signedOut, 'info');
    router.replace('/admin/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#080510] to-black text-white">
      <Head>
        <title>{t.docTitle}</title>
      </Head>
      <CockpitHeader
        caster={caster}
        onSignOut={handleSignOut}
        connection={connection}
      />

      <div className="px-4 pt-4 pb-12 max-w-2xl mx-auto space-y-4">
        {/* Rappel discret : le navigateur ne peut pas garder l'ecran eveille. */}
        {!wakeLockSupported && (
          <p className="flex items-center gap-1.5 text-[11px] text-gray-500 px-1">
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
        {/* Bandeau non bloquant : session perdue, reconnexion en cours. On
            garde les donnees a l ecran dessous. */}
        {sessionLost && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-2xl border border-amber-500/30 bg-amber-900/15 p-3 text-xs text-amber-100 flex items-center gap-2"
          >
            <span
              aria-hidden="true"
              className="w-3.5 h-3.5 border-2 border-amber-300/40 border-t-amber-200 rounded-full animate-spin shrink-0"
            />
            {t.sessionExpired}
          </div>
        )}

        {loadingRun ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-xs text-gray-400">
            {t.loadingRun}
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
        <PushOptIn audience="caster" variant="card" loginPath="/admin/login" />
      </div>

      {/* Modal bloquante pour cue urgent non ack. FIFO si plusieurs. */}
      {cueStream.pendingUrgent && (
        <UrgentCueModal cue={cueStream.pendingUrgent} onAck={cueStream.ack} />
      )}
    </div>
  );
}

const seo: SeoProps = {
  title: {
    fr: 'Cockpit caster',
    en: 'Caster cockpit',
  },
  noindex: true,
};

CockpitPage.seo = seo;

export default CockpitPage;
