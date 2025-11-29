// pages/admin/demandes/index.tsx

import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { StaffRoleBadge } from "@/components/admin/StaffRoleBadge";
import { supabaseClient } from "@/utils/supabase";
import { withStaffPage } from '@/utils/staff';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type DemandeType = "join_team" | "leave_team";

type DemandeStatus = "pending" | "approved" | "rejected" | "cancelled";

type TournamentMini = {
  id: string;
  name: string;
  slug: string | null;
};

type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type UserMini = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  discord_tag?: string | null;
  battlefy_name?: string | null;
};

type StaffMini = {
  id: string;
  display_name: string | null;
};

type Demande = {
  id: string;
  type: DemandeType;
  status: DemandeStatus;
  created_at: string;
  updated_at: string | null;
  tournament_id: string | null;
  team_id: string | null;
  user_id: string | null;
  message: string | null;
  metadata: any | null;
  handled_at?: string | null;
  handled_by?: StaffMini | null;

  tournament?: TournamentMini | null;
  team?: TeamMini | null;
  user?: UserMini | null;
};

type DemandesApiResponse = {
  demandes: Demande[];
  total: number | null;
};

type TournamentsApiResponse = {
  tournaments: TournamentMini[];
  total: number | null;
};

export const getServerSideProps = withStaffPage('manager');

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function typeLabel(type: DemandeType) {
  switch (type) {
    case "join_team":
      return "Rejoindre une équipe";
    case "leave_team":
      return "Quitter une équipe";
    default:
      return type;
  }
}

function typeColor(type: DemandeType) {
  switch (type) {
    case "join_team":
      return "bg-emerald-700/80 text-white";
    case "leave_team":
      return "bg-amber-600/80 text-neutral-900";
    default:
      return "bg-neutral-700 text-neutral-100";
  }
}

function statusLabel(status: DemandeStatus) {
  switch (status) {
    case "pending":
      return "En attente";
    case "approved":
      return "Approuvée";
    case "rejected":
      return "Refusée";
    case "cancelled":
      return "Annulée";
    default:
      return status;
  }
}

function statusColor(status: DemandeStatus) {
  switch (status) {
    case "pending":
      return "bg-neutral-700 text-neutral-100";
    case "approved":
      return "bg-emerald-600/80 text-white";
    case "rejected":
      return "bg-red-700/80 text-white";
    case "cancelled":
      return "bg-neutral-600 text-neutral-100";
    default:
      return "bg-neutral-700 text-neutral-100";
  }
}

function AdminDemandesPage() {
  const router = useRouter();

  // 🔐 Guard auth côté client
  const [guardLoading, setGuardLoading] = useState(true);
  const [staff, setStaff] = useState<StaffShape | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Données page
  const [loading, setLoading] = useState(true);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [tournaments, setTournaments] = useState<TournamentMini[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(false);

  // Filtres
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [tournamentFilter, setTournamentFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  // 1) Guard staff : check session + /api/admin/me
  useEffect(() => {
    const run = async () => {
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();

        if (!session?.access_token) {
          router.push("/admin/login");
          return;
        }

        const accessToken = session.access_token;
        setToken(accessToken);

        const res = await fetch("/api/admin/me", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!res.ok) {
          router.push("/admin/login");
          return;
        }

        const me = await res.json();

        if (!me.role) {
          router.push("/admin/login");
          return;
        }

        setStaff({
          id: (me.id as string) ?? "",
          role: me.role ?? "helper",
          display_name: me.display_name ?? null,
        });
      } catch (e) {
        console.error("staff guard error", e);
        router.push("/admin/login");
        return;
      } finally {
        setGuardLoading(false);
      }
    };

    run();
  }, [router]);

  // 2) Charger les tournois une fois l’auth OK
  useEffect(() => {
    if (!token) return;
    fetchTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // 3) Charger les demandes quand filtres changent (et auth OK)
  useEffect(() => {
    if (!token) return;
    fetchDemandes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, statusFilter, typeFilter, tournamentFilter, token]);

  async function fetchTournaments() {
    try {
      setLoadingTournaments(true);
      const res = await fetch("/api/admin/tournaments?limit=200", {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      });
      if (!res.ok) return; // non bloquant
      const json: TournamentsApiResponse = await res.json();
      setTournaments(json.tournaments || []);
    } catch (e) {
      console.error("Failed to load tournaments for filter", e);
    } finally {
      setLoadingTournaments(false);
    }
  }

  async function fetchDemandes() {
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (tournamentFilter) params.set("tournamentId", tournamentFilter);
      if (search.trim()) params.set("search", search.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch("/api/admin/demandes?" + params.toString(), {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Impossible de charger les demandes");
      }
      const json: DemandesApiResponse = await res.json();
      setDemandes(json.demandes || []);
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
    fetchDemandes();
  }

  function handleExportCsv() {
    const params = new URLSearchParams();
    params.set("limit", "10000");
    params.set("offset", "0");
    params.set("export", "csv");
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (tournamentFilter) params.set("tournamentId", tournamentFilter);
    if (search.trim()) params.set("search", search.trim());
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    const url = "/api/admin/demandes?" + params.toString();

    // on envoie aussi le token pour les routes protégées
    if (token) {
      fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => res.blob())
        .then((blob) => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "demandes.csv";
          a.click();
        })
        .catch((e) => {
          console.error("CSV export error", e);
        });
    } else {
      window.location.href = url;
    }
  }

  const backUrl = "/admin";

  // État de garde : pendant le check auth, on affiche un écran simple
  if (guardLoading) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
        <span className="text-sm text-neutral-400">Vérification des droits…</span>
      </div>
    );
  }

  // Si pas de staff (et pas en train de loader) → on ne rend rien (redir déjà faite)
  if (!staff) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Admin – Demandes d&apos;équipes</title>
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
            <h1 className="text-3xl font-bold">Demandes équipes / joueurs</h1>
            <p className="text-neutral-400 text-sm mt-1">
              Requêtes de joueurs pour rejoindre / quitter une équipe, par
              tournoi. Filtre par type, statut et tournoi.
            </p>
          </div>
          <StaffRoleBadge staff={staff} />
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Filters */}
        <form
          onSubmit={handleFilterSubmit}
          className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-end"
        >
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-xs text-neutral-400">Type</label>
            <select
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">Tous</option>
              <option value="join_team">Rejoindre une équipe</option>
              <option value="leave_team">Quitter une équipe</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 w-40">
            <label className="text-xs text-neutral-400">Statut</label>
            <select
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Tous</option>
              <option value="pending">En attente</option>
              <option value="approved">Approuvée</option>
              <option value="rejected">Refusée</option>
              <option value="cancelled">Annulée</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs text-neutral-400">Tournoi</label>
            <select
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={tournamentFilter}
              onChange={(e) => setTournamentFilter(e.target.value)}
            >
              <option value="">Tous</option>
              {loadingTournaments && (
                <option disabled>Chargement...</option>
              )}
              {!loadingTournaments &&
                tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.slug ? ` (${t.slug})` : ""}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs text-neutral-400">Recherche</label>
            <input
              type="text"
              placeholder="Nom joueur, équipe, Battlefy..."
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
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">Au</label>
            <input
              type="date"
              className="px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
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

        {/* Table */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-700 flex justify-between items-center">
            <span className="text-sm font-semibold">
              {loading
                ? "Chargement..."
                : `Demandes (${demandes.length}${
                    total != null ? ` / ${total}` : ""
                  })`}
            </span>
            <span className="text-xs text-neutral-400">
              Triées par date (plus récentes en haut) – logique gérée côté API.
            </span>
          </div>

          {demandes.length === 0 && !loading && (
            <div className="px-4 py-6 text-sm text-neutral-400">
              Aucune demande trouvée pour ces filtres.
            </div>
          )}

          {demandes.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-750 text-neutral-300">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Joueur</th>
                    <th className="px-3 py-2 text-left">Équipe</th>
                    <th className="px-3 py-2 text-left">Tournoi</th>
                    <th className="px-3 py-2 text-left">Message</th>
                    <th className="px-3 py-2 text-left">Statut</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {demandes.map((d) => (
                    <tr
                      key={d.id}
                      className="border-t border-neutral-800 hover:bg-neutral-800/60"
                    >
                      {/* Date */}
                      <td className="px-3 py-2 text-xs text-neutral-300 whitespace-nowrap">
                        {formatDateTime(d.created_at)}
                      </td>

                      {/* Type */}
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={
                            "inline-flex px-2 py-1 rounded-full text-[11px] font-semibold " +
                            typeColor(d.type)
                          }
                        >
                          {typeLabel(d.type)}
                        </span>
                      </td>

                      {/* Joueur */}
                      <td className="px-3 py-2 text-xs">
                        {d.user ? (
                          <div>
                            <div className="font-semibold">
                              {d.user.display_name || d.user.id}
                            </div>
                            {d.user.discord_tag && (
                              <div className="text-[10px] text-neutral-400">
                                Discord:{" "}
                                <span className="font-mono">
                                  {d.user.discord_tag}
                                </span>
                              </div>
                            )}
                            {d.user.battlefy_name && (
                              <div className="text-[10px] text-neutral-400">
                                Battlefy:{" "}
                                <span className="font-mono">
                                  {d.user.battlefy_name}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : d.user_id ? (
                          <span className="font-mono text-neutral-300">
                            {d.user_id}
                          </span>
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>

                      {/* Équipe */}
                      <td className="px-3 py-2 text-xs">
                        {d.team ? (
                          <div className="flex items-center gap-2">
                            {d.team.logo_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={d.team.logo_url}
                                alt={d.team.name}
                                className="w-6 h-6 rounded-full object-cover"
                              />
                            )}
                            <div>
                              <div className="font-semibold">
                                {d.team.name}
                              </div>
                              {d.team.short_name && (
                                <div className="text-[10px] text-neutral-400">
                                  {d.team.short_name}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : d.team_id ? (
                          <span className="font-mono text-neutral-300">
                            {d.team_id}
                          </span>
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>

                      {/* Tournoi */}
                      <td className="px-3 py-2 text-xs">
                        {d.tournament ? (
                          <div>
                            <div className="font-semibold">
                              {d.tournament.name}
                            </div>
                            {d.tournament.slug && (
                              <div className="text-[10px] text-neutral-500 font-mono">
                                {d.tournament.slug}
                              </div>
                            )}
                          </div>
                        ) : d.tournament_id ? (
                          <span className="font-mono text-neutral-300">
                            {d.tournament_id}
                          </span>
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>

                      {/* Message */}
                      <td className="px-3 py-2 text-xs max-w-[260px]">
                        {d.message ? (
                          <div className="text-neutral-200 line-clamp-3">
                            {d.message}
                          </div>
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>

                      {/* Statut + handler */}
                      <td className="px-3 py-2 text-xs">
                        <div className="mb-1">
                          <span
                            className={
                              "inline-flex px-2 py-1 rounded-full text-[11px] font-semibold " +
                              statusColor(d.status)
                            }
                          >
                            {statusLabel(d.status)}
                          </span>
                        </div>
                        {d.handled_by && (
                          <div className="text-[10px] text-neutral-500">
                            par{" "}
                            <span className="font-medium">
                              {d.handled_by.display_name || d.handled_by.id}
                            </span>
                            {d.handled_at && (
                              <>
                                {" "}
                                • {formatDateTime(d.handled_at)}
                              </>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2 text-right align-top text-xs">
                        <div className="flex flex-col gap-2 items-end">
                          <Link
                            href={`/admin/demandes/${d.id}`}
                            className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600"
                          >
                            Ouvrir
                          </Link>
                          {d.user && (
                            <Link
                              href={`/admin/users/${d.user.id}`}
                              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700"
                            >
                              Voir joueur
                            </Link>
                          )}
                          {d.team && (
                            <Link
                              href={`/admin/teams/${d.team.id}`}
                              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700"
                            >
                              Voir équipe
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {demandes.length > 0 && (
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
              {offset + 1} – {offset + demandes.length}
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

export default AdminDemandesPage;
