// pages/admin/tournament/[id]/edit.tsx

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import RegistrationFieldsEditor, {
  hasRegistrationFieldErrors,
} from '@/components/admin/RegistrationFieldsEditor';
import { useAdminT } from '@/lib/i18n/useAdminT';
import type { StaffProps, Tournament } from '@/types/admin';
import type { RegistrationField } from '@/utils/registrationFields';
import { getGame } from '@/config/games';
import { TOURNAMENT_TIMEZONES } from '@/utils/timezone';
import nsAdminTournamentEdit from '@/lib/i18n/locales/admin-fr/adminTournamentEdit';
import nsAdminRegistrationFields from '@/lib/i18n/locales/admin-fr/adminRegistrationFields';

type ApiResponse = {
  tournament: Tournament;
};

// Convertit un ISO en valeur pour <input type="datetime-local"> (heure locale).
// Fonction pure sans closure sur l'état → définie au niveau module pour une
// identité stable, ce qui permet de mémoïser `fetchTournament` sans casse.
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

export const getServerSideProps = withStaffPage({ permission: 'manage_tournaments' });

function AdminTournamentEditPage({ staff }: StaffProps) {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutate: uploadRules } = useIdempotentMutation();
  const t = useAdminT(nsAdminTournamentEdit);
  const tf = useAdminT(nsAdminRegistrationFields);

  const [formReady, setFormReady] = useState(false);

  const [registrationFields, setRegistrationFields] = useState<
    RegistrationField[]
  >([]);

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
    format: string;
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
    format: '',
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

  // Stable references derived from the current game so the memoized
  // RegistrationFieldsEditor doesn't re-render when other form fields change.
  // `getGame` returns a stable registry object; the `?? []` fallback below is
  // what would otherwise create a fresh array (and re-render) on every keystroke.
  const gameConfig = useMemo(() => getGame(form.game), [form.game]);
  const registrationPresets = useMemo(
    () => gameConfig?.registrationPresets ?? [],
    [gameConfig]
  );

  async function handleRulesPdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setRulesError(null);

    if (file.type !== 'application/pdf') {
      setRulesError(t.errorPdfOnly);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setRulesError(t.errorPdfTooLarge);
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

      const res = await uploadRules('/api/admin/upload', {
        method: 'POST',
        body: JSON.stringify({
          data: dataUrl,
          mimeType: 'application/pdf',
          filename: file.name,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || t.errorRulesUpload);
      }
      updateField('rules_url', json.url || '');
      addToast(t.toastRulesUploaded, 'success');
    } catch (err: unknown) {
      setRulesError((err as Error)?.message ?? t.errorUploadFailed);
    } finally {
      setUploadingRules(false);
    }
  }

  // Chargement initial mémoïsé : deps toutes stables (id ; adminFetchJson figé
  // par le hook ; t figé au niveau module par useAdminT). `toLocalInputValue`
  // est désormais au niveau module, donc plus aucune closure instable ici.
  const fetchTournament = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const json = await adminFetchJson<ApiResponse>(
        `/api/admin/tournament/${id}`
      );
      const tour = json.tournament;

      // Pré-remplir le formulaire
      setForm({
        name: tour.name || '',
        slug: tour.slug || '',
        game: tour.game || '',
        status: tour.status || 'draft',
        start_date: tour.start_date ? toLocalInputValue(tour.start_date) : '',
        end_date: tour.end_date ? toLocalInputValue(tour.end_date) : '',
        roster_locked_at: tour.roster_locked_at
          ? toLocalInputValue(tour.roster_locked_at)
          : '',
        timezone: tour.timezone || 'Europe/Paris',
        format: tour.format || '',
        format_type: tour.format_type || '',
        max_teams: tour.max_teams ? String(tour.max_teams) : '',
        min_players: tour.min_players ? String(tour.min_players) : '',
        max_players: tour.max_players ? String(tour.max_players) : '',
        is_public: tour.is_public,
        is_featured: tour.is_featured,
        logo_url: tour.logo_url || '',
        banner_url: tour.banner_url || '',
        rules_url: tour.rules_url || '',
        description_info: tour.description_info || '',
        schedule_details: tour.schedule_details || '',
        schedule_rules: tour.schedule_rules || '',
        format_details: tour.format_details || '',
      });

      setRegistrationFields(
        Array.isArray(tour.registration_fields) ? tour.registration_fields : []
      );

      setFormReady(true);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [id, adminFetchJson, t]);

  useEffect(() => {
    if (!id) return;
    fetchTournament();
  }, [id, fetchTournament]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;

    setErrorMsg(null);
    setDateError(null);

    if (!form.name.trim()) {
      setErrorMsg(t.errorNameRequired);
      return;
    }

    if (form.start_date && form.end_date) {
      if (new Date(form.start_date) >= new Date(form.end_date)) {
        setDateError(t.errorEndBeforeStart);
        setErrorMsg(t.errorEndBeforeStart);
        return;
      }
    }

    if (hasRegistrationFieldErrors(registrationFields)) {
      setErrorMsg(tf.errFormInvalid);
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
      end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
      roster_locked_at: form.roster_locked_at
        ? new Date(form.roster_locked_at).toISOString()
        : null,
      timezone: form.timezone || null,
      format: form.format.trim() || null,
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
      registration_fields: registrationFields,
    };

    try {
      await adminFetchJson(`/api/admin/tournament/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      addToast(t.toastUpdated, 'success');
      // On peut éventuellement recharger les données
      fetchTournament();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorUpdate);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <TournamentTabsNav tournamentId={String(id ?? '')} active="settings" />

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {t.heading}
                </h1>
                <p className="text-neutral-400 text-sm mt-1">{t.subtitle}</p>
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
                        {t.sectionGeneral}
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            {t.nameLabel}{' '}
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
                            {t.slugLabel}
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
                            {t.slugHelp}
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            {t.gameLabel}
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
                            {t.statusLabel}
                          </label>
                          <select
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.status}
                            onChange={(e) =>
                              updateField('status', e.target.value)
                            }
                          >
                            <option value="draft">{t.statusDraft}</option>
                            <option value="published">
                              {t.statusPublished}
                            </option>
                            <option value="running">{t.statusRunning}</option>
                            <option value="completed">
                              {t.statusCompleted}
                            </option>
                            <option value="archived">{t.statusArchived}</option>
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
                        {t.sectionSchedule}
                      </h2>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            {t.startDateLabel}
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
                            {t.endDateLabel}
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
                            {t.rosterLockLabel}
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
                            {t.rosterLockHelp}
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            {t.timezoneLabel}
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
                            {t.timezoneHelp}
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            {t.formatLabel}
                          </label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.format}
                            onChange={(e) =>
                              updateField('format', e.target.value)
                            }
                            placeholder="BO3"
                          />
                          <p className="text-xs text-neutral-500 mt-1">
                            {t.formatHelp}
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            {t.formatTypeLabel}
                          </label>
                          <select
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.format_type}
                            onChange={(e) =>
                              updateField('format_type', e.target.value)
                            }
                          >
                            <option value="">{t.formatTypeNone}</option>
                            <option value="single_elim">
                              {t.formatSingleElim}
                            </option>
                            <option value="double_elim">
                              {t.formatDoubleElim}
                            </option>
                            <option value="swiss">{t.formatSwiss}</option>
                            <option value="round_robin">
                              {t.formatRoundRobin}
                            </option>
                            <option value="showmatch">
                              {t.formatShowmatch}
                            </option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            {t.maxTeamsLabel}
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
                            {t.minPlayersLabel}
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
                            {t.minPlayersHelp}
                          </p>
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm mb-1 text-neutral-300">
                            {t.maxPlayersLabel}
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
                            {t.maxPlayersHelp}
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
                        {t.sectionVisuals}
                      </h2>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            {t.logoLabel}
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
                            {t.bannerLabel}
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
                          {t.rulesLabel}
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
                            {uploadingRules ? t.uploading : t.uploadPdf}
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
                          {t.rulesHelp}
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
                            {t.openCurrentRules}
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
                        {t.sectionPublic}
                      </h2>
                      <p className="text-xs text-neutral-500 mb-4">
                        {t.publicHelp}
                      </p>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            {t.descriptionLabel}
                          </label>
                          <textarea
                            rows={4}
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.description_info}
                            onChange={(e) =>
                              updateField('description_info', e.target.value)
                            }
                            placeholder={t.descriptionPlaceholder}
                          />
                        </div>

                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            {t.scheduleDetailsLabel}
                          </label>
                          <textarea
                            rows={4}
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.schedule_details}
                            onChange={(e) =>
                              updateField('schedule_details', e.target.value)
                            }
                            placeholder={t.scheduleDetailsPlaceholder}
                          />
                        </div>

                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            {t.scheduleRulesLabel}
                          </label>
                          <textarea
                            rows={4}
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.schedule_rules}
                            onChange={(e) =>
                              updateField('schedule_rules', e.target.value)
                            }
                            placeholder={t.scheduleRulesPlaceholder}
                          />
                        </div>

                        <div>
                          <label className="block text-sm mb-1 text-neutral-300">
                            {t.formatDetailsLabel}
                          </label>
                          <textarea
                            rows={4}
                            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.format_details}
                            onChange={(e) =>
                              updateField('format_details', e.target.value)
                            }
                            placeholder={t.formatDetailsPlaceholder}
                          />
                        </div>
                      </div>
                    </section>

                    {/* Champs d'inscription personnalisés */}
                    <RegistrationFieldsEditor
                      fields={registrationFields}
                      onChange={setRegistrationFields}
                      disabled={saving}
                      presets={registrationPresets}
                      presetsGameLabel={gameConfig?.label}
                    />
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
                        {t.sectionVisibility}
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
                              {t.publicToggle}
                            </span>
                            <p className="text-xs text-neutral-500">
                              {t.publicToggleHelp}
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
                              {t.featuredToggle}
                            </span>
                            <p className="text-xs text-neutral-500">
                              {t.featuredToggleHelp}
                            </p>
                          </div>
                        </label>
                      </div>
                    </section>

                    {/* Actions */}
                    <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                      <h2 className="text-lg font-semibold mb-4">
                        {t.sectionActions}
                      </h2>

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
                              {t.saving}
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
                              {t.saveChanges}
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
                          {t.cancel}
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
