// pages/admin/stats/maps.tsx

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type MapStatsRow = {
  map_name: string;
  matches_played: number;
  matches_won_attack?: number | null;
  matches_won_defense?: number | null;
  rounds_played?: number | null;
  match_winrate_attack?: number | null;
  match_winrate_defense?: number | null;
  avg_total_rounds?: number | null;
};

type MapStatsApiResponse = {
  stats: MapStatsRow[];
  total: number | null;
};

export const getServerSideProps = withStaffPage('manager');

function formatPercent(v: number | null | undefined) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function formatNumber(v: number | null | undefined, decimals = 1) {
  if (v == null) return '—';
  return v.toFixed(decimals);
}

function rankBadge(rank: number) {
  if (rank === 1)
    return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
  if (rank === 2)
    return 'bg-neutral-400/20 text-neutral-300 border border-neutral-400/30';
  if (rank === 3)
    return 'bg-orange-600/20 text-orange-300 border border-orange-500/30';
  return 'bg-neutral-700/50 text-neutral-400';
}

function AdminMapsStatsPage({}: StaffProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [stats, setStats] = useState<MapStatsRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);

  // Filtres
  const [searchMap, setSearchMap] = useState<string>('');
  const [minMatches, setMinMatches] = useState<string>('1');
  const [sortBy, setSortBy] = useState<string>('matches_played');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, sortBy, sortDir, minMatches]);

  async function fetchStats() {
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (searchMap.trim()) params.set('search', searchMap.trim());
      if (minMatches) params.set('minMatches', minMatches);
      if (sortBy) params.set('sortBy', sortBy);
      if (sortDir) params.set('sortDir', sortDir);

      const res = await fetch('/api/admin/stats/maps?' + params.toString());
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger les stats maps');
      }

      const json: MapStatsApiResponse = await res.json();
      setStats(json.stats || []);
      setTotal(typeof json.total === 'number' ? json.total : null);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
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
    if (searchMap.trim()) params.set('search', searchMap.trim());
    if (minMatches) params.set('minMatches', minMatches);
    if (sortBy) params.set('sortBy', sortBy);
    if (sortDir) params.set('sortDir', sortDir);

    window.location.href = '/api/admin/stats/maps?' + params.toString();
  }

  const backUrl = '/admin';

  return (
    <>
      <Head>
        <title>Admin – Stats maps</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push(backUrl)}
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
              Retour au dashboard admin
            </button>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Stats maps
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  Analyse des performances & de la popularité des maps
                  (pick-rate, winrate attaque/défense, volume de matchs &
                  manches).
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportCsv}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Export CSV
              </button>
            </div>
          </div>

          {/* Filters */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <form
              onSubmit={handleFilterSubmit}
              className="flex gap-4 flex-wrap items-end"
            >
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Map
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
                    placeholder="Nom de la map (ex: Ascent, Bind…)"
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={searchMap}
                    onChange={(e) => setSearchMap(e.target.value)}
                  />
                </div>
              </div>

              <div className="w-36">
                <label className="block text-sm text-neutral-400 mb-1">
                  Min. matchs
                </label>
                <input
                  type="number"
                  min={0}
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={minMatches}
                  onChange={(e) => setMinMatches(e.target.value)}
                  placeholder="ex: 5"
                />
              </div>

              <div className="min-w-[180px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Trier par
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="matches_played">Matchs joués</option>
                  <option value="rounds_played">Rounds totaux</option>
                  <option value="match_winrate_attack">Victoires Team 1</option>
                  <option value="match_winrate_defense">Victoires Team 2</option>
                  <option value="avg_total_rounds">Moy. rounds/match</option>
                  <option value="map_name">Nom de la map</option>
                </select>
              </div>

              <div className="w-36">
                <label className="block text-sm text-neutral-400 mb-1">
                  Ordre
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={sortDir}
                  onChange={(e) =>
                    setSortDir(e.target.value === 'asc' ? 'asc' : 'desc')
                  }
                >
                  <option value="desc">Descendant</option>
                  <option value="asc">Ascendant</option>
                </select>
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
                Filtrer
              </button>
            </form>
          </section>

          {/* Error */}
          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/30 border border-red-600/50 px-4 py-3 flex items-center gap-3">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm text-red-200">{errorMsg}</span>
            </div>
          )}

          {/* Table */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-700/50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <svg
                  className="w-5 h-5 text-neutral-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  />
                </svg>
                <span className="font-semibold">
                  {loading
                    ? 'Chargement...'
                    : `Maps (${stats.length}${total != null ? ` / ${total}` : ''})`}
                </span>
              </div>
              <span className="text-xs text-neutral-500">
                Calcul effectué côté API à partir des matchs et des rounds
                joués.
              </span>
            </div>

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
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  />
                </svg>
                Aucune map pour ces filtres.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-900/50 text-neutral-400">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">#</th>
                      <th className="px-4 py-3 text-left font-medium">Map</th>
                      <th className="px-4 py-3 text-center font-medium">
                        Matchs joués
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        Victoires Team 1
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        Victoires Team 2
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        Winrate T1 / T2
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        Rounds totaux
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        Moy. rounds/match
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700/50">
                    {stats.map((row, index) => {
                      const rank = offset + index + 1;

                      return (
                        <tr
                          key={`${row.map_name}-${index}`}
                          className="hover:bg-neutral-700/30 transition-colors"
                        >
                          {/* Rank */}
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${rankBadge(rank)}`}
                            >
                              {rank}
                            </span>
                          </td>

                          {/* Map name */}
                          <td className="px-4 py-3">
                            <div className="font-semibold text-white">
                              {row.map_name}
                            </div>
                          </td>

                          {/* Matches played */}
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-1 rounded-lg bg-neutral-700/50 text-neutral-200 text-sm font-medium">
                              {row.matches_played}
                            </span>
                          </td>

                          {/* Wins Team 1 */}
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-1 rounded-lg bg-emerald-600/20 text-emerald-300 text-sm font-medium">
                              {row.matches_won_attack ?? 0}
                            </span>
                          </td>

                          {/* Wins Team 2 */}
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-1 rounded-lg bg-sky-600/20 text-sky-300 text-sm font-medium">
                              {row.matches_won_defense ?? 0}
                            </span>
                          </td>

                          {/* Winrate T1 / T2 */}
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <span className="px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-300 text-xs font-medium">
                                {formatPercent(row.match_winrate_attack)}
                              </span>
                              <span className="text-neutral-500">/</span>
                              <span className="px-2 py-0.5 rounded bg-sky-600/20 text-sky-300 text-xs font-medium">
                                {formatPercent(row.match_winrate_defense)}
                              </span>
                            </div>
                          </td>

                          {/* Total rounds */}
                          <td className="px-4 py-3 text-center">
                            <span className="font-medium">
                              {row.rounds_played ?? '—'}
                            </span>
                          </td>

                          {/* Avg rounds per match */}
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-1 rounded-lg bg-purple-600/20 text-purple-300 text-sm font-medium">
                              {formatNumber(row.avg_total_rounds)}
                            </span>
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
                Précédent
              </button>

              <span className="text-neutral-400 text-sm">
                {offset + 1} – {offset + stats.length}
                {total ? ` sur ${total}` : ''}
              </span>

              <button
                type="button"
                disabled={total !== null && offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Suivant
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

export default AdminMapsStatsPage;
