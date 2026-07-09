import { useCallback, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { useUrlFilters } from '@/utils/useUrlFilters';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { StaffProps, Tournament } from '@/types/admin';

import { logger } from '../../../utils/logger';

type Dict = ReturnType<typeof useAdminT<'adminTournamentsList'>>;
type AdminTournamentsProps = StaffProps & {
  tournaments: Tournament[];
  total: number | null;
  errorMsg: string | null;
};

function statusLabel(tx: Dict, status: string | null) {
  switch (status) {
    case 'draft':
      return tx.statusDraft;
    case 'published':
      return tx.statusPublished;
    case 'running':
      return tx.statusRunning;
    case 'completed':
      return tx.statusCompleted;
    case 'archived':
      return tx.statusArchived;
    default:
      return status || tx.statusUnknown;
  }
}

function statusColor(status: string | null) {
  switch (status) {
    case 'draft':
      return 'bg-neutral-600 text-neutral-100';
    case 'published':
      return 'bg-blue-600 text-white';
    case 'running':
      return 'bg-emerald-600 text-white';
    case 'completed':
      return 'bg-purple-600 text-white';
    case 'archived':
      return 'bg-neutral-700 text-neutral-300';
    default:
      return 'bg-neutral-700 text-neutral-200';
  }
}

function formatLabel(tx: Dict, formatType: string | null) {
  switch (formatType) {
    case 'single_elim':
      return tx.formatSingleElim;
    case 'double_elim':
      return tx.formatDoubleElim;
    case 'swiss':
      return tx.formatSwiss;
    case 'round_robin':
      return tx.formatRoundRobin;
    case 'showmatch':
      return tx.formatShowmatch;
    default:
      return formatType || '—';
  }
}

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

const T_FILTER_KEYS = [
  'search',
  'status',
  'dateFrom',
  'dateTo',
  'offset',
] as const;
const LIMIT = 20;

function AdminTournamentsPage({
  tournaments,
  total,
  errorMsg,
}: AdminTournamentsProps) {
  const tx = useAdminT('adminTournamentsList');
  const tqb = useAdminT('adminQuickBracket');
  const router = useRouter();
  const { filters, setFilter, setFilters } = useUrlFilters(T_FILTER_KEYS);

  const search = filters.search ?? '';
  const status = filters.status ?? null;
  const dateFrom = filters.dateFrom ?? '';
  const dateTo = filters.dateTo ?? '';
  const offset = Number(filters.offset) || 0;

  const loading = false;

  // Local search input (synced to URL on submit)
  const [searchInput, setSearchInput] = useState(search);

  const fetchData = useCallback(() => {
    router.replace(router.asPath, undefined, { scroll: false });
  }, [router]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFilters({ search: searchInput.trim() || null, offset: null });
  }

  return (
    <>
      <Head>
        <title>{tx.headTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {tx.pageTitle}
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {total !== null
                    ? format(
                        total > 1
                          ? tx.tournamentCount_other
                          : tx.tournamentCount_one,
                        {
                          count: total,
                        }
                      )
                    : tx.loading}
                </p>
              </div>

              <div className="flex gap-2">
                <Link
                  href="/admin/quick-bracket"
                  className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  {tqb.navCta}
                </Link>
                <Link
                  href="/admin/tournament-simulator"
                  className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  {tx.simulator}
                </Link>
                <Link
                  href="/admin/tournaments/create"
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  {tx.newTournament}
                </Link>
              </div>
            </div>
          </div>

          {/* Filters */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <form
              onSubmit={handleSearchSubmit}
              className="flex gap-4 flex-wrap items-end"
            >
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {tx.searchLabel}
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="text"
                    aria-label={tx.searchPlaceholder}
                    placeholder={tx.searchPlaceholder}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="min-w-[160px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {tx.statusLabel}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={status || ''}
                  onChange={(e) =>
                    setFilters({ status: e.target.value || null, offset: null })
                  }
                >
                  <option value="">{tx.allStatuses}</option>
                  <option value="draft">{tx.statusDraft}</option>
                  <option value="published">{tx.statusPublished}</option>
                  <option value="running">{tx.statusRunning}</option>
                  <option value="completed">{tx.statusCompleted}</option>
                  <option value="archived">{tx.statusArchived}</option>
                </select>
              </div>

              <div className="min-w-[150px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {tx.dateFromLabel}
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={dateFrom}
                  onChange={(e) => {
                    setFilters({
                      dateFrom: e.target.value || null,
                      offset: null,
                    });
                  }}
                />
              </div>

              <div className="min-w-[150px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {tx.dateToLabel}
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={dateTo}
                  onChange={(e) => {
                    setFilters({
                      dateTo: e.target.value || null,
                      offset: null,
                    });
                  }}
                />
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                {tx.searchButton}
              </button>
            </form>
          </section>

          {/* Error Message */}
          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="flex-1">{errorMsg}</span>
              <button
                type="button"
                onClick={() => fetchData()}
                className="flex-shrink-0 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium transition-colors"
              >
                {tx.retry}
              </button>
            </div>
          )}

          {/* Tournaments Grid/List */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : tournaments.length === 0 ? (
              <div className="text-center py-20 text-neutral-400">
                <svg
                  className="w-12 h-12 mx-auto mb-4 text-neutral-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                {tx.emptyTournaments}
              </div>
            ) : (
              <div className="divide-y divide-neutral-700/50">
                {tournaments.map((tourn) => (
                  <Link
                    key={tourn.id}
                    href={`/admin/tournament/${tourn.id}`}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 hover:bg-neutral-700/30 transition-colors group"
                  >
                    <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                      {/* Logo */}
                      <div className="flex-shrink-0">
                        {tourn.logo_url ? (
                          <Image
                            src={tourn.logo_url}
                            alt={tourn.name}
                            width={48}
                            height={48}
                            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover border border-neutral-700"
                          />
                        ) : (
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-neutral-700/50 flex items-center justify-center border border-neutral-700">
                            <svg
                              className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-500"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                              />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                            {tourn.name}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(
                              tourn.status
                            )}`}
                          >
                            {statusLabel(tx, tourn.status)}
                          </span>
                          {tourn.is_public && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                              {tx.badgePublic}
                            </span>
                          )}
                          {tourn.is_featured && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30">
                              {tx.badgeFeatured}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 text-sm text-neutral-400 flex-wrap">
                          {tourn.slug && (
                            <span className="font-mono text-xs bg-neutral-800 px-2 py-0.5 rounded">
                              /{tourn.slug}
                            </span>
                          )}
                          {tourn.game && <span>{tourn.game}</span>}
                          <span className="hidden sm:inline">•</span>
                          <span>{formatLabel(tx, tourn.format_type)}</span>
                          <span className="hidden sm:inline">•</span>
                          <span>{formatDate(tourn.start_date)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Arrow */}
                    <svg
                      className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors flex-shrink-0 hidden sm:block"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-6">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() =>
                setFilter('offset', String(Math.max(0, offset - LIMIT)) || null)
              }
              className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              {tx.previous}
            </button>

            <span className="text-neutral-400 text-sm">
              {format(tx.paginationRange, {
                from: offset + 1,
                to: offset + tournaments.length,
              })}
              {total ? format(tx.paginationOf, { total }) : ''}
            </span>

            <button
              type="button"
              disabled={total !== null && offset + LIMIT >= total}
              onClick={() => setFilter('offset', String(offset + LIMIT))}
              className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {tx.next}
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage(
  'manager',
  async (ctx, staffCtx) => {
    const { query } = ctx;
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = typeof query.status === 'string' ? query.status : null;
    const dateFromRaw =
      typeof query.dateFrom === 'string' ? query.dateFrom : '';
    const dateToRaw = typeof query.dateTo === 'string' ? query.dateTo : '';
    const offset = Math.max(0, Number(query.offset) || 0);

    if (!supabaseAdmin) {
      return { tournaments: [], total: null, errorMsg: 'Service indisponible' };
    }

    const { tenantId } = staffCtx;

    const selectColumns = `
    id, name, slug, game, status,
    start_date, end_date, max_teams,
    created_at, updated_at
  `;

    let q = supabaseAdmin
      .from('tournaments')
      .select(selectColumns, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + LIMIT - 1);

    if (status) q = q.eq('status', status);
    if (search) {
      const s = `%${search}%`;
      q = q.or(`name.ilike.${s},slug.ilike.${s}`);
    }
    if (dateFromRaw) {
      try {
        q = q.gte('start_date', new Date(dateFromRaw).toISOString());
      } catch {}
    }
    if (dateToRaw) {
      try {
        q = q.lte(
          'start_date',
          new Date(`${dateToRaw}T23:59:59`).toISOString()
        );
      } catch {}
    }

    const { data, error, count } = await q;

    if (error) {
      logger.error('admin tournaments SSR error:', error);
      return {
        tournaments: [],
        total: null,
        errorMsg: 'Erreur lors du chargement',
      };
    }

    return {
      tournaments: (data || []) as Tournament[],
      total: typeof count === 'number' ? count : null,
      errorMsg: null,
    };
  }
);

export default AdminTournamentsPage;
