// pages/admin/tournament/[id]/checkin/live.tsx
//
// Lot 5 — Live Check-In Console.
// Large-display variant of the existing /checkin page : prend la place
// d'un second écran pendant le check-in J-1 / J-0. Polling 10s, gros
// chiffres, un bouton "Relance Discord" par équipe non encore checkée.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import type { StaffProps } from '@/types/admin';

type TeamSide = 1 | 2;

type CheckinRow = {
  matchId: string;
  scheduledAt: string | null;
  status: string;
  team1: { id: string | null; name: string | null; checkedInAt: string | null };
  team2: { id: string | null; name: string | null; checkedInAt: string | null };
  emailSentAt: string | null;
  reminder30At: string | null;
  reminder15At: string | null;
  forfeitProcessedAt: string | null;
};

type ApiResponse = { matches: CheckinRow[] };

const POLL_MS = 10_000;
// On garde les matchs visibles sur la fenêtre [now - 30 min, now + 2 h]
// par défaut : ce qui mérite l'oeil du staff pendant le check-in J-0.
const PAST_WINDOW_MIN = 30;
const FUTURE_WINDOW_MIN = 120;

export const getServerSideProps = withStaffPage('manager');

function LiveCheckInPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation({
    autoRegenerateOnSuccess: true,
  });

  const [rows, setRows] = useState<CheckinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nudging, setNudging] = useState<Set<string>>(new Set());
  const [lastNudgeAt, setLastNudgeAt] = useState<Date | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const lastFetchRef = useRef<number>(0);

  const fetchData = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const json = await adminFetchJson<ApiResponse>(
        `/api/admin/tournament/${tournamentId}/checkin`
      );
      setRows(json.matches ?? []);
      setError(null);
      lastFetchRef.current = Date.now();
    } catch (err) {
      const e = err as AdminFetchError;
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, tournamentId]);

  // Tick clock + auto-poll (séparés pour ne pas re-render la totalité du
  // tableau à chaque seconde).
  useEffect(() => {
    fetchData();
    const poll = setInterval(fetchData, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [fetchData]);

  const windowedRows = useMemo(() => {
    return rows
      .filter((r) => {
        if (!r.scheduledAt) return false;
        const t = Date.parse(r.scheduledAt);
        if (!Number.isFinite(t)) return false;
        const diffMin = (t - now) / 60_000;
        if (diffMin < -PAST_WINDOW_MIN) return false;
        if (diffMin > FUTURE_WINDOW_MIN) return false;
        if (r.status !== 'pending' && r.status !== 'ongoing') return false;
        return true;
      })
      .sort(
        (a, b) =>
          (Date.parse(a.scheduledAt!) || 0) - (Date.parse(b.scheduledAt!) || 0)
      );
  }, [rows, now]);

  const stats = useMemo(() => {
    let teamsExpected = 0;
    let teamsCheckedIn = 0;
    let bothCheckedIn = 0;
    for (const r of windowedRows) {
      if (r.team1.id) {
        teamsExpected += 1;
        if (r.team1.checkedInAt) teamsCheckedIn += 1;
      }
      if (r.team2.id) {
        teamsExpected += 1;
        if (r.team2.checkedInAt) teamsCheckedIn += 1;
      }
      if (r.team1.checkedInAt && r.team2.checkedInAt) bothCheckedIn += 1;
    }
    const nextMatch = windowedRows.find(
      (r) => !(r.team1.checkedInAt && r.team2.checkedInAt)
    );
    const nextEta = nextMatch?.scheduledAt
      ? Math.round((Date.parse(nextMatch.scheduledAt) - now) / 60_000)
      : null;
    return {
      teamsExpected,
      teamsCheckedIn,
      bothCheckedIn,
      matches: windowedRows.length,
      nextEta,
    };
  }, [windowedRows, now]);

  async function nudge(matchId: string, side: TeamSide | 'both') {
    if (!matchId) return;
    const key = `${matchId}:${side}`;
    setNudging((prev) => new Set(prev).add(key));
    try {
      const json = await mutateJson<{
        success: boolean;
        nudgedSides: TeamSide[];
      }>(`/api/admin/matches/${matchId}/checkin-nudge`, {
        method: 'POST',
        body: JSON.stringify({ teamSide: side }),
      });
      const count = json.nudgedSides?.length ?? 0;
      addToast(
        count === 0
          ? 'Aucune équipe à relancer.'
          : `Relance envoyée à ${count} capitaine${count > 1 ? 's' : ''}.`,
        count > 0 ? 'success' : 'info'
      );
      setLastNudgeAt(new Date());
    } catch (err) {
      const e = err as AdminFetchError;
      const payloadError =
        typeof e.payload === 'object' && e.payload && 'error' in e.payload
          ? String((e.payload as { error: string }).error)
          : null;
      addToast(payloadError || e.message || 'Échec de la relance', 'error');
    } finally {
      setNudging((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <>
      <Head>
        <title>Live check-in — admin</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-black text-white">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <Link
                href={`/admin/tournament/${tournamentId}/checkin`}
                className="text-xs text-neutral-400 hover:text-white"
              >
                ← Vue admin normale
              </Link>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-1">
                Live check-in
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                Fenêtre [-{PAST_WINDOW_MIN} min, +{FUTURE_WINDOW_MIN} min] ·
                poll {POLL_MS / 1000}s
              </p>
            </div>
            <div className="text-right text-xs text-neutral-400">
              <div>Maintenant : {formatClock(now)}</div>
              {lastNudgeAt && (
                <div>Dernière relance : {formatClock(lastNudgeAt.getTime())}</div>
              )}
            </div>
          </div>

          {/* Métriques header (gros chiffres stream-friendly) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <BigMetric
              label="Matchs en fenêtre"
              value={stats.matches}
              accent="neutral"
            />
            <BigMetric
              label="Équipes checkées"
              value={`${stats.teamsCheckedIn} / ${stats.teamsExpected}`}
              accent="emerald"
            />
            <BigMetric
              label="Matchs complets"
              value={`${stats.bothCheckedIn} / ${stats.matches}`}
              accent="blue"
            />
            <BigMetric
              label="Prochain match"
              value={
                stats.nextEta === null
                  ? '—'
                  : stats.nextEta >= 0
                    ? `T-${stats.nextEta} min`
                    : `T+${Math.abs(stats.nextEta)} min`
              }
              accent={stats.nextEta !== null && stats.nextEta < 5 ? 'red' : 'amber'}
            />
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {loading && rows.length === 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-10 text-center text-neutral-400">
              Chargement…
            </div>
          )}

          {!loading && windowedRows.length === 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-10 text-center text-neutral-500">
              Aucun match dans la fenêtre actuelle.
            </div>
          )}

          <div className="space-y-3">
            {windowedRows.map((r) => (
              <MatchRow
                key={r.matchId}
                row={r}
                now={now}
                onNudge={nudge}
                nudgingSet={nudging}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function BigMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent: 'neutral' | 'emerald' | 'blue' | 'amber' | 'red';
}) {
  const accentClass = {
    neutral: 'border-neutral-800 bg-neutral-900/60',
    emerald: 'border-emerald-500/40 bg-emerald-900/20',
    blue: 'border-blue-500/40 bg-blue-900/20',
    amber: 'border-amber-500/40 bg-amber-900/20',
    red: 'border-red-500/50 bg-red-900/30',
  }[accent];
  return (
    <div className={`rounded-2xl border px-5 py-4 ${accentClass}`}>
      <div className="text-[11px] uppercase tracking-widest text-neutral-300">
        {label}
      </div>
      <div className="text-3xl sm:text-4xl font-extrabold mt-1 tabular-nums">
        {value}
      </div>
    </div>
  );
}

function MatchRow({
  row,
  now,
  onNudge,
  nudgingSet,
}: {
  row: CheckinRow;
  now: number;
  onNudge: (matchId: string, side: TeamSide | 'both') => void;
  nudgingSet: Set<string>;
}) {
  const scheduledMs = row.scheduledAt
    ? Date.parse(row.scheduledAt)
    : Number.NaN;
  const tMinusMin = Number.isFinite(scheduledMs)
    ? Math.round((scheduledMs - now) / 60_000)
    : null;
  const tLabel =
    tMinusMin === null
      ? '—'
      : tMinusMin >= 0
        ? `T-${tMinusMin} min`
        : `T+${Math.abs(tMinusMin)} min`;
  const urgent = tMinusMin !== null && tMinusMin <= 5;

  return (
    <div
      className={`rounded-2xl border bg-neutral-900/40 px-4 py-3 ${
        urgent ? 'border-red-500/50' : 'border-neutral-800'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-3">
          <span
            className={`px-2 py-1 rounded text-xs font-mono ${
              urgent
                ? 'bg-red-900/40 text-red-100 border border-red-500/40'
                : 'bg-neutral-800 text-neutral-300'
            }`}
          >
            {tLabel}
          </span>
          <span className="text-xs text-neutral-500">
            {row.scheduledAt
              ? new Date(row.scheduledAt).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Europe/Paris',
                })
              : '—'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onNudge(row.matchId, 'both')}
          disabled={
            !!(row.team1.checkedInAt && row.team2.checkedInAt) ||
            nudgingSet.has(`${row.matchId}:both`)
          }
          className="text-xs px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
        >
          {nudgingSet.has(`${row.matchId}:both`)
            ? 'Relance…'
            : 'Relance les 2'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TeamLine
          side={1}
          name={row.team1.name}
          checkedInAt={row.team1.checkedInAt}
          matchId={row.matchId}
          onNudge={onNudge}
          loading={nudgingSet.has(`${row.matchId}:1`)}
        />
        <TeamLine
          side={2}
          name={row.team2.name}
          checkedInAt={row.team2.checkedInAt}
          matchId={row.matchId}
          onNudge={onNudge}
          loading={nudgingSet.has(`${row.matchId}:2`)}
        />
      </div>
    </div>
  );
}

function TeamLine({
  side,
  name,
  checkedInAt,
  matchId,
  onNudge,
  loading,
}: {
  side: TeamSide;
  name: string | null;
  checkedInAt: string | null;
  matchId: string;
  onNudge: (matchId: string, side: TeamSide | 'both') => void;
  loading: boolean;
}) {
  const checkedIn = !!checkedInAt;
  return (
    <div
      className={`rounded-xl px-4 py-3 flex items-center justify-between gap-3 border ${
        checkedIn
          ? 'border-emerald-500/40 bg-emerald-900/15'
          : 'border-amber-500/40 bg-amber-900/10'
      }`}
    >
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-neutral-400">
          Équipe {side}
        </div>
        <div className="text-lg font-semibold truncate">{name ?? '—'}</div>
        <div className="text-xs mt-1">
          {checkedIn ? (
            <span className="text-emerald-300">
              ✓ Checké {formatRelative(checkedInAt)}
            </span>
          ) : (
            <span className="text-amber-300">⏳ Pas encore checké</span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onNudge(matchId, side)}
        disabled={checkedIn || loading}
        className="text-xs px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium whitespace-nowrap"
      >
        {loading ? '…' : 'Relance Discord'}
      </button>
    </div>
  );
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diffMin = Math.round((Date.now() - t) / 60_000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  return `il y a ${diffH}h`;
}

export default LiveCheckInPage;
