import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { statsClient } from '@/features/admin/stats/client';
import { useTeamStats } from '@/features/admin/stats/hooks/useStats';
import { useTournamentOptions } from '@/features/admin/_shared/tournamentOptions';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import {
  rubanCard,
  rubanCardPadded,
  rubanErrBox,
} from '@/features/admin/_shared/ui/ruban';

import { logger } from '../../../utils/logger';
import nsAdminStatsTeams from '@/lib/i18n/locales/admin-fr/adminStatsTeams';

type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type TournamentMini = {
  id: string;
  name: string;
  slug: string | null;
};

type TeamStatsRow = {
  team_id: string;
  team: TeamMini | null;
  tournament_id: string | null;
  tournament: TournamentMini | null;

  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  maps_won: number;
  maps_lost: number;
  map_ties?: number | null;

  winrate: number | null;
  map_winrate: number | null;

  points: number | null;
  last_match_at: string | null;
};

function formatPercent(v: number | null | undefined) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * "Équipes" tab of the merged /admin/stats page: per-team aggregate stats with
 * tournament / search / min-matches filters, sortable table and CSV export.
 */
export default function TeamStatsPanel() {
  const t = useAdminT(nsAdminStatsTeams);

  // Filtres
  const [tournamentId, setTournamentId] = useState<string>('');
  const [minMatches, setMinMatches] = useState<string>('3');
  const [search, setSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('winrate');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);

  const tournamentsQuery = useTournamentOptions();
  const tournaments: TournamentMini[] =
    tournamentsQuery.data?.tournaments ?? [];
  const loadingTournaments = tournamentsQuery.isFetching;
  useEffect(() => {
    if (tournamentsQuery.error)
      logger.error(
        'Failed to load tournaments for stats filters',
        tournamentsQuery.error
      );
  }, [tournamentsQuery.error]);

  // Paramètres de la requête : figés quand un filtre ou la page change, avec
  // la recherche telle qu'elle est tapée à cet instant (la saisie seule ne
  // relance rien ; elle s'applique via « Filtrer »).
  const [query, setQuery] = useState<string | null>(null);

  function buildQuery(opts: { offset?: number; csv?: boolean } = {}) {
    const params = new URLSearchParams();
    if (opts.csv) {
      params.set('limit', '10000');
      params.set('offset', '0');
      params.set('export', 'csv');
    } else {
      params.set('limit', String(limit));
      params.set('offset', String(opts.offset ?? offset));
    }
    if (tournamentId) params.set('tournamentId', tournamentId);
    if (search.trim()) params.set('search', search.trim());
    if (minMatches) params.set('minMatches', minMatches);
    if (sortBy) params.set('sortBy', sortBy);
    if (sortDir) params.set('sortDir', sortDir);
    return params.toString();
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: requête figée sur les seuls filtres/offset listés ; `search` (réactif) est volontairement exclu (appliqué via handleFilterSubmit).
  useEffect(() => {
    setQuery(buildQuery());
  }, [offset, tournamentId, sortBy, sortDir, minMatches]);

  const statsQuery = useTeamStats<TeamStatsRow>(query);
  const stats = statsQuery.data?.stats ?? [];
  const total =
    typeof statsQuery.data?.total === 'number' ? statsQuery.data.total : null;
  const loading = statsQuery.isFetching;
  const errorMsg = statsQuery.isError
    ? ((statsQuery.error as Error)?.message ?? t.errorUnexpected)
    : null;

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    const next = buildQuery({ offset: 0 });
    if (next === query) void statsQuery.refetch();
    else setQuery(next);
  }

  function handleExportCsv() {
    window.location.href = statsClient.teamsCsvUrl(buildQuery({ csv: true }));
  }

  // Colonnes déclaratives (lot A5). Le rang dépend de l'offset : il est calculé
  // ici et pas dans le composant partagé, qui n'a pas à connaître la
  // pagination du serveur.
  const columns: DataTableColumn<TeamStatsRow>[] = [
    {
      key: 'rank',
      header: '#',
      sortable: false,
      render: (row) => {
        const rank = offset + stats.indexOf(row) + 1;
        return (
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              rank === 1
                ? 'bg-amber-500 text-black'
                : rank === 2
                  ? 'bg-neutral-400 text-black'
                  : rank === 3
                    ? 'bg-amber-700 text-white'
                    : 'bg-[var(--s3,#2f2732)] text-[var(--t3,#a39ba6)]'
            }`}
          >
            {rank}
          </span>
        );
      },
    },
    {
      key: 'team',
      header: t.thTeam,
      value: (row) => row.team?.name || row.team_id,
      render: (row) => (
        <Link
          href={`/admin/teams/${row.team_id}/edit`}
          className="group flex items-center gap-3"
        >
          {row.team?.logo_url && (
            <Image
              src={row.team.logo_url}
              alt={row.team?.name || row.team_id}
              width={32}
              height={32}
              className="h-8 w-8 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] object-cover"
            />
          )}
          <span>
            <span className="block font-semibold text-[var(--t1,#f4edf7)] transition-colors group-hover:text-[var(--or-200,#eec4ff)]">
              {row.team?.name || row.team_id}
            </span>
            {row.team?.short_name && (
              <span className="block text-xs text-neutral-500">
                {row.team.short_name}
              </span>
            )}
          </span>
        </Link>
      ),
    },
    {
      key: 'tournament',
      header: t.thTournament,
      value: (row) => row.tournament?.name ?? '',
      render: (row) =>
        row.tournament ? (
          <Link
            href={`/admin/tournament/${row.tournament_id}`}
            className="transition-colors hover:text-[var(--or-200,#eec4ff)]"
          >
            <span className="block font-medium text-neutral-200">
              {row.tournament.name}
            </span>
            {row.tournament.slug && (
              <span className="block font-mono text-xs text-neutral-500">
                {row.tournament.slug}
              </span>
            )}
          </Link>
        ) : (
          <span className="text-neutral-500">—</span>
        ),
    },
    {
      key: 'matches',
      header: t.thMatches,
      value: (row) => row.matches_played,
      className: 'text-center font-medium',
      headerClassName: 'text-center',
    },
    {
      key: 'wdl',
      header: t.thWDL,
      className: 'text-center',
      headerClassName: 'text-center',
      value: (row) => `${row.wins}/${row.losses}/${row.draws}`,
      render: (row) => (
        <span>
          <span className="text-emerald-400">{row.wins}</span>
          <span className="text-neutral-500"> / </span>
          <span className="text-red-400">{row.losses}</span>
          <span className="text-neutral-500"> / </span>
          <span className="text-neutral-400">{row.draws}</span>
        </span>
      ),
    },
    {
      key: 'winrate',
      header: t.thWinrate,
      className: 'text-center',
      headerClassName: 'text-center',
      value: (row) => row.winrate ?? 0,
      render: (row) => (
        <span
          className={`text-xs font-semibold tabular-nums ${
            (row.winrate ?? 0) >= 0.6
              ? 'text-[var(--lf-200,#b3e7a3)]'
              : (row.winrate ?? 0) >= 0.4
                ? 'text-[var(--t2,#c7bfca)]'
                : 'text-[#ffc2c2]'
          }`}
        >
          {formatPercent(row.winrate)}
        </span>
      ),
    },
    {
      key: 'maps',
      header: t.thMaps,
      className: 'text-center',
      headerClassName: 'text-center',
      value: (row) => `${row.maps_won}/${row.maps_lost}`,
      render: (row) => {
        const diff = (row.maps_won ?? 0) - (row.maps_lost ?? 0);
        return (
          <span>
            <span className="text-neutral-300">
              {row.maps_won}/{row.maps_lost}
            </span>{' '}
            <span
              className={`text-xs ${
                diff > 0
                  ? 'text-emerald-400'
                  : diff < 0
                    ? 'text-red-400'
                    : 'text-neutral-500'
              }`}
            >
              ({diff > 0 ? '+' : ''}
              {diff})
            </span>
          </span>
        );
      },
    },
    {
      key: 'map_winrate',
      header: t.thMapWinrate,
      className: 'text-center text-neutral-300',
      headerClassName: 'text-center',
      value: (row) => row.map_winrate ?? 0,
      render: (row) => <>{formatPercent(row.map_winrate)}</>,
    },
    {
      key: 'points',
      header: t.thPoints,
      className: 'text-center',
      headerClassName: 'text-center',
      value: (row) => row.points ?? 0,
      render: (row) => (
        <span className="font-bold text-[var(--t1,#f4edf7)]">
          {row.points != null ? row.points : '—'}
        </span>
      ),
    },
    {
      key: 'last_match',
      header: t.thLastMatch,
      className: 'text-xs text-neutral-400',
      value: (row) => row.last_match_at ?? '',
      render: (row) => <>{formatDateTime(row.last_match_at)}</>,
    },
  ];

  return (
    <>
      {/* Header */}
      <AdminPageHeader
        level={2}
        title={t.heading}
        subtitle={
          total !== null
            ? format(total > 1 ? t.countRanked_other : t.countRanked_one, {
                total,
              })
            : t.loading
        }
        actions={
          <AdminButton size="sm" onClick={handleExportCsv}>
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
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {t.exportCsv}
          </AdminButton>
        }
      />

      {/* Error Message */}
      {errorMsg && (
        <div className={`mb-6 flex items-center gap-2 ${rubanErrBox}`}>
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
          {errorMsg}
        </div>
      )}

      {/* Filters */}
      <section className={`mb-6 ${rubanCardPadded}`}>
        <form
          onSubmit={handleFilterSubmit}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end"
        >
          <div className="lg:col-span-2">
            <label className="mb-1 block text-sm text-[var(--t2,#c7bfca)]">
              {t.filterTournamentLabel}
            </label>
            <select
              className="w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
              value={tournamentId}
              onChange={(e) => setTournamentId(e.target.value)}
              disabled={loadingTournaments}
            >
              <option value="">
                {loadingTournaments ? t.tournamentsLoading : t.tournamentsAll}
              </option>
              {tournaments.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                  {tm.slug ? ` (${tm.slug})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-[var(--t2,#c7bfca)]">
              {t.filterMinMatchesLabel}
            </label>
            <input
              type="number"
              min={0}
              className="w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
              value={minMatches}
              onChange={(e) => setMinMatches(e.target.value)}
              placeholder="ex: 3"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-[var(--t2,#c7bfca)]">
              {t.filterSearchLabel}
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
                placeholder={t.filterSearchPlaceholder}
                className="w-full pl-10 pr-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-[var(--t2,#c7bfca)]">
              {t.sortByLabel}
            </label>
            <select
              className="w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="winrate">{t.sortWinrate}</option>
              <option value="map_winrate">{t.sortMapWinrate}</option>
              <option value="matches_played">{t.sortMatchesPlayed}</option>
              <option value="points">{t.sortPoints}</option>
              <option value="last_match_at">{t.sortLastMatch}</option>
            </select>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-[var(--t2,#c7bfca)]">
                {t.orderLabel}
              </label>
              <select
                className="w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
                value={sortDir}
                onChange={(e) =>
                  setSortDir(e.target.value === 'asc' ? 'asc' : 'desc')
                }
              >
                <option value="desc">{t.orderDesc}</option>
                <option value="asc">{t.orderAsc}</option>
              </select>
            </div>

            <AdminButton type="submit" variant="primary" className="self-end">
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
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              {t.filterSubmit}
            </AdminButton>
          </div>
        </form>
      </section>

      {/* Stats Table */}
      {/* Classement — kit partagé (lot A5). L'export CSV reste celui de
          l'écran : il repart au serveur chercher les 10 000 lignes, là où
          l'export du kit n'exporterait que la page affichée. */}
      <section className={`p-4 ${rubanCard}`}>
        <DataTable<TeamStatsRow>
          rows={stats}
          columns={columns}
          rowKey={(r) => `${r.team_id}-${r.tournament_id || 'global'}`}
          loading={loading}
          error={null}
          emptyTitle={t.emptyState}
          serverPagination={{ offset, limit, total, onOffsetChange: setOffset }}
        />
      </section>
    </>
  );
}
