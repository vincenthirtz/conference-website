import { useCallback, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { useUrlFilters } from '@/utils/useUrlFilters';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import ListToolbar, {
  FilterSelect,
  ListSearch,
} from '@/features/admin/_shared/ui/ListToolbar';
import type { StaffProps, Tournament } from '@/types/admin';

import { logger } from '../../../utils/logger';
import nsAdminTournamentsList from '@/lib/i18n/locales/admin-fr/adminTournamentsList';
import nsAdminQuickBracket from '@/lib/i18n/locales/admin-fr/adminQuickBracket';

type Dict = typeof nsAdminTournamentsList.fr;
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

function statusTone(status: string | null): ChipTone {
  switch (status) {
    case 'draft':
      return 'warn';
    case 'published':
      return 'brand';
    case 'running':
      return 'ok';
    default:
      return 'neutral';
  }
}

const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]';
const FIELD =
  'h-[38px] rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 text-[13px] text-[var(--t1,#f4edf7)] outline-none focus-visible:border-[var(--or,#b467d1)]';
const FIELD_LABEL =
  'flex items-center gap-2 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';

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
  const tx = useAdminT(nsAdminTournamentsList);
  const tqb = useAdminT(nsAdminQuickBracket);
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

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <AdminPageHeader
          title={tx.pageTitle}
          subtitle={
            total !== null
              ? format(
                  total > 1 ? tx.tournamentCount_other : tx.tournamentCount_one,
                  {
                    count: total,
                  }
                )
              : tx.loading
          }
          actions={
            <>
              <AdminButtonLink href="/admin/quick-bracket" variant="ghost">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                {tqb.navCta}
              </AdminButtonLink>
              <AdminButtonLink
                href="/admin/tournament-simulator"
                variant="ghost"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                {tx.simulator}
              </AdminButtonLink>
              <AdminButtonLink
                href="/admin/tournaments/create"
                variant="primary"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                {tx.newTournament}
              </AdminButtonLink>
            </>
          }
        />

        {/* Filters */}
        <form onSubmit={handleSearchSubmit}>
          <ListToolbar
            search={
              <ListSearch
                value={searchInput}
                onChange={setSearchInput}
                placeholder={tx.searchPlaceholder}
                label={tx.searchLabel}
              />
            }
            filters={
              <>
                <FilterSelect
                  label={tx.statusLabel}
                  allLabel={tx.allStatuses}
                  value={status}
                  onChange={(v) => setFilters({ status: v, offset: null })}
                  options={[
                    { value: 'draft', label: tx.statusDraft },
                    { value: 'published', label: tx.statusPublished },
                    { value: 'running', label: tx.statusRunning },
                    { value: 'completed', label: tx.statusCompleted },
                    { value: 'archived', label: tx.statusArchived },
                  ]}
                />
                <label className={FIELD_LABEL}>
                  {tx.dateFromLabel}
                  <input
                    type="date"
                    className={FIELD}
                    value={dateFrom}
                    onChange={(e) => {
                      setFilters({
                        dateFrom: e.target.value || null,
                        offset: null,
                      });
                    }}
                  />
                </label>
                <label className={FIELD_LABEL}>
                  {tx.dateToLabel}
                  <input
                    type="date"
                    className={FIELD}
                    value={dateTo}
                    onChange={(e) => {
                      setFilters({
                        dateTo: e.target.value || null,
                        offset: null,
                      });
                    }}
                  />
                </label>
                <AdminButton type="submit" variant="ghost" size="sm">
                  {tx.searchButton}
                </AdminButton>
              </>
            }
          />
        </form>

        {/* Error Message */}
        {errorMsg && (
          <div className="mb-6 flex items-center gap-2 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]">
            <svg
              className="h-5 w-5 flex-shrink-0 text-[var(--err,#ff6b6b)]"
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
            <AdminButton variant="danger" size="xs" onClick={() => fetchData()}>
              {tx.retry}
            </AdminButton>
          </div>
        )}

        {/* Tournaments Grid/List */}
        <section className={`${CARD} overflow-hidden`}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--t1,#f4edf7)]" />
            </div>
          ) : tournaments.length === 0 ? (
            <div className="py-20 text-center text-[var(--t3,#a39ba6)]">
              <svg
                className="mx-auto mb-4 h-12 w-12 text-[var(--t4,#807984)]"
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
            <div className="divide-y divide-[var(--line2,rgba(194,196,201,.2))]">
              {tournaments.map((tourn) => (
                <Link
                  key={tourn.id}
                  href={`/admin/tournament/${tourn.id}/dashboard`}
                  className="group flex flex-col gap-3 p-4 transition-colors hover:bg-[var(--s2,#1d1520)] sm:flex-row sm:items-center sm:gap-4"
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
                          className="h-10 w-10 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] object-cover sm:h-12 sm:w-12"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] sm:h-12 sm:w-12">
                          <svg
                            className="h-5 w-5 text-[var(--t4,#807984)] sm:h-6 sm:w-6"
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
                        <h3 className="truncate font-semibold text-[var(--t1,#f4edf7)] transition-colors group-hover:text-[var(--or-200,#eec4ff)]">
                          {tourn.name}
                        </h3>
                        <Chip tone={statusTone(tourn.status)}>
                          {statusLabel(tx, tourn.status)}
                        </Chip>
                        {tourn.is_public && (
                          <Chip tone="neutral">{tx.badgePublic}</Chip>
                        )}
                        {tourn.is_featured && (
                          <Chip tone="brand">{tx.badgeFeatured}</Chip>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--t3,#a39ba6)] sm:gap-3">
                        {tourn.slug && (
                          <span className="rounded-[3px] bg-[var(--s2,#1d1520)] px-2 py-0.5 font-mono text-xs">
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
                    className="hidden h-5 w-5 flex-shrink-0 text-[var(--t4,#807984)] transition-colors group-hover:text-[var(--t1,#f4edf7)] sm:block"
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
          <AdminButton
            variant="ghost"
            size="sm"
            disabled={offset === 0}
            onClick={() =>
              setFilter('offset', String(Math.max(0, offset - LIMIT)) || null)
            }
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
          </AdminButton>

          <span className="text-sm text-[var(--t3,#a39ba6)]" data-numeric>
            {format(tx.paginationRange, {
              from: offset + 1,
              to: offset + tournaments.length,
            })}
            {total ? format(tx.paginationOf, { total }) : ''}
          </span>

          <AdminButton
            variant="ghost"
            size="sm"
            disabled={total !== null && offset + LIMIT >= total}
            onClick={() => setFilter('offset', String(offset + LIMIT))}
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
          </AdminButton>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage(
  { permission: 'manage_tournaments' },
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
