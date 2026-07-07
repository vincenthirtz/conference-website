// pages/admin/disputes/index.tsx
// Lot 4 — Cross-tournament board of open disputes with SLA timers.
// Disputes are colored by classification (breached / approaching / fresh).
//
// Perf hardening: all filtering (tournament + classification) and pagination
// happen server-side. The page no longer loads the full dispute set and
// filters client-side; it requests one page at a time and lets the API count
// the classification breakdown.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { StaffProps } from '@/types/admin';

type Classification = 'breached' | 'approaching' | 'fresh';

type DisputeRow = {
  matchId: string;
  tournament: { id: string; name: string; slug: string | null } | null;
  team1: { id: string; name: string | null } | null;
  team2: { id: string; name: string | null } | null;
  disputeReason: string | null;
  disputeOpenedAt: string | null;
  escalationPingedAt: string | null;
  ageMinutes: number | null;
  slaMinutes: number;
  classification: Classification;
};

type ApiResponse = {
  disputes: DisputeRow[];
  counts: {
    total: number;
    breached: number;
    approaching: number;
    fresh: number;
  };
  total: number | null;
};

type TournamentMini = {
  id: string;
  name: string;
  slug: string | null;
};

type TournamentsApiResponse = {
  tournaments: TournamentMini[];
  total: number | null;
};

const PAGE_SIZE = 50;

export const getServerSideProps = withStaffPage('caster');

function DisputesBoardPage(_: StaffProps) {
  const t = useAdminT('adminDisputes');
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Server-side classification filter (drives Stat cards + the `status` query).
  const [filter, setFilter] = useState<'all' | Classification>('all');

  const initialTournament =
    typeof router.query.tournament_id === 'string'
      ? router.query.tournament_id
      : '';
  const [tournamentFilter, setTournamentFilter] = useState(initialTournament);

  const [offset, setOffset] = useState(0);

  const [tournaments, setTournaments] = useState<TournamentMini[]>([]);

  const fetchTournaments = useCallback(async () => {
    try {
      const json = await adminFetchJson<TournamentsApiResponse>(
        '/api/admin/tournaments?limit=200'
      );
      setTournaments(json.tournaments || []);
    } catch {
      // Non-blocking: the dropdown just stays empty.
    }
  }, [adminFetchJson]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      params.set('includeTotal', '1');
      if (tournamentFilter) params.set('tournament_id', tournamentFilter);
      if (filter !== 'all') params.set('status', filter);
      const json = await adminFetchJson<ApiResponse>(
        `/api/admin/disputes?${params.toString()}`
      );
      setData(json);
    } catch (err) {
      const e = err as AdminFetchError;
      setError(e.message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, tournamentFilter, filter, offset, t.errorLoad]);

  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);

  useEffect(() => {
    fetchData();
    const handle = setInterval(fetchData, 60_000); // 1 min auto-refresh
    return () => clearInterval(handle);
  }, [fetchData]);

  // Reset to the first page when a filter changes.
  function changeFilter(next: 'all' | Classification) {
    setOffset(0);
    setFilter(next);
  }

  function changeTournament(next: string) {
    setOffset(0);
    setTournamentFilter(next);
  }

  const disputes = data?.disputes ?? [];
  const total = data?.total ?? null;

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{t.heading}</h1>
              <p className="text-sm text-neutral-400 mt-1">
                {t.introPrefix}{' '}
                <SLAPill cls="breached" />
                {t.introSuffix}
              </p>
            </div>
            <button
              type="button"
              onClick={fetchData}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors"
            >
              {t.refresh}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat
              label={t.statTotal}
              value={data?.counts.total ?? 0}
              active={filter === 'all'}
              onClick={() => changeFilter('all')}
            />
            <Stat
              label={t.statBreached}
              value={data?.counts.breached ?? 0}
              accent="red"
              active={filter === 'breached'}
              onClick={() => changeFilter('breached')}
            />
            <Stat
              label={t.statApproaching}
              value={data?.counts.approaching ?? 0}
              accent="amber"
              active={filter === 'approaching'}
              onClick={() => changeFilter('approaching')}
            />
            <Stat
              label={t.statFresh}
              value={data?.counts.fresh ?? 0}
              accent="emerald"
              active={filter === 'fresh'}
              onClick={() => changeFilter('fresh')}
            />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="text-xs text-neutral-400">
              {t.tournamentLabel}
            </label>
            <select
              value={tournamentFilter}
              onChange={(e) => changeTournament(e.target.value)}
              className="rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1 text-sm"
            >
              <option value="">{t.tournamentAll}</option>
              {tournaments.map((tour) => (
                <option key={tour.id} value={tour.id}>
                  {tour.name}
                  {tour.slug ? ` (${tour.slug})` : ''}
                </option>
              ))}
            </select>
            <span className="ml-auto text-xs text-neutral-500">
              {total !== null
                ? format(t.resultsCount, { count: total })
                : format(t.shownCount, { count: disputes.length })}{' '}
              {t.autoRefresh}
            </span>
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {loading && !data && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-8 text-center text-sm text-neutral-400">
              {t.loading}
            </div>
          )}

          {!loading && disputes.length === 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-8 text-center text-sm text-neutral-500">
              {format(t.empty, {
                filter: filter !== 'all' ? `(${filter})` : '',
              })}
            </div>
          )}

          <div className="space-y-2">
            {disputes.map((d) => (
              <DisputeCard key={d.matchId} dispute={d} />
            ))}
          </div>

          {/* Pagination */}
          {disputes.length > 0 && (
            <div className="flex justify-between items-center mt-6">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t.prev}
              </button>

              <span className="text-neutral-400 text-sm">
                {format(t.paginationRange, {
                  from: offset + 1,
                  to: offset + disputes.length,
                })}
                {total !== null ? format(t.paginationOf, { total }) : ''}
              </span>

              <button
                type="button"
                disabled={total !== null && offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t.next}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: number;
  accent?: 'red' | 'amber' | 'emerald';
  active?: boolean;
  onClick?: () => void;
}) {
  const accentMap = {
    red: 'border-red-500/50 bg-red-900/20 text-red-200',
    amber: 'border-amber-500/50 bg-amber-900/20 text-amber-200',
    emerald: 'border-emerald-500/50 bg-emerald-900/20 text-emerald-200',
  };
  const accentClass = accent
    ? accentMap[accent]
    : 'border-neutral-800 bg-neutral-900/60 text-neutral-200';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left px-4 py-3 rounded-xl border transition-colors ${accentClass} ${
        active ? 'ring-2 ring-white/30' : 'hover:brightness-110'
      }`}
    >
      <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </button>
  );
}

function SLAPill({ cls }: { cls: Classification }) {
  const t = useAdminT('adminDisputes');
  const map: Record<Classification, { label: string; className: string }> = {
    breached: {
      label: t.statBreached,
      className: 'bg-red-900/40 text-red-200 border-red-500/40',
    },
    approaching: {
      label: t.statApproaching,
      className: 'bg-amber-900/30 text-amber-200 border-amber-500/40',
    },
    fresh: {
      label: t.statFresh,
      className: 'bg-emerald-900/30 text-emerald-200 border-emerald-500/40',
    },
  };
  const s = map[cls];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${s.className}`}
    >
      {s.label}
    </span>
  );
}

function formatAge(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return '?';
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return `${h}h${m > 0 ? ` ${m}min` : ''}`;
  const d = Math.floor(h / 24);
  return `${d}j ${h % 24}h`;
}

function DisputeCard({ dispute: d }: { dispute: DisputeRow }) {
  const t = useAdminT('adminDisputes');
  const matchHref = `/admin/matches/${d.matchId}`;
  const ageLabel = formatAge(d.ageMinutes);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1">
            <SLAPill cls={d.classification} />
            <span className="font-mono">{ageLabel}</span>
            <span>{format(t.slaLine, { min: d.slaMinutes })}</span>
            {d.escalationPingedAt && (
              <span className="text-amber-300">{t.escalated}</span>
            )}
            {d.tournament && (
              <>
                <span className="text-neutral-600">·</span>
                <Link
                  href={`/admin/tournament/${d.tournament.id}/matches?status=disputed`}
                  className="hover:text-white"
                >
                  {d.tournament.name}
                </Link>
              </>
            )}
          </div>
          <div className="text-base font-medium">
            {d.team1?.name ?? '?'}{' '}
            <span className="text-neutral-500">{t.vs}</span>{' '}
            {d.team2?.name ?? '?'}
          </div>
          {d.disputeReason && (
            <div className="mt-1 text-sm text-neutral-300 line-clamp-2">
              {d.disputeReason}
            </div>
          )}
        </div>
        <Link
          href={matchHref}
          className="self-center px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-medium transition-colors"
        >
          {t.resolve}
        </Link>
      </div>
    </div>
  );
}

export default DisputesBoardPage;
