// components/Live/LiveEventBanner.tsx
//
// Encart "EN DIRECT MAINTENANT" affiche en haut de /live quand un event_run
// est en status='live' pour le tenant courant.
//
// Source : GET /api/events/current (projection safe).
// Realtime best-effort via usePublicEventRunRealtime + polling 30s.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePublicEventRunRealtime } from '@/hooks/usePublicEventRunRealtime';
import { useT, format } from '@/lib/i18n/useT';
import { logger } from '@/utils/logger';
import nsLiveEventBanner from '@/lib/i18n/locales/fr/liveEventBanner';

type BannerDict = typeof nsLiveEventBanner.fr;

type PublicSegment = {
  id: string;
  ord: number;
  type: string;
  title: string;
  durationMin: number | null;
  matchId: string | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
};

type PublicRun = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  scheduledAt: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
};

type CurrentResponse = {
  run: PublicRun | null;
  segments: PublicSegment[];
};

function typeLabel(type: string, t: BannerDict): string {
  switch (type) {
    case 'match':
      return t.typeMatch;
    case 'break':
      return t.typeBreak;
    case 'intro':
      return t.typeIntro;
    case 'outro':
      return t.typeOutro;
    case 'custom':
      return t.typeCustom;
    default:
      return t.typeFallback;
  }
}

function formatDuration(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.abs(totalSeconds);
  const mm = Math.floor(abs / 60);
  const ss = Math.floor(abs % 60);
  return `${sign}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export default function LiveEventBanner() {
  const t = useT(nsLiveEventBanner);
  const [run, setRun] = useState<PublicRun | null>(null);
  const [segments, setSegments] = useState<PublicSegment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const fetchCurrent = useCallback(async () => {
    try {
      const res = await fetch('/api/events/current');
      if (!res.ok) {
        // 4xx/5xx : silencieux, on n affiche juste pas le banner.
        setRun(null);
        setSegments([]);
        return;
      }
      const json = (await res.json()) as CurrentResponse;
      setRun(json.run);
      setSegments(json.segments ?? []);
    } catch (err) {
      logger.warn('[LiveEventBanner] fetch error', err);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchCurrent();
  }, [fetchCurrent]);

  // Tick chaque seconde uniquement si on a un segment live (pour le countdown).
  const currentSegment = useMemo(
    () => segments.find((s) => s.status === 'live') ?? null,
    [segments]
  );
  const nextSegment = useMemo(
    () =>
      segments
        .filter((s) => s.status === 'upcoming')
        .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))[0] ?? null,
    [segments]
  );

  useEffect(() => {
    if (!currentSegment?.startedAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [currentSegment?.startedAt]);

  // Realtime + polling pour refresh quand status change cote serveur.
  usePublicEventRunRealtime({
    enabled: !!run?.id,
    runId: run?.id ?? null,
    onTick: fetchCurrent,
  });

  // Even when there s no run yet, poll a fois toutes les 60s pour eventuel
  // start.
  useEffect(() => {
    if (run) return undefined;
    if (!loaded) return undefined;
    const t = setInterval(fetchCurrent, 60_000);
    return () => clearInterval(t);
  }, [fetchCurrent, loaded, run]);

  if (!loaded) return null;
  if (!run) return null;

  // Countdown du segment courant.
  let remainingLabel: string | null = null;
  let progress = 0;
  if (currentSegment?.startedAt) {
    const startedAtMs = Date.parse(currentSegment.startedAt);
    const durationMs = currentSegment.durationMin
      ? currentSegment.durationMin * 60_000
      : null;
    if (durationMs) {
      const remaining = Math.floor((startedAtMs + durationMs - now) / 1000);
      remainingLabel = formatDuration(remaining);
      progress = Math.min(
        100,
        Math.max(0, ((now - startedAtMs) / durationMs) * 100)
      );
    }
  }

  return (
    <section
      className="rounded-2xl border border-red-500/40 bg-gradient-to-br from-red-950/40 via-purple-950/30 to-black p-4 sm:p-5 mb-6"
      aria-label={t.ariaLabel}
      data-testid="live-event-banner"
      data-run-id={run.id}
    >
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/80 text-white font-semibold animate-pulse">
          {t.liveNow}
        </span>
        <h2 className="text-base sm:text-lg font-bold text-white">
          {run.name}
        </h2>
      </div>

      {currentSegment ? (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <div className="text-xs text-gray-300 mb-0.5">
              <span className="text-gray-400">
                {typeLabel(currentSegment.type, t)} :
              </span>{' '}
              <span className="text-white font-medium">
                {currentSegment.title || typeLabel(currentSegment.type, t)}
              </span>
            </div>
            {remainingLabel !== null && (
              <div
                className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-2"
                role="progressbar"
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`h-full transition-all duration-500 ${
                    progress >= 100
                      ? 'bg-amber-400'
                      : 'bg-gradient-to-r from-purple-400 to-pink-400'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
          {remainingLabel !== null && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-gray-400">
                {t.remaining}
              </div>
              <div className="text-xl font-mono font-semibold text-white tabular-nums">
                {remainingLabel}
              </div>
            </div>
          )}
        </div>
      ) : nextSegment ? (
        <div className="text-xs text-gray-300">
          {t.waitingNext}{' '}
          <span className="text-white">
            {nextSegment.title || typeLabel(nextSegment.type, t)}
          </span>
          {nextSegment.durationMin
            ? ` ${format(t.durationMin, { count: nextSegment.durationMin })}`
            : ''}
        </div>
      ) : (
        <div className="text-xs text-gray-300">{t.programInProgress}</div>
      )}
    </section>
  );
}
