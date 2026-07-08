// pages/admin/tournament/[id]/stages.tsx
// Liste des phases (stages) d'un tournoi pour le staff

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import Breadcrumb from '@/components/admin/Breadcrumb';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import Modal from '@/components/admin/Modal';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import {
  TOURNAMENT_TEMPLATES,
  type TournamentTemplate,
} from '@/config/tournament-templates';
import type {
  StaffProps,
  StageType,
  StageSummary,
  TournamentMini,
} from '@/types/admin';

type MatchesApiResponse = {
  tournament: TournamentMini | null;
  stages: StageSummary[];
};

export const getServerSideProps = withStaffPage('manager');

type Dict = ReturnType<typeof useAdminT<'adminTournamentStagesList'>>;

function typeLabel(t: Dict, type: StageType | null) {
  switch (type) {
    case 'group':
      return t.typeGroup;
    case 'bracket':
      return t.typeBracket;
    case 'swiss':
      return t.typeSwiss;
    case 'round_robin':
      return t.typeRoundRobin;
    case 'showmatch':
      return t.typeShowmatch;
    default:
      return t.typeOther;
  }
}

function StagesPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;
  const { mutate: mutateIdempotent } = useIdempotentMutation();
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const t = useAdminT('adminTournamentStagesList');

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stages, setStages] = useState<StageSummary[]>([]);
  const [tournamentName, setTournamentName] = useState<string>(
    t.defaultTournamentName
  );
  const [reorderMode, setReorderMode] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [orderChanged, setOrderChanged] = useState(false);

  // Template append
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<TournamentTemplate[]>(
    []
  );
  const [selectedTemplate, setSelectedTemplate] =
    useState<TournamentTemplate | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    if (!tournamentId) return;
    fetchStages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  async function fetchStages() {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Fetch stages
      const stagesJson = await adminFetchJson<{ stages?: typeof stages }>(
        `/api/admin/tournament/${tournamentId}/stages`
      );
      setStages(stagesJson.stages || []);

      // Fetch tournament name
      const tournamentRes = await adminFetch(
        `/api/admin/tournament/${tournamentId}`
      );
      if (tournamentRes.ok) {
        const tournamentJson = await tournamentRes.json();
        setTournamentName(
          tournamentJson.tournament?.name ||
            tournamentId ||
            t.defaultTournamentName
        );
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }

  function getSortedStages() {
    return [...stages].sort(
      (a, b) =>
        (a.order_index ?? 0) - (b.order_index ?? 0) ||
        a.name.localeCompare(b.name)
    );
  }

  function moveStage(index: number, direction: 'up' | 'down') {
    const sorted = getSortedStages();
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    // Swap order_index values
    const temp = sorted[index].order_index;
    sorted[index] = {
      ...sorted[index],
      order_index: sorted[targetIndex].order_index,
    };
    sorted[targetIndex] = { ...sorted[targetIndex], order_index: temp };

    setStages(sorted);
    setOrderChanged(true);
  }

  async function saveOrder() {
    setReordering(true);
    setErrorMsg(null);
    try {
      const payload = stages.map((s) => ({
        id: s.id,
        order_index: s.order_index ?? 0,
      }));
      const json = await adminFetchJson<{ stages?: typeof stages }>(
        `/api/admin/tournament/${tournamentId}/stages`,
        {
          method: 'PATCH',
          body: JSON.stringify({ stages: payload }),
        }
      );
      setStages(json.stages || []);
      setOrderChanged(false);
      setReorderMode(false);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorSaveOrder);
    } finally {
      setReordering(false);
    }
  }

  async function openTemplateModal() {
    setShowTemplateModal(true);
    setSelectedTemplate(null);
    try {
      const res = await adminFetch('/api/admin/tournament-templates');
      if (res.ok) {
        const json = await res.json();
        setCustomTemplates(json.templates || []);
      }
    } catch {
      // ignore
    }
  }

  async function handleAppendTemplate() {
    if (!selectedTemplate || !tournamentId) return;
    setApplyingTemplate(true);
    setErrorMsg(null);
    try {
      const res = await mutateIdempotent(
        `/api/admin/tournament/${tournamentId}/apply-template`,
        {
          method: 'POST',
          body: JSON.stringify({
            templateId: selectedTemplate.id,
            append: true,
          }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorApplyTemplate);
      }
      setShowTemplateModal(false);
      setSelectedTemplate(null);
      addToast(
        format(t.toastTemplateAdded, { name: selectedTemplate.name }),
        'success'
      );
      fetchStages();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorApplyTemplateGeneric);
    } finally {
      setApplyingTemplate(false);
    }
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

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <Breadcrumb
            items={[
              { label: t.breadcrumbTournaments, href: '/admin/tournaments' },
              {
                label: tournamentName,
                href: `/admin/tournament/${tournamentId}`,
              },
              { label: t.breadcrumbStages },
            ]}
          />
          <TournamentTabsNav
            tournamentId={String(tournamentId ?? '')}
            active="stages"
          />
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                {t.eyebrow}
              </p>
              <h1 className="text-2xl font-semibold">
                {format(t.titleSuffix, { name: tournamentName })}
              </h1>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/admin/tournament/${tournamentId}/matches`}
                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-sm hover:bg-white/15"
              >
                {t.viewMatches}
              </Link>
              {stages.length > 1 && (
                <button
                  onClick={() => {
                    if (reorderMode && orderChanged) {
                      // Cancel: refetch original order
                      setOrderChanged(false);
                      setReorderMode(false);
                      fetchStages();
                    } else {
                      setReorderMode(!reorderMode);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg border text-sm ${
                    reorderMode
                      ? 'bg-red-500/20 border-red-400/40 text-red-200 hover:bg-red-500/30'
                      : 'bg-white/10 border-white/15 hover:bg-white/15'
                  }`}
                >
                  {reorderMode ? t.cancel : t.reorder}
                </button>
              )}
              {reorderMode && orderChanged && (
                <button
                  onClick={saveOrder}
                  disabled={reordering}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 border border-purple-400/40 text-sm hover:bg-purple-500 disabled:opacity-50"
                >
                  {reordering ? t.saving : t.saveOrder}
                </button>
              )}
              <button
                onClick={openTemplateModal}
                className="px-3 py-1.5 rounded-lg bg-blue-600/80 border border-blue-400/40 text-sm hover:bg-blue-500"
              >
                {t.addTemplateBlock}
              </button>
              <button
                onClick={() => fetchStages()}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10"
              >
                {t.refresh}
              </button>
            </div>
          </div>

          {loading && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              {t.loading}
            </div>
          )}

          {errorMsg && !loading && (
            <div className="p-4 rounded-lg bg-red-900/60 border border-red-500/40 text-red-100">
              {errorMsg}
            </div>
          )}

          {!loading && !errorMsg && stages.length === 0 && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              {t.empty}
            </div>
          )}

          {stages.length > 0 && (
            <div
              className={
                reorderMode
                  ? 'flex flex-col gap-3'
                  : 'grid grid-cols-1 md:grid-cols-2 gap-4'
              }
            >
              {getSortedStages().map((stage, idx) => (
                <div
                  key={stage.id}
                  className={`p-4 rounded-xl bg-white/5 border ${
                    reorderMode ? 'border-purple-400/30' : 'border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-3">
                      {reorderMode && (
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => moveStage(idx, 'up')}
                            disabled={idx === 0}
                            className="px-2 py-0.5 rounded bg-white/10 border border-white/15 text-xs hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
                            title={t.moveUp}
                          >
                            &#9650;
                          </button>
                          <button
                            onClick={() => moveStage(idx, 'down')}
                            disabled={idx === stages.length - 1}
                            className="px-2 py-0.5 rounded bg-white/10 border border-white/15 text-xs hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
                            title={t.moveDown}
                          >
                            &#9660;
                          </button>
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold">{stage.name}</p>
                        <p className="text-xs text-gray-400">
                          {typeLabel(t, stage.stage_type)} · {t.orderPrefix}
                          {stage.order_index ?? '—'}
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/admin/stages/${stage.id}`}
                      className="text-sm px-3 py-1 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15"
                    >
                      {t.open}
                    </Link>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                    <span
                      className={`px-2 py-0.5 rounded-full border ${
                        stage.is_active
                          ? 'border-emerald-400/50 text-emerald-200'
                          : 'border-gray-500/40 text-gray-300'
                      }`}
                    >
                      {stage.is_active ? t.active : t.inactive}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full border ${
                        stage.is_public
                          ? 'border-blue-300/50 text-blue-200'
                          : 'border-gray-500/40 text-gray-300'
                      }`}
                    >
                      {stage.is_public ? t.public : t.private}
                    </span>
                    {stage.start_date && (
                      <span className="px-2 py-0.5 rounded-full border border-white/10 text-gray-200">
                        {t.startsAt}
                        {new Date(stage.start_date).toLocaleString()}
                      </span>
                    )}
                    {stage.end_date && (
                      <span className="px-2 py-0.5 rounded-full border border-white/10 text-gray-200">
                        {t.endsAt}
                        {new Date(stage.end_date).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Template Append Modal */}
      <Modal
        open={showTemplateModal}
        onClose={() => {
          setShowTemplateModal(false);
          setSelectedTemplate(null);
        }}
        title={t.modalTitle}
        subtitle={t.modalSubtitle}
        size="lg"
        footer={
          <>
            <button
              onClick={() => {
                setShowTemplateModal(false);
                setSelectedTemplate(null);
              }}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            <button
              onClick={handleAppendTemplate}
              disabled={!selectedTemplate || applyingTemplate}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {applyingTemplate ? t.applying : t.addStages}
            </button>
          </>
        }
      >
        <div className="grid gap-2 max-h-72 overflow-y-auto pr-1">
          {[...TOURNAMENT_TEMPLATES, ...customTemplates].map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setSelectedTemplate(tpl)}
              className={`p-3 rounded-xl border text-left transition-all ${
                selectedTemplate?.id === tpl.id
                  ? 'bg-blue-600/20 border-blue-500/50 ring-1 ring-blue-500/30'
                  : 'bg-neutral-900/50 border-neutral-700 hover:bg-neutral-800 hover:border-neutral-600'
              }`}
            >
              <div className="font-medium text-sm">{tpl.name}</div>
              <div className="text-xs text-neutral-400 mt-0.5">
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
      </Modal>
    </>
  );
}

export default StagesPage;
