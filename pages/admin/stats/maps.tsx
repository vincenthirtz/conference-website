// pages/admin/stats/maps.tsx

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { StaffRoleBadge } from '@/components/admin/StaffRoleBadge';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};
type TournamentMini = {
  id: string;
  name: string;
  slug: string | null;
};

type MapStatsRow = {
  map_name: string;
  tournament_id: string | null;
  tournament: TournamentMini | null;

  // occurrences au niveau matchs
  matches_played: number;
  matches_won_attack?: number | null;
  matches_won_defense?: number | null;

  // occurrences au niveau manches / rounds (optionnel selon ton backend)
  rounds_played?: number | null;
  rounds_won_attack?: number | null;
  rounds_won_defense?: number | null;

  // winrates calculés côté API
  match_winrate_attack?: number | null; // 0–1
  match_winrate_defense?: number | null; // 0–1
  round_winrate_attack?: number | null; // 0–1
  round_winrate_defense?: number | null; // 0–1;

  // stats génériques
  avg_total_rounds?: number | null;
  pick_rate?: number | null; // proportion de matchs du tournoi où la map est jouée
  ban_rate?: number | null; // si ton système gère les bans
};

type MapStatsApiResponse = {
  stats: MapStatsRow[];
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

function formatNumber(v: number | null | undefined, decimals = 1) {
  if (v == null) return '—';
  return v.toFixed(decimals);
}

function AdminMapsStatsPage({ staff }: StaffProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [stats, setStats] = useState<MapStatsRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);

  const [tournaments, setTournaments] = useState<TournamentMini[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(false);

  // Filtres
  const [tournamentId, setTournamentId] = useState<string>('');
  const [searchMap, setSearchMap] = useState<string>('');
  const [minMatches, setMinMatches] = useState<string>('5');
  const [sortBy, setSortBy] = useState<string>('pick_rate');
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
      const res = await fetch('/api/admin/tournaments?limit=200');
      if (!res.ok) return;
      const json: TournamentsApiResponse = await res.json();
      setTournaments(json.tournaments || []);
    } catch (err) {
      console.error('Failed to load tournaments for map stats filters', err);
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
      if (searchMap.trim()) params.set('search', searchMap.trim());
      if (minMatches) params.set('minMatches', minMatches);
      if (sortBy) params.set('sortBy', sortBy);
      if (sortDir) params.set('sortDir', sortDir);

      // Endpoint admin stats maps – à implémenter côté API:
      // GET /api/admin/stats/maps
      const res = await fetch('/api/admin/stats/maps?' + params.toString());
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger les stats maps');
      }

      const json: MapStatsApiResponse = await res.json();
      setStats(json.stats || []);
      setTotal(typeof json.total === 'number' ? json.total : null);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
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

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <header className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push(backUrl)}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour au dashboard admin
            </button>
            <h1 className="text-3xl font-bold">Stats maps</h1>
            <p className="text-neutral-400 text-sm mt-1">
              Analyse des performances & de la popularité des maps (pick-rate,
              winrate attaque/défense, volume de matchs & manches).
            </p>
          </div>
          <StaffRoleBadge staff={staff} />
        </header>

        {/* Filters */}
        <form
          onSubmit={handleFilterSubmit}
          className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-end"
        >
          <div className="flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs text-neutral-400">Tournoi</label>
            <select
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={tournamentId}
              onChange={(e) => setTournamentId(e.target.value)}
              disabled={loadingTournaments}
            >
              <option value="">
                {loadingTournaments
                  ? 'Chargement des tournois…'
                  : 'Tous les tournois'}
              </option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.slug ? ` (${t.slug})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs text-neutral-400">Map</label>
            <input
              type="text"
              placeholder="Nom de la map (ex: Ascent, Bind…) "
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchMap}
              onChange={(e) => setSearchMap(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1 w-36">
            <label className="text-xs text-neutral-400">Min. matchs</label>
            <input
              type="number"
              min={0}
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={minMatches}
              onChange={(e) => setMinMatches(e.target.value)}
              placeholder="ex: 5"
            />
          </div>

          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-xs text-neutral-400">Trier par</label>
            <select
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="pick_rate">Pick-rate</option>
              <option value="ban_rate">Ban-rate</option>
              <option value="matches_played">Matchs joués</option>
              <option value="rounds_played">Manches jouées</option>
              <option value="match_winrate_attack">
                Winrate match (attaque)
              </option>
              <option value="match_winrate_defense">
                Winrate match (défense)
              </option>
              <option value="round_winrate_attack">
                Winrate round (attaque)
              </option>
              <option value="round_winrate_defense">
                Winrate round (défense)
              </option>
              <option value="avg_total_rounds">Nb moyen de manches</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 w-32">
            <label className="text-xs text-neutral-400">Ordre</label>
            <select
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="ml-auto px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-sm font-semibold"
          >
            Filtrer
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-4 py-2 rounded border border-neutral-600 text-sm hover:bg-neutral-800"
          >
            Export CSV
          </button>
        </form>

        {/* Error */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Table */}
        <section className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-700 flex justify-between items-center">
            <span className="text-sm font-semibold">
              {loading
                ? 'Chargement...'
                : `Maps (${stats.length}${total != null ? ` / ${total}` : ''})`}
            </span>
            <span className="text-xs text-neutral-400">
              Calcul effectué côté API à partir des matchs et des rounds joués.
            </span>
          </div>

          {stats.length === 0 && !loading && (
            <div className="px-4 py-6 text-sm text-neutral-400">
              Aucune map pour ces filtres.
            </div>
          )}

          {stats.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-neutral-750 text-neutral-300">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Map</th>
                    <th className="px-3 py-2 text-left">Tournoi</th>
                    <th className="px-3 py-2 text-center">Matchs</th>
                    <th className="px-3 py-2 text-center">Pick-rate</th>
                    <th className="px-3 py-2 text-center">Ban-rate</th>
                    <th className="px-3 py-2 text-center">
                      Winrate match A / D
                    </th>
                    <th className="px-3 py-2 text-center">Manches totales</th>
                    <th className="px-3 py-2 text-center">
                      Winrate round A / D
                    </th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((row, index) => {
                    const rank = offset + index + 1;

                    const roundsPlayed =
                      row.rounds_played != null ? row.rounds_played : null;

                    const totalRoundWinrateA = formatPercent(
                      row.round_winrate_attack
                    );
                    const totalRoundWinrateD = formatPercent(
                      row.round_winrate_defense
                    );

                    return (
                      <tr
                        key={`${row.map_name}-${row.tournament_id || 'global'}`}
                        className="border-t border-neutral-700"
                      >
                        {/* Rank */}
                        <td className="px-3 py-2 text-center font-semibold">
                          {rank}
                        </td>

                        {/* Map name */}
                        <td className="px-3 py-2">
                          <div className="font-semibold text-neutral-50">
                            {row.map_name}
                          </div>
                        </td>

                        {/* Tournament */}
                        <td className="px-3 py-2">
                          {row.tournament ? (
                            <div>
                              <div className="font-medium text-neutral-100">
                                {row.tournament.name}
                              </div>
                              {row.tournament.slug && (
                                <div className="text-[10px] text-neutral-500 font-mono">
                                  {row.tournament.slug}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-neutral-500">
                              Tous tournois
                            </span>
                          )}
                        </td>

                        {/* Matches */}
                        <td className="px-3 py-2 text-center">
                          {row.matches_played}
                        </td>

                        {/* Pick / Ban rate */}
                        <td className="px-3 py-2 text-center font-semibold">
                          {formatPercent(row.pick_rate)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {formatPercent(row.ban_rate)}
                        </td>

                        {/* Match winrate attack / defense */}
                        <td className="px-3 py-2 text-center">
                          <div>
                            <span className="text-emerald-300">
                              {formatPercent(row.match_winrate_attack)}
                            </span>{' '}
                            /{' '}
                            <span className="text-sky-300">
                              {formatPercent(row.match_winrate_defense)}
                            </span>
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            (Victoires match selon side de départ)
                          </div>
                        </td>

                        {/* Rounds info */}
                        <td className="px-3 py-2 text-center">
                          {roundsPlayed != null ? (
                            <>
                              <div>{roundsPlayed}</div>
                              <div className="text-[10px] text-neutral-500">
                                Moyenne : {formatNumber(row.avg_total_rounds)}
                              </div>
                            </>
                          ) : (
                            <span className="text-neutral-500">—</span>
                          )}
                        </td>

                        {/* Round winrate A/D */}
                        <td className="px-3 py-2 text-center">
                          {roundsPlayed != null ? (
                            <>
                              <div>
                                <span className="text-emerald-300">
                                  {totalRoundWinrateA}
                                </span>{' '}
                                /{' '}
                                <span className="text-sky-300">
                                  {totalRoundWinrateD}
                                </span>
                              </div>
                              <div className="text-[10px] text-neutral-500">
                                (Winrate par manche)
                              </div>
                            </>
                          ) : (
                            <span className="text-neutral-500">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-2 text-right align-top">
                          <div className="flex flex-col gap-2 items-end">
                            {row.tournament_id && (
                              <Link
                                href={`/tournament/${row.tournament_id}/maps`}
                                className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-[11px]"
                                target="_blank"
                              >
                                Voir maps tournoi (public)
                              </Link>
                            )}
                            {row.tournament_id && (
                              <Link
                                href={`/tournament/${row.tournament_id}/stats`}
                                className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-[11px]"
                                target="_blank"
                              >
                                Stats tournoi
                              </Link>
                            )}
                          </div>
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
          <div className="flex justify-between items-center mt-6 text-sm">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className={`px-3 py-2 rounded ${
                offset === 0
                  ? 'bg-neutral-700 opacity-40 cursor-not-allowed'
                  : 'bg-neutral-700 hover:bg-neutral-600'
              }`}
            >
              ← Précédent
            </button>

            <span className="text-neutral-400">
              {offset + 1} – {offset + stats.length}
              {total ? ` / ${total}` : ''}
            </span>

            <button
              disabled={total !== null && offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
              className={`px-3 py-2 rounded ${
                total !== null && offset + limit >= total
                  ? 'bg-neutral-700 opacity-40 cursor-not-allowed'
                  : 'bg-neutral-700 hover:bg-neutral-600'
              }`}
            >
              Suivant →
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default AdminMapsStatsPage;
