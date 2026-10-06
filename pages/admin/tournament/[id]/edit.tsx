// pages/admin/tournament/[id]/edit.tsx

import { useCallback, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useHydrateOnce } from '@/features/admin/_shared/useHydrateOnce';
import { useDirtyBaseline } from '@/hooks/forms/useDirtyBaseline';
import { useUnsavedChangesGuard } from '@/hooks/forms/useUnsavedChangesGuard';
import { isStaleUpdateError } from '@/features/admin/_shared/optimisticLock';
import StaleUpdateNotice from '@/features/admin/_shared/ui/StaleUpdateNotice';
import {
  useTournamentDetail,
  useUpdateTournament,
} from '@/features/admin/tournaments/hooks/useTournamentDetail';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import RegistrationFieldsEditor, {
  hasRegistrationFieldErrors,
} from '@/components/admin/RegistrationFieldsEditor';
import TournamentVisualsSection from '@/components/admin/tournament/TournamentVisualsSection';
import TournamentFormatFields from '@/components/admin/tournament/TournamentFormatFields';
import { useAdminT } from '@/lib/i18n/useAdminT';
import type { StaffProps, Tournament } from '@/types/admin';
import type { RegistrationField } from '@/utils/registrationFields';
import { getGame } from '@/config/games';
import { TOURNAMENT_TIMEZONES } from '@/utils/timezone';
import nsAdminTournamentEdit from '@/lib/i18n/locales/admin-fr/adminTournamentEdit';
import nsAdminRegistrationFields from '@/lib/i18n/locales/admin-fr/adminRegistrationFields';
import nsAdminFiche from '@/lib/i18n/locales/admin-fr/adminFiche';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import {
  FicheLayout,
  FicheSection,
  MetaList,
} from '@/features/admin/_shared/ui/Fiche';

const FORM_ID = 'tournament-edit-form';
const LABEL = 'mb-1 block text-sm text-[var(--t2,#c7bfca)]';
const HELP = 'mt-1 text-xs text-[var(--t3,#a39ba6)]';
const INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';
const TOGGLE =
  'flex cursor-pointer items-center gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3 transition-colors hover:border-[var(--line2,rgba(194,196,201,.2))]';

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

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

function AdminTournamentEditPage(_props: StaffProps) {
  const router = useRouter();
  const { id } = router.query;

  const tournamentId = String(id ?? '');
  const [saving, setSaving] = useState(false);
  const [actionError, setErrorMsg] = useState<string | null>(null);
  const { addToast } = useToast();
  const detail = useTournamentDetail<Tournament>(tournamentId, {
    editor: true,
  });
  const saveTournament = useUpdateTournament(tournamentId, 'PUT');
  const t = useAdminT(nsAdminTournamentEdit);
  const tf = useAdminT(nsAdminRegistrationFields);
  const tFiche = useAdminT(nsAdminFiche);

  const [registrationFields, setRegistrationFields] = useState<
    RegistrationField[]
  >([]);

  const [dateError, setDateError] = useState<string | null>(null);

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
    solo_mode: boolean;
    pooled_teams: boolean;
    max_players: string;
    is_public: boolean;
    is_featured: boolean;
    logo_url: string;
    banner_url: string;
    rules_url: string;
    default_stream_url: string;
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
    solo_mode: false,
    pooled_teams: false,
    max_players: '',
    is_public: false,
    is_featured: false,
    logo_url: '',
    banner_url: '',
    rules_url: '',
    default_stream_url: '',
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

  // « Modifications non enregistrées » : comparées à la dernière version
  // hydratée depuis le serveur (ouverture, puis chaque enregistrement réussi).
  const editable = useMemo(
    () => ({ form, registrationFields }),
    [form, registrationFields]
  );
  const { dirty, markClean } = useDirtyBaseline(editable);
  useUnsavedChangesGuard(dirty, tFiche.unsavedConfirm);
  // Verrou optimiste : version (`updated_at`) sur laquelle repose la saisie.
  const [version, setVersion] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [reloading, setReloading] = useState(false);

  // Pré-remplissage du formulaire depuis la fiche serveur : à l'ouverture
  // (une fois), puis après chaque enregistrement.
  const hydrateForm = useCallback(
    (tour: Tournament) => {
      const nextForm = {
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
        solo_mode: tour.solo_mode === true,
        pooled_teams: tour.pooled_teams === true,
        max_players: tour.max_players ? String(tour.max_players) : '',
        is_public: tour.is_public,
        is_featured: tour.is_featured,
        logo_url: tour.logo_url || '',
        banner_url: tour.banner_url || '',
        rules_url: tour.rules_url || '',
        default_stream_url: tour.default_stream_url || '',
        description_info: tour.description_info || '',
        schedule_details: tour.schedule_details || '',
        schedule_rules: tour.schedule_rules || '',
        format_details: tour.format_details || '',
      };
      const nextFields = Array.isArray(tour.registration_fields)
        ? tour.registration_fields
        : [];
      setForm(nextForm);
      setRegistrationFields(nextFields);
      setVersion(tour.updated_at ?? null);
      markClean({ form: nextForm, registrationFields: nextFields });
    },
    [markClean]
  );

  const formReady = useHydrateOnce(tournamentId || null, detail.data, (d) => {
    if (d.tournament) hydrateForm(d.tournament);
  });
  const loading = detail.isFetching;
  const errorMsg =
    actionError ??
    (detail.error ? (detail.error.message ?? t.errorLoad) : null);

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
      solo_mode: form.solo_mode,
      pooled_teams: form.pooled_teams,
      max_players: form.max_players ? Number(form.max_players) : null,
      is_public: form.is_public,
      is_featured: form.is_featured,
      logo_url: form.logo_url.trim() || null,
      banner_url: form.banner_url.trim() || null,
      rules_url: form.rules_url.trim() || null,
      default_stream_url: form.default_stream_url.trim() || null,
      description_info: form.description_info.trim() || null,
      schedule_details: form.schedule_details.trim() || null,
      schedule_rules: form.schedule_rules.trim() || null,
      format_details: form.format_details.trim() || null,
      registration_fields: registrationFields,
      expected_updated_at: version,
    };

    try {
      await saveTournament.mutateAsync(payload);

      addToast(t.toastUpdated, 'success');
      // Relecture de la fiche, formulaire réhydraté (comme avant).
      const { data } = await detail.refetch();
      if (data?.tournament) hydrateForm(data.tournament);
    } catch (err: unknown) {
      if (isStaleUpdateError(err)) setStale(true);
      else setErrorMsg((err as Error)?.message ?? t.errorUpdate);
    } finally {
      setSaving(false);
    }
  }

  // 409 : relire la fiche et repartir de la version à jour.
  async function handleReload() {
    setReloading(true);
    try {
      const { data } = await detail.refetch();
      if (data?.tournament) hydrateForm(data.tournament);
      setStale(false);
      setErrorMsg(null);
    } finally {
      setReloading(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <TournamentTabsNav tournamentId={String(id ?? '')} active="settings" />

        <EntityHeader
          title={(formReady && form.name) || t.heading}
          meta={t.subtitle}
          actions={
            !loading &&
            formReady && (
              <>
                <AdminButtonLink
                  href={`/admin/tournament/${id}`}
                  variant="ghost"
                  size="sm"
                  className={saving ? 'pointer-events-none opacity-50' : ''}
                >
                  {t.cancel}
                </AdminButtonLink>
                <AdminButton
                  type="submit"
                  form={FORM_ID}
                  variant="primary"
                  size="sm"
                  disabled={saving}
                >
                  {saving ? t.saving : t.saveChanges}
                </AdminButton>
              </>
            )
          }
        />

        {stale && (
          <StaleUpdateNotice onReload={handleReload} reloading={reloading} />
        )}

        {errorMsg && (
          <div className="mb-6 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]">
            {errorMsg}
          </div>
        )}

        {loading && !formReady && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)]" />
          </div>
        )}

        {!loading && formReady && (
          <form id={FORM_ID} onSubmit={handleSubmit}>
            <fieldset disabled={saving}>
              <FicheLayout
                main={
                  <>
                    <FicheSection title={t.sectionGeneral}>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className={LABEL}>
                            {t.nameLabel}{' '}
                            <span className="text-[var(--err,#ff6b6b)]">*</span>
                          </label>
                          <input
                            type="text"
                            className={INPUT}
                            value={form.name}
                            onChange={(e) =>
                              updateField('name', e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <label className={LABEL}>{t.slugLabel}</label>
                          <input
                            type="text"
                            className={INPUT}
                            value={form.slug}
                            onChange={(e) =>
                              updateField('slug', e.target.value)
                            }
                            placeholder="owl-womens-cup-1"
                          />
                          <p className={HELP}>{t.slugHelp}</p>
                        </div>
                        <div>
                          <label className={LABEL}>{t.gameLabel}</label>
                          <input
                            type="text"
                            className={INPUT}
                            value={form.game}
                            onChange={(e) =>
                              updateField('game', e.target.value)
                            }
                            placeholder="Overwatch"
                          />
                        </div>
                        <div>
                          <label className={LABEL}>{t.statusLabel}</label>
                          <select
                            className={INPUT}
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
                    </FicheSection>

                    <FicheSection title={t.sectionSchedule}>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className={LABEL}>{t.startDateLabel}</label>
                          <input
                            type="datetime-local"
                            className={INPUT}
                            value={form.start_date}
                            onChange={(e) =>
                              updateField('start_date', e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <label className={LABEL}>{t.endDateLabel}</label>
                          <input
                            type="datetime-local"
                            className={`${INPUT} ${
                              dateError ? '!border-[var(--err,#ff6b6b)]' : ''
                            }`}
                            value={form.end_date}
                            onChange={(e) => {
                              updateField('end_date', e.target.value);
                              setDateError(null);
                            }}
                          />
                          {dateError && (
                            <p className="mt-1 text-xs text-[var(--err,#ff6b6b)]">
                              {dateError}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className={LABEL}>{t.rosterLockLabel}</label>
                          <input
                            type="datetime-local"
                            className={INPUT}
                            value={form.roster_locked_at}
                            onChange={(e) =>
                              updateField('roster_locked_at', e.target.value)
                            }
                          />
                          <p className={HELP}>{t.rosterLockHelp}</p>
                        </div>
                        <div>
                          <label className={LABEL}>{t.timezoneLabel}</label>
                          <select
                            className={INPUT}
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
                          <p className={HELP}>{t.timezoneHelp}</p>
                        </div>
                        <TournamentFormatFields
                          form={form}
                          updateField={updateField}
                        />
                      </div>
                    </FicheSection>

                    {/* Visuels : logo, bannière, règlement, chaîne de diffusion */}
                    <TournamentVisualsSection
                      form={form}
                      updateField={updateField}
                    />

                    <FicheSection title={t.sectionPublic}>
                      <p className="-mt-3 mb-4 text-xs text-[var(--t3,#a39ba6)]">
                        {t.publicHelp}
                      </p>
                      <div className="space-y-4">
                        <div>
                          <label className={LABEL}>{t.descriptionLabel}</label>
                          <textarea
                            rows={4}
                            className={INPUT}
                            value={form.description_info}
                            onChange={(e) =>
                              updateField('description_info', e.target.value)
                            }
                            placeholder={t.descriptionPlaceholder}
                          />
                        </div>
                        <div>
                          <label className={LABEL}>
                            {t.scheduleDetailsLabel}
                          </label>
                          <textarea
                            rows={4}
                            className={INPUT}
                            value={form.schedule_details}
                            onChange={(e) =>
                              updateField('schedule_details', e.target.value)
                            }
                            placeholder={t.scheduleDetailsPlaceholder}
                          />
                        </div>
                        <div>
                          <label className={LABEL}>
                            {t.scheduleRulesLabel}
                          </label>
                          <textarea
                            rows={4}
                            className={INPUT}
                            value={form.schedule_rules}
                            onChange={(e) =>
                              updateField('schedule_rules', e.target.value)
                            }
                            placeholder={t.scheduleRulesPlaceholder}
                          />
                        </div>
                        <div>
                          <label className={LABEL}>
                            {t.formatDetailsLabel}
                          </label>
                          <textarea
                            rows={4}
                            className={INPUT}
                            value={form.format_details}
                            onChange={(e) =>
                              updateField('format_details', e.target.value)
                            }
                            placeholder={t.formatDetailsPlaceholder}
                          />
                        </div>
                      </div>
                    </FicheSection>

                    {/* Champs d'inscription personnalisés */}
                    <RegistrationFieldsEditor
                      fields={registrationFields}
                      onChange={setRegistrationFields}
                      disabled={saving}
                      presets={registrationPresets}
                      presetsGameLabel={gameConfig?.label}
                    />
                  </>
                }
                aside={
                  <>
                    <FicheSection title={t.sectionVisibility} eyebrow>
                      <div className="space-y-3">
                        <label className={TOGGLE}>
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-[var(--lf,#7fca65)]"
                            checked={form.is_public}
                            onChange={(e) =>
                              updateField('is_public', e.target.checked)
                            }
                          />
                          <div>
                            <span className="text-sm font-medium text-[var(--t1,#f4edf7)]">
                              {t.publicToggle}
                            </span>
                            <p className="text-xs text-[var(--t3,#a39ba6)]">
                              {t.publicToggleHelp}
                            </p>
                          </div>
                        </label>
                        <label className={TOGGLE}>
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-[var(--or,#b467d1)]"
                            checked={form.is_featured}
                            onChange={(e) =>
                              updateField('is_featured', e.target.checked)
                            }
                          />
                          <div>
                            <span className="text-sm font-medium text-[var(--t1,#f4edf7)]">
                              {t.featuredToggle}
                            </span>
                            <p className="text-xs text-[var(--t3,#a39ba6)]">
                              {t.featuredToggleHelp}
                            </p>
                          </div>
                        </label>
                      </div>
                    </FicheSection>

                    <FicheSection title={tFiche.metaTitle} eyebrow>
                      <MetaList
                        items={[
                          { label: tFiche.metaId, value: String(id ?? '') },
                        ]}
                      />
                    </FicheSection>
                  </>
                }
              />
            </fieldset>
          </form>
        )}
      </div>
    </>
  );
}

export default withAdminQuery(AdminTournamentEditPage);
