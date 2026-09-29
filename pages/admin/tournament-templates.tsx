// pages/admin/tournament-templates.tsx
// UI pour creer et gerer des templates de tournoi personnalises.

import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import {
  useTournamentTemplateActions,
  useTournamentTemplates,
} from '@/features/admin/tournaments/hooks/useTournamentTemplates';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import {
  TOURNAMENT_TEMPLATES,
  type TournamentTemplate,
  type TemplateStage,
  type StageType,
} from '@/config/tournament-templates';
import nsAdminTournamentTemplates from '@/lib/i18n/locales/admin-fr/adminTournamentTemplates';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import LoadingSpinner from '@/components/admin/LoadingSpinner';

type Dict = typeof nsAdminTournamentTemplates.fr;

type StaffProps = {
  staff: { id: string; role: string; display_name: string | null };
};

function getStageTypes(t: Dict): { value: StageType; label: string }[] {
  return [
    { value: 'group', label: t.stageTypeGroup },
    { value: 'bracket', label: t.stageTypeBracket },
    { value: 'swiss', label: t.stageTypeSwiss },
    { value: 'round_robin', label: t.stageTypeRoundRobin },
    { value: 'showmatch', label: t.stageTypeShowmatch },
    { value: 'other', label: t.stageTypeOther },
  ];
}

const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4';
const SECTION_TITLE =
  'mb-4 font-[family-name:var(--fd)] text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--t1,#f4edf7)] [font-stretch:75%]';
const LABEL = 'mb-1 block text-sm text-[var(--t3,#a39ba6)]';
const INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2.5 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';
const INPUT_SM =
  'rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 py-1.5 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';

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

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

function AdminTournamentTemplatesPage(_props: StaffProps) {
  const t = useAdminT(nsAdminTournamentTemplates);
  const STAGE_TYPES = getStageTypes(t);
  const router = useRouter();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const templatesQuery = useTournamentTemplates();
  const { create: createTemplate, remove: removeTemplate } =
    useTournamentTemplateActions();

  const customTemplates = templatesQuery.data ?? [];
  const loading = templatesQuery.isPending;
  const [actionError, setErrorMsg] = useState<string | null>(null);
  const errorMsg =
    actionError ??
    (templatesQuery.error
      ? templatesQuery.error.message || t.errorUnexpected
      : null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newStages, setNewStages] = useState<TemplateStage[]>([
    { name: '', stage_type: 'bracket' },
  ]);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!newName.trim()) {
      setErrorMsg(t.errorNameRequired);
      return;
    }

    const validStages = newStages.filter((s) => s.name.trim());
    if (validStages.length === 0) {
      setErrorMsg(t.errorStageRequired);
      return;
    }

    setCreating(true);
    try {
      await createTemplate.mutateAsync({
        name: newName.trim(),
        description: newDesc.trim(),
        stages: validStages,
      });

      addToast(t.createSuccess, 'success');
      setNewName('');
      setNewDesc('');
      setNewStages([{ name: '', stage_type: 'bracket' }]);
      setShowCreate(false);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorUnexpected);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(templateId: string) {
    const ok = await confirm({
      title: t.deleteConfirmTitle,
      variant: 'danger',
      confirmLabel: t.deleteConfirmLabel,
    });
    if (!ok) return;

    setDeletingId(templateId);
    setErrorMsg(null);

    try {
      await removeTemplate.mutateAsync(templateId);

      addToast(t.deleteSuccess, 'success');
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorUnexpected);
    } finally {
      setDeletingId(null);
    }
  }

  function addStageRow() {
    setNewStages((prev) => [...prev, { name: '', stage_type: 'bracket' }]);
  }

  function removeStageRow(idx: number) {
    setNewStages((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateStageRow(
    idx: number,
    field: keyof TemplateStage,
    value: string
  ) {
    setNewStages((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  }

  function TemplateCard({
    tpl,
    isBuiltIn,
  }: {
    tpl: TournamentTemplate;
    isBuiltIn: boolean;
  }) {
    return (
      <div className={`${CARD} space-y-3`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
              {tpl.name}
            </h3>
            {tpl.description && (
              <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
                {tpl.description}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Chip tone={isBuiltIn ? 'neutral' : 'brand'}>
              {isBuiltIn ? t.badgeBuiltIn : t.badgeCustom}
            </Chip>
            {!isBuiltIn && (
              <AdminButton
                size="xs"
                variant="danger"
                onClick={() => handleDelete(tpl.id)}
                disabled={deletingId === tpl.id}
                title={t.deleteTitle}
                aria-label={t.deleteTitle}
              >
                <svg
                  aria-hidden
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </AdminButton>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {tpl.stages.map((s, i) => (
            <span
              key={i}
              className={`rounded-[3px] border px-2 py-0.5 text-[10px] font-medium ${stageTypeBadge(s.stage_type)}`}
            >
              {s.name}
            </span>
          ))}
        </div>

        <p className="font-mono text-[11px] text-[var(--t4,#807984)]">
          {format(t.cardId, { id: tpl.id })}
        </p>
      </div>
    );
  }

  return (
    <>
      {dialog}
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div>
          {/* Retour à la liste des tournois */}
          <button
            type="button"
            onClick={() => router.push('/admin/tournaments')}
            className="mb-4 inline-flex items-center gap-2 text-sm text-[var(--t3,#a39ba6)] transition-colors hover:text-[var(--t1,#f4edf7)]"
          >
            <svg
              aria-hidden
              className="h-4 w-4"
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
            {t.back}
          </button>

          {/* Formulaire ouvert : son bouton « Créer » devient l'action principale. */}
          <AdminPageHeader
            title={t.heading}
            subtitle={t.subtitle}
            actions={
              <AdminButton
                variant={showCreate ? 'ghost' : 'primary'}
                onClick={() => setShowCreate(!showCreate)}
              >
                <svg
                  aria-hidden
                  className="h-4 w-4"
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
                {t.newTemplate}
              </AdminButton>
            }
          />

          {/* Messages */}
          {errorMsg && (
            <div
              role="alert"
              className="mb-6 flex items-center gap-2 rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]"
            >
              <svg
                aria-hidden
                className="h-5 w-5 flex-shrink-0 text-[var(--err,#ff6b6b)]"
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
          {/* Create form */}
          {showCreate && (
            <section className={`${CARD} mb-8 space-y-4`}>
              <h2 className={`${SECTION_TITLE} !mb-0`}>{t.createHeading}</h2>

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={LABEL}>
                      {t.nameLabel}{' '}
                      <span className="text-[var(--err,#ff6b6b)]">*</span>
                    </label>
                    <input
                      type="text"
                      className={INPUT}
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={t.namePlaceholder}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>{t.descLabel}</label>
                    <input
                      type="text"
                      className={INPUT}
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder={t.descPlaceholder}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-[var(--t3,#a39ba6)]">
                      {t.stagesLabel}{' '}
                      <span className="text-[var(--err,#ff6b6b)]">*</span>
                    </label>
                    <AdminButton size="xs" onClick={addStageRow}>
                      {t.addStage}
                    </AdminButton>
                  </div>

                  <div className="space-y-2">
                    {newStages.map((stage, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-3"
                      >
                        <span
                          className="w-6 text-center text-xs text-[var(--t4,#807984)]"
                          data-numeric
                        >
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          className={`${INPUT_SM} flex-1 bg-[var(--s1,#100812)]`}
                          value={stage.name}
                          onChange={(e) =>
                            updateStageRow(idx, 'name', e.target.value)
                          }
                          placeholder={t.stageNamePlaceholder}
                        />
                        <select
                          className={`${INPUT_SM} bg-[var(--s1,#100812)]`}
                          value={stage.stage_type}
                          onChange={(e) =>
                            updateStageRow(idx, 'stage_type', e.target.value)
                          }
                        >
                          {STAGE_TYPES.map((st) => (
                            <option key={st.value} value={st.value}>
                              {st.label}
                            </option>
                          ))}
                        </select>
                        {newStages.length > 1 && (
                          <AdminButton
                            size="xs"
                            onClick={() => removeStageRow(idx)}
                          >
                            <svg
                              aria-hidden
                              className="h-4 w-4"
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
                          </AdminButton>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <AdminButton
                    type="submit"
                    variant="primary"
                    disabled={creating}
                  >
                    {creating ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[rgba(15,10,18,.3)] border-t-[#0f0a12]" />
                        {t.creating}
                      </>
                    ) : (
                      t.createSubmit
                    )}
                  </AdminButton>
                  <AdminButton onClick={() => setShowCreate(false)}>
                    {t.cancel}
                  </AdminButton>
                </div>
              </form>
            </section>
          )}

          {/* Templates lists */}
          <div className="space-y-8">
            {/* Built-in */}
            <section>
              <h2 className={SECTION_TITLE}>
                {format(t.builtInHeading, {
                  count: TOURNAMENT_TEMPLATES.length,
                })}
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {TOURNAMENT_TEMPLATES.map((tpl) => (
                  <TemplateCard key={tpl.id} tpl={tpl} isBuiltIn />
                ))}
              </div>
            </section>

            {/* Custom */}
            <section>
              <h2 className={SECTION_TITLE}>
                {format(t.customHeading, { count: customTemplates.length })}
              </h2>

              {loading ? (
                <LoadingSpinner className="py-12" />
              ) : customTemplates.length === 0 ? (
                <div
                  className={`${CARD} py-12 text-center text-[var(--t3,#a39ba6)]`}
                >
                  <p>{t.emptyCustom}</p>
                  <p className="text-xs mt-1">{t.emptyCustomHint}</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {customTemplates.map((tpl) => (
                    <TemplateCard key={tpl.id} tpl={tpl} isBuiltIn={false} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

export default withAdminQuery(AdminTournamentTemplatesPage);
