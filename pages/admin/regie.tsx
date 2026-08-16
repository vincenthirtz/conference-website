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
// Gate SSR : owner / admin / caster UNIQUEMENT (PAS manager). `withStaffPage`
// exprime un seuil (minRole) et ne peut pas décrire cet ensemble non-contigu,
// d'où un `getServerSideProps` custom (voir en bas du fichier).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';

import { useToast } from '@/components/Toast';
import { useCasterSession } from '@/hooks/useCasterSession';
import { useEventRunRealtime } from '@/hooks/useEventRunRealtime';
import { useCockpitHeartbeat } from '@/hooks/useCockpitHeartbeat';
import { useCueStream } from '@/hooks/useCueStream';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { AdminFetchError, useAdminFetch } from '@/hooks/useAdminFetch';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { logger } from '@/utils/logger';
import { unlockAudio } from '@/utils/playChime';
import type { EventRun, EventSegment } from '@/types/events';
import type { StaffProps } from '@/types/admin';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { computeRunSchedule } from '@/utils/eventSchedule';
import { useT, format } from '@/lib/i18n/useT';
import {
  requireStaffRoleFromRequest,
  StaffUnauthenticatedError,
  StaffUnauthorizedError,
} from '@/utils/staff';

import LiveSegmentBlock from '@/components/Caster/LiveSegmentBlock';
import CockpitChecklist from '@/components/Caster/CockpitChecklist';
import CockpitHotkeys from '@/components/Caster/CockpitHotkeys';
import BriefingPanel from '@/components/Caster/BriefingPanel';
import UpcomingAssignments from '@/components/Caster/UpcomingAssignments';
import CueBanner from '@/components/Caster/CueBanner';
import CueFeed from '@/components/Caster/CueFeed';
import UrgentCueModal from '@/components/Caster/UrgentCueModal';
import nsAdminRegie from '@/lib/i18n/locales/fr/adminRegie';
import nsRegieNewRun from '@/lib/i18n/locales/fr/regieNewRun';
import nsRegieStartPrepared from '@/lib/i18n/locales/fr/regieStartPrepared';
import nsCasterCockpit from '@/lib/i18n/locales/fr/casterCockpit';

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

type Connection =
  | { level: 'online'; seen: boolean }
  | { level: 'reconnecting'; seen: false }
  | { level: 'offline'; seen: false };

/** Formate un Date en valeur `datetime-local` (fuseau local du navigateur). */
function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/**
 * Pastille de connexion (reprise de CockpitHeader) adaptée à la chrome admin :
 * la couleur porte l'info, le label court + aria-live la rendent accessible.
 */
function ConnectionIndicator({ connection }: { connection: Connection }) {
  const t = useT(nsAdminRegie);
  const dot =
    connection.level === 'online'
      ? 'bg-emerald-400'
      : connection.level === 'reconnecting'
        ? 'bg-amber-400 animate-pulse'
        : 'bg-red-500';
  const text =
    connection.level === 'online'
      ? 'text-emerald-300'
      : connection.level === 'reconnecting'
        ? 'text-amber-300'
        : 'text-red-300';
  const label =
    connection.level === 'offline'
      ? t.statusOffline
      : connection.level === 'reconnecting'
        ? t.statusReconnecting
        : connection.seen
          ? t.statusSeen
          : t.statusOnline;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-1.5 ${text}`}
      data-testid="regie-connection"
    >
      <span aria-hidden className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span className="text-[11px] font-medium whitespace-nowrap">{label}</span>
    </div>
  );
}

/**
 * Panneau « Nouveau run » — admin/owner uniquement, affiché quand aucun run
 * n'est live. Crée un event_run (draft) via POST /api/admin/events puis le
 * démarre via POST /api/admin/events/{id}/start (rôle 'admin'). Tournoi
 * optionnel : un run peut être 100 % libre, l'endpoint ne demande pas de lien.
 */
function NewRunPanel({ onStarted }: { onStarted: () => Promise<void> }) {
  const t = useT(nsRegieNewRun);
  const { addToast } = useToast();
  // Deux (ou trois) intentions successives (create → [from-tournament] →
  // start) : la clé se régénère après chaque 2xx, chaque mutation part donc
  // avec une clé fraîche.
  const { mutateJson } = useIdempotentMutation();
  const { adminFetchJson } = useAdminFetch();

  const [name, setName] = useState('');
  const [scheduledAt, setScheduledAt] = useState(() => nowLocalInput());
  const [busy, setBusy] = useState(false);
  // Sélecteur de tournoi optionnel : '' = run libre (comportement historique).
  const [tournaments, setTournaments] = useState<
    { id: string; name: string }[]
  >([]);
  const [tournamentId, setTournamentId] = useState('');

  // Charge la liste des tournois pour le sélecteur. Optionnel : en cas d'échec
  // on reste sur « run libre » sans bruit (le run 100 % libre reste possible).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await adminFetchJson<{
          tournaments: { id: string; name: string }[];
        }>('/api/admin/tournaments?limit=100&orderBy=start_date&orderDir=desc');
        if (!cancelled) setTournaments(json.tournaments ?? []);
      } catch {
        if (!cancelled) setTournaments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminFetchJson]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      addToast(t.nameRequired, 'error');
      return;
    }
    setBusy(true);
    try {
      const scheduledIso = new Date(scheduledAt).toISOString();
      const created = await mutateJson<{ id: string }>('/api/admin/events', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed, scheduled_at: scheduledIso }),
      });

      // Tournoi lié : on pré-remplit les segments match AVANT le /start (les
      // segments sont ajoutés au draft). Si cet appel échoue, le run existe
      // déjà en draft : on informe l'utilisateur, on refetch (le draft
      // apparaît dans « Démarrer un run préparé ») et on NE démarre PAS —
      // pas d'état incohérent silencieux.
      if (tournamentId) {
        try {
          const res = await mutateJson<{
            segments: unknown[];
            created: number;
            skipped: number;
          }>(`/api/admin/events/${created.id}/segments/from-tournament`, {
            method: 'POST',
            body: JSON.stringify({ tournament_id: tournamentId }),
          });
          const count = res.created ?? 0;
          addToast(
            format(
              count === 1 ? t.segmentsCreated_one : t.segmentsCreated_other,
              { count }
            ),
            'success'
          );
        } catch (fromErr) {
          const fe = fromErr as AdminFetchError;
          const feError =
            typeof fe.payload === 'object' &&
            fe.payload &&
            'error' in fe.payload
              ? String((fe.payload as { error: string }).error)
              : null;
          addToast(feError || t.fromTournamentError, 'error');
          setName('');
          setTournamentId('');
          await onStarted();
          return;
        }
      }

      await mutateJson(`/api/admin/events/${created.id}/start`, {
        method: 'POST',
      });
      addToast(t.createSuccess, 'success');
      setName('');
      setTournamentId('');
      // Le run live apparaît via realtime, mais on refetch immédiatement pour
      // une transition instantanée (pas d'attente du canal).
      await onStarted();
    } catch (err) {
      const e2 = err as AdminFetchError;
      const payloadError =
        typeof e2.payload === 'object' && e2.payload && 'error' in e2.payload
          ? String((e2.payload as { error: string }).error)
          : null;
      addToast(payloadError || e2.message || t.createError, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 space-y-4"
      data-testid="regie-new-run"
    >
      <div>
        <h2 className="text-sm font-semibold text-white">{t.title}</h2>
        <p className="text-xs text-neutral-400 mt-1">{t.description}</p>
        <p className="text-[11px] text-neutral-500 mt-1">{t.tournamentHint}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs text-neutral-400 mb-1">
            {t.nameLabel}
          </span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder={t.namePlaceholder}
            disabled={busy}
            className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 disabled:opacity-50"
          />
        </label>

        <label className="block">
          <span className="block text-xs text-neutral-400 mb-1">
            {t.scheduledLabel}
          </span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            disabled={busy}
            className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-2.5 py-2 text-sm text-white disabled:opacity-50"
          />
        </label>
      </div>

      <label className="block">
        <span className="block text-xs text-neutral-400 mb-1">
          {t.tournamentLabel}
        </span>
        <select
          value={tournamentId}
          onChange={(e) => setTournamentId(e.target.value)}
          disabled={busy}
          className="w-full rounded-md bg-neutral-950 border border-neutral-700 px-2.5 py-2 text-sm text-white disabled:opacity-50"
          data-testid="regie-new-run-tournament"
        >
          <option value="">{t.tournamentNone}</option>
          {tournaments.map((tour) => (
            <option key={tour.id} value={tour.id}>
              {tour.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy && (
          <span className="inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
        )}
        {busy ? t.submitting : t.submit}
      </button>
    </form>
  );
}

/** Un draft d'event_run tel que renvoyé par GET /api/admin/events?status=draft. */
type DraftRun = {
  id: string;
  name: string;
  scheduled_at: string | null;
  status: string;
};

/**
 * Panneau « Démarrer un run préparé » — admin/owner, affiché quand aucun run
 * n'est live ET qu'au moins un run draft existe. Complète NewRunPanel (créer à
 * blanc) : ici on lance un run déjà construit (avec ses segments montés dans le
 * Director) via POST /api/admin/events/{id}/start (rôle 'admin'). Si aucun
 * draft, le composant ne rend rien (pas de bruit visuel).
 */
function StartPreparedPanel({ onStarted }: { onStarted: () => Promise<void> }) {
  const t = useT(nsRegieStartPrepared);
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();

  const [drafts, setDrafts] = useState<DraftRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Busy ciblé par ligne (id du draft en cours de démarrage).
  const [startingId, setStartingId] = useState<string | null>(null);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const json = await adminFetchJson<{ items: DraftRun[] }>(
        '/api/admin/events?status=draft&limit=50'
      );
      setDrafts(json.items ?? []);
      setError(null);
    } catch (err) {
      setError((err as AdminFetchError)?.message || t.loadError);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, t.loadError]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  async function handleStart(id: string) {
    if (startingId) return;
    setStartingId(id);
    try {
      await mutateJson(`/api/admin/events/${id}/start`, { method: 'POST' });
      addToast(t.startSuccess, 'success');
      await onStarted();
    } catch (err) {
      const e2 = err as AdminFetchError;
      const payloadError =
        typeof e2.payload === 'object' && e2.payload && 'error' in e2.payload
          ? String((e2.payload as { error: string }).error)
          : null;
      addToast(payloadError || e2.message || t.startError, 'error');
      setStartingId(null);
    }
  }

  // État de chargement discret pour éviter un flash.
  if (loading) {
    return (
      <div
        className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 text-xs text-neutral-500"
        data-testid="regie-start-prepared-loading"
      >
        {t.loading}
      </div>
    );
  }

  // Erreur (rare) : petit encart, on ne bloque pas la création à blanc.
  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-900/15 p-3 text-xs text-red-100">
        {error}
      </div>
    );
  }

  // Aucun draft : on n'affiche rien (NewRunPanel reste seul à l'écran).
  if (drafts.length === 0) return null;

  const formatDate = (iso: string | null) => {
    if (!iso) return t.noSchedule;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? t.noSchedule : d.toLocaleString();
  };

  return (
    <div
      className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 space-y-3"
      data-testid="regie-start-prepared"
    >
      <div>
        <h2 className="text-sm font-semibold text-white">{t.title}</h2>
        <p className="text-xs text-neutral-400 mt-1">{t.description}</p>
        <p className="text-[11px] text-neutral-500 mt-1">{t.directorHint}</p>
      </div>

      <ul className="space-y-2">
        {drafts.map((d) => {
          const busy = startingId === d.id;
          return (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2"
              data-testid="regie-draft-row"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {d.name}
                </p>
                <p className="text-[11px] text-neutral-500">
                  {formatDate(d.scheduled_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleStart(d.id)}
                disabled={!!startingId}
                className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy && (
                  <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                )}
                {busy ? t.starting : t.start}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RegiePage({ staff }: StaffProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const session = useCasterSession();
  const t = useT(nsCasterCockpit);
  const tr = useT(nsAdminRegie);

  // Le panneau « Nouveau run » exige l'endpoint /start (rôle 'admin') : réservé
  // aux admin/owner. Un caster ne le voit pas. L'endpoint /end est lui aussi
  // 'admin' → on réutilise le même gate pour « Terminer le run ».
  const canStartRun = staff.role === 'admin' || staff.role === 'owner';

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

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      await mutateJson(`/api/admin/events/${liveRunId}/end`, {
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
      await mutateJson(
        `/api/admin/events/${liveRunId}/segments/${currentSegment.id}/end`,
        { method: 'POST' }
      );
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
      await mutateJson(
        `/api/admin/events/${liveRunId}/segments/${nextSegment.id}/start`,
        { method: 'POST' }
      );
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

  // En-tête admin sobre (titre + connexion + Director + déconnexion), réutilisé
  // par tous les états de la page pour conserver la chrome admin.
  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            {tr.heading}
          </h1>
          <ConnectionIndicator connection={connection} />
        </div>
        <p className="text-sm text-neutral-400 mt-1">{tr.subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        {liveRunId && (
          <Link
            href={`/admin/events/${liveRunId}/director`}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
          >
            {tr.openDirector}
          </Link>
        )}
        {liveRunId && canStartRun && (
          <button
            type="button"
            onClick={handleEndRun}
            disabled={endingRun}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/20 hover:bg-red-900/40 border border-red-500/30 text-red-200 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="regie-end-run"
          >
            {endingRun && (
              <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-red-300/40 border-t-red-200 animate-spin" />
            )}
            {endingRun ? tr.ending : tr.endRun}
          </button>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
        >
          {tr.signOut}
        </button>
      </div>
    </div>
  );

  const shell = (children: React.ReactNode) => (
    <>
      <Head>
        <title>{tr.docTitle}</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-black text-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-16 pb-12">
          {children}
        </div>
      </div>
    </>
  );

  if (session.loading) {
    return shell(
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-10 text-center text-sm text-neutral-400 flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-neutral-700 border-t-purple-400 rounded-full animate-spin" />
        {t.connecting}
      </div>
    );
  }

  if (session.error === 'not_caster') {
    return shell(
      <>
        {header}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 text-center space-y-4">
          <h2 className="text-lg font-semibold">{t.accessInactiveTitle}</h2>
          <p className="text-sm text-neutral-300">{t.accessInactiveBody}</p>
          <button
            type="button"
            onClick={() => session.signOut()}
            className="px-4 py-2 rounded-md border border-white/15 text-sm hover:bg-white/10 transition"
          >
            {t.signOut}
          </button>
        </div>
      </>
    );
  }

  if (session.error === 'network' || !session.caster) {
    return shell(
      <>
        {header}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 text-center space-y-4">
          <h2 className="text-lg font-semibold">{t.connectionErrorTitle}</h2>
          <p className="text-sm text-neutral-300">{t.connectionErrorBody}</p>
          <button
            type="button"
            onClick={() => session.refresh()}
            className="px-4 py-2 rounded-md bg-purple-500 hover:bg-purple-400 text-sm font-semibold transition"
          >
            {t.retry}
          </button>
        </div>
      </>
    );
  }

  return shell(
    <>
      {header}

      <div className="space-y-4">
        {/* Rappel discret : le navigateur ne peut pas garder l'ecran eveille. */}
        {!wakeLockSupported && (
          <p className="flex items-center gap-1.5 text-[11px] text-neutral-500 px-1">
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
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 text-center text-xs text-neutral-400">
            {t.loadingRun}
          </div>
        ) : errorRun ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-900/15 p-4 text-xs text-red-100">
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

        {/* Banniere cues : sticky, visible si un cue recent n est pas vu. */}
        <CueBanner cues={cueStream.cues} seenLocally={seenLocally} />

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
              <button
                type="button"
                onClick={handleEndSegment}
                disabled={!!segAction}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="regie-end-segment"
              >
                {segAction === 'end' && (
                  <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                )}
                {segAction === 'end' ? tr.endingSegment : tr.endSegment}
              </button>
            )}
            {nextSegment && (
              <button
                type="button"
                onClick={handleStartNext}
                disabled={!!segAction}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 border border-indigo-500/40 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="regie-start-next"
              >
                {segAction === 'startNext' && (
                  <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                )}
                {segAction === 'startNext' ? tr.startingNext : tr.startNext}
              </button>
            )}
          </div>
        )}

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
 * Gate SSR custom : owner / admin / caster UNIQUEMENT (PAS manager).
 *
 * `withStaffPage(minRole)` exprime un SEUIL (rôle >= minRole) et ne peut donc
 * pas décrire cet ensemble non-contigu (caster est le rôle le plus bas, manager
 * est juste au-dessus). On authentifie donc tout staff via
 * `requireStaffRoleFromRequest(_, 'caster')` puis on exclut explicitement
 * `manager`. Pour le reste, on réplique fidèlement ce que fait `withStaffPage` :
 * baseProps { staff, activeTenantKind } + gestion des erreurs d'auth.
 */
export const getServerSideProps: GetServerSideProps = async (
  ctx: GetServerSidePropsContext
) => {
  const { req, res } = ctx;
  try {
    // Gate = tout staff (caster/admin/owner). Le rôle 'manager' a été retiré des
    // rôles staff : plus besoin de l'exclure explicitement, l'ensemble « tout
    // staff » vaut désormais exactement caster/admin/owner.
    const staffCtx = await requireStaffRoleFromRequest(
      req as never,
      res as never,
      'caster'
    );

    // Nature du tenant actif (organizer/developer) — comme withStaffPage.
    // Fail-safe 'organizer' pour ne jamais durcir accidentellement l'accès.
    const { getTenantKind } = await import('@/utils/tenantKind');
    let activeTenantKind: 'organizer' | 'developer' = 'organizer';
    try {
      activeTenantKind = (await getTenantKind(staffCtx.tenantId)) as
        | 'organizer'
        | 'developer';
    } catch (e) {
      logger.error('[regie] getTenantKind error', e);
    }

    return {
      props: {
        staff: {
          id: staffCtx.staff.id,
          role: staffCtx.role,
          display_name: staffCtx.staff.display_name,
        },
        activeTenantKind,
      },
    };
  } catch (err: unknown) {
    if (err instanceof StaffUnauthenticatedError) {
      return {
        redirect: {
          destination: '/admin/login?next=/admin/regie',
          permanent: false,
        },
      };
    }
    if (err instanceof StaffUnauthorizedError) {
      return { redirect: { destination: '/403', permanent: false } };
    }
    logger.error('[regie] getServerSideProps error', err);
    return { redirect: { destination: '/500', permanent: false } };
  }
};
