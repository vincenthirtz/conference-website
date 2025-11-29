import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { StaffRoleBadge } from "@/components/admin/StaffRoleBadge";
import { withStaffPage } from "@/utils/staff";

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type TeamRow = {
  id: string;
  name: string;
  slug: string | null;
  short_name: string | null;
  country: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
};

type TeamsApiResponse = {
  teams: TeamRow[];
  total: number | null;
};

export const getServerSideProps = withStaffPage("manager");

function AdminTeamsListPage({ staff }: StaffProps) {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("");

  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    fetchTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, activeFilter]);

  async function fetchTeams() {
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      params.set("includeTotal", "1");
      if (search.trim()) params.set("search", search.trim());
      if (activeFilter) params.set("isActive", activeFilter);

      const res = await fetch(`/api/admin/teams?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Impossible de charger les équipes");
      }

      const json: TeamsApiResponse = await res.json();
      setTeams(json.teams || []);
      setTotal(typeof json.total === "number" ? json.total : null);
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(team: TeamRow) {
    if (!team?.id) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/teams/${team.id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        throw new Error(json.error || "Échec de la suppression");
      }
      setDeleteTarget(null);
      fetchTeams();
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur inattendue");
    } finally {
      setDeleting(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    fetchTeams();
  }

  return (
    <>
      <Head>
        <title>Admin – Équipes</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold">Équipes</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Liste des équipes enregistrées dans la base.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/admin/teams/new"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition text-sm font-semibold"
            >
              + Nouvelle équipe
            </Link>
            <StaffRoleBadge staff={staff} />
          </div>
        </div>

        {/* Filters */}
        <form
          onSubmit={handleSearchSubmit}
          className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 mb-6 flex flex-wrap gap-4 items-center"
        >
          <input
            type="text"
            placeholder="Recherche par nom ou slug..."
            className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-sm flex-1 min-w-[220px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-sm"
            value={activeFilter}
            onChange={(e) => {
              setActiveFilter(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Toutes</option>
            <option value="true">Actives</option>
            <option value="false">Inactives</option>
          </select>

          <button
            type="submit"
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 transition text-sm font-semibold"
          >
            Rechercher
          </button>
        </form>

        {/* Table */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-neutral-750 text-neutral-300 text-sm">
              <tr>
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Tag</th>
                <th className="px-4 py-2">Pays</th>
                <th className="px-4 py-2">Actif</th>
                <th className="px-4 py-2">Créé</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-neutral-300">
                    Chargement...
                  </td>
                </tr>
              ) : teams.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-neutral-400">
                    Aucune équipe trouvée
                  </td>
                </tr>
              ) : (
                teams.map((team) => (
                  <tr
                    key={team.id}
                    className="border-t border-neutral-700 hover:bg-neutral-750"
                  >
                    <td className="px-4 py-3 font-semibold">
                      {team.name}
                    </td>
                    <td className="px-4 py-3">{team.short_name || "—"}</td>
                    <td className="px-4 py-3">{team.country || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          team.is_active
                            ? "bg-emerald-700/70 text-white"
                            : "bg-neutral-700 text-neutral-200"
                        }`}
                      >
                        {team.is_active ? "Oui" : "Non"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {team.created_at
                        ? new Date(team.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/admin/teams/${team.id}/edit`}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          Éditer
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(team)}
                          className="text-sm text-red-300 hover:text-red-200"
                        >
                          Supprimer
                        </button>
                        <span className="text-neutral-600 text-xs font-mono break-all">
                          {team.id}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mt-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Pagination */}
        <div className="flex justify-between items-center mt-6">
          <button
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className={`px-3 py-2 rounded ${
              offset === 0 || loading
                ? "bg-neutral-700 opacity-50 cursor-not-allowed"
                : "bg-neutral-700 hover:bg-neutral-600"
            }`}
          >
            ← Précédent
          </button>

          <span className="text-neutral-400 text-sm">
            {offset + 1} – {offset + teams.length}
            {total ? ` / ${total}` : ""}
          </span>

          <button
            disabled={loading || (total !== null && offset + limit >= total)}
            onClick={() => setOffset(offset + limit)}
            className={`px-3 py-2 rounded ${
              loading || (total !== null && offset + limit >= total)
                ? "bg-neutral-700 opacity-50 cursor-not-allowed"
                : "bg-neutral-700 hover:bg-neutral-600"
            }`}
          >
            Suivant →
          </button>
        </div>

        {deleteTarget && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4">
            <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-2">Supprimer l'équipe ?</h3>
              <p className="text-sm text-neutral-300 mb-4">
                Cela désactive l'équipe (suppression soft). Continuer pour{" "}
                <span className="font-semibold">{deleteTarget.name}</span> ?
              </p>
              {errorMsg && (
                <div className="mb-3 rounded-lg border border-red-600 bg-red-900/60 px-3 py-2 text-sm">
                  {errorMsg}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm"
                  disabled={deleting}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(deleteTarget)}
                  disabled={deleting}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                    deleting
                      ? "bg-red-700/60 cursor-not-allowed"
                      : "bg-red-600 hover:bg-red-500"
                  }`}
                >
                  {deleting ? "Suppression..." : "Supprimer"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default AdminTeamsListPage;
