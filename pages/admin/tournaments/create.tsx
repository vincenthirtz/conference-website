import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import Button from '@/components/Buttons/button';

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

type CreateTournamentBody = {
  name: string;
  slug?: string | null;
  game?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_at?: string | null;
  format_type?: string | null;
  max_teams?: number | null;
  is_public?: boolean;
  is_featured?: boolean;
  logo_url?: string | null;
  banner_url?: string | null;
};

export const getServerSideProps = withStaffPage('manager');

function AdminTournamentCreatePage({ staff }: Props) {
  const router = useRouter();

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
    name: '',
    slug: '',
    game: '',
    status: 'draft',
    start_date: '',
    end_at: '',
    format_type: '',
    max_teams: '',
    is_public: false,
    is_featured: false,
    logo_url: '',
    banner_url: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!form.name.trim()) {
      setErrorMsg('Le nom du tournoi est obligatoire.');
      return;
    }

    setSubmitting(true);

    const payload: CreateTournamentBody = {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      game: form.game.trim() || null,
      status: form.status || 'draft',
      start_date: form.start_date
        ? new Date(form.start_date).toISOString()
        : null,
      end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
      format_type: form.format_type || null,
      max_teams: form.max_teams ? Number(form.max_teams) : null,
      is_public: form.is_public,
      is_featured: form.is_featured,
      logo_url: form.logo_url.trim() || null,
      banner_url: form.banner_url.trim() || null,
    };

    try {
      const res = await fetch('/api/admin/tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors de la création du tournoi');
      }

      const json = await res.json();
      const created = json.tournament;

      if (created?.id) {
        router.push(`/admin/tournament/${created.id}`);
      } else {
        router.push('/admin/tournaments');
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message ?? 'Erreur inconnue lors de la création du tournoi'
      );
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Admin – Créer un tournoi</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Nouveau tournoi</h1>
            <p className="text-neutral-400 text-sm mt-1">
              Configure les informations de base, tu pourras affiner les stages
              / matchs ensuite.
            </p>
          </div>
        </div>

        {/* Card full width */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 pt-20">
          {errorMsg && (
            <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basics */}
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">Informations générales</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    Nom du tournoi <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="OWL Women’s Cup #1"
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
                    onChange={(e) => updateField('slug', e.target.value)}
                    placeholder="owl-womens-cup-1"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Laisse vide pour générer automatiquement.
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
                    onChange={(e) => updateField('game', e.target.value)}
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

            {/* Dates & format */}
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">Planning & format</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    Date de début
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.start_date}
                    onChange={(e) => updateField('start_date', e.target.value)}
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
                    onChange={(e) => updateField('end_at', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    Format global
                  </label>
                  <select
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.format_type}
                    onChange={(e) => updateField('format_type', e.target.value)}
                  >
                    <option value="">(À définir plus tard)</option>
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
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.max_teams}
                    onChange={(e) => updateField('max_teams', e.target.value)}
                    placeholder="16"
                  />
                </div>
              </div>
            </section>

            {/* Visibilité & visuels */}
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">Visibilité & visuels</h2>

              <div className="flex flex-col gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    className="rounded border-neutral-500 bg-neutral-700"
                    checked={form.is_public}
                    onChange={(e) => updateField('is_public', e.target.checked)}
                  />
                  <span>Rendre le tournoi public sur le site</span>
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    className="rounded border-neutral-500 bg-neutral-700"
                    checked={form.is_featured}
                    onChange={(e) =>
                      updateField('is_featured', e.target.checked)
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
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.banner_url}
                    onChange={(e) => updateField('banner_url', e.target.value)}
                    placeholder="https://…"
                  />
                </div>
              </div>
            </section>

            {/* Actions */}
            <div className="flex justify-between items-center pt-2">
              <Button
                type="button"
                size="compact"
                className="px-4 py-2"
                onClick={() => router.push('/admin/tournaments')}
                disabled={submitting}
              >
                Annuler
              </Button>

              <Button
                type="submit"
                size="compact"
                disabled={submitting}
                className="px-5 py-2 font-semibold"
              >
                {submitting ? 'Création...' : 'Créer le tournoi'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default AdminTournamentCreatePage;
