// pages/admin/tournament-templates.tsx
// UI pour creer et gerer des templates de tournoi personnalises.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import {
  TOURNAMENT_TEMPLATES,
  type TournamentTemplate,
  type TemplateStage,
  type StageType,
} from '@/config/tournament-templates';

type Dict = ReturnType<typeof useAdminT<'adminTournamentTemplates'>>;

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

export const getServerSideProps = withStaffPage('admin');

function AdminTournamentTemplatesPage({ staff }: StaffProps) {
  const t = useAdminT('adminTournamentTemplates');
  const STAGE_TYPES = getStageTypes(t);
  const router = useRouter();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson: createTemplate } = useIdempotentMutation();

  const [customTemplates, setCustomTemplates] = useState<TournamentTemplate[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newStages, setNewStages] = useState<TemplateStage[]>([
    { name: '', stage_type: 'bracket' },
  ]);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCustomTemplates = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const json = await adminFetchJson<{ templates?: TournamentTemplate[] }>(
        '/api/admin/tournament-templates'
      );
      setCustomTemplates(json.templates || []);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorUnexpected);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, t]);

  useEffect(() => {
    fetchCustomTemplates();
  }, [fetchCustomTemplates]);

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
      await createTemplate('/api/admin/tournament-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim(),
          stages: validStages,
        }),
      });

      addToast(t.createSuccess, 'success');
      setNewName('');
      setNewDesc('');
      setNewStages([{ name: '', stage_type: 'bracket' }]);
      setShowCreate(false);
      fetchCustomTemplates();
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
      await adminFetchJson('/api/admin/tournament-templates', {
        method: 'DELETE',
        body: JSON.stringify({ templateId }),
      });

      addToast(t.deleteSuccess, 'success');
      fetchCustomTemplates();
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
      <div className="bg-neutral-900/50 border border-neutral-700 rounded-xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-sm">{tpl.name}</h3>
            {tpl.description && (
              <p className="text-xs text-neutral-400 mt-1">{tpl.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                isBuiltIn
                  ? 'bg-neutral-700 text-neutral-300'
                  : 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
              }`}
            >
              {isBuiltIn ? t.badgeBuiltIn : t.badgeCustom}
            </span>
            {!isBuiltIn && (
              <button
                type="button"
                onClick={() => handleDelete(tpl.id)}
                disabled={deletingId === tpl.id}
                className="p-1.5 rounded hover:bg-red-900/50 text-neutral-500 hover:text-red-400 transition-colors disabled:opacity-50"
                title={t.deleteTitle}
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
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {tpl.stages.map((s, i) => (
            <span
              key={i}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${stageTypeBadge(s.stage_type)}`}
            >
              {s.name}
            </span>
          ))}
        </div>

        <p className="text-[11px] text-neutral-500 font-mono">
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
              {t.back}
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {t.heading}
                </h1>
                <p className="text-neutral-400 text-sm mt-1">{t.subtitle}</p>
              </div>

              <button
                type="button"
                onClick={() => setShowCreate(!showCreate)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold transition-colors flex items-center gap-2"
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                {t.newTemplate}
              </button>
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
          {/* Create form */}
          {showCreate && (
            <section className="mb-8 bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-semibold">{t.createHeading}</h2>

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      {t.nameLabel} <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={t.namePlaceholder}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      {t.descLabel}
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder={t.descPlaceholder}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-neutral-300">
                      {t.stagesLabel} <span className="text-red-400">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={addStageRow}
                      className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-medium transition-colors"
                    >
                      {t.addStage}
                    </button>
                  </div>

                  <div className="space-y-2">
                    {newStages.map((stage, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-3 rounded-lg bg-neutral-900/50 border border-neutral-700"
                      >
                        <span className="text-xs text-neutral-500 w-6 text-center">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          className="flex-1 px-2 py-1.5 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={stage.name}
                          onChange={(e) =>
                            updateStageRow(idx, 'name', e.target.value)
                          }
                          placeholder={t.stageNamePlaceholder}
                        />
                        <select
                          className="px-2 py-1.5 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                          <button
                            type="button"
                            onClick={() => removeStageRow(idx)}
                            className="p-1.5 rounded hover:bg-red-900/50 text-neutral-500 hover:text-red-400 transition-colors"
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
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {creating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {t.creating}
                      </>
                    ) : (
                      t.createSubmit
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors"
                  >
                    {t.cancel}
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* Templates lists */}
          <div className="space-y-8">
            {/* Built-in */}
            <section>
              <h2 className="text-lg font-semibold mb-4">
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
              <h2 className="text-lg font-semibold mb-4">
                {format(t.customHeading, { count: customTemplates.length })}
              </h2>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
                </div>
              ) : customTemplates.length === 0 ? (
                <div className="text-center py-12 text-neutral-400 bg-neutral-800/50 border border-neutral-700/50 rounded-2xl">
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

export default AdminTournamentTemplatesPage;
