import { useCallback, useEffect, useState, type JSX } from 'react';
import Link from 'next/link';
import { supabaseClient } from '@/utils/supabase';

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

function formatScheduled(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

function formatRelative(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms)) return null;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const mins = Math.floor((abs % 3_600_000) / 60_000);
  const parts: string[] = [];
  if (days) parts.push(`${days}j`);
  if (hours) parts.push(`${hours}h`);
  if (!days && mins) parts.push(`${mins}min`);
  if (parts.length === 0) parts.push("moins d'1 min");
  return ms >= 0 ? `dans ${parts.join(' ')}` : `il y a ${parts.join(' ')}`;
}

export default function NextMatchCard(): JSX.Element | null {
  const [data, setData] = useState<NextMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/player/next-match', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: NextMatch = await res.json();
      setData(json);
    } catch (err) {
      console.error('[NextMatchCard] load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Tick the relative clock once a minute so "dans 12 min" stays accurate.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleCheckin = async () => {
    if (!data?.checkin?.token) return;
    setCheckinLoading(true);
    setCheckinError(null);
    try {
      const res = await fetch(
        `/api/checkin/${encodeURIComponent(data.checkin.token)}`,
        { method: 'POST' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Check-in échoué');
      await load();
    } catch (err: unknown) {
      setCheckinError(
        err instanceof Error ? err.message : 'Erreur réseau au check-in'
      );
    } finally {
      setCheckinLoading(false);
    }
  };

  if (loading) {
    // Hide while loading to avoid layout flash; the rest of the dashboard
    // is meaningful on its own.
    return null;
  }
  if (!data?.match || !data.team || !data.opponent) return null;

  const scheduled = data.match.scheduledAt;
  const relative = formatRelative(scheduled, now);
  const isLive = data.match.status === 'ongoing';
  const checkin = data.checkin;
  const matchHref = `/match/${data.match.id}`;

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-white/[0.03] to-cyan-500/10 backdrop-blur-xl p-6">
      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-blue-200/80">
        <span className="inline-flex items-center rounded-full border border-blue-300/40 bg-blue-500/15 px-2.5 py-1 text-[10px] font-semibold text-blue-50">
          Prochain match
        </span>
        {isLive && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-2.5 py-1 text-rose-100 text-[10px] font-semibold">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
            </span>
            En direct
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
          <span className="capitalize">{formatScheduled(scheduled)}</span>
          {relative && <span className="text-gray-500"> · {relative}</span>}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={matchHref}
          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
        >
          Voir le match
          <span aria-hidden>→</span>
        </Link>
        {data.match.streamUrl && (
          <a
            href={data.match.streamUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-2 text-sm font-medium text-fuchsia-100 transition hover:bg-fuchsia-500/20"
          >
            Live cast
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
            Check-in confirmé
          </span>
        ) : checkin?.isPassed ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-100">
            Check-in clos
          </span>
        ) : checkin?.token && checkin.isOpen ? (
          <button
            type="button"
            onClick={handleCheckin}
            disabled={checkinLoading}
            className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {checkinLoading ? 'Validation…' : 'Check-in maintenant'}
          </button>
        ) : checkin?.token && checkin.opensAt ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-300">
            Check-in {formatRelative(checkin.opensAt, now) ?? 'bientôt'}
          </span>
        ) : null}
      </div>

      {checkinError && (
        <p className="mt-3 text-sm text-rose-200" role="alert">
          {checkinError}
        </p>
      )}
    </div>
  );
}
