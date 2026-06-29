/* eslint-disable @next/next/no-img-element */
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import {
  TOURNAMENT_TEMPLATES,
  type TournamentTemplate,
} from '@/config/tournament-templates';
import { useAutoSave } from '@/utils/useAutoSave';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import DraftBanner from '@/components/admin/DraftBanner';
import AutoSaveIndicator from '@/components/admin/AutoSaveIndicator';

import { logger } from '../../../utils/logger';
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
  end_date?: string | null;
  format_type?: string | null;
  max_teams?: number | null;
  min_players?: number | null;
  max_players?: number | null;
  is_public?: boolean;
  is_featured?: boolean;
  logo_url?: string | null;
  banner_url?: string | null;
};

function stageTypeBadge(type: string) {
  switch (type) {
    case 'bracket':
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    case 'swiss':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    case 'group':
      return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    case 'round_robin':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    case 'showmatch':
      return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
    default:
      return 'bg-neutral-500/20 text-neutral-300 border-neutral-500/30';
  }
}

export const getServerSideProps = withStaffPage('manager');

function AdminTournamentCreatePage({ staff }: Props) {
  const router = useRouter();
  const { adminFetch } = useAdminFetch();
  const { mutate: mutateIdempotent } = useIdempotentMutation();
  const { mutate: createTournament } = useIdempotentMutation();
  const [customTemplates, setCustomTemplates] = useState<TournamentTemplate[]>(
    []
  );

  useEffect(() => {
    adminFetch('/api/admin/tournament-templates')
      .then((r) => r.json())
      .then((json) => setCustomTemplates(json.templates || []))
      .catch(() => {});
  }, [adminFetch]);

  const [form, setForm] = useState<{
    name: string;
    slug: string;
    game: string;
    status: string;
    start_date: string;
    end_date: string;
    format_type: string;
    max_teams: string;
    min_players: string;
    max_players: string;
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
    end_date: '',
    format_type: '',
    max_teams: '',
    min_players: '',
    max_players: '',
    is_public: false,
    is_featured: false,
    logo_url: '',
    banner_url: '',
  });

  const [selectedTemplate, setSelectedTemplate] =
    useState<TournamentTemplate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  const { draftRestored, lastSaved, clearDraft, restoreDraft } = useAutoSave(
    form,
    {
      key: 'tournament_create',
    }
  );

  useEffect(() => {
    if (draftRestored) setShowDraftBanner(true);
  }, [draftRestored]);

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    setDateError(null);

    if (!form.name.trim()) {
      setErrorMsg('Le nom du tournoi est obligatoire.');
      return;
    }

    if (form.start_date && form.end_date) {
      if (new Date(form.start_date) >= new Date(form.end_date)) {
        setDateError(
          'La date de fin doit être postérieure à la date de début.'
        );
        setErrorMsg('La date de fin doit être postérieure à la date de début.');
        return;
      }
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
      end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
      format_type: form.format_type || null,
      max_teams: form.max_teams ? Number(form.max_teams) : null,
      min_players: form.min_players ? Number(form.min_players) : null,
      max_players: form.max_players ? Number(form.max_players) : null,
      is_public: form.is_public,
      is_featured: form.is_featured,
      logo_url: form.logo_url.trim() || null,
      banner_url: form.banner_url.trim() || null,
    };

    try {
      const res = await createTournament('/api/admin/tournaments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors de la création du tournoi');
      }

      const json = await res.json();
      const created = json.tournament;

      if (created?.id) {
        clearDraft();
        // Apply template if selected
        if (selectedTemplate) {
          try {
            const tplRes = await mutateIdempotent(
              `/api/admin/tournament/${created.id}/apply-template`,
              {
                method: 'POST',
                body: JSON.stringify({ templateId: selectedTemplate.id }),
              }
            );
            if (!tplRes.ok) {
              const tplJson = await tplRes.json().catch(() => ({}));
              logger.error('apply-template error:', tplJson.error);
            }
          } catch (tplErr) {
            logger.error('apply-template fetch error:', tplErr);
          }
        }

        router.push(`/admin/tournament/${created.id}`);
      } else {
        router.push('/admin/tournaments');
      }
    } catch (err: unknown) {
      setErrorMsg(
        (err as Error)?.message ??
          'Erreur inconnue lors de la création du tournoi'
      );
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Admin – Créer un tournoi</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push('/admin/tournaments')}
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
              Retour a la liste des tournois
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Nouveau tournoi
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  Configure les informations de base, tu pourras affiner les
                  stages / matchs ensuite.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[2fr,1fr] items-start">
            {/* Form */}
            <div className="space-y-6">
              {showDraftBanner && (
                <DraftBanner
                  lastSaved={lastSaved}
                  onRestore={() => {
                    const draft = restoreDraft();
                    if (draft) setForm(draft);
                    setShowDraftBanner(false);
                  }}
                  onDiscard={() => {
                    clearDraft();
                    setShowDraftBanner(false);
                  }}
                />
              )}
              {errorMsg && (
                <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
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

              {/* Template selector */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">Template de structure</h2>
                <p className="text-xs text-neutral-400">
                  Choisis un template pour creer automatiquement les stages du
                  tournoi, ou laisse vide pour les configurer manuellement.
                </p>

                <div className="grid gap-3 md:grid-cols-2">
                  {/* No template option */}
                  <button
                    type="button"
                    onClick={() => setSelectedTemplate(null)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      !selectedTemplate
                        ? 'bg-blue-600/20 border-blue-500/50 ring-1 ring-blue-500/30'
                        : 'bg-neutral-900/50 border-neutral-700 hover:bg-neutral-800 hover:border-neutral-600'
                    }`}
                  >
                    <div className="font-medium text-sm">Aucun template</div>
                    <div className="text-xs text-neutral-400 mt-1">
                      Configurer les stages manuellement apres la creation.
                    </div>
                  </button>

                  {[...TOURNAMENT_TEMPLATES, ...customTemplates].map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setSelectedTemplate(tpl)}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        selectedTemplate?.id === tpl.id
                          ? 'bg-blue-600/20 border-blue-500/50 ring-1 ring-blue-500/30'
                          : 'bg-neutral-900/50 border-neutral-700 hover:bg-neutral-800 hover:border-neutral-600'
                      }`}
                    >
                      <div className="font-medium text-sm">{tpl.name}</div>
                      <div className="text-xs text-neutral-400 mt-1">
                        {tpl.description}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {tpl.stages.map((s, i) => (
                          <span
                            key={i}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${stageTypeBadge(s.stage_type)}`}
                          >
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Informations generales */}
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
                  <h2 className="text-lg font-semibold">
                    Informations generales
                  </h2>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        Nom du tournoi <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={form.name}
                        onChange={(e) => updateField('name', e.target.value)}
                        placeholder="OWL Women's Cup #1"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        Slug (URL)
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                        value={form.slug}
                        onChange={(e) => updateField('slug', e.target.value)}
                        placeholder="owl-womens-cup-1"
                      />
                      <p className="text-xs text-neutral-500 mt-1">
                        Laisse vide pour generer automatiquement.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        Jeu
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={form.game}
                        onChange={(e) => updateField('game', e.target.value)}
                        placeholder="Overwatch"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        Statut
                      </label>
                      <select
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={form.status}
                        onChange={(e) => updateField('status', e.target.value)}
                      >
                        <option value="draft">Brouillon</option>
                        <option value="published">Publie</option>
                        <option value="running">En cours</option>
                        <option value="completed">Termine</option>
                        <option value="archived">Archive</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* Planning & format */}
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
                  <h2 className="text-lg font-semibold">Planning & format</h2>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        Date de debut
                      </label>
                      <input
                        type="datetime-local"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={form.start_date}
                        onChange={(e) =>
                          updateField('start_date', e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        Date de fin
                      </label>
                      <input
                        type="datetime-local"
                        className={`w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                          dateError ? 'border-red-500' : 'border-neutral-600'
                        }`}
                        value={form.end_date}
                        onChange={(e) => {
                          updateField('end_date', e.target.value);
                          setDateError(null);
                        }}
                      />
                      {dateError && (
                        <p className="text-xs text-red-400 mt-1">{dateError}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        Format global
                      </label>
                      <select
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={form.format_type}
                        onChange={(e) =>
                          updateField('format_type', e.target.value)
                        }
                      >
                        <option value="">(A definir plus tard)</option>
                        <option value="single_elim">Single Elim</option>
                        <option value="double_elim">Double Elim</option>
                        <option value="swiss">Swiss</option>
                        <option value="round_robin">Round Robin</option>
                        <option value="showmatch">Showmatch</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        Nombre max. d&apos;equipes
                      </label>
                      <input
                        type="number"
                        min={2}
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={form.max_teams}
                        onChange={(e) =>
                          updateField('max_teams', e.target.value)
                        }
                        placeholder="16"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        Nombre min. de joueurs par equipe
                      </label>
                      <input
                        type="number"
                        min={1}
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={form.min_players}
                        onChange={(e) =>
                          updateField('min_players', e.target.value)
                        }
                        placeholder="5"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        Nombre max. de joueurs par equipe
                      </label>
                      <input
                        type="number"
                        min={1}
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={form.max_players}
                        onChange={(e) =>
                          updateField('max_players', e.target.value)
                        }
                        placeholder="10"
                      />
                    </div>
                  </div>
                </section>

                {/* Visibilite & visuels */}
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
                  <h2 className="text-lg font-semibold">
                    Visibilite & visuels
                  </h2>

                  <div className="flex flex-col gap-3">
                    <label className="inline-flex items-center gap-3 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-neutral-600 bg-neutral-900"
                        checked={form.is_public}
                        onChange={(e) =>
                          updateField('is_public', e.target.checked)
                        }
                      />
                      <span>Rendre le tournoi public sur le site</span>
                    </label>

                    <label className="inline-flex items-center gap-3 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-neutral-600 bg-neutral-900"
                        checked={form.is_featured}
                        onChange={(e) =>
                          updateField('is_featured', e.target.checked)
                        }
                      />
                      <span>
                        Mettre en avant (section &quot;featured&quot;)
                      </span>
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 pt-2">
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        Logo (URL)
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                        value={form.logo_url}
                        onChange={(e) =>
                          updateField('logo_url', e.target.value)
                        }
                        placeholder="https://..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        Banniere (URL)
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                        value={form.banner_url}
                        onChange={(e) =>
                          updateField('banner_url', e.target.value)
                        }
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                </section>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <AutoSaveIndicator lastSaved={lastSaved} />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Creation en cours...
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
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        Creer le tournoi
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => router.push('/admin/tournaments')}
                    disabled={submitting}
                    className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>

            {/* Sidebar */}
            <aside className="space-y-6">
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">Apercu</h2>

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {form.logo_url ? (
                      <img
                        src={form.logo_url}
                        alt="Logo"
                        className="w-12 h-12 rounded-xl object-cover border border-neutral-700"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-neutral-700/50 flex items-center justify-center border border-neutral-700">
                        <svg
                          className="w-6 h-6 text-neutral-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                          />
                        </svg>
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-white">
                        {form.name || 'Nom du tournoi'}
                      </p>
                      {form.slug && (
                        <p className="text-xs text-neutral-400 font-mono">
                          /{form.slug}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-600 text-neutral-100">
                      {form.status === 'draft' && 'Brouillon'}
                      {form.status === 'published' && 'Publie'}
                      {form.status === 'running' && 'En cours'}
                      {form.status === 'completed' && 'Termine'}
                      {form.status === 'archived' && 'Archive'}
                    </span>
                    {form.is_public && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                        Public
                      </span>
                    )}
                    {form.is_featured && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30">
                        Featured
                      </span>
                    )}
                  </div>

                  {form.game && (
                    <p className="text-sm text-neutral-400">{form.game}</p>
                  )}
                </div>
              </section>

              {selectedTemplate && (
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-3">
                  <h2 className="text-lg font-semibold">
                    Template selectionne
                  </h2>
                  <p className="text-sm text-neutral-300 font-medium">
                    {selectedTemplate.name}
                  </p>
                  <div className="space-y-2">
                    {selectedTemplate.stages.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {i > 0 && (
                          <svg
                            className="w-3 h-3 text-neutral-600 -mt-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 14l-7 7m0 0l-7-7m7 7V3"
                            />
                          </svg>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium border ${stageTypeBadge(s.stage_type)}`}
                        >
                          {s.name}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-neutral-500 mt-2">
                    Les stages seront crees automatiquement apres la creation du
                    tournoi.
                  </p>
                </section>
              )}

              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-3">
                <h2 className="text-lg font-semibold">Informations</h2>
                <div className="text-xs text-neutral-400 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-500">•</span>
                    <p>Le tournoi sera cree en mode brouillon par defaut.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-500">•</span>
                    <p>
                      Tu pourras configurer les stages et matchs apres la
                      creation.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-500">•</span>
                    <p>
                      Le slug est utilise pour l&apos;URL publique du tournoi.
                    </p>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

export default AdminTournamentCreatePage;
