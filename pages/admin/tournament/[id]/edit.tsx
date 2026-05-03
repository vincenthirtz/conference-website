// pages/admin/tournament/[id]/edit.tsx

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import Breadcrumb from '@/components/admin/Breadcrumb';
import type { StaffProps, Tournament } from '@/types/admin';
import { TOURNAMENT_TIMEZONES } from '@/utils/timezone';

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
  const { addToast } = useToast();

  const [formReady, setFormReady] = useState(false);

  const [dateError, setDateError] = useState<string | null>(null);

  const [uploadingRules, setUploadingRules] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);

  const [form, setForm] = useState<{
    name: string;
    slug: string;
    game: string;
    status: string;
    start_date: string;
    end_date: string;
    roster_locked_at: string;
    timezone: string;
    format_type: string;
    max_teams: string;
    min_players: string;
    max_players: string;
    is_public: boolean;
    is_featured: boolean;
    logo_url: string;
    banner_url: string;
    rules_url: string;
    description_info: string;
    schedule_details: string;
    schedule_rules: string;
    format_details: string;
  }>({
    name: '',
    slug: '',
    game: '',
    status: 'draft',
    start_date: '',
    end_date: '',
    roster_locked_at: '',
    timezone: 'Europe/Paris',
    format_type: '',
    max_teams: '',
    min_players: '',
    max_players: '',
    is_public: false,
    is_featured: false,
    logo_url: '',
    banner_url: '',
    rules_url: '',
    description_info: '',
    schedule_details: '',
    schedule_rules: '',
    format_details: '',
  });

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleRulesPdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setRulesError(null);

    if (file.type !== 'application/pdf') {
      setRulesError('Seuls les fichiers PDF sont acceptés.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setRulesError('PDF trop lourd (max 5 Mo).');
      return;
    }

    setUploadingRules(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error('read failed'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: dataUrl,
          mimeType: 'application/pdf',
          filename: file.name,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Échec de l'upload du règlement");
      }
      updateField('rules_url', json.url || '');
      addToast('Règlement uploadé.', 'success');
    } catch (err: unknown) {
      setRulesError((err as Error)?.message ?? 'Upload impossible');
    } finally {
      setUploadingRules(false);
    }
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
        end_date: t.end_date ? toLocalInputValue(t.end_date) : '',
        roster_locked_at: t.roster_locked_at
          ? toLocalInputValue(t.roster_locked_at)
          : '',
        timezone: t.timezone || 'Europe/Paris',
        format_type: t.format_type || '',
        max_teams: t.max_teams ? String(t.max_teams) : '',
        min_players: t.min_players ? String(t.min_players) : '',
        max_players: t.max_players ? String(t.max_players) : '',
        is_public: t.is_public,
        is_featured: t.is_featured,
        logo_url: t.logo_url || '',
        banner_url: t.banner_url || '',
        rules_url: t.rules_url || '',
        description_info: t.description_info || '',
        schedule_details: t.schedule_details || '',
        schedule_rules: t.schedule_rules || '',
        format_details: t.format_details || '',
      });

      setFormReady(true);
    } catch (err: unknown) {
      setErrorMsg(
        (err as Error)?.message ??
          'Erreur inattendue lors du chargement du tournoi'
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

    setSaving(true);

    const payload: Record<string, any> = {
      name: form.name.trim(),
      slug: form.slug.trim() || null,
      game: form.game.trim() || null,
      status: form.status || 'draft',
      start_date: form.start_date
        ? new Date(form.start_date).toISOString()
        : null,
      end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
      roster_locked_at: form.roster_locked_at
        ? new Date(form.roster_locked_at).toISOString()
        : null,
      timezone: form.timezone || null,
      format_type: form.format_type || null,
      max_teams: form.max_teams ? Number(form.max_teams) : null,
      min_players: form.min_players ? Number(form.min_players) : null,
      max_players: form.max_players ? Number(form.max_players) : null,
      is_public: form.is_public,
      is_featured: form.is_featured,
      logo_url: form.logo_url.trim() || null,
      banner_url: form.banner_url.trim() || null,
      rules_url: form.rules_url.trim() || null,
      description_info: form.description_info.trim() || null,
      schedule_details: form.schedule_details.trim() || null,
      schedule_rules: form.schedule_rules.trim() || null,
      format_details: form.format_details.trim() || null,
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

      addToast('Tournoi mis à jour avec succès.', 'success');
      // On peut éventuellement recharger les données
      fetchTournament();
    } catch (err: unknown) {
      setErrorMsg(
        (err as Error)?.message ?? 'Erreur inconnue lors de la mise à jour'
      );
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
            <Breadcrumb
              items={[
                { label: 'Tournois', href: '/admin/tournaments' },
                {
                  label: form.name || 'Tournoi',
                  href: `/admin/tournament/${id}`,
                },
                { label: 'Modifier' },
              ]}
            />
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

          {loading && !formReady && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {!loading && formReady && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <fieldset disabled={saving} className="space-y-6">
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
                            Nom du tournoi{' '}
                            <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.name}
                            onChange={(e) =>
                              updateField('name', e.target.value)
                            }
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
                            onChange={(e) =>
                              updateField('slug', e.target.value)
                            }
                            placeholder="owl-womens-cup-1"
                          />
                          <p className="text-xs text-neutral-500 mt-1">
                            Si tu modifies le slug, l&apos;URL publique
                            changera.
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
                            onChange={(e) =>
                              updateField('game', e.target.value)
                            }
                            placeholder="Overwatch"
                          />
                        </div>

                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            Statut
                          </label>
                          <select
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.status}
                            onChange={(e) =>
                              updateField('status', e.target.value)
                            }
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
                            className={`w-full px-3 py-2 rounded-lg bg-neutral-900/50 border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              dateError
                                ? 'border-red-500'
                                : 'border-neutral-600'
                            }`}
                            value={form.end_date}
                            onChange={(e) => {
                              updateField('end_date', e.target.value);
                              setDateError(null);
                            }}
                          />
                          {dateError && (
                            <p className="text-xs text-red-400 mt-1">
                              {dateError}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            Verrouillage roster
                          </label>
                          <input
                            type="datetime-local"
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.roster_locked_at}
                            onChange={(e) =>
                              updateField('roster_locked_at', e.target.value)
                            }
                          />
                          <p className="text-xs text-neutral-500 mt-1">
                            Au-delà de cette date, les équipes inscrites ne
                            peuvent plus modifier leur roster (ajout,
                            suppression, swap). Vide = pas de verrou.
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            Fuseau horaire
                          </label>
                          <select
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.timezone}
                            onChange={(e) =>
                              updateField('timezone', e.target.value)
                            }
                          >
                            {TOURNAMENT_TIMEZONES.map((tz) => (
                              <option key={tz.value} value={tz.value}>
                                {tz.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-neutral-500 mt-1">
                            Les horaires seront affiches dans ce fuseau.
                          </p>
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
                            <option value="">
                              (Ne pas modifier / à définir)
                            </option>
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
                            onChange={(e) =>
                              updateField('max_teams', e.target.value)
                            }
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
                            onChange={(e) =>
                              updateField('min_players', e.target.value)
                            }
                            placeholder="5"
                          />
                          <p className="text-xs text-neutral-500 mt-1">
                            Nombre minimum de membres requis pour inscrire une
                            équipe
                          </p>
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm mb-1 text-neutral-300">
                            Joueuses max. par équipe
                          </label>
                          <input
                            type="number"
                            min={1}
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.max_players}
                            onChange={(e) =>
                              updateField('max_players', e.target.value)
                            }
                            placeholder="10"
                          />
                          <p className="text-xs text-neutral-500 mt-1">
                            Nombre maximum de membres autorisé par équipe
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
                            onChange={(e) =>
                              updateField('logo_url', e.target.value)
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
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.banner_url}
                            onChange={(e) =>
                              updateField('banner_url', e.target.value)
                            }
                            placeholder="https://…"
                          />
                        </div>
                      </div>

                      <div className="mt-4">
                        <label className="block text-sm mb-1 text-neutral-300">
                          Règlement (PDF)
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            className="flex-1 px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.rules_url}
                            onChange={(e) =>
                              updateField('rules_url', e.target.value)
                            }
                            placeholder="https://…/reglement.pdf"
                          />
                          <label className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-neutral-700/60 hover:bg-neutral-700 border border-neutral-600 text-sm cursor-pointer whitespace-nowrap">
                            {uploadingRules ? 'Upload…' : 'Uploader un PDF'}
                            <input
                              type="file"
                              accept="application/pdf"
                              className="hidden"
                              disabled={uploadingRules}
                              onChange={handleRulesPdfChange}
                            />
                          </label>
                        </div>
                        <p className="text-xs text-neutral-500 mt-1">
                          Affiché en lien &laquo;&nbsp;Règlement du
                          tournoi&nbsp;&raquo; sur la page publique. PDF max
                          5&nbsp;Mo.
                        </p>
                        {rulesError && (
                          <p className="text-xs text-red-400 mt-1">
                            {rulesError}
                          </p>
                        )}
                        {form.rules_url && (
                          <a
                            href={form.rules_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block text-xs text-blue-400 hover:text-blue-300 mt-1"
                          >
                            Ouvrir le règlement actuel ↗
                          </a>
                        )}
                      </div>
                    </section>

                    {/* Informations publiques */}
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
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        Informations publiques
                      </h2>
                      <p className="text-xs text-neutral-500 mb-4">
                        Ces champs sont affichés sur la page publique du tournoi
                        uniquement s&apos;ils sont remplis.
                      </p>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            Infos générales
                          </label>
                          <textarea
                            rows={4}
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.description_info}
                            onChange={(e) =>
                              updateField('description_info', e.target.value)
                            }
                            placeholder="Description du tournoi visible sur la page publique..."
                          />
                        </div>

                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            Calendrier précis
                          </label>
                          <textarea
                            rows={4}
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.schedule_details}
                            onChange={(e) =>
                              updateField('schedule_details', e.target.value)
                            }
                            placeholder="Dates clés, phases, deadlines..."
                          />
                        </div>

                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            Règles des horaires
                          </label>
                          <textarea
                            rows={4}
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.schedule_rules}
                            onChange={(e) =>
                              updateField('schedule_rules', e.target.value)
                            }
                            placeholder="Horaires de check-in, heures de match, délais..."
                          />
                        </div>

                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            Format du tournoi
                          </label>
                          <textarea
                            rows={4}
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.format_details}
                            onChange={(e) =>
                              updateField('format_details', e.target.value)
                            }
                            placeholder="Format des matchs, BO3/BO5, bracket, règles spécifiques..."
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
                            <span className="text-sm font-medium">
                              Tournoi public
                            </span>
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
                            <span className="text-sm font-medium">
                              Mis en avant
                            </span>
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
                          className={`w-full px-4 py-3 rounded-xl border border-neutral-600 text-neutral-200 hover:bg-neutral-700/50 text-sm font-medium transition-colors flex items-center justify-center gap-2${saving ? ' pointer-events-none opacity-50' : ''}`}
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
              </fieldset>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminTournamentEditPage;
