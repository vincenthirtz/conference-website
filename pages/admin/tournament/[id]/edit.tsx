// pages/admin/tournament/[id]/edit.tsx

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
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
  min_players: number | null;
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

export const getServerSideProps = withStaffPage('manager');

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
    min_players: string;
    is_public: boolean;
    is_featured: boolean;
    logo_url: string;
    banner_url: string;
  }>({
    name: '',
    slug: '',
    game: '',
    status: 'draft',
    start_date: '',
    end_at: '',
    format_type: '',
    max_teams: '',
    min_players: '',
    is_public: false,
    is_featured: false,
    logo_url: '',
    banner_url: '',
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
        throw new Error(json.error || 'Impossible de charger le tournoi');
      }
      const json: ApiResponse = await res.json();
      const t = json.tournament;

      // Pré-remplir le formulaire
      setForm({
        name: t.name || '',
        slug: t.slug || '',
        game: t.game || '',
        status: t.status || 'draft',
        start_date: t.start_date ? toLocalInputValue(t.start_date) : '',
        end_at: t.end_date ? toLocalInputValue(t.end_date) : '',
        format_type: t.format_type || '',
        max_teams: t.max_teams ? String(t.max_teams) : '',
        min_players: t.min_players ? String(t.min_players) : '',
        is_public: t.is_public,
        is_featured: t.is_featured,
        logo_url: t.logo_url || '',
        banner_url: t.banner_url || '',
      });

      setFormReady(true);
    } catch (err: any) {
      setErrorMsg(
        err?.message ?? 'Erreur inattendue lors du chargement du tournoi'
      );
    } finally {
      setLoading(false);
    }
  }

  function toLocalInputValue(iso: string): string {
    try {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, '0');
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch {
      return '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    if (!form.name.trim()) {
      setErrorMsg('Le nom du tournoi est obligatoire.');
      return;
    }

    setSaving(true);

    const payload: Record<string, any> = {
      name: form.name.trim(),
      slug: form.slug.trim() || null,
      game: form.game.trim() || null,
      status: form.status || 'draft',
      start_date: form.start_date
        ? new Date(form.start_date).toISOString()
        : null,
      end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
      format_type: form.format_type || null,
      max_teams: form.max_teams ? Number(form.max_teams) : null,
      min_players: form.min_players ? Number(form.min_players) : null,
      is_public: form.is_public,
      is_featured: form.is_featured,
      logo_url: form.logo_url.trim() || null,
      banner_url: form.banner_url.trim() || null,
    };

    try {
      const res = await fetch(`/api/admin/tournament/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          json.error || 'Erreur lors de la mise à jour du tournoi'
        );
      }

      await res.json(); // contient { tournament: ... } mais on n'en a pas strictement besoin ici

      setSuccessMsg('Tournoi mis à jour avec succès.');
      // On peut éventuellement recharger les données
      fetchTournament();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inconnue lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Head>
        <title>Admin – Éditer le tournoi</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push(`/admin/tournament/${id}`)}
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
              Retour au dashboard du tournoi
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Éditer le tournoi
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  Mets à jour les informations principales du tournoi.
                </p>
              </div>
            </div>
          </div>

          {/* Messages */}
          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="mb-6 rounded-xl bg-emerald-900/40 border border-emerald-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg
                className="w-5 h-5 text-emerald-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              {successMsg}
            </div>
          )}

          {loading && !formReady && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {!loading && formReady && (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Grid layout like dashboard */}
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Left Column - Main fields */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Informations générales */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
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
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Informations générales
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm mb-1 text-neutral-300">
                          Nom du tournoi <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={form.name}
                          onChange={(e) => updateField('name', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block text-sm mb-1 text-neutral-300">
                          Slug (URL)
                        </label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={form.slug}
                          onChange={(e) => updateField('slug', e.target.value)}
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
                          className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={form.game}
                          onChange={(e) => updateField('game', e.target.value)}
                          placeholder="Overwatch 2"
                        />
                      </div>

                      <div>
                        <label className="block text-sm mb-1 text-neutral-300">
                          Statut
                        </label>
                        <select
                          className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={form.status}
                          onChange={(e) => updateField('status', e.target.value)}
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

                  {/* Planning & format */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
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
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      Planning & format
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm mb-1 text-neutral-300">
                          Date de début
                        </label>
                        <input
                          type="datetime-local"
                          className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={form.start_date}
                          onChange={(e) =>
                            updateField('start_date', e.target.value)
                          }
                        />
                      </div>

                      <div>
                        <label className="block text-sm mb-1 text-neutral-300">
                          Date de fin
                        </label>
                        <input
                          type="datetime-local"
                          className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={form.end_at}
                          onChange={(e) => updateField('end_at', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block text-sm mb-1 text-neutral-300">
                          Format global
                        </label>
                        <select
                          className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={form.format_type}
                          onChange={(e) =>
                            updateField('format_type', e.target.value)
                          }
                        >
                          <option value="">(Ne pas modifier / à définir)</option>
                          <option value="single_elim">Single Elim</option>
                          <option value="double_elim">Double Elim</option>
                          <option value="swiss">Swiss</option>
                          <option value="round_robin">Round Robin</option>
                          <option value="showmatch">Showmatch</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm mb-1 text-neutral-300">
                          Nombre max. d&apos;équipes
                        </label>
                        <input
                          type="number"
                          min={2}
                          className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={form.max_teams}
                          onChange={(e) => updateField('max_teams', e.target.value)}
                          placeholder="16"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm mb-1 text-neutral-300">
                          Joueuses min. par équipe
                        </label>
                        <input
                          type="number"
                          min={1}
                          className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={form.min_players}
                          onChange={(e) => updateField('min_players', e.target.value)}
                          placeholder="5"
                        />
                        <p className="text-xs text-neutral-500 mt-1">
                          Nombre minimum de membres requis pour inscrire une équipe
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* Visuels */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
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
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      Visuels
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm mb-1 text-neutral-300">
                          Logo (URL)
                        </label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={form.logo_url}
                          onChange={(e) => updateField('logo_url', e.target.value)}
                          placeholder="https://…"
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1 text-neutral-300">
                          Bannière (URL)
                        </label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={form.banner_url}
                          onChange={(e) =>
                            updateField('banner_url', e.target.value)
                          }
                          placeholder="https://…"
                        />
                      </div>
                    </div>
                  </section>
                </div>

                {/* Right Column - Visibility & Actions */}
                <div className="space-y-6">
                  {/* Visibilité */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
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
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                      Visibilité
                    </h2>

                    <div className="space-y-3">
                      <label className="flex items-center gap-3 p-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-900 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-5 h-5 rounded border-neutral-500 bg-neutral-700 text-emerald-500 focus:ring-emerald-500"
                          checked={form.is_public}
                          onChange={(e) =>
                            updateField('is_public', e.target.checked)
                          }
                        />
                        <div>
                          <span className="text-sm font-medium">Tournoi public</span>
                          <p className="text-xs text-neutral-500">
                            Visible sur le site
                          </p>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-900 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-5 h-5 rounded border-neutral-500 bg-neutral-700 text-amber-500 focus:ring-amber-500"
                          checked={form.is_featured}
                          onChange={(e) =>
                            updateField('is_featured', e.target.checked)
                          }
                        />
                        <div>
                          <span className="text-sm font-medium">Mis en avant</span>
                          <p className="text-xs text-neutral-500">
                            Section &quot;featured&quot;
                          </p>
                        </div>
                      </label>
                    </div>
                  </section>

                  {/* Actions */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Actions</h2>

                    <div className="space-y-3">
                      <button
                        type="submit"
                        disabled={saving}
                        className={`w-full px-4 py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                          saving
                            ? 'bg-blue-800 cursor-wait'
                            : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {saving ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Enregistrement...
                          </>
                        ) : (
                          <>
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
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            Enregistrer les modifications
                          </>
                        )}
                      </button>

                      <Link
                        href={`/admin/tournament/${id}`}
                        className="w-full px-4 py-3 rounded-xl border border-neutral-600 text-neutral-200 hover:bg-neutral-700/50 text-sm font-medium transition-colors flex items-center justify-center gap-2"
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                        Annuler
                      </Link>
                    </div>
                  </section>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminTournamentEditPage;
