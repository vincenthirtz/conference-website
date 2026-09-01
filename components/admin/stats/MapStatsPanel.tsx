import { useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable';
import nsAdminStatsMaps from '@/lib/i18n/locales/admin-fr/adminStatsMaps';

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

/**
 * "Maps" tab of the merged /admin/stats page: per-map aggregate stats with
 * search / min-matches filters, sortable table and CSV export.
 */
export default function MapStatsPanel() {
  const t = useAdminT(nsAdminStatsMaps);
  const { adminFetchJson } = useAdminFetch();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch piloté par les seuls filtres/offset listés ; `searchMap` (réactif) est volontairement exclu (appliqué via handleFilterSubmit). adminFetch* est désormais stable mais fetchStats reste hors deps pour ne pas déclencher sur `searchMap`.
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

      const json = await adminFetchJson<MapStatsApiResponse>(
        '/api/admin/stats/maps?' + params.toString()
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
    if (searchMap.trim()) params.set('search', searchMap.trim());
    if (minMatches) params.set('minMatches', minMatches);
    if (sortBy) params.set('sortBy', sortBy);
    if (sortDir) params.set('sortDir', sortDir);

    window.location.href = '/api/admin/stats/maps?' + params.toString();
  }

  const columns: DataTableColumn<MapStatsRow>[] = [
    {
      key: 'rank',
      header: '#',
      sortable: false,
      render: (row) => {
        const rank = offset + stats.indexOf(row) + 1;
        return (
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${rankBadge(rank)}`}
          >
            {rank}
          </span>
        );
      },
    },
    {
      key: 'map',
      header: t.thMap,
      value: (row) => row.map_name,
      className: 'font-semibold text-white',
    },
    {
      key: 'played',
      header: t.thMatchesPlayed,
      headerClassName: 'text-center',
      className: 'text-center',
      value: (row) => row.matches_played,
      render: (row) => (
        <span className="rounded-lg bg-neutral-700/50 px-2 py-1 text-sm font-medium text-neutral-200">
          {row.matches_played}
        </span>
      ),
    },
    {
      key: 'wins_t1',
      header: t.thWinsTeam1,
      headerClassName: 'text-center',
      className: 'text-center',
      value: (row) => row.matches_won_attack ?? 0,
      render: (row) => (
        <span className="rounded-lg bg-emerald-600/20 px-2 py-1 text-sm font-medium text-emerald-300">
          {row.matches_won_attack ?? 0}
        </span>
      ),
    },
    {
      key: 'wins_t2',
      header: t.thWinsTeam2,
      headerClassName: 'text-center',
      className: 'text-center',
      value: (row) => row.matches_won_defense ?? 0,
      render: (row) => (
        <span className="rounded-lg bg-sky-600/20 px-2 py-1 text-sm font-medium text-sky-300">
          {row.matches_won_defense ?? 0}
        </span>
      ),
    },
    {
      key: 'winrate',
      header: t.thWinrate,
      headerClassName: 'text-center',
      className: 'text-center',
      value: (row) => row.match_winrate_attack ?? 0,
      render: (row) => (
        <span className="flex items-center justify-center gap-1">
          <span className="rounded bg-emerald-600/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
            {formatPercent(row.match_winrate_attack)}
          </span>
          <span className="text-neutral-500">/</span>
          <span className="rounded bg-sky-600/20 px-2 py-0.5 text-xs font-medium text-sky-300">
            {formatPercent(row.match_winrate_defense)}
          </span>
        </span>
      ),
    },
    {
      key: 'rounds',
      header: t.thRoundsTotal,
      headerClassName: 'text-center',
      className: 'text-center font-medium',
      value: (row) => row.rounds_played ?? 0,
      render: (row) => <>{row.rounds_played ?? '—'}</>,
    },
    {
      key: 'avg_rounds',
      header: t.thAvgRounds,
      headerClassName: 'text-center',
      className: 'text-center',
      value: (row) => row.avg_total_rounds ?? 0,
      render: (row) => (
        <span className="rounded-lg bg-purple-600/20 px-2 py-1 text-sm font-medium text-purple-300">
          {formatNumber(row.avg_total_rounds)}
        </span>
      ),
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
            <p className="text-neutral-400 text-sm mt-1">{t.subtitle}</p>
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
            {t.exportCsv}
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
              {t.filterMapLabel}
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
                placeholder={t.filterMapPlaceholder}
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchMap}
                onChange={(e) => setSearchMap(e.target.value)}
              />
            </div>
          </div>

          <div className="w-36">
            <label className="block text-sm text-neutral-400 mb-1">
              {t.filterMinMatchesLabel}
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
              {t.sortByLabel}
            </label>
            <select
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="matches_played">{t.sortMatchesPlayed}</option>
              <option value="rounds_played">{t.sortRoundsPlayed}</option>
              <option value="match_winrate_attack">{t.sortWinsTeam1}</option>
              <option value="match_winrate_defense">{t.sortWinsTeam2}</option>
              <option value="avg_total_rounds">{t.sortAvgRounds}</option>
              <option value="map_name">{t.sortMapName}</option>
            </select>
          </div>

          <div className="w-36">
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
            {t.filterSubmit}
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
      {/* Classement des maps — kit partagé (lot A5). Même forme que le
          classement d'équipes : pagination serveur, export maison. */}
      <section className="rounded-2xl border border-neutral-700/50 bg-neutral-800/50 p-4 backdrop-blur">
        <DataTable<MapStatsRow>
          rows={stats}
          columns={columns}
          rowKey={(row) => row.map_name}
          loading={loading}
          error={null}
          emptyTitle={t.emptyState}
          serverPagination={{ offset, limit, total, onOffsetChange: setOffset }}
        />
      </section>
    </>
  );
}
