// pages/admin/tournament/[id]/stages.tsx
// Liste des phases (stages) d'un tournoi pour le staff

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { tournamentUrls } from '@/features/admin/tournaments/client';
import { useTournamentDetail } from '@/features/admin/tournaments/hooks/useTournamentDetail';
import {
  tournamentStagesKey,
  useReorderTournamentStages,
  useTournamentStages,
} from '@/features/admin/tournaments/hooks/useTournamentStages';
import { useTournamentTemplates } from '@/features/admin/tournaments/hooks/useTournamentTemplates';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import Modal from '@/components/admin/Modal';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import {
  TOURNAMENT_TEMPLATES,
  type TournamentTemplate,
} from '@/config/tournament-templates';
import type { StaffProps, StageType, StageSummary } from '@/types/admin';
import nsAdminTournamentStagesList from '@/lib/i18n/locales/admin-fr/adminTournamentStagesList';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4';
const EYEBROW =
  'mb-2 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

type Dict = typeof nsAdminTournamentStagesList.fr;

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
  const t = useAdminT(nsAdminTournamentStagesList);
  const qc = useQueryClient();
  const stagesQuery = useTournamentStages(tournamentId ?? '');
  const detail = useTournamentDetail<{ name?: string | null }>(
    tournamentId ?? ''
  );
  const reorder = useReorderTournamentStages(tournamentId ?? '');

  const loading = stagesQuery.isFetching;
  const [actionError, setErrorMsg] = useState<string | null>(null);
  const errorMsg =
    actionError ??
    (stagesQuery.error ? stagesQuery.error.message || t.errorLoad : null);
  // Ordre en cours d'édition (mode réordonnancement), sinon la liste serveur.
  const [localStages, setStages] = useState<StageSummary[] | null>(null);
  const stages = localStages ?? stagesQuery.data ?? [];
  const tournamentName = detail.data
    ? detail.data.tournament?.name || tournamentId || t.defaultTournamentName
    : t.defaultTournamentName;
  const [reorderMode, setReorderMode] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [orderChanged, setOrderChanged] = useState(false);

  // Template append
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const templatesQuery = useTournamentTemplates(showTemplateModal);
  const customTemplates = templatesQuery.data ?? [];
  const [selectedTemplate, setSelectedTemplate] =
    useState<TournamentTemplate | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const { addToast } = useToast();

  // Relire la liste serveur (abandonne un ordre local non enregistré).
  function fetchStages() {
    setErrorMsg(null);
    setStages(null);
    void stagesQuery.refetch();
    void detail.refetch();
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
      await reorder.mutateAsync(payload);
      setStages(null);
      setOrderChanged(false);
      setReorderMode(false);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorSaveOrder);
    } finally {
      setReordering(false);
    }
  }

  function openTemplateModal() {
    // Modèles chargés (ou relus s'ils datent) à l'ouverture ; un échec
    // laisse la liste des modèles perso vide, comme avant.
    setShowTemplateModal(true);
    setSelectedTemplate(null);
  }

  async function handleAppendTemplate() {
    if (!selectedTemplate || !tournamentId) return;
    setApplyingTemplate(true);
    setErrorMsg(null);
    try {
      const res = await mutateIdempotent(
        tournamentUrls.applyTemplate(tournamentId),
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
      void qc.invalidateQueries({
        queryKey: tournamentStagesKey(tournamentId),
      });
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
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <TournamentTabsNav
          tournamentId={String(tournamentId ?? '')}
          active="stages"
        />

        <p className={EYEBROW}>{t.breadcrumbStages}</p>
        <AdminPageHeader
          title={tournamentName}
          subtitle={
            loading
              ? undefined
              : format(t.stagesCount, { count: stages.length })
          }
          actions={
            <>
              <AdminButtonLink
                href={`/admin/tournament/${tournamentId}/matches`}
                variant="ghost"
                size="sm"
              >
                {t.viewMatches}
              </AdminButtonLink>
              {stages.length > 1 && (
                <AdminButton
                  variant={reorderMode ? 'danger' : 'ghost'}
                  size="sm"
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
                >
                  {reorderMode ? t.cancel : t.reorder}
                </AdminButton>
              )}
              {reorderMode && orderChanged && (
                <AdminButton
                  variant="primary"
                  size="sm"
                  onClick={saveOrder}
                  disabled={reordering}
                >
                  {reordering ? t.saving : t.saveOrder}
                </AdminButton>
              )}
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={openTemplateModal}
              >
                {t.addTemplateBlock}
              </AdminButton>
              <AdminButton
                variant="ghost"
                size="sm"
                onClick={() => fetchStages()}
              >
                {t.refresh}
              </AdminButton>
            </>
          }
        />

        {loading && (
          <div className={`${CARD} text-sm text-[var(--t3,#a39ba6)]`}>
            {t.loading}
          </div>
        )}

        {errorMsg && !loading && (
          <div className="rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] p-4 text-sm text-[#ffc2c2]">
            {errorMsg}
          </div>
        )}

        {!loading && !errorMsg && stages.length === 0 && (
          <div className={`${CARD} text-sm text-[var(--t3,#a39ba6)]`}>
            {t.empty}
          </div>
        )}

        {stages.length > 0 && (
          <div
            className={
              reorderMode
                ? 'flex max-w-4xl flex-col gap-3'
                : 'grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3'
            }
          >
            {getSortedStages().map((stage, idx) => (
              <div
                key={stage.id}
                className={`rounded-[var(--r-card,14px)] border bg-[var(--s1,#100812)] p-4 ${
                  reorderMode
                    ? 'border-[rgba(180,103,209,.45)]'
                    : 'border-[var(--line2,rgba(194,196,201,.2))]'
                }`}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {reorderMode && (
                      <div className="flex flex-col gap-1">
                        <AdminButton
                          variant="ghost"
                          size="xs"
                          onClick={() => moveStage(idx, 'up')}
                          disabled={idx === 0}
                          title={t.moveUp}
                          aria-label={t.moveUp}
                        >
                          &#9650;
                        </AdminButton>
                        <AdminButton
                          variant="ghost"
                          size="xs"
                          onClick={() => moveStage(idx, 'down')}
                          disabled={idx === stages.length - 1}
                          title={t.moveDown}
                          aria-label={t.moveDown}
                        >
                          &#9660;
                        </AdminButton>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-[var(--t1,#f4edf7)]">
                        {stage.name}
                      </p>
                      <p className="text-xs text-[var(--t3,#a39ba6)]">
                        {typeLabel(t, stage.stage_type)} · {t.orderPrefix}
                        <span className="font-mono">
                          {stage.order_index ?? '—'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <AdminButtonLink
                    href={`/admin/stages/${stage.id}`}
                    variant="ghost"
                    size="xs"
                  >
                    {t.open}
                  </AdminButtonLink>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={stage.is_active ? 'ok' : 'neutral'}>
                    {stage.is_active ? t.active : t.inactive}
                  </Chip>
                  <Chip tone={stage.is_public ? 'brand' : 'neutral'}>
                    {stage.is_public ? t.public : t.private}
                  </Chip>
                </div>
                {(stage.start_date || stage.end_date) && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--t3,#a39ba6)]">
                    {stage.start_date && (
                      <span>
                        {t.startsAt}
                        <span className="font-mono text-[var(--t2,#c7bfca)]">
                          {new Date(stage.start_date).toLocaleString()}
                        </span>
                      </span>
                    )}
                    {stage.end_date && (
                      <span>
                        {t.endsAt}
                        <span className="font-mono text-[var(--t2,#c7bfca)]">
                          {new Date(stage.end_date).toLocaleString()}
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowTemplateModal(false);
                setSelectedTemplate(null);
              }}
            >
              {t.cancel}
            </AdminButton>
            <AdminButton
              variant="primary"
              size="sm"
              onClick={handleAppendTemplate}
              disabled={!selectedTemplate || applyingTemplate}
            >
              {applyingTemplate ? t.applying : t.addStages}
            </AdminButton>
          </>
        }
      >
        <div className="grid gap-2 max-h-72 overflow-y-auto pr-1">
          {[...TOURNAMENT_TEMPLATES, ...customTemplates].map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setSelectedTemplate(tpl)}
              aria-pressed={selectedTemplate?.id === tpl.id}
              className={`rounded-[var(--r-card,14px)] border p-3 text-left transition-colors ${
                selectedTemplate?.id === tpl.id
                  ? 'border-[rgba(180,103,209,.55)] bg-[rgba(180,103,209,.12)]'
                  : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] hover:border-[var(--t4,#807984)]'
              }`}
            >
              <div className="text-sm font-medium text-[var(--t1,#f4edf7)]">
                {tpl.name}
              </div>
              <div className="mt-0.5 text-xs text-[var(--t3,#a39ba6)]">
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

export default withAdminQuery(StagesPage);
