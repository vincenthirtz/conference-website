import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { withStaffPage } from "@/utils/staff";
import { StaffRoleBadge } from "@/components/admin/StaffRoleBadge";

type Tournament = {
  id: string;
  name: string;
  slug: string | null;
  status: string | null;
  start_date: string | null;
  end_at: string | null;
  format_type: string | null;
  is_public: boolean;
  created_at: string;
};

type ApiResponse = {
  tournaments: Tournament[];
  total: number | null;
};

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

function AdminTournamentsPage({ staff }: Props) {
  const [loading, setLoading] = useState(false);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [total, setTotal] = useState<number | null>(null);

  // filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    params.set("includeTotal", "1");

    if (search.trim()) params.set("search", search);
    if (status) params.set("status", status);

    const res = await fetch(`/api/admin/tournaments?${params.toString()}`);
    const json: ApiResponse = await res.json();

    setTournaments(json.tournaments || []);
    setTotal(json.total);
    setLoading(false);
  }, [limit, offset, search, status]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    fetchData();
  }

  return (
    <>
      <Head>
        <title>Admin – Tournois</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Gestion des tournois</h1>
          <StaffRoleBadge staff={staff} />
        </div>

        {/* Filters */}
        <form
          onSubmit={handleSearchSubmit}
          className="bg-neutral-800 p-4 rounded-lg mb-6 flex gap-4 flex-wrap"
        >
          <input
            type="text"
            placeholder="Recherche par nom/slug..."
            className="px-3 py-2 rounded bg-neutral-700"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="px-3 py-2 rounded bg-neutral-700"
            value={status || ""}
            onChange={(e) =>
              setStatus(e.target.value || null)
            }
          >
            <option value="">Tous les statuts</option>
            <option value="draft">Brouillon</option>
            <option value="published">Publié</option>
            <option value="running">En cours</option>
            <option value="completed">Terminé</option>
            <option value="archived">Archivé</option>
          </select>

          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-semibold"
          >
            Rechercher
          </button>

          <Link
            href="/admin/tournaments/create"
            className="ml-auto bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-semibold"
          >
            + Nouveau tournoi
          </Link>
        </form>

        {/* Table */}
        <div className="bg-neutral-800 rounded-lg overflow-hidden border border-neutral-700">
          <table className="w-full text-left">
            <thead className="bg-neutral-700 text-sm text-neutral-300">
              <tr>
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Slug</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Format</th>
                <th className="px-4 py-2">Début</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-6">
                    Chargement...
                  </td>
                </tr>
              ) : tournaments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-neutral-400">
                    Aucun tournoi trouvé
                  </td>
                </tr>
              ) : (
                tournaments.map((t) => (
                  <tr
                    key={t.id}
                    className="border-t border-neutral-700 hover:bg-neutral-750"
                  >
                    <td className="px-4 py-3 font-semibold">
                      {t.name}
                    </td>
                    <td className="px-4 py-3">{t.slug}</td>
                    <td className="px-4 py-3">
                      <span className="bg-neutral-700 px-2 py-1 rounded text-xs uppercase">
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{t.format_type}</td>
                    <td className="px-4 py-3">
                      {t.start_date
                        ? new Date(t.start_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/tournament/${t.id}`}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        Ouvrir →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex justify-between items-center mt-6">
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
            {offset + 1} – {offset + tournaments.length}
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
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage("manager");

export default AdminTournamentsPage;
