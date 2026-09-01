import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable';

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

type TeamStatsApiResponse = {
  stats: TeamStatsRow[];
  total: number | null;
};

type TournamentsApiResponse = {
  tournaments: TournamentMini[];
  total: number | null;
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
  const { adminFetch, adminFetchJson } = useAdminFetch();

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [stats, setStats] = useState<TeamStatsRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);

  const [tournaments, setTournaments] = useState<TournamentMini[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(false);

  // Filtres
  const [tournamentId, setTournamentId] = useState<string>('');
  const [minMatches, setMinMatches] = useState<string>('3');
  const [search, setSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('winrate');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);

  const fetchTournaments = useCallback(async () => {
    try {
      setLoadingTournaments(true);
      const res = await adminFetch('/api/admin/tournaments?limit=200');
      if (!res.ok) return;
      const json: TournamentsApiResponse = await res.json();
      setTournaments(json.tournaments || []);
    } catch (err) {
      logger.error('Failed to load tournaments for stats filters', err);
    } finally {
      setLoadingTournaments(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch piloté par les seuls filtres/offset listés ; `search` (réactif) est volontairement exclu (appliqué via handleFilterSubmit). adminFetch* est désormais stable mais fetchStats reste hors deps pour ne pas déclencher sur `search`.
  }, [offset, tournamentId, sortBy, sortDir, minMatches]);

  async function fetchStats() {
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (tournamentId) params.set('tournamentId', tournamentId);
      if (search.trim()) params.set('search', search.trim());
      if (minMatches) params.set('minMatches', minMatches);
      if (sortBy) params.set('sortBy', sortBy);
      if (sortDir) params.set('sortDir', sortDir);

      const json = await adminFetchJson<TeamStatsApiResponse>(
        '/api/admin/stats/teams?' + params.toString()
      );
      setStats(json.stats || []);
      setTotal(typeof json.total === 'number' ? json.total : null);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorUnexpected);
    } finally {
      setLoading(false);
    }
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    fetchStats();
  }

  function handleExportCsv() {
    const params = new URLSearchParams();
    params.set('limit', '10000');
    params.set('offset', '0');
    params.set('export', 'csv');
    if (tournamentId) params.set('tournamentId', tournamentId);
    if (search.trim()) params.set('search', search.trim());
    if (minMatches) params.set('minMatches', minMatches);
    if (sortBy) params.set('sortBy', sortBy);
    if (sortDir) params.set('sortDir', sortDir);

    window.location.href = '/api/admin/stats/teams?' + params.toString();
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
                    : 'bg-neutral-700 text-neutral-300'
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
              className="h-8 w-8 rounded-lg border border-neutral-700 object-cover"
            />
          )}
          <span>
            <span className="block font-semibold text-white transition-colors group-hover:text-blue-400">
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
            className="transition-colors hover:text-blue-400"
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
          className={`rounded-lg px-2 py-1 text-xs font-semibold ${
            (row.winrate ?? 0) >= 0.6
              ? 'bg-emerald-900/50 text-emerald-300'
              : (row.winrate ?? 0) >= 0.4
                ? 'bg-amber-900/50 text-amber-300'
                : 'bg-red-900/50 text-red-300'
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
        <span className="font-bold text-white">
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
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {t.heading}
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              {total !== null
                ? format(total > 1 ? t.countRanked_other : t.countRanked_one, {
                    total,
                  })
                : t.loading}
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-4 py-2.5 rounded-xl border border-neutral-600 hover:bg-neutral-800 text-sm font-medium transition-colors flex items-center gap-2"
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
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {t.exportCsv}
          </button>
        </div>
      </div>

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
          {errorMsg}
        </div>
      )}

      {/* Filters */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
        <form
          onSubmit={handleFilterSubmit}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end"
        >
          <div className="lg:col-span-2">
            <label className="block text-sm text-neutral-400 mb-1">
              {t.filterTournamentLabel}
            </label>
            <select
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <label className="block text-sm text-neutral-400 mb-1">
              {t.filterMinMatchesLabel}
            </label>
            <input
              type="number"
              min={0}
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={minMatches}
              onChange={(e) => setMinMatches(e.target.value)}
              placeholder="ex: 3"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
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
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.sortByLabel}
            </label>
            <select
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-sm text-neutral-400 mb-1">
                {t.orderLabel}
              </label>
              <select
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={sortDir}
                onChange={(e) =>
                  setSortDir(e.target.value === 'asc' ? 'asc' : 'desc')
                }
              >
                <option value="desc">{t.orderDesc}</option>
                <option value="asc">{t.orderAsc}</option>
              </select>
            </div>

            <button
              type="submit"
              className="self-end px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              {t.filterSubmit}
            </button>
          </div>
        </form>
      </section>

      {/* Stats Table */}
      {/* Classement — kit partagé (lot A5). L'export CSV reste celui de
          l'écran : il repart au serveur chercher les 10 000 lignes, là où
          l'export du kit n'exporterait que la page affichée. */}
      <section className="rounded-2xl border border-neutral-700/50 bg-neutral-800/50 p-4 backdrop-blur">
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
