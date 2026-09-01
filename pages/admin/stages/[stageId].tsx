// pages/admin/stages/[stageId].tsx

import { useEffect, useState, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import Breadcrumb from '@/components/admin/Breadcrumb';
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

type StageApiResponse = {
  stage: Stage;
};

type TournamentApiResponse = {
  tournament: Tournament;
};

export const getServerSideProps = withStaffPage({ permission: 'manage_tournaments' });

function AdminStagePage({ staff }: StaffProps) {
  const t = useAdminT(nsAdminStageDetail);
  const router = useRouter();
  const { stageId } = router.query;
  const { mutate: mutateIdempotent } = useIdempotentMutation();
  const { mutate: autoByesMutate } = useIdempotentMutation();
  const { mutate: advanceMutate } = useIdempotentMutation();
  const { adminFetch, adminFetchJson } = useAdminFetch();

  const [stage, setStage] = useState<Stage | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingActions, setLoadingActions] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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

  // Swiss status state
  const [swissStatus, setSwissStatus] = useState<SwissStatus | null>(null);

  // Completion status state
  const [completionStatus, setCompletionStatus] =
    useState<CompletionStatus | null>(null);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    name: '',
    tournament_id: '',
    is_active: false,
    is_public: false,
  });
  const [saving, setSaving] = useState(false);
  const [allTournaments, setAllTournaments] = useState<
    { id: string; name: string }[]
  >([]);

  // Advancement rules editor state
  const [advancementRulesDraft, setAdvancementRulesDraft] =
    useState<AdvancementRules | null>(null);
  const [advancementSiblingStages, setAdvancementSiblingStages] = useState<
    { id: string; name: string; stage_type: string | null }[]
  >([]);
  const [advancementSaving, setAdvancementSaving] = useState(false);

  const fetchStage = useCallback(async () => {
    if (!stageId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const json = await adminFetchJson<StageApiResponse>(
        `/api/admin/stages/${stageId}`
      );
      const s = json.stage;
      setStage(s);
      setEditForm({
        name: s.name || '',
        tournament_id: s.tournament_id || '',
        is_active: s.is_active || false,
        is_public: s.is_public || false,
      });

      // Init advancement rules draft from settings
      setAdvancementRulesDraft(s.settings?.advancement_rules ?? null);

      // Charger le tournoi parent + sibling stages. Ces deux lectures ne
      // dependent que de tournament_id (connu apres l'etape 1) : on les lance
      // en parallele. Chaque branche garde sa propre gestion d'erreur pour
      // rester independante (l'une peut echouer sans casser l'autre).
      if (s.tournament_id) {
        await Promise.all([
          (async () => {
            try {
              const res2 = await adminFetch(
                `/api/admin/tournament/${s.tournament_id}`
              );
              if (res2.ok) {
                const json2: TournamentApiResponse = await res2.json();
                setTournament(json2.tournament);
              }
            } catch (e) {
              logger.error('fetch parent tournament error', e);
            }
          })(),
          (async () => {
            // Fetch sibling stages for advancement target dropdown
            try {
              const stagesRes = await adminFetch(
                `/api/admin/tournament/${s.tournament_id}/stages`
              );
              if (stagesRes.ok) {
                const stagesJson = await stagesRes.json();
                const siblings = (stagesJson.stages || [])
                  .filter((st: any) => st.id !== s.id)
                  .map((st: any) => ({
                    id: st.id,
                    name: st.name,
                    stage_type: st.stage_type,
                  }));
                setAdvancementSiblingStages(siblings);
              }
            } catch (e) {
              logger.error('fetch sibling stages error', e);
            }
          })(),
        ]);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setLoading(false);
    }
  }, [stageId, adminFetch, adminFetchJson, t.errUnexpected]);

  const fetchSwissStatus = useCallback(async () => {
    if (!stageId) return;
    try {
      const res = await adminFetch(`/api/admin/stages/${stageId}/swiss-status`);
      if (res.ok) {
        const json = await res.json();
        setSwissStatus(json);
      }
    } catch (e) {
      logger.error('fetchSwissStatus error', e);
    }
  }, [stageId, adminFetch]);

  const fetchCompletionStatus = useCallback(async () => {
    if (!stageId) return;
    try {
      const res = await adminFetch(
        `/api/admin/stages/${stageId}/completion-status`
      );
      if (res.ok) {
        const json = await res.json();
        setCompletionStatus(json);
      }
    } catch (e) {
      logger.error('fetchCompletionStatus error', e);
    }
  }, [stageId, adminFetch]);

  useEffect(() => {
    if (!stageId) return;
    fetchStage();
  }, [stageId, fetchStage]);

  // Fetch Swiss status and completion status after stage is loaded
  useEffect(() => {
    if (!stage) return;
    fetchCompletionStatus();
    if (stage.stage_type === 'swiss') {
      fetchSwissStatus();
    }
  }, [stage, fetchCompletionStatus, fetchSwissStatus]);

  const fetchTournaments = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/tournaments?limit=100');
      if (res.ok) {
        const json = await res.json();
        setAllTournaments(
          (json.tournaments || []).map((tm: any) => ({
            id: tm.id,
            name: tm.name,
          }))
        );
      }
    } catch (e) {
      logger.error('fetch tournaments error', e);
    }
  }, [adminFetch]);

  const handleSaveEdit = useCallback(async () => {
    if (!stageId || !stage) return;
    setSaving(true);
    setErrorMsg(null);

    try {
      const json = await adminFetchJson<StageApiResponse>(
        `/api/admin/stages/${stageId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(editForm),
        }
      );
      setStage(json.stage);
      setIsEditing(false);
      addToast(t.toastStageUpdated, 'success');

      // Recharger le tournoi parent si changé
      if (json.stage.tournament_id !== stage.tournament_id) {
        try {
          const res2 = await adminFetch(
            `/api/admin/tournament/${json.stage.tournament_id}`
          );
          if (res2.ok) {
            const json2 = await res2.json();
            setTournament(json2.tournament);
          }
        } catch (e) {
          logger.error('fetch updated tournament error', e);
        }
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setSaving(false);
    }
  }, [stageId, stage, editForm, adminFetch, adminFetchJson, addToast, t]);

  const handleAutoByes = useCallback(async () => {
    if (!stageId) return;
    setLoadingActions(true);
    setErrorMsg(null);

    try {
      const res = await autoByesMutate(
        `/api/admin/stages/${stageId}/auto-byes`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

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
  }, [stageId, autoByesMutate, addToast, t]);

  const handleGenerateSwissRound = useCallback(async () => {
    if (!stageId || stage?.stage_type !== 'swiss') return;
    setLoadingActions(true);
    setErrorMsg(null);

    try {
      const res = await mutateIdempotent(
        `/api/admin/stages/${stageId}/generate-swiss-round`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

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
  ]);

  const openAdvanceModal = useCallback(async () => {
    if (!stageId || !stage) return;
    setShowAdvanceModal(true);
    setAdvanceLoading(true);
    setAdvanceSelectedIds(new Set());
    setAdvanceTopN('');
    setAdvanceMinScore('');
    setAdvanceMinWins('');
    setAdvanceTargetStageId('');
    setAdvanceSeedMode('rank');

    try {
      // Fetch standings and other stages in parallel
      const [standingsRes, stagesRes] = await Promise.all([
        adminFetch(`/api/admin/stages/${stageId}/standings`),
        adminFetch(`/api/admin/tournament/${stage.tournament_id}/stages`),
      ]);

      if (standingsRes.ok) {
        const json = await standingsRes.json();
        setAdvanceStandings(json.standings || []);
      }

      if (stagesRes.ok) {
        const json = await stagesRes.json();
        const others = (json.stages || [])
          .filter((s: any) => s.id !== stageId)
          .map((s: any) => ({
            id: s.id,
            name: s.name,
            stage_type: s.stage_type,
          }));
        setAdvanceOtherStages(others);
        if (others.length > 0) setAdvanceTargetStageId(others[0].id);
      }
    } catch (err) {
      logger.error('openAdvanceModal error:', err);
    } finally {
      setAdvanceLoading(false);
    }
  }, [stageId, stage, adminFetch]);

  const handleAdvanceTopN = useCallback(
    (value: string) => {
      setAdvanceTopN(value);
      setAdvanceMinScore('');
      setAdvanceMinWins('');
      const n = parseInt(value, 10);
      if (!isNaN(n) && n > 0) {
        const ids = new Set(advanceStandings.slice(0, n).map((s) => s.teamId));
        setAdvanceSelectedIds(ids);
      }
    },
    [advanceStandings]
  );

  const handleAdvanceMinScore = useCallback(
    (value: string) => {
      setAdvanceMinScore(value);
      setAdvanceTopN('');
      setAdvanceMinWins('');
      const threshold = parseFloat(value);
      if (!isNaN(threshold)) {
        const ids = new Set(
          advanceStandings
            .filter((s) => s.score >= threshold)
            .map((s) => s.teamId)
        );
        setAdvanceSelectedIds(ids);
      }
    },
    [advanceStandings]
  );

  const handleAdvanceMinWins = useCallback(
    (value: string) => {
      setAdvanceMinWins(value);
      setAdvanceTopN('');
      setAdvanceMinScore('');
      const threshold = parseInt(value, 10);
      if (!isNaN(threshold) && threshold > 0) {
        const ids = new Set(
          advanceStandings
            .filter((s) => s.wins >= threshold)
            .map((s) => s.teamId)
        );
        setAdvanceSelectedIds(ids);
      }
    },
    [advanceStandings]
  );

  const toggleAdvanceTeam = useCallback((teamId: string) => {
    setAdvanceSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
    setAdvanceTopN('');
  }, []);

  const toggleAdvanceAll = useCallback(() => {
    setAdvanceSelectedIds((prev) =>
      prev.size === advanceStandings.length
        ? new Set()
        : new Set(advanceStandings.map((s) => s.teamId))
    );
    setAdvanceTopN('');
  }, [advanceStandings]);

  const handleAdvanceSubmit = useCallback(async () => {
    if (!stageId || advanceSelectedIds.size === 0 || !advanceTargetStageId)
      return;
    setAdvanceSubmitting(true);
    setErrorMsg(null);

    // Preserve standings order for the selected teams
    const orderedIds = advanceStandings
      .filter((s) => advanceSelectedIds.has(s.teamId))
      .map((s) => s.teamId);

    try {
      const res = await advanceMutate(`/api/admin/stages/${stageId}/advance`, {
        method: 'POST',
        body: JSON.stringify({
          targetStageId: advanceTargetStageId,
          teamIds: orderedIds,
          seedMode: advanceSeedMode,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errAdvance);
      }

      const json = await res.json();
      const advancedCount = json.advanced?.length ?? 0;
      const skippedCount = json.skipped?.length ?? 0;

      let msg = format(t.toastAdvanced, { count: advancedCount });
      if (skippedCount > 0) {
        msg += ' ' + format(t.toastAdvancedSkipped, { count: skippedCount });
      }

      addToast(msg, 'success');
      setShowAdvanceModal(false);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errAdvance);
    } finally {
      setAdvanceSubmitting(false);
    }
  }, [
    stageId,
    advanceSelectedIds,
    advanceTargetStageId,
    advanceStandings,
    advanceSeedMode,
    advanceMutate,
    addToast,
    t,
  ]);

  const openAutoSeedModal = useCallback(async () => {
    if (!stageId || !stage || stage.stage_type !== 'bracket') return;
    setShowAutoSeedModal(true);
    setAutoSeedLoading(true);
    setAutoSeedSourceStageId('');
    setAutoSeedPattern('standard');

    try {
      const stagesRes = await adminFetch(
        `/api/admin/tournament/${stage.tournament_id}/stages`
      );
      if (stagesRes.ok) {
        const json = await stagesRes.json();
        const sources = (json.stages || [])
          .filter(
            (s: any) =>
              s.id !== stageId &&
              ['swiss', 'group', 'round_robin'].includes(s.stage_type)
          )
          .map((s: any) => ({
            id: s.id,
            name: s.name,
            stage_type: s.stage_type,
          }));
        setAutoSeedOtherStages(sources);
        if (sources.length > 0) setAutoSeedSourceStageId(sources[0].id);
      }
    } catch (err) {
      logger.error('openAutoSeedModal error:', err);
    } finally {
      setAutoSeedLoading(false);
    }
  }, [stageId, stage, adminFetch]);

  const handleAutoSeedSubmit = useCallback(async () => {
    if (!stageId || !autoSeedSourceStageId) return;
    setAutoSeedSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await mutateIdempotent(
        `/api/admin/stages/${stageId}/auto-seed`,
        {
          method: 'POST',
          body: JSON.stringify({
            sourceStageId: autoSeedSourceStageId,
            seedingPattern: autoSeedPattern,
          }),
        }
      );

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
  ]);

  const handleClone = useCallback(
    async (includeMatches: boolean) => {
      if (!stageId || !stage) return;
      setCloning(true);
      setErrorMsg(null);

      try {
        const res = await mutateIdempotent(
          `/api/admin/stages/${stageId}/clone`,
          {
            method: 'POST',
            body: JSON.stringify({ includeMatches }),
          }
        );

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
    [stageId, stage, mutateIdempotent, addToast, t, router]
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
      await adminFetchJson(`/api/admin/stages/${stageId}`, {
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
  ]);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    fetchTournaments();
  }, [fetchTournaments]);

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

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <Breadcrumb
              items={[
                {
                  label: t.breadcrumbStages,
                  href: tournament
                    ? `/admin/tournament/${tournament.id}/stages`
                    : '/admin/tournaments',
                },
                { label: stage?.name || t.stageFallback },
              ]}
            />
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

          {loading && !stage && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {!loading && !stage && !errorMsg && (
            <div className="text-center py-20 text-neutral-400">
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
      />
    </>
  );
}

export default AdminStagePage;
