// pages/admin/stages/[stageId].tsx

import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useHydrateOnce } from '@/features/admin/_shared/useHydrateOnce';
import { useTournamentOptions } from '@/features/admin/_shared/tournamentOptions';
import { stageUrls } from '@/features/admin/stages/client';
import {
  stageDetailKey,
  useStage,
  useStageRead,
} from '@/features/admin/stages/hooks/useStage';
import { useTournamentDetail } from '@/features/admin/tournaments/hooks/useTournamentDetail';
import {
  fetchTournamentStages,
  useTournamentStages,
} from '@/features/admin/tournaments/hooks/useTournamentStages';
import StageTabsNav from '@/components/admin/stages/StageTabsNav';
import type { StaffProps, Stage, Tournament } from '@/types/admin';
import type { AdvancementRules } from '@/components/admin/AdvancementRulesEditor';
import FfaLobbiesManager from '@/components/admin/ffa/FfaLobbiesManager';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

// Sous-composants mémoïsés (extraction perf P2-5) — cf.
// `components/admin/stages/[stageId]/`. Toute la logique de fetch/mutation +
// l'état restent dans CETTE page ; ces enfants sont présentationnels et ne
// reçoivent que des props stables (callbacks `useCallback`, scalaires, refs
// mémoïsées), pour que la frappe dans un formulaire ne reconcilie plus l'arbre.
import StageHeaderTitle from '@/components/admin/stages/[stageId]/StageHeaderTitle';
import QuickActionsBar from '@/components/admin/stages/[stageId]/QuickActionsBar';
import StageOverviewCard from '@/components/admin/stages/[stageId]/StageOverviewCard';
import AutomatedToolsSection from '@/components/admin/stages/[stageId]/AutomatedToolsSection';
import SwissStatusPanel, {
  type SwissStatus,
} from '@/components/admin/stages/[stageId]/SwissStatusPanel';
import CompletionBanner, {
  type CompletionStatus,
} from '@/components/admin/stages/[stageId]/CompletionBanner';
import AdvancementRulesSection from '@/components/admin/stages/[stageId]/AdvancementRulesSection';
import AdvancedConfigSection from '@/components/admin/stages/[stageId]/AdvancedConfigSection';
import NavigationCard from '@/components/admin/stages/[stageId]/NavigationCard';
import MetaInfoCard from '@/components/admin/stages/[stageId]/MetaInfoCard';
import EditStageModal, {
  type EditForm,
} from '@/components/admin/stages/[stageId]/EditStageModal';
import AutoSeedModal from '@/components/admin/stages/[stageId]/AutoSeedModal';
import AdvanceModal from '@/components/admin/stages/[stageId]/AdvanceModal';
import type { AdvanceStanding } from '@/components/admin/stages/[stageId]/AdvanceStandingsTable';

import { logger } from '../../../utils/logger';
import nsAdminStageDetail from '@/lib/i18n/locales/admin-fr/adminStageDetail';
import type { StageOption, TournamentOption } from '@/utils/stages/stageOption';
import { ERROR_BOX, SPINNER } from '@/features/admin/stages/ui/rubanClasses';
import { useStageAdvanceActions } from '@/features/admin/stages/hooks/useStageAdvanceActions';
import { useTiebreakerOverrides } from '@/features/admin/stages/hooks/useTiebreakerOverrides';
import BatchScoresGrid from '@/features/admin/stages/ui/BatchScoresGrid';

type StageApiResponse = {
  stage: Stage;
};

const NO_OPTIONS: TournamentOption[] = [];

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

function AdminStagePage(_props: StaffProps) {
  const t = useAdminT(nsAdminStageDetail);
  const router = useRouter();
  const { stageId } = router.query;
  const { mutate: mutateIdempotent } = useIdempotentMutation();
  const { mutate: autoByesMutate } = useIdempotentMutation();
  const { mutate: advanceMutate } = useIdempotentMutation();
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const sid = String(stageId ?? '');
  const qc = useQueryClient();

  const stageQuery = useStage<Stage>(sid, { editor: true });
  const { refetch: refetchStage } = stageQuery;
  const stage = stageQuery.data?.stage ?? null;
  const tournament =
    useTournamentDetail<Tournament>(stage?.tournament_id ?? '').data
      ?.tournament ?? null;

  const loading = stageQuery.isPending || stageQuery.isFetching;
  const [loadingActions, setLoadingActions] = useState(false);
  const [actionError, setErrorMsg] = useState<string | null>(null);
  const errorMsg =
    actionError ??
    (stageQuery.error ? (stageQuery.error.message ?? t.errUnexpected) : null);
  const { addToast } = useToast();

  // Advance modal state
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceStandings, setAdvanceStandings] = useState<AdvanceStanding[]>(
    []
  );
  const [advanceSelectedIds, setAdvanceSelectedIds] = useState<Set<string>>(
    new Set()
  );
  const [advanceTopN, setAdvanceTopN] = useState('');
  const [advanceTargetStageId, setAdvanceTargetStageId] = useState('');
  const [advanceSeedMode, setAdvanceSeedMode] = useState<
    'rank' | 'manual' | 'none'
  >('rank');
  const [advanceOtherStages, setAdvanceOtherStages] = useState<
    { id: string; name: string; stage_type: string | null }[]
  >([]);
  const [advanceMinScore, setAdvanceMinScore] = useState('');
  const [advanceMinWins, setAdvanceMinWins] = useState('');
  const [advanceLoading, setAdvanceLoading] = useState(false);
  const [advanceSubmitting, setAdvanceSubmitting] = useState(false);

  // Auto-seed modal state
  const [showAutoSeedModal, setShowAutoSeedModal] = useState(false);
  const [autoSeedSourceStageId, setAutoSeedSourceStageId] = useState('');
  const [autoSeedPattern, setAutoSeedPattern] = useState<
    'standard' | 'sequential'
  >('standard');
  const [autoSeedOtherStages, setAutoSeedOtherStages] = useState<
    { id: string; name: string; stage_type: string | null }[]
  >([]);
  const [autoSeedLoading, setAutoSeedLoading] = useState(false);
  const [autoSeedSubmitting, setAutoSeedSubmitting] = useState(false);

  // Clone state
  const [cloning, setCloning] = useState(false);

  // Swiss status + completion status, lus une fois la phase chargée.
  const swissQuery = useStageRead<SwissStatus>(
    sid,
    'swiss-status',
    stageUrls.swissStatus,
    {
      enabled: stage?.stage_type === 'swiss',
    }
  );
  const swissStatus = swissQuery.data ?? null;
  const completionQuery = useStageRead<CompletionStatus>(
    sid,
    'completion-status',
    stageUrls.completionStatus,
    { enabled: !!stage }
  );
  const completionStatus = completionQuery.data ?? null;

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    name: '',
    tournament_id: '',
    is_active: false,
    is_public: false,
  });
  const [saving, setSaving] = useState(false);
  const allTournaments =
    useTournamentOptions(isEditing).data?.tournaments ?? NO_OPTIONS;

  // Advancement rules editor state
  const [advancementRulesDraft, setAdvancementRulesDraft] =
    useState<AdvancementRules | null>(null);
  const siblingsQuery = useTournamentStages(stage?.tournament_id ?? '');
  const advancementSiblingStages = useMemo(
    () =>
      ((siblingsQuery.data ?? []) as StageOption[])
        .filter((st) => st.id !== stage?.id)
        .map((st) => ({ id: st.id, name: st.name, stage_type: st.stage_type })),
    [siblingsQuery.data, stage?.id]
  );
  const [advancementSaving, setAdvancementSaving] = useState(false);

  // Formulaire d'édition + brouillon des règles d'avancement : hydratés à
  // l'ouverture, puis après l'enregistrement des règles (comme avant).
  const hydrateFromStage = useCallback((s: Stage) => {
    setEditForm({
      name: s.name || '',
      tournament_id: s.tournament_id || '',
      is_active: s.is_active || false,
      is_public: s.is_public || false,
    });
    setAdvancementRulesDraft(s.settings?.advancement_rules ?? null);
  }, []);
  useHydrateOnce(sid || null, stageQuery.data, (d) => {
    if (d.stage) hydrateFromStage(d.stage);
  });
  const fetchStage = useCallback(async () => {
    setErrorMsg(null);
    const { data } = await refetchStage();
    if (data?.stage) hydrateFromStage(data.stage);
  }, [refetchStage, hydrateFromStage]);
  const fetchSwissStatus = swissQuery.refetch;
  const fetchCompletionStatus = completionQuery.refetch;

  const handleSaveEdit = useCallback(async () => {
    if (!stageId || !stage) return;
    setSaving(true);
    setErrorMsg(null);

    try {
      const json = await adminFetchJson<StageApiResponse>(stageUrls.byId(sid), {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      // Le tournoi parent suit `stage.tournament_id` (relu s'il a changé).
      qc.setQueryData(stageDetailKey(sid), json);
      setIsEditing(false);
      addToast(t.toastStageUpdated, 'success');
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setSaving(false);
    }
  }, [stageId, stage, sid, qc, editForm, adminFetchJson, addToast, t]);

  const handleAutoByes = useCallback(async () => {
    if (!stageId) return;
    setLoadingActions(true);
    setErrorMsg(null);

    try {
      const res = await autoByesMutate(stageUrls.autoByes(sid), {
        method: 'POST',
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errAutoByes);
      }

      const json = await res.json();
      addToast(
        format(t.toastAutoByes, {
          count: json.updatedMatchIds?.length ?? 0,
        }),
        'success'
      );
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errAutoByesShort);
    } finally {
      setLoadingActions(false);
    }
  }, [stageId, autoByesMutate, addToast, t, sid]);

  const handleGenerateSwissRound = useCallback(async () => {
    if (!stageId || stage?.stage_type !== 'swiss') return;
    setLoadingActions(true);
    setErrorMsg(null);

    try {
      const res = await mutateIdempotent(stageUrls.generateSwissRound(sid), {
        method: 'POST',
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errGenSwiss);
      }

      const json = await res.json();
      addToast(
        format(t.toastSwissGenerated, {
          round: json.roundNumber,
          count: json.createdMatches?.length ?? 0,
        }),
        'success'
      );
      // Refresh Swiss and completion status
      fetchSwissStatus();
      fetchCompletionStatus();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errGenSwissShort);
    } finally {
      setLoadingActions(false);
    }
  }, [
    stageId,
    stage,
    mutateIdempotent,
    addToast,
    t,
    fetchSwissStatus,
    fetchCompletionStatus,
    sid,
  ]);

  const {
    openAdvanceModal,
    handleAdvanceTopN,
    handleAdvanceMinScore,
    handleAdvanceMinWins,
    toggleAdvanceTeam,
    toggleAdvanceAll,
    handleAdvanceSubmit,
  } = useStageAdvanceActions({
    t,
    stageId,
    stage,
    adminFetch,
    advanceMutate,
    addToast,
    setErrorMsg,
    advanceStandings,
    setAdvanceStandings,
    advanceSelectedIds,
    setAdvanceSelectedIds,
    setAdvanceTopN,
    advanceTargetStageId,
    setAdvanceTargetStageId,
    advanceSeedMode,
    setAdvanceSeedMode,
    setAdvanceOtherStages,
    setAdvanceMinScore,
    setAdvanceMinWins,
    setAdvanceLoading,
    setAdvanceSubmitting,
    setShowAdvanceModal,
  });

  // Dérogations de départage (« Forcer l'ordre » dans la modale d'avancement) :
  // après chaque geste, le classement affiché est relu (sélection conservée).
  const refreshAdvanceStandings = useCallback(async () => {
    if (!sid) return;
    try {
      const res = await adminFetch(stageUrls.standings(sid));
      if (!res.ok) return;
      const json = await res.json();
      setAdvanceStandings(json.standings || []);
    } catch (err) {
      logger.error('refreshAdvanceStandings error:', err);
    }
  }, [sid, adminFetch]);
  const tiebreak = useTiebreakerOverrides(sid, {
    enabled: showAdvanceModal && !!stage,
    onChanged: refreshAdvanceStandings,
    t,
  });

  const openAutoSeedModal = useCallback(async () => {
    if (!stageId || !stage || stage.stage_type !== 'bracket') return;
    setShowAutoSeedModal(true);
    setAutoSeedLoading(true);
    setAutoSeedSourceStageId('');
    setAutoSeedPattern('standard');

    try {
      const json = await fetchTournamentStages<StageOption>(
        stage.tournament_id
      );
      const sources = (json.stages || [])
        .filter(
          (s) =>
            s.id !== stageId &&
            ['swiss', 'group', 'round_robin'].includes(s.stage_type ?? '')
        )
        .map((s) => ({
          id: s.id,
          name: s.name,
          stage_type: s.stage_type,
        }));
      setAutoSeedOtherStages(sources);
      if (sources.length > 0) setAutoSeedSourceStageId(sources[0].id);
    } catch (err) {
      logger.error('openAutoSeedModal error:', err);
    } finally {
      setAutoSeedLoading(false);
    }
  }, [stageId, stage]);

  const handleAutoSeedSubmit = useCallback(async () => {
    if (!stageId || !autoSeedSourceStageId) return;
    setAutoSeedSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await mutateIdempotent(stageUrls.autoSeed(sid), {
        method: 'POST',
        body: JSON.stringify({
          sourceStageId: autoSeedSourceStageId,
          seedingPattern: autoSeedPattern,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errAutoSeed);
      }

      const json = await res.json();
      addToast(
        format(t.toastAutoSeed, {
          count: json.seeded?.length ?? 0,
          total: json.totalMatches,
        }),
        'success'
      );
      setShowAutoSeedModal(false);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errAutoSeed);
    } finally {
      setAutoSeedSubmitting(false);
    }
  }, [
    stageId,
    autoSeedSourceStageId,
    autoSeedPattern,
    mutateIdempotent,
    addToast,
    t,
    sid,
  ]);

  const handleClone = useCallback(
    async (includeMatches: boolean) => {
      if (!stageId || !stage) return;
      setCloning(true);
      setErrorMsg(null);

      try {
        const res = await mutateIdempotent(stageUrls.clone(sid), {
          method: 'POST',
          body: JSON.stringify({ includeMatches }),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || t.errClone);
        }

        const json = await res.json();
        const matchMsg = includeMatches
          ? format(t.cloneMatchSuffix, { count: json.clonedMatchCount ?? 0 })
          : '';
        addToast(
          format(t.toastCloned, {
            matchSuffix: matchMsg,
            name: json.stage?.name ?? t.cloneFallbackName,
          }),
          'success'
        );

        // Navigate to the cloned stage
        if (json.stage?.id) {
          router.push(`/admin/stages/${json.stage.id}`);
        }
      } catch (err: unknown) {
        setErrorMsg((err as Error)?.message ?? t.errClone);
      } finally {
        setCloning(false);
      }
    },
    [stageId, stage, mutateIdempotent, addToast, t, router, sid]
  );

  const handleSaveAdvancementRules = useCallback(async () => {
    if (!stageId || !stage) return;
    setAdvancementSaving(true);
    setErrorMsg(null);
    try {
      const currentSettings = stage.settings ?? {};
      const newSettings = { ...currentSettings };
      if (advancementRulesDraft) {
        newSettings.advancement_rules = advancementRulesDraft;
      } else {
        delete newSettings.advancement_rules;
      }
      await adminFetchJson(stageUrls.byId(sid), {
        method: 'PATCH',
        body: JSON.stringify({ settings: newSettings }),
      });
      addToast(t.toastAdvancementRules, 'success');
      await fetchStage();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setAdvancementSaving(false);
    }
  }, [
    stageId,
    stage,
    advancementRulesDraft,
    adminFetchJson,
    addToast,
    t,
    fetchStage,
    sid,
  ]);

  // Liste des tournois chargée à la première ouverture de l'édition.
  const handleEdit = useCallback(() => setIsEditing(true), []);

  const handleEditFormChange = useCallback((patch: Partial<EditForm>) => {
    setEditForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleCloseEdit = useCallback(() => setIsEditing(false), []);
  const handleCloseAutoSeed = useCallback(
    () => setShowAutoSeedModal(false),
    []
  );
  const handleCloseAdvance = useCallback(() => setShowAdvanceModal(false), []);

  const tournamentDashboardUrl = tournament
    ? `/admin/tournament/${tournament.id}`
    : stage
      ? `/admin/tournament/${stage.tournament_id}`
      : '/admin/tournaments';

  const matchesUrl =
    stage && stage.tournament_id
      ? `/admin/tournament/${stage.tournament_id}/matches?stageId=${stage.id}`
      : null;

  // JSON des settings hors advancement_rules — mémoïsé pour ne pas recréer
  // l'objet (et casser le React.memo du bloc de config) à chaque render.
  const advancedConfigJson = useMemo(() => {
    const { advancement_rules: _omit, ...rest } = stage?.settings ?? {};
    return JSON.stringify(rest, null, 2);
  }, [stage]);

  return (
    <>
      <Head>
        <title>
          {stage
            ? format(t.pageTitleWithName, { name: stage.name })
            : t.pageTitle}
        </title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div>
          <StageTabsNav
            stageId={String(stageId ?? '')}
            active="overview"
            stageType={stage?.stage_type}
            tournamentId={stage?.tournament_id ?? tournament?.id}
            tournamentName={tournament?.name}
          />
          <StageHeaderTitle
            stage={stage}
            tournament={tournament}
            tournamentDashboardUrl={tournamentDashboardUrl}
            t={t}
          />

          {errorMsg && <div className={`mb-6 ${ERROR_BOX}`}>{errorMsg}</div>}

          {loading && !stage && (
            <div className="flex items-center justify-center py-20">
              <div className={SPINNER} />
            </div>
          )}

          {!loading && !stage && !errorMsg && (
            <div className="py-20 text-center text-[var(--t3,#a39ba6)]">
              {t.stageNotFound}
            </div>
          )}

          {stage && (
            <div className="space-y-6">
              {/* Quick Actions Bar */}
              <QuickActionsBar
                stage={stage}
                matchesUrl={matchesUrl}
                cloning={cloning}
                onEdit={handleEdit}
                onOpenAdvance={openAdvanceModal}
                onClone={handleClone}
                t={t}
              />

              {/* Main Grid */}
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Left Column - Info */}
                <div className="lg:col-span-2 space-y-6">
                  {/* FFA lobbies manager (isolé, uniquement pour les phases ffa) */}
                  {stage.stage_type === 'ffa' && (
                    <FfaLobbiesManager
                      stageId={stage.id}
                      tournamentId={stage.tournament_id}
                    />
                  )}

                  <StageOverviewCard stage={stage} t={t} />

                  <AutomatedToolsSection
                    stage={stage}
                    loadingActions={loadingActions}
                    onAutoByes={handleAutoByes}
                    onOpenAutoSeed={openAutoSeedModal}
                    onGenerateSwissRound={handleGenerateSwissRound}
                    t={t}
                  />

                  {stage.stage_type === 'swiss' && swissStatus && (
                    <SwissStatusPanel
                      swissStatus={swissStatus}
                      loadingActions={loadingActions}
                      onGenerateSwissRound={handleGenerateSwissRound}
                      t={t}
                    />
                  )}

                  {stage.stage_type !== 'ffa' && (
                    <BatchScoresGrid
                      stageId={stage.id}
                      tournamentId={stage.tournament_id}
                      stageType={stage.stage_type ?? null}
                      onSaved={fetchCompletionStatus}
                      t={t}
                    />
                  )}

                  {completionStatus &&
                    completionStatus.totalMatches > 0 &&
                    completionStatus.isComplete && (
                      <CompletionBanner
                        completionStatus={completionStatus}
                        onOpenAdvance={openAdvanceModal}
                        t={t}
                      />
                    )}

                  <AdvancementRulesSection
                    value={advancementRulesDraft}
                    availableStages={advancementSiblingStages}
                    onChange={setAdvancementRulesDraft}
                    saving={advancementSaving}
                    sourceStageType={stage.stage_type ?? null}
                    onSave={handleSaveAdvancementRules}
                    t={t}
                  />

                  <AdvancedConfigSection json={advancedConfigJson} t={t} />
                </div>

                {/* Right Column - Quick Links & Meta */}
                <div className="space-y-6">
                  <NavigationCard
                    stage={stage}
                    tournament={tournament}
                    matchesUrl={matchesUrl}
                    tournamentDashboardUrl={tournamentDashboardUrl}
                    t={t}
                  />

                  <MetaInfoCard stage={stage} t={t} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <EditStageModal
        open={Boolean(isEditing && stage)}
        editForm={editForm}
        allTournaments={allTournaments}
        saving={saving}
        onClose={handleCloseEdit}
        onChange={handleEditFormChange}
        onSave={handleSaveEdit}
        t={t}
      />

      {/* Auto-Seed Modal */}
      <AutoSeedModal
        open={Boolean(showAutoSeedModal && stage)}
        loading={autoSeedLoading}
        otherStages={autoSeedOtherStages}
        sourceStageId={autoSeedSourceStageId}
        pattern={autoSeedPattern}
        submitting={autoSeedSubmitting}
        onClose={handleCloseAutoSeed}
        onChangeSource={setAutoSeedSourceStageId}
        onChangePattern={setAutoSeedPattern}
        onSubmit={handleAutoSeedSubmit}
        t={t}
      />

      {/* Advance Modal */}
      <AdvanceModal
        open={Boolean(showAdvanceModal && stage)}
        loading={advanceLoading}
        submitting={advanceSubmitting}
        otherStages={advanceOtherStages}
        targetStageId={advanceTargetStageId}
        standings={advanceStandings}
        selectedIds={advanceSelectedIds}
        topN={advanceTopN}
        minScore={advanceMinScore}
        minWins={advanceMinWins}
        seedMode={advanceSeedMode}
        onClose={handleCloseAdvance}
        onChangeTarget={setAdvanceTargetStageId}
        onTopN={handleAdvanceTopN}
        onMinScore={handleAdvanceMinScore}
        onMinWins={handleAdvanceMinWins}
        onToggleTeam={toggleAdvanceTeam}
        onToggleAll={toggleAdvanceAll}
        onChangeSeedMode={setAdvanceSeedMode}
        onSubmit={handleAdvanceSubmit}
        t={t}
        overrides={tiebreak.overrides}
        overrideSaving={tiebreak.saving}
        onAddOverride={tiebreak.addOverride}
        onRemoveOverride={tiebreak.removeOverride}
      />
      {tiebreak.dialog}
    </>
  );
}

export default withAdminQuery(AdminStagePage);
