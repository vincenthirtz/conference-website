// pages/admin/logs.tsx

import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { withStaffPage } from "@/utils/staff";
import { StaffRoleBadge } from "@/components/admin/StaffRoleBadge";

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type StaffLog = {
  id: string;
  created_at: string;
  staff_id: string | null;
  staff_role: string | null;
  staff_display_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  tournament_id: string | null;
  stage_id: string | null;
  match_id: string | null;
  team_id: string | null;
  payload: any | null;
  message: string | null;
};

type LogsApiResponse = {
  logs: StaffLog[];
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

export const getServerSideProps = withStaffPage("manager");

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function shortId(id: string | null | undefined) {
  if (!id) return "";
  if (id.length <= 8) return id;
  return id.slice(0, 4) + "…" + id.slice(-3);
}

function AdminLogsPage({ staff }: StaffProps) {
  const router = useRouter();

  const [logs, setLogs] = useState<StaffLog[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [tournaments, setTournaments] = useState<TournamentMini[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(false);

  // Filtres
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [staffId, setStaffId] = useState("");
  const [tournamentId, setTournamentId] = useState("");
  const [stageId, setStageId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    fetchTournaments();
  }, []);

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, entityType, action, staffId, tournamentId, stageId, matchId, teamId]);

  async function fetchTournaments() {
    try {
      setLoadingTournaments(true);
      const res = await fetch("/api/admin/tournaments?limit=200");
      if (!res.ok) return;
      const json: TournamentsApiResponse = await res.json();
      setTournaments(json.tournaments || []);
    } catch (e) {
      console.error("Failed to load tournaments for logs filter", e);
    } finally {
      setLoadingTournaments(false);
    }
  }

  async function fetchLogs() {
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (entityType.trim()) params.set("entityType", entityType.trim());
      if (action.trim()) params.set("action", action.trim());
      if (staffId.trim()) params.set("staffId", staffId.trim());
      if (tournamentId.trim()) params.set("tournamentId", tournamentId.trim());
      if (stageId.trim()) params.set("stageId", stageId.trim());
      if (matchId.trim()) params.set("matchId", matchId.trim());
      if (teamId.trim()) params.set("teamId", teamId.trim());
      if (search.trim()) params.set("search", search.trim());
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);

      const res = await fetch("/api/admin/logs?" + params.toString());
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Impossible de charger les logs");
      }

      const json: LogsApiResponse = await res.json();
      setLogs(json.logs || []);
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
    fetchLogs();
  }

  const backUrl = "/admin";

  return (
    <>
      <Head>
        <title>Admin – Logs staff</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push(backUrl)}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour au dashboard admin
            </button>
            <h1 className="text-3xl font-bold">Logs staff</h1>
            <p className="text-neutral-400 text-sm mt-1">
              Historique global des actions staff (tournois, stages, matches, teams…).
            </p>
          </div>
          <StaffRoleBadge staff={staff} />
        </div>

        {/* Filters */}
        <form
          onSubmit={handleFilterSubmit}
          className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-end"
        >
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs text-neutral-400">Type d&apos;entité</label>
            <input
              type="text"
              placeholder='ex: "tournament", "stage", "match", "team"...'
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs text-neutral-400">Action</label>
            <input
              type="text"
              placeholder='ex: "create_match", "update_stage"...'
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs text-neutral-400">Staff (id ou display_name)</label>
            <input
              type="text"
              placeholder="staff_id ou nom"
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs text-neutral-400">Tournoi</label>
            <select
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={tournamentId}
              onChange={(e) => setTournamentId(e.target.value)}
              disabled={loadingTournaments}
            >
              <option value="">
                {loadingTournaments
                  ? "Chargement…"
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

          <div className="flex flex-col gap-1 w-32">
            <label className="text-xs text-neutral-400">Stage ID</label>
            <input
              type="text"
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              placeholder="stage…"
            />
          </div>

          <div className="flex flex-col gap-1 w-32">
            <label className="text-xs text-neutral-400">Match ID</label>
            <input
              type="text"
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
              placeholder="match…"
            />
          </div>

          <div className="flex flex-col gap-1 w-32">
            <label className="text-xs text-neutral-400">Team ID</label>
            <input
              type="text"
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              placeholder="team…"
            />
          </div>

          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs text-neutral-400">Recherche texte</label>
            <input
              type="text"
              placeholder="message, payload, id…"
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">Du</label>
            <input
              type="date"
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">Au</label>
            <input
              type="date"
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="ml-auto px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-sm font-semibold"
          >
            Filtrer
          </button>
        </form>

        {/* Error */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Table */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-700 flex justify-between items-center">
            <span className="text-sm font-semibold">
              {loading
                ? "Chargement..."
                : `Logs (${logs.length}${total != null ? ` / ${total}` : ""})`}
            </span>
            <span className="text-xs text-neutral-400">
              Triés par date décroissante (géré côté API).
            </span>
          </div>

          {logs.length === 0 && !loading && (
            <div className="px-4 py-6 text-sm text-neutral-400">
              Aucun log trouvé pour ces filtres.
            </div>
          )}

          {logs.length > 0 && (
            <ul className="divide-y divide-neutral-700">
              {logs.map((log) => (
                <li key={log.id} className="px-4 py-3 text-sm flex flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-neutral-500">
                        {formatDateTime(log.created_at)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-700 text-neutral-100">
                        {log.action}
                      </span>
                      {log.entity_type && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-neutral-900 border border-neutral-700 text-neutral-300">
                          {log.entity_type}
                          {log.entity_id ? ` #${shortId(log.entity_id)}` : ""}
                        </span>
                      )}
                      {log.tournament_id && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-neutral-900 border border-neutral-700 text-neutral-400">
                          T:{shortId(log.tournament_id)}
                        </span>
                      )}
                      {log.stage_id && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-neutral-900 border border-neutral-700 text-neutral-400">
                          S:{shortId(log.stage_id)}
                        </span>
                      )}
                      {log.match_id && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-neutral-900 border border-neutral-700 text-neutral-400">
                          M:{shortId(log.match_id)}
                        </span>
                      )}
                      {log.team_id && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-neutral-900 border border-neutral-700 text-neutral-400">
                          Team:{shortId(log.team_id)}
                        </span>
                      )}
                    </div>

                    {log.staff_id && (
                      <div className="flex items-center gap-2 text-xs text-neutral-400">
                        <span className="text-neutral-500">par</span>
                        <span className="font-medium text-neutral-200">
                          {log.staff_display_name || log.staff_id}
                        </span>
                        {log.staff_role && (
                          <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-700 text-[10px] uppercase tracking-wide">
                            {log.staff_role}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {log.message && (
                    <div className="text-neutral-200">
                      {log.message}
                    </div>
                  )}

                  {log.payload && (
                    <details className="mt-1 text-xs text-neutral-400">
                      <summary className="cursor-pointer select-none hover:text-neutral-200">
                        Détails (payload)
                      </summary>
                      <pre className="mt-1 bg-neutral-900 border border-neutral-800 rounded p-2 text-[11px] overflow-x-auto">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </details>
                  )}

                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-blue-300">
                    {log.tournament_id && (
                      <Link
                        href={`/admin/tournament/${log.tournament_id}`}
                        className="hover:underline"
                      >
                        Ouvrir tournoi
                      </Link>
                    )}
                    {log.stage_id && (
                      <Link
                        href={`/admin/stages/${log.stage_id}`}
                        className="hover:underline"
                      >
                        Ouvrir phase
                      </Link>
                    )}
                    {log.match_id && (
                      <Link
                        href={`/admin/matches/${log.match_id}`}
                        className="hover:underline"
                      >
                        Ouvrir match
                      </Link>
                    )}
                    {log.team_id && (
                      <Link
                        href={`/admin/teams/${log.team_id}`}
                        className="hover:underline"
                      >
                        Ouvrir équipe
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pagination */}
        {logs.length > 0 && (
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
              {offset + 1} – {offset + logs.length}
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

export default AdminLogsPage;
