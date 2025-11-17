// pages/admin/stats/teams.tsx

import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { withStaffPage } from "@/utils/staff";
import { StaffRoleBadge } from "@/components/admin/StaffRoleBadge";

type StaffProps= {
  id: string;                // plus de `| null`
  role: string;
  display_name: string | null;
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

  winrate: number | null; // 0–1
  map_winrate: number | null; // 0–1

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

export const getServerSideProps = withStaffPage("manager");

function formatPercent(v: number | null | undefined) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function AdminTeamsStatsPage({ staff }: StaffProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [stats, setStats] = useState<TeamStatsRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);

  const [tournaments, setTournaments] = useState<TournamentMini[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(false);

  // Filtres
  const [tournamentId, setTournamentId] = useState<string>("");
  const [minMatches, setMinMatches] = useState<string>("3");
  const [search, setSearch] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("winrate");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

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
      const res = await fetch("/api/admin/tournaments?limit=200");
      if (!res.ok) return;
      const json: TournamentsApiResponse = await res.json();
      setTournaments(json.tournaments || []);
    } catch (err) {
      console.error("Failed to load tournaments for stats filters", err);
    } finally {
      setLoadingTournaments(false);
    }
  }

  async function fetchStats() {
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (tournamentId) params.set("tournamentId", tournamentId);
      if (search.trim()) params.set("search", search.trim());
      if (minMatches) params.set("minMatches", minMatches);
      if (sortBy) params.set("sortBy", sortBy);
      if (sortDir) params.set("sortDir", sortDir);

      // Endpoint admin stats équipes – à implémenter côté API:
      // GET /api/admin/stats/teams
      const res = await fetch("/api/admin/stats/teams?" + params.toString());
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Impossible de charger les stats équipes");
      }

      const json: TeamStatsApiResponse = await res.json();
      setStats(json.stats || []);
      setTotal(typeof json.total === "number" ? json.total : null);
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur inattendue");
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
    params.set("limit", "10000");
    params.set("offset", "0");
    params.set("export", "csv");
    if (tournamentId) params.set("tournamentId", tournamentId);
    if (search.trim()) params.set("search", search.trim());
    if (minMatches) params.set("minMatches", minMatches);
    if (sortBy) params.set("sortBy", sortBy);
    if (sortDir) params.set("sortDir", sortDir);

    window.location.href = "/api/admin/stats/teams?" + params.toString();
  }

  const backUrl = "/admin";

  return (
    <>
      <Head>
        <title>Admin – Stats équipes</title>
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
            <h1 className="text-3xl font-bold">Stats équipes</h1>
            <p className="text-neutral-400 text-sm mt-1">
              Classement statistique des équipes (victoires, winrate, maps, points),
              filtré par tournoi et volume de matchs.
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
                  ? "Chargement des tournois…"
                  : "Tous les tournois"}
              </option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.slug ? ` (${t.slug})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 w-36">
            <label className="text-xs text-neutral-400">
              Min. matchs
            </label>
            <input
              type="number"
              min={0}
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={minMatches}
              onChange={(e) => setMinMatches(e.target.value)}
              placeholder="ex: 3"
            />
          </div>

          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs text-neutral-400">Recherche équipe</label>
            <input
              type="text"
              placeholder="Nom équipe, tag…"
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-xs text-neutral-400">Trier par</label>
            <select
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="winrate">Winrate match</option>
              <option value="map_winrate">Winrate maps</option>
              <option value="matches_played">Matchs joués</option>
              <option value="points">Points</option>
              <option value="last_match_at">Dernier match</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 w-32">
            <label className="text-xs text-neutral-400">Ordre</label>
            <select
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={sortDir}
              onChange={(e) =>
                setSortDir(e.target.value === "asc" ? "asc" : "desc")
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
                ? "Chargement..."
                : `Équipes (${stats.length}${total != null ? ` / ${total}` : ""})`}
            </span>
            <span className="text-xs text-neutral-400">
              Classement calculé côté API (matchs officiels du tournoi sélectionné).
            </span>
          </div>

          {stats.length === 0 && !loading && (
            <div className="px-4 py-6 text-sm text-neutral-400">
              Aucune équipe pour ces filtres.
            </div>
          )}

          {stats.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-neutral-750 text-neutral-300">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Équipe</th>
                    <th className="px-3 py-2 text-left">Tournoi</th>
                    <th className="px-3 py-2 text-center">Matchs</th>
                    <th className="px-3 py-2 text-center">V / D / N</th>
                    <th className="px-3 py-2 text-center">Winrate</th>
                    <th className="px-3 py-2 text-center">Maps + / −</th>
                    <th className="px-3 py-2 text-center">Winrate maps</th>
                    <th className="px-3 py-2 text-center">Points</th>
                    <th className="px-3 py-2 text-left">Dernier match</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((row, index) => {
                    const rank = offset + index + 1;
                    const teamName = row.team?.name || row.team_id;
                    const short = row.team?.short_name;
                    const diff = (row.maps_won ?? 0) - (row.maps_lost ?? 0);

                    return (
                      <tr
                        key={`${row.team_id}-${row.tournament_id || "global"}`}
                        className="border-t border-neutral-700"
                      >
                        {/* Rank */}
                        <td className="px-3 py-2 text-center font-semibold">
                          {rank}
                        </td>

                        {/* Team */}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {row.team?.logo_url && (
                              <img
                                src={row.team.logo_url}
                                alt={teamName}
                                className="w-7 h-7 rounded object-cover border border-neutral-700"
                              />
                            )}
                            <div>
                              <div className="font-semibold text-neutral-50">
                                {teamName}
                              </div>
                              {short && (
                                <div className="text-[10px] text-neutral-400">
                                  {short}
                                </div>
                              )}
                            </div>
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
                            <span className="text-neutral-500">—</span>
                          )}
                        </td>

                        {/* Matches */}
                        <td className="px-3 py-2 text-center">
                          {row.matches_played}
                        </td>

                        {/* W/D/L */}
                        <td className="px-3 py-2 text-center">
                          {row.wins} / {row.losses} / {row.draws}
                        </td>

                        {/* Match winrate */}
                        <td className="px-3 py-2 text-center font-semibold">
                          {formatPercent(row.winrate)}
                        </td>

                        {/* Maps +/- */}
                        <td className="px-3 py-2 text-center">
                          {row.maps_won} / {row.maps_lost}{" "}
                          <span
                            className={
                              diff > 0
                                ? "text-emerald-300"
                                : diff < 0
                                ? "text-red-300"
                                : "text-neutral-300"
                            }
                          >
                            ({diff > 0 ? "+" : ""}
                            {diff})
                          </span>
                        </td>

                        {/* Map winrate */}
                        <td className="px-3 py-2 text-center">
                          {formatPercent(row.map_winrate)}
                        </td>

                        {/* Points */}
                        <td className="px-3 py-2 text-center font-semibold">
                          {row.points != null ? row.points : "—"}
                        </td>

                        {/* Last match */}
                        <td className="px-3 py-2 text-xs text-neutral-300">
                          {formatDateTime(row.last_match_at)}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-2 text-right align-top">
                          <div className="flex flex-col gap-2 items-end">
                            <Link
                              href={`/admin/teams/${row.team_id}`}
                              className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-[11px]"
                            >
                              Voir équipe (admin)
                            </Link>
                            <Link
                              href={`/team/${row.team_id}`}
                              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-[11px]"
                              target="_blank"
                            >
                              Fiche publique
                            </Link>
                            {row.tournament_id && (
                              <Link
                                href={`/admin/tournament/${row.tournament_id}`}
                                className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-[11px]"
                              >
                                Ouvrir tournoi
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
                  ? "bg-neutral-700 opacity-40 cursor-not-allowed"
                  : "bg-neutral-700 hover:bg-neutral-600"
              }`}
            >
              ← Précédent
            </button>

            <span className="text-neutral-400">
              {offset + 1} – {offset + stats.length}
              {total ? ` / ${total}` : ""}
            </span>

            <button
              disabled={total !== null && offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
              className={`px-3 py-2 rounded ${
                total !== null && offset + limit >= total
                  ? "bg-neutral-700 opacity-40 cursor-not-allowed"
                  : "bg-neutral-700 hover:bg-neutral-600"
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

export default AdminTeamsStatsPage;
