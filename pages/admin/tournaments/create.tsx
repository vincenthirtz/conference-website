import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import {
  TOURNAMENT_TEMPLATES,
  type TournamentTemplate,
} from '@/config/tournament-templates';
import { applyTemplateDefaults } from '@/utils/admin/tournamentTemplateForm';
import SoloModeCheckbox from '@/components/admin/tournaments/SoloModeCheckbox';
import TemplatePicker from '@/components/admin/tournaments/TemplatePicker';
import { useAutoSave } from '@/utils/useAutoSave';
import { withAdminQuery } from '@/features/admin/_shared/query';
import {
  tournamentsUrls,
  tournamentUrls,
} from '@/features/admin/tournaments/client';
import { useTournamentTemplates } from '@/features/admin/tournaments/hooks/useTournamentTemplates';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import DraftBanner from '@/components/admin/DraftBanner';
import AutoSaveIndicator from '@/components/admin/AutoSaveIndicator';
import { useAdminT } from '@/lib/i18n/useAdminT';

import { logger } from '../../../utils/logger';
import nsAdminTournamentsCreate from '@/lib/i18n/locales/admin-fr/adminTournamentsCreate';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import CreateTournamentAside, {
  CREATE_CARD,
  CREATE_CARD_TITLE,
  CREATE_ERROR,
  CREATE_HELP,
  CREATE_INPUT,
  CREATE_LABEL,
  CREATE_TOGGLE,
} from '@/features/admin/tournaments/ui/CreateTournamentAside';

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
  solo_mode?: boolean;
  is_public?: boolean;
  is_featured?: boolean;
  logo_url?: string | null;
  banner_url?: string | null;
};

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

function AdminTournamentCreatePage(_props: Props) {
  const t = useAdminT(nsAdminTournamentsCreate);
  const router = useRouter();
  const { mutate: mutateIdempotent } = useIdempotentMutation();
  const { mutate: createTournament } = useIdempotentMutation();
  const templatesQuery = useTournamentTemplates();
  const customTemplates = templatesQuery.data ?? [];
  const templatesError = templatesQuery.error;

  useEffect(() => {
    // Échec non bloquant : le reste de la page (templates prédéfinis,
    // formulaire) reste utilisable. On informe juste l'utilisateur.
    if (!templatesError) return;
    logger.error('load custom templates error', templatesError);
    setErrorMsg(t.errorTemplatesLoad);
  }, [templatesError, t.errorTemplatesLoad]);

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
    solo_mode: boolean;
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
    solo_mode: false,
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
  // Fallback d'aperçu du logo géré par état (réarmé à chaque changement d'URL).
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [form.logo_url]);

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

  /**
   * Choisir un gabarit, et poser les réglages de tournoi qu'il emporte —
   * la règle vit dans `applyTemplateDefaults`, qui explique pourquoi.
   */
  function selectTemplate(tpl: TournamentTemplate | null) {
    setSelectedTemplate(tpl);
    setForm((prev) => applyTemplateDefaults(prev, tpl));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    setDateError(null);

    if (!form.name.trim()) {
      setErrorMsg(t.errorNameRequired);
      return;
    }

    if (form.start_date && form.end_date) {
      if (new Date(form.start_date) >= new Date(form.end_date)) {
        setDateError(t.errorEndAfterStart);
        setErrorMsg(t.errorEndAfterStart);
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
      solo_mode: form.solo_mode,
      max_players: form.max_players ? Number(form.max_players) : null,
      is_public: form.is_public,
      is_featured: form.is_featured,
      logo_url: form.logo_url.trim() || null,
      banner_url: form.banner_url.trim() || null,
    };

    try {
      const res = await createTournament(tournamentsUrls.collection, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorCreate);
      }

      const json = await res.json();
      const created = json.tournament;

      if (created?.id) {
        clearDraft();
        // Apply template if selected
        if (selectedTemplate) {
          try {
            const tplRes = await mutateIdempotent(
              tournamentUrls.applyTemplate(created.id),
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

        router.push(`/admin/tournament/${created.id}/dashboard`);
      } else {
        router.push('/admin/tournaments');
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorCreateUnknown);
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div>
          <button
            type="button"
            data-case="normal"
            onClick={() => router.push('/admin/tournaments')}
            className="mb-4 inline-flex items-center gap-2 text-sm text-[var(--t3,#a39ba6)] transition-colors hover:text-[var(--t1,#f4edf7)]"
          >
            ← {t.backToList}
          </button>
          <AdminPageHeader title={t.pageTitle} subtitle={t.pageSubtitle} />

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr] items-start">
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
              {errorMsg && <div className={CREATE_ERROR}>{errorMsg}</div>}

              <TemplatePicker
                templates={[...TOURNAMENT_TEMPLATES, ...customTemplates]}
                selected={selectedTemplate}
                onSelect={selectTemplate}
                labels={{
                  title: t.templateTitle,
                  help: t.templateHelp,
                  noTemplate: t.noTemplate,
                  noTemplateDesc: t.noTemplateDesc,
                }}
              />

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Informations generales */}
                <section className={CREATE_CARD}>
                  <h2 className={CREATE_CARD_TITLE}>{t.generalInfo}</h2>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={CREATE_LABEL}>
                        {t.nameLabel}{' '}
                        <span className="text-[var(--err,#ff6b6b)]">*</span>
                      </label>
                      <input
                        type="text"
                        className={CREATE_INPUT}
                        value={form.name}
                        onChange={(e) => updateField('name', e.target.value)}
                        placeholder="OWL Women's Cup #1"
                      />
                    </div>

                    <div>
                      <label className={CREATE_LABEL}>{t.slugLabel}</label>
                      <input
                        type="text"
                        className={`${CREATE_INPUT} font-mono`}
                        value={form.slug}
                        onChange={(e) => updateField('slug', e.target.value)}
                        placeholder="owl-womens-cup-1"
                      />
                      <p className={CREATE_HELP}>{t.slugHelp}</p>
                    </div>

                    <div>
                      <label className={CREATE_LABEL}>{t.gameLabel}</label>
                      <input
                        type="text"
                        className={CREATE_INPUT}
                        value={form.game}
                        onChange={(e) => updateField('game', e.target.value)}
                        placeholder="Overwatch"
                      />
                    </div>

                    <div>
                      <label className={CREATE_LABEL}>{t.statusLabel}</label>
                      <select
                        className={CREATE_INPUT}
                        value={form.status}
                        onChange={(e) => updateField('status', e.target.value)}
                      >
                        <option value="draft">{t.statusDraft}</option>
                        <option value="published">{t.statusPublished}</option>
                        <option value="running">{t.statusRunning}</option>
                        <option value="completed">{t.statusCompleted}</option>
                        <option value="archived">{t.statusArchived}</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* Planning & format */}
                <section className={CREATE_CARD}>
                  <h2 className={CREATE_CARD_TITLE}>{t.planningFormat}</h2>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={CREATE_LABEL}>{t.startDateLabel}</label>
                      <input
                        type="datetime-local"
                        className={CREATE_INPUT}
                        value={form.start_date}
                        onChange={(e) =>
                          updateField('start_date', e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <label className={CREATE_LABEL}>{t.endDateLabel}</label>
                      <input
                        type="datetime-local"
                        className={`${CREATE_INPUT} ${
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
                      <label className={CREATE_LABEL}>
                        {t.globalFormatLabel}
                      </label>
                      <select
                        className={CREATE_INPUT}
                        value={form.format_type}
                        onChange={(e) =>
                          updateField('format_type', e.target.value)
                        }
                      >
                        <option value="">{t.formatTbd}</option>
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
                        <option value="showmatch">{t.formatShowmatch}</option>
                      </select>
                    </div>

                    <div>
                      <label className={CREATE_LABEL}>{t.maxTeamsLabel}</label>
                      <input
                        type="number"
                        min={2}
                        className={CREATE_INPUT}
                        value={form.max_teams}
                        onChange={(e) =>
                          updateField('max_teams', e.target.value)
                        }
                        placeholder="16"
                      />
                    </div>

                    <div>
                      <label className={CREATE_LABEL}>
                        {t.minPlayersLabel}
                      </label>
                      <input
                        type="number"
                        min={1}
                        className={CREATE_INPUT}
                        value={form.min_players}
                        onChange={(e) =>
                          updateField('min_players', e.target.value)
                        }
                        placeholder="5"
                      />
                    </div>
                    <div>
                      <label className={CREATE_LABEL}>
                        {t.maxPlayersLabel}
                      </label>
                      <input
                        type="number"
                        min={1}
                        className={CREATE_INPUT}
                        value={form.max_players}
                        onChange={(e) =>
                          updateField('max_players', e.target.value)
                        }
                        placeholder="10"
                      />
                    </div>
                  </div>

                  <SoloModeCheckbox
                    checked={form.solo_mode}
                    onChange={(v) => updateField('solo_mode', v)}
                    label={t.soloModeLabel}
                    help={t.soloModeHelp}
                  />
                </section>

                {/* Visibilite & visuels */}
                <section className={CREATE_CARD}>
                  <h2 className={CREATE_CARD_TITLE}>{t.visibilityVisuals}</h2>

                  <div className="flex flex-col gap-3">
                    <label className={CREATE_TOGGLE}>
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={form.is_public}
                        onChange={(e) =>
                          updateField('is_public', e.target.checked)
                        }
                      />
                      <span>{t.makePublic}</span>
                    </label>

                    <label className={CREATE_TOGGLE}>
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={form.is_featured}
                        onChange={(e) =>
                          updateField('is_featured', e.target.checked)
                        }
                      />
                      <span>{t.makeFeatured}</span>
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 pt-2">
                    <div>
                      <label className={CREATE_LABEL}>{t.logoUrlLabel}</label>
                      <input
                        type="text"
                        className={`${CREATE_INPUT} font-mono`}
                        value={form.logo_url}
                        onChange={(e) =>
                          updateField('logo_url', e.target.value)
                        }
                        placeholder="https://..."
                      />
                    </div>
                    <div>
                      <label className={CREATE_LABEL}>{t.bannerUrlLabel}</label>
                      <input
                        type="text"
                        className={`${CREATE_INPUT} font-mono`}
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
                  <AdminButton
                    variant="primary"
                    type="submit"
                    disabled={submitting}
                  >
                    {submitting ? t.creating : t.createButton}
                  </AdminButton>
                  <AdminButton
                    onClick={() => router.push('/admin/tournaments')}
                    disabled={submitting}
                  >
                    {t.cancel}
                  </AdminButton>
                </div>
              </form>
            </div>

            {/* Sidebar */}
            <CreateTournamentAside
              form={form}
              logoError={logoError}
              onLogoError={() => setLogoError(true)}
              selectedTemplate={selectedTemplate}
              t={t}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export default withAdminQuery(AdminTournamentCreatePage);
