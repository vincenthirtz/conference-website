import { useCallback, useEffect, useState, type JSX } from 'react';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useLang, type Lang } from '@/lib/i18n/LanguageProvider';
import { useT, format } from '@/lib/i18n/useT';

import { logger } from '../../utils/logger';

type T = ReturnType<typeof useT<'nextMatchCard'>>;
type NextMatch = {
  match: {
    id: string;
    scheduledAt: string | null;
    status: string;
    format: string | null;
    roundName: string | null;
    streamUrl: string | null;
    bestOf: number | null;
  } | null;
  team: { id: string; name: string; slot: 1 | 2 } | null;
  opponent: { id: string; name: string } | null;
  tournament: { id: string; name: string; slug: string | null } | null;
  checkin: {
    token: string | null;
    alreadyCheckedIn: boolean;
    checkedInAt: string | null;
    opensAt: string | null;
    closesAt: string | null;
    isOpen: boolean;
    isPassed: boolean;
  } | null;
};

function formatScheduled(iso: string | null, lang: Lang, t: T): string {
  if (!iso) return t.noDate;
  return new Date(iso).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

function formatRelative(
  iso: string | null,
  now: number,
  t: T
): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms)) return null;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const mins = Math.floor((abs % 3_600_000) / 60_000);
  const parts: string[] = [];
  if (days) parts.push(format(t.days, { n: days }));
  if (hours) parts.push(format(t.hours, { n: hours }));
  if (!days && mins) parts.push(format(t.mins, { n: mins }));
  if (parts.length === 0) parts.push(t.lessThanMin);
  const joined = parts.join(' ');
  return ms >= 0
    ? format(t.inFmt, { parts: joined })
    : format(t.agoFmt, { parts: joined });
}

export default function NextMatchCard(): JSX.Element | null {
  const { adminFetchJson } = useAdminFetch();
  const { lang } = useLang();
  const t = useT('nextMatchCard');
  const [data, setData] = useState<NextMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<number>(() => Date.now());

  const load = useCallback(async () => {
    try {
      const json = await adminFetchJson<NextMatch>('/api/player/next-match', {
        skipAuthRedirect: true,
      });
      setData(json);
    } catch (err) {
      logger.error('[NextMatchCard] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    // Initial load always runs on mount, even if the tab starts hidden.
    load();

    // Single 60s interval: refetches the payload and ticks the relative clock
    // (minute granularity). Both are skipped while the tab is backgrounded to
    // avoid useless network + work in hidden tabs.
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setNow(Date.now());
      load();
    }, 60_000);

    // Refresh immediately when the user returns to the tab so stale data and a
    // stale clock are corrected without waiting for the next tick.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setNow(Date.now());
      load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  if (loading) {
    // Hide while loading to avoid layout flash; the rest of the dashboard
    // is meaningful on its own.
    return null;
  }
  if (!data?.match || !data.team || !data.opponent) return null;

  const scheduled = data.match.scheduledAt;
  const relative = formatRelative(scheduled, now, t);
  const isLive = data.match.status === 'ongoing';
  const checkin = data.checkin;
  const matchHref = `/match/${data.match.id}`;

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-white/[0.03] to-cyan-500/10 backdrop-blur-xl p-6">
      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-blue-200/80">
        <span className="inline-flex items-center rounded-full border border-blue-300/40 bg-blue-500/15 px-2.5 py-1 text-[10px] font-semibold text-blue-50">
          {t.nextMatch}
        </span>
        {isLive && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-2.5 py-1 text-rose-100 text-[10px] font-semibold">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
            </span>
            {t.live}
          </span>
        )}
        {data.tournament && <span>{data.tournament.name}</span>}
        {data.match.roundName && <span>{data.match.roundName}</span>}
        {data.match.format && (
          <span className="tabular-nums">
            {data.match.format.toUpperCase()}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <h3 className="text-2xl md:text-3xl font-bold text-white leading-tight">
          {data.team.name} <span className="text-white/50">vs</span>{' '}
          {data.opponent.name}
        </h3>
        <p className="text-sm text-gray-300">
          <span className="capitalize">
            {formatScheduled(scheduled, lang, t)}
          </span>
          {relative && <span className="text-gray-500"> · {relative}</span>}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={matchHref}
          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
        >
          {t.viewMatch}
          <span aria-hidden>→</span>
        </Link>
        {data.match.streamUrl && (
          <a
            href={data.match.streamUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-2 text-sm font-medium text-fuchsia-100 transition hover:bg-fuchsia-500/20"
          >
            {t.liveCast}
            <span aria-hidden>↗</span>
          </a>
        )}

        {checkin?.alreadyCheckedIn ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
            {t.checkedIn}
          </span>
        ) : checkin?.isPassed ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-100">
            {t.checkinClosed}
          </span>
        ) : checkin?.token && checkin.isOpen ? (
          <Link
            href="/player/checkin"
            className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            {t.checkinNow}
            <span aria-hidden>→</span>
          </Link>
        ) : checkin?.token && checkin.opensAt ? (
          <Link
            href="/player/checkin"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-300 transition hover:bg-white/10"
          >
            {t.checkin}{' '}
            {formatRelative(checkin.opensAt, now, t) ?? t.soon}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
