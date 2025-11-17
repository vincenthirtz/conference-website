// pages/admin/tournament/[id].tsx

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
type Tournament = {
  id: string;
  name: string;
  slug: string | null;
  game: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  format_type: string | null;
  max_teams: number | null;
  is_public: boolean;
  is_featured: boolean;
  logo_url: string | null;
  banner_url: string | null;
  created_at: string;
  updated_at: string | null;
};

type ApiResponse = {
  tournament: Tournament;
};

export const getServerSideProps = withStaffPage("manager");

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

function statusLabel(status: string | null) {
  switch (status) {
    case "draft":
      return "Brouillon";
    case "published":
      return "Publié";
    case "running":
      return "En cours";
    case "completed":
      return "Terminé";
    case "archived":
      return "Archivé";
    default:
      return status || "Inconnu";
  }
}

function statusColor(status: string | null) {
  switch (status) {
    case "draft":
      return "bg-neutral-700 text-neutral-100";
    case "published":
      return "bg-blue-600/80 text-white";
    case "running":
      return "bg-emerald-600/80 text-white";
    case "completed":
      return "bg-purple-600/80 text-white";
    case "archived":
      return "bg-neutral-700 text-neutral-300";
    default:
      return "bg-neutral-700 text-neutral-200";
  }
}

function AdminTournamentPage({ staff }: StaffProps) {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchTournament();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchTournament() {
    if (!id) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/tournament/${id}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Impossible de charger le tournoi");
      }
      const json: ApiResponse = await res.json();
      setTournament(json.tournament);
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }

  const publicUrl =
    tournament?.slug ? `/tournament/${tournament.slug}` : `/tournament/${tournament?.id}`;

  return (
    <>
      <Head>
        <title>
          Admin – Tournoi {tournament ? `: ${tournament.name}` : ""}
        </title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <button
              type="button"
              onClick={() => router.push("/admin/tournaments")}
              className="mb-3 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour à la liste
            </button>
            <div className="flex items-center gap-3">
              {tournament?.logo_url && (
                <img
                  src={tournament.logo_url}
                  alt={tournament.name}
                  className="w-10 h-10 rounded-md object-cover border border-neutral-700"
                />
              )}
              <div>
                <h1 className="text-3xl font-bold">
                  {tournament ? tournament.name : "Tournoi"}
                </h1>
                {tournament?.slug && (
                  <p className="text-sm text-neutral-400">
                    Slug :{" "}
                    <span className="font-mono text-xs bg-neutral-800 px-2 py-0.5 rounded">
                      {tournament.slug}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <StaffRoleBadge staff={staff} />
            {tournament && (
              <div className="flex flex-wrap gap-2 justify-end">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor(
                    tournament.status
                  )}`}
                >
                  {statusLabel(tournament.status)}
                </span>

                {tournament.is_public && (
                  <span className="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-700/80 text-white">
                    Public
                  </span>
                )}

                {tournament.is_featured && (
                  <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-600/80 text-neutral-900">
                    Mis en avant
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Error / loading */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {loading && !tournament && (
          <div className="text-neutral-300">Chargement du tournoi…</div>
        )}

        {!loading && !tournament && !errorMsg && (
          <div className="text-neutral-300">Tournoi introuvable.</div>
        )}

        {tournament && (
          <div className="space-y-6">
            {/* Top layout: info + actions */}
            <div className="grid gap-6 md:grid-cols-[2fr,1fr]">
              {/* Infos principales */}
              <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-4">
                <h2 className="text-lg font-semibold mb-1">
                  Aperçu du tournoi
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <div className="text-neutral-400">Jeu</div>
                    <div className="font-medium">
                      {tournament.game || "Non spécifié"}
                    </div>
                  </div>

                  <div>
                    <div className="text-neutral-400">Format</div>
                    <div className="font-medium">
                      {tournament.format_type || "À définir"}
                    </div>
                  </div>

                  <div>
                    <div className="text-neutral-400">Date de début</div>
                    <div className="font-medium">
                      {formatDate(tournament.start_date)}
                    </div>
                  </div>

                  <div>
                    <div className="text-neutral-400">Date de fin</div>
                    <div className="font-medium">
                      {formatDate(tournament.end_date)}
                    </div>
                  </div>

                  <div>
                    <div className="text-neutral-400">
                      Nombre max. d&apos;équipes
                    </div>
                    <div className="font-medium">
                      {tournament.max_teams ?? "Non défini"}
                    </div>
                  </div>

                  <div>
                    <div className="text-neutral-400">Créé le</div>
                    <div className="font-medium">
                      {formatDate(tournament.created_at)}
                    </div>
                  </div>
                </div>
              </section>

              {/* Actions / liens rapides */}
              <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-3">
                <h2 className="text-lg font-semibold">
                  Actions rapides
                </h2>
                <div className="flex flex-col gap-2 text-sm">
                  <Link
                    href={`/admin/tournament/${tournament.id}/stages`}
                    className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 flex justify-between items-center"
                  >
                    <span>Gérer les phases (stages)</span>
                    <span className="text-xs text-neutral-300">
                      brackets / swiss / groupes
                    </span>
                  </Link>
                  <Link
                    href={`/admin/tournament/${tournament.id}/matches`}
                    className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 flex justify-between items-center"
                  >
                    <span>Matches & résultats</span>
                    <span className="text-xs text-neutral-300">
                      scores / auto-scheduler
                    </span>
                  </Link>
                  <Link
                    href={`/admin/tournament/${tournament.id}/bracket`}
                    className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 flex justify-between items-center"
                  >
                    <span>Bracket</span>
                    <span className="text-xs text-neutral-300">
                      arbre visuel & drag & drop
                    </span>
                  </Link>
                  <Link
                    href={`/admin/tournament/${tournament.id}/maps`}
                    className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 flex justify-between items-center"
                  >
                    <span>Pool de maps</span>
                    <span className="text-xs text-neutral-300">
                      maps autorisées / ordre
                    </span>
                  </Link>
                  <Link
                    href={`/admin/tournament/${tournament.id}/stats`}
                    className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 flex justify-between items-center"
                  >
                    <span>Stats & top maps</span>
                    <span className="text-xs text-neutral-300">
                      perf équipes / maps
                    </span>
                  </Link>
                  <Link
                    href={`/admin/tournament/${tournament.id}/history`}
                    className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 flex justify-between items-center"
                  >
                    <span>Journal staff du tournoi</span>
                    <span className="text-xs text-neutral-300">
                      logs & actions
                    </span>
                  </Link>
                </div>

                <div className="pt-3 border-t border-neutral-700 mt-3">
                  <div className="text-xs text-neutral-400 mb-2">
                    Vue publique
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={publicUrl}
                      target="_blank"
                      className="flex-1 px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-center text-sm font-semibold"
                    >
                      Ouvrir la page publique
                    </Link>
                  </div>
                </div>
              </section>
            </div>

            {/* Second row : paramètres rapides / debug / meta */}
            <div className="grid gap-6 lg:grid-cols-[2fr,1.5fr]">
              {/* Paramètres rapides */}
              <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-3">
                <h2 className="text-lg font-semibold mb-1">
                  Paramètres rapides
                </h2>
                <p className="text-sm text-neutral-400 mb-3">
                  Certains paramètres nécessitent l&apos;édition complète via
                  l&apos;API ou une page dédiée, mais tu peux vérifier ici les
                  infos principales.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-neutral-400 mb-1">
                      URL du logo
                    </div>
                    <div className="font-mono text-xs break-all bg-neutral-900 px-3 py-2 rounded border border-neutral-700">
                      {tournament.logo_url || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-neutral-400 mb-1">
                      URL de la bannière
                    </div>
                    <div className="font-mono text-xs break-all bg-neutral-900 px-3 py-2 rounded border border-neutral-700">
                      {tournament.banner_url || "—"}
                    </div>
                  </div>
                </div>
              </section>

              {/* Infos système */}
              <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-3">
                <h2 className="text-lg font-semibold mb-1">
                  Meta & debug
                </h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-400">
                      ID du tournoi
                    </span>
                    <span className="font-mono text-xs bg-neutral-900 px-2 py-1 rounded border border-neutral-700">
                      {tournament.id}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-400">
                      Dernière mise à jour
                    </span>
                    <span className="text-neutral-200">
                      {formatDate(tournament.updated_at || tournament.created_at)}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-xs text-neutral-500">
                  Pour modifier en profondeur ce tournoi (statut, visibilité,
                  etc.), utilise l&apos;API{" "}
                  <code className="font-mono bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-700">
                    /api/admin/tournament/{tournament.id}
                  </code>{" "}
                  ou les pages dédiées.
                </p>
              </section>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default AdminTournamentPage;
