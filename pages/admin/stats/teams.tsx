import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import { logger } from '../../../utils/logger';
type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

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

export const getServerSideProps = withStaffPage('manager');

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

function AdminTeamsStatsPage({ staff }: StaffProps) {
  const t = useAdminT('adminStatsTeams');
  const router = useRouter();
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

  useEffect(() => {
    fetchTournaments();
  }, []);

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, tournamentId, sortBy, sortDir, minMatches]);

  async function fetchTournaments() {
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
  }

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

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
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
              {t.back}
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {t.heading}
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {total !== null
                    ? format(
                        total > 1 ? t.countRanked_other : t.countRanked_one,
                        {
                          total,
                        }
                      )
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
                    {loadingTournaments
                      ? t.tournamentsLoading
                      : t.tournamentsAll}
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
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : stats.length === 0 ? (
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
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                {t.emptyState}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-900/50 text-neutral-400 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-left">#</th>
                      <th className="px-4 py-3 text-left">{t.thTeam}</th>
                      <th className="px-4 py-3 text-left">{t.thTournament}</th>
                      <th className="px-4 py-3 text-center">{t.thMatches}</th>
                      <th className="px-4 py-3 text-center">{t.thWDL}</th>
                      <th className="px-4 py-3 text-center">{t.thWinrate}</th>
                      <th className="px-4 py-3 text-center">{t.thMaps}</th>
                      <th className="px-4 py-3 text-center">
                        {t.thMapWinrate}
                      </th>
                      <th className="px-4 py-3 text-center">{t.thPoints}</th>
                      <th className="px-4 py-3 text-left">{t.thLastMatch}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700/50">
                    {stats.map((row, index) => {
                      const rank = offset + index + 1;
                      const teamName = row.team?.name || row.team_id;
                      const short = row.team?.short_name;
                      const diff = (row.maps_won ?? 0) - (row.maps_lost ?? 0);

                      return (
                        <tr
                          key={`${row.team_id}-${row.tournament_id || 'global'}`}
                          className="hover:bg-neutral-700/30 transition-colors"
                        >
                          {/* Rank */}
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
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
                          </td>

                          {/* Team */}
                          <td className="px-4 py-3">
                            <Link
                              href={`/admin/teams/${row.team_id}/edit`}
                              className="flex items-center gap-3 group"
                            >
                              {row.team?.logo_url ? (
                                <Image
                                  src={row.team.logo_url}
                                  alt={teamName}
                                  width={32}
                                  height={32}
                                  className="w-8 h-8 rounded-lg object-cover border border-neutral-700"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-neutral-700/50 flex items-center justify-center border border-neutral-700">
                                  <svg
                                    className="w-4 h-4 text-neutral-500"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                                    />
                                  </svg>
                                </div>
                              )}
                              <div>
                                <div className="font-semibold text-white group-hover:text-blue-400 transition-colors">
                                  {teamName}
                                </div>
                                {short && (
                                  <div className="text-xs text-neutral-500">
                                    {short}
                                  </div>
                                )}
                              </div>
                            </Link>
                          </td>

                          {/* Tournament */}
                          <td className="px-4 py-3">
                            {row.tournament ? (
                              <Link
                                href={`/admin/tournament/${row.tournament_id}`}
                                className="hover:text-blue-400 transition-colors"
                              >
                                <div className="font-medium text-neutral-200">
                                  {row.tournament.name}
                                </div>
                                {row.tournament.slug && (
                                  <div className="text-xs text-neutral-500 font-mono">
                                    {row.tournament.slug}
                                  </div>
                                )}
                              </Link>
                            ) : (
                              <span className="text-neutral-500">—</span>
                            )}
                          </td>

                          {/* Matches */}
                          <td className="px-4 py-3 text-center font-medium">
                            {row.matches_played}
                          </td>

                          {/* W/D/L */}
                          <td className="px-4 py-3 text-center">
                            <span className="text-emerald-400">{row.wins}</span>
                            <span className="text-neutral-500"> / </span>
                            <span className="text-red-400">{row.losses}</span>
                            <span className="text-neutral-500"> / </span>
                            <span className="text-neutral-400">
                              {row.draws}
                            </span>
                          </td>

                          {/* Match winrate */}
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                                (row.winrate ?? 0) >= 0.6
                                  ? 'bg-emerald-900/50 text-emerald-300'
                                  : (row.winrate ?? 0) >= 0.4
                                    ? 'bg-amber-900/50 text-amber-300'
                                    : 'bg-red-900/50 text-red-300'
                              }`}
                            >
                              {formatPercent(row.winrate)}
                            </span>
                          </td>

                          {/* Maps +/- */}
                          <td className="px-4 py-3 text-center">
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
                          </td>

                          {/* Map winrate */}
                          <td className="px-4 py-3 text-center text-neutral-300">
                            {formatPercent(row.map_winrate)}
                          </td>

                          {/* Points */}
                          <td className="px-4 py-3 text-center">
                            <span className="font-bold text-white">
                              {row.points != null ? row.points : '—'}
                            </span>
                          </td>

                          {/* Last match */}
                          <td className="px-4 py-3 text-xs text-neutral-400">
                            {formatDateTime(row.last_match_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Pagination */}
          {stats.length > 0 && (
            <div className="flex justify-between items-center mt-6">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
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
                {t.previous}
              </button>

              <span className="text-neutral-400 text-sm">
                {offset + 1} – {offset + stats.length}
                {total ? format(t.paginationOf, { total }) : ''}
              </span>

              <button
                type="button"
                disabled={total !== null && offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {t.next}
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
          )}
        </div>
      </div>
    </>
  );
}

export default AdminTeamsStatsPage;
