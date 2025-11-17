// pages/admin/tournament/[id]/edit.tsx

import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Link from "next/link";
import { withStaffPage } from "@/utils/staff";
import { StaffRoleBadge } from "@/components/admin/StaffRoleBadge";

type StaffShape = {
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
  end_at: string | null;
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

function AdminTournamentEditPage({ staff }: StaffProps) {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [formReady, setFormReady] = useState(false);

  const [form, setForm] = useState<{
    name: string;
    slug: string;
    game: string;
    status: string;
    start_date: string;
    end_at: string;
    format_type: string;
    max_teams: string;
    is_public: boolean;
    is_featured: boolean;
    logo_url: string;
    banner_url: string;
  }>({
    name: "",
    slug: "",
    game: "",
    status: "draft",
    start_date: "",
    end_at: "",
    format_type: "",
    max_teams: "",
    is_public: false,
    is_featured: false,
    logo_url: "",
    banner_url: "",
  });

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    if (!id) return;
    fetchTournament();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchTournament() {
    if (!id) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/tournament/${id}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Impossible de charger le tournoi");
      }
      const json: ApiResponse = await res.json();
      const t = json.tournament;

      // Pré-remplir le formulaire
      setForm({
        name: t.name || "",
        slug: t.slug || "",
        game: t.game || "",
        status: t.status || "draft",
        start_date: t.start_date ? toLocalInputValue(t.start_date) : "",
        end_at: t.end_at ? toLocalInputValue(t.end_at) : "",
        format_type: t.format_type || "",
        max_teams: t.max_teams ? String(t.max_teams) : "",
        is_public: t.is_public,
        is_featured: t.is_featured,
        logo_url: t.logo_url || "",
        banner_url: t.banner_url || "",
      });

      setFormReady(true);
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur inattendue lors du chargement du tournoi");
    } finally {
      setLoading(false);
    }
  }

  function toLocalInputValue(iso: string): string {
    try {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, "0");
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch {
      return "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    if (!form.name.trim()) {
      setErrorMsg("Le nom du tournoi est obligatoire.");
      return;
    }

    setSaving(true);

    const payload: Partial<Tournament> = {
      name: form.name.trim(),
      slug: form.slug.trim() || null,
      game: form.game.trim() || null,
      status: form.status || "draft",
      start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
      end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
      format_type: form.format_type || null,
      max_teams: form.max_teams ? Number(form.max_teams) : null,
      is_public: form.is_public,
      is_featured: form.is_featured,
      logo_url: form.logo_url.trim() || null,
      banner_url: form.banner_url.trim() || null,
    };

    try {
      const res = await fetch(`/api/admin/tournament/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Erreur lors de la mise à jour du tournoi");
      }

      await res.json(); // contient { tournament: ... } mais on n'en a pas strictement besoin ici

      setSuccessMsg("Tournoi mis à jour avec succès.");
      // On peut éventuellement recharger les données
      fetchTournament();
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur inconnue lors de la mise à jour");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Head>
        <title>Admin – Éditer le tournoi</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push(`/admin/tournament/${id}`)}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour au dashboard du tournoi
            </button>
            <h1 className="text-3xl font-bold">Éditer le tournoi</h1>
            <p className="text-neutral-400 text-sm mt-1">
              Mets à jour les informations principales du tournoi.
            </p>
          </div>
          <StaffRoleBadge staff={staff} />
        </div>

        {/* Card */}
        <div className="max-w-3xl bg-neutral-800 border border-neutral-700 rounded-xl p-6 pt-20">
          {loading && !formReady && (
            <div className="text-neutral-300">Chargement des données du tournoi…</div>
          )}

          {!loading && errorMsg && (
            <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 rounded bg-emerald-900/60 border border-emerald-600 px-4 py-3 text-sm">
              {successMsg}
            </div>
          )}

          {!loading && formReady && (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basics */}
              <section className="space-y-4">
                <h2 className="font-semibold text-lg">
                  Informations générales
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1 text-neutral-300">
                      Nom du tournoi{" "}
                      <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.name}
                      onChange={(e) => updateField("name", e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-1 text-neutral-300">
                      Slug (URL)
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.slug}
                      onChange={(e) => updateField("slug", e.target.value)}
                      placeholder="owl-womens-cup-1"
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      Si tu modifies le slug, l&apos;URL publique changera.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm mb-1 text-neutral-300">
                      Jeu
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.game}
                      onChange={(e) => updateField("game", e.target.value)}
                      placeholder="Overwatch 2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-1 text-neutral-300">
                      Statut
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.status}
                      onChange={(e) => updateField("status", e.target.value)}
                    >
                      <option value="draft">Brouillon</option>
                      <option value="published">Publié</option>
                      <option value="running">En cours</option>
                      <option value="completed">Terminé</option>
                      <option value="archived">Archivé</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* Dates & format */}
              <section className="space-y-4">
                <h2 className="font-semibold text-lg">
                  Planning & format
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1 text-neutral-300">
                      Date de début
                    </label>
                    <input
                      type="datetime-local"
                      className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.start_date}
                      onChange={(e) => updateField("start_date", e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-1 text-neutral-300">
                      Date de fin
                    </label>
                    <input
                      type="datetime-local"
                      className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.end_at}
                      onChange={(e) => updateField("end_at", e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-1 text-neutral-300">
                      Format global
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.format_type}
                      onChange={(e) =>
                        updateField("format_type", e.target.value)
                      }
                    >
                      <option value="">
                        (Ne pas modifier / à définir)
                      </option>
                      <option value="single_elim">
                        Single Elim
                      </option>
                      <option value="double_elim">
                        Double Elim
                      </option>
                      <option value="swiss">
                        Swiss
                      </option>
                      <option value="round_robin">
                        Round Robin
                      </option>
                      <option value="showmatch">
                        Showmatch
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm mb-1 text-neutral-300">
                      Nombre max. d&apos;équipes
                    </label>
                    <input
                      type="number"
                      min={2}
                      className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.max_teams}
                      onChange={(e) => updateField("max_teams", e.target.value)}
                      placeholder="16"
                    />
                  </div>
                </div>
              </section>

              {/* Visibilité & visuels */}
              <section className="space-y-4">
                <h2 className="font-semibold text-lg">
                  Visibilité & visuels
                </h2>

                <div className="flex flex-col gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-neutral-200">
                    <input
                      type="checkbox"
                      className="rounded border-neutral-500 bg-neutral-700"
                      checked={form.is_public}
                      onChange={(e) =>
                        updateField("is_public", e.target.checked)
                      }
                    />
                    <span>Rendre le tournoi public sur le site</span>
                  </label>

                  <label className="inline-flex items-center gap-2 text-sm text-neutral-200">
                    <input
                      type="checkbox"
                      className="rounded border-neutral-500 bg-neutral-700"
                      checked={form.is_featured}
                      onChange={(e) =>
                        updateField("is_featured", e.target.checked)
                      }
                    />
                    <span>Mettre en avant (section &quot;featured&quot;)</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1 text-neutral-300">
                      Logo (URL)
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.logo_url}
                      onChange={(e) =>
                        updateField("logo_url", e.target.value)
                      }
                      placeholder="https://…"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1 text-neutral-300">
                      Bannière (URL)
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.banner_url}
                      onChange={(e) =>
                        updateField("banner_url", e.target.value)
                      }
                      placeholder="https://…"
                    />
                  </div>
                </div>
              </section>

              {/* Actions */}
              <div className="flex justify-between items-center pt-2">
                <Link
                  href={`/admin/tournament/${id}`}
                  className="px-4 py-2 rounded border border-neutral-600 text-neutral-200 hover:bg-neutral-800 text-sm"
                >
                  Annuler
                </Link>

                <button
                  type="submit"
                  disabled={saving}
                  className={`px-5 py-2 rounded font-semibold text-sm ${
                    saving
                      ? "bg-blue-800 cursor-wait"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {saving ? "Enregistrement..." : "Enregistrer les modifications"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminTournamentEditPage;
