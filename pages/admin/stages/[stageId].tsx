// pages/admin/stages/[stageId].tsx

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import Breadcrumb from '@/components/admin/Breadcrumb';
import Modal from '@/components/admin/Modal';
import type { StaffProps, Stage, StageType, Tournament } from '@/types/admin';
import AdvancementRulesEditor from '@/components/admin/AdvancementRulesEditor';
import type { AdvancementRules } from '@/components/admin/AdvancementRulesEditor';
import FfaLobbiesManager from '@/components/admin/ffa/FfaLobbiesManager';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import { logger } from '../../../utils/logger';

type Dict = ReturnType<typeof useAdminT<'adminStageDetail'>>;
type StageApiResponse = {
  stage: Stage;
};

type TournamentApiResponse = {
  tournament: Tournament;
};

export const getServerSideProps = withStaffPage('manager');

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function stageTypeLabel(type: StageType | null, t: Dict) {
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
    case 'ffa':
      return t.typeFfa;
    case 'other':
      return t.typeOther;
    default:
      return t.typeUndefined;
  }
}

function stageTypeColor(type: StageType | null) {
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
    case 'ffa':
      return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
    default:
      return 'bg-neutral-500/20 text-neutral-300 border-neutral-500/30';
  }
}

function stageTypeIcon(type: StageType | null) {
  switch (type) {
    case 'bracket':
      return (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
          />
        </svg>
      );
    case 'swiss':
      return (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 10h16M4 14h16M4 18h16"
          />
        </svg>
      );
    case 'group':
    case 'round_robin':
      return (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      );
    case 'showmatch':
      return (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </svg>
      );
    default:
      return (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
      );
  }
}

function AdminStagePage({ staff }: StaffProps) {
  const t = useAdminT('adminStageDetail');
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
  const [advanceStandings, setAdvanceStandings] = useState<
    {
      teamId: string;
      teamName: string | null;
      rank: number;
      wins: number;
      losses: number;
      draws: number;
      score: number;
    }[]
  >([]);
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
  const [swissStatus, setSwissStatus] = useState<{
    currentRound: number;
    totalRounds: number | null;
    roundStatus: {
      round: number;
      total: number;
      finished: number;
      pending: number;
      ongoing: number;
    };
    allCurrentRoundFinished: boolean;
    canGenerateNext: boolean;
    isComplete: boolean;
  } | null>(null);

  // Completion status state
  const [completionStatus, setCompletionStatus] = useState<{
    totalMatches: number;
    finishedMatches: number;
    pendingMatches: number;
    ongoingMatches: number;
    isComplete: boolean;
    nextStage: { id: string; name: string; stage_type: string | null } | null;
    canAdvance: boolean;
  } | null>(null);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
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

      // Charger le tournoi parent + sibling stages
      if (s.tournament_id) {
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

  async function fetchTournaments() {
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
  }

  async function handleSaveEdit() {
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
  }

  async function handleAutoByes() {
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
  }

  async function handleGenerateSwissRound() {
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
  }

  async function openAdvanceModal() {
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
  }

  function handleAdvanceTopN(value: string) {
    setAdvanceTopN(value);
    setAdvanceMinScore('');
    setAdvanceMinWins('');
    const n = parseInt(value, 10);
    if (!isNaN(n) && n > 0) {
      const ids = new Set(advanceStandings.slice(0, n).map((s) => s.teamId));
      setAdvanceSelectedIds(ids);
    }
  }

  function handleAdvanceMinScore(value: string) {
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
  }

  function handleAdvanceMinWins(value: string) {
    setAdvanceMinWins(value);
    setAdvanceTopN('');
    setAdvanceMinScore('');
    const threshold = parseInt(value, 10);
    if (!isNaN(threshold) && threshold > 0) {
      const ids = new Set(
        advanceStandings.filter((s) => s.wins >= threshold).map((s) => s.teamId)
      );
      setAdvanceSelectedIds(ids);
    }
  }

  function toggleAdvanceTeam(teamId: string) {
    setAdvanceSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
    setAdvanceTopN('');
  }

  async function handleAdvanceSubmit() {
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
  }

  async function openAutoSeedModal() {
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
  }

  async function handleAutoSeedSubmit() {
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
  }

  async function handleClone(includeMatches: boolean) {
    if (!stageId || !stage) return;
    setCloning(true);
    setErrorMsg(null);

    try {
      const res = await mutateIdempotent(`/api/admin/stages/${stageId}/clone`, {
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
  }

  const tournamentDashboardUrl = tournament
    ? `/admin/tournament/${tournament.id}`
    : stage
      ? `/admin/tournament/${stage.tournament_id}`
      : '/admin/tournaments';

  const matchesUrl =
    stage && stage.tournament_id
      ? `/admin/tournament/${stage.tournament_id}/matches?stageId=${stage.id}`
      : null;

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
            <button
              type="button"
              onClick={() => router.push(tournamentDashboardUrl)}
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
              {t.backToTournament}
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                {stage && (
                  <div
                    className={`w-14 h-14 rounded-xl flex items-center justify-center border ${stageTypeColor(stage.stage_type)}`}
                  >
                    {stageTypeIcon(stage.stage_type)}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                      {stage?.name || t.loadingName}
                    </h1>
                    {stage && (
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium border ${stageTypeColor(stage.stage_type)}`}
                      >
                        {stageTypeLabel(stage.stage_type, t)}
                      </span>
                    )}
                  </div>
                  {tournament && (
                    <p className="text-sm text-neutral-400 mt-1 flex items-center gap-2">
                      <span>{t.tournamentPrefix}</span>
                      <Link
                        href={tournamentDashboardUrl}
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        {tournament.name}
                      </Link>
                      {stage?.slug && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-xs bg-neutral-800/80 px-2 py-0.5 rounded">
                            /{stage.slug}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {stage && (
                <div className="flex flex-wrap items-center gap-2">
                  {stage.is_active && (
                    <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                      {t.badgeActive}
                    </span>
                  )}
                  {stage.is_public && (
                    <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-blue-600/20 text-blue-300 border border-blue-500/30">
                      {t.badgePublic}
                    </span>
                  )}
                  {!stage.is_active && !stage.is_public && (
                    <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-neutral-700/50 text-neutral-400 border border-neutral-600/30">
                      {t.badgeDraft}
                    </span>
                  )}
                </div>
              )}
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
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setIsEditing(true);
                    fetchTournaments();
                  }}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  {t.editStage}
                </button>
                {matchesUrl && (
                  <Link
                    href={matchesUrl}
                    className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                    {t.viewMatches}
                  </Link>
                )}
                <button
                  onClick={openAdvanceModal}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                  {t.advanceTeams}
                </button>
                <button
                  onClick={() => handleClone(false)}
                  disabled={cloning}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
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
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  {cloning ? t.cloning : t.cloneStage}
                </button>
                <button
                  onClick={() => handleClone(true)}
                  disabled={cloning}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
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
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  {cloning ? t.cloning : t.cloneWithMatches}
                </button>
                <Link
                  href={`/admin/stages/${stage.id}/history`}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {t.history}
                </Link>
              </div>

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

                  {/* Stage Overview Card */}
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
                      {t.infoTitle}
                    </h2>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          {t.infoType}
                        </div>
                        <div className="font-medium">
                          {stageTypeLabel(stage.stage_type, t)}
                        </div>
                      </div>

                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          {t.infoOrder}
                        </div>
                        <div className="font-medium">
                          {stage.order_index !== null
                            ? `#${stage.order_index + 1}`
                            : '—'}
                        </div>
                      </div>

                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          {t.infoStatus}
                        </div>
                        <div className="font-medium">
                          {stage.is_active ? t.statusActive : t.statusInactive}
                        </div>
                      </div>

                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          {t.infoStartDate}
                        </div>
                        <div className="font-medium text-sm">
                          {formatDateTime(stage.start_date)}
                        </div>
                      </div>

                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          {t.infoEndDate}
                        </div>
                        <div className="font-medium text-sm">
                          {formatDateTime(stage.end_date)}
                        </div>
                      </div>

                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          {t.infoCreatedAt}
                        </div>
                        <div className="font-medium text-sm">
                          {formatDateTime(stage.created_at)}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Automated Tools */}
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
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      {t.autoToolsTitle}
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={handleAutoByes}
                        disabled={loadingActions}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          loadingActions
                            ? 'bg-neutral-800/50 border-neutral-700 cursor-wait opacity-50'
                            : 'bg-neutral-900/50 border-neutral-700 hover:bg-neutral-800 hover:border-neutral-600'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-orange-600/20 flex items-center justify-center">
                            <svg
                              className="w-5 h-5 text-orange-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 10V3L4 14h7v7l9-11h-7z"
                              />
                            </svg>
                          </div>
                          <div>
                            <div className="font-medium text-sm">
                              {t.autoByeTitle}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {t.autoByeDesc}
                            </div>
                          </div>
                        </div>
                      </button>

                      {stage.stage_type === 'bracket' && (
                        <button
                          type="button"
                          onClick={openAutoSeedModal}
                          disabled={loadingActions}
                          className={`p-4 rounded-xl border text-left transition-all ${
                            loadingActions
                              ? 'bg-neutral-800/50 border-neutral-700 cursor-wait opacity-50'
                              : 'bg-purple-900/20 border-purple-700/50 hover:bg-purple-900/30 hover:border-purple-600/50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
                              <svg
                                className="w-5 h-5 text-purple-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                                />
                              </svg>
                            </div>
                            <div>
                              <div className="font-medium text-sm text-purple-200">
                                {t.autoSeedTitle}
                              </div>
                              <div className="text-xs text-purple-400/70">
                                {t.autoSeedDesc}
                              </div>
                            </div>
                          </div>
                        </button>
                      )}

                      {stage.stage_type === 'bracket' && (
                        <Link
                          href={`/admin/stages/${stage.id}/seeding`}
                          className="p-4 rounded-xl border text-left transition-all bg-indigo-900/20 border-indigo-700/50 hover:bg-indigo-900/30 hover:border-indigo-600/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center">
                              <svg
                                className="w-5 h-5 text-indigo-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                />
                              </svg>
                            </div>
                            <div>
                              <div className="font-medium text-sm text-indigo-200">
                                {t.seedingComparatorTitle}
                              </div>
                              <div className="text-xs text-indigo-400/70">
                                {t.seedingComparatorDesc}
                              </div>
                            </div>
                          </div>
                        </Link>
                      )}

                      {stage.stage_type === 'swiss' && (
                        <button
                          type="button"
                          onClick={handleGenerateSwissRound}
                          disabled={loadingActions}
                          className={`p-4 rounded-xl border text-left transition-all ${
                            loadingActions
                              ? 'bg-neutral-800/50 border-neutral-700 cursor-wait opacity-50'
                              : 'bg-amber-900/20 border-amber-700/50 hover:bg-amber-900/30 hover:border-amber-600/50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center">
                              <svg
                                className="w-5 h-5 text-amber-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                                />
                              </svg>
                            </div>
                            <div>
                              <div className="font-medium text-sm text-amber-200">
                                {t.genSwissTitle}
                              </div>
                              <div className="text-xs text-amber-400/70">
                                {t.genSwissDesc}
                              </div>
                            </div>
                          </div>
                        </button>
                      )}
                    </div>

                    {loadingActions && (
                      <div className="mt-4 text-xs text-neutral-400 flex items-center gap-2">
                        <div className="w-3 h-3 border border-neutral-500 border-t-white rounded-full animate-spin" />
                        {t.processing}
                      </div>
                    )}
                  </section>

                  {/* Swiss Status Panel */}
                  {stage.stage_type === 'swiss' && swissStatus && (
                    <section className="bg-neutral-800/50 backdrop-blur border border-amber-700/30 rounded-2xl p-6">
                      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <svg
                          className="w-5 h-5 text-amber-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                          />
                        </svg>
                        {t.swissProgressTitle}
                      </h2>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="bg-neutral-900/50 rounded-xl p-3 text-center">
                          <div className="text-2xl font-bold text-amber-300">
                            {swissStatus.currentRound}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {t.swissCurrentRound}
                          </div>
                        </div>
                        <div className="bg-neutral-900/50 rounded-xl p-3 text-center">
                          <div className="text-2xl font-bold">
                            {swissStatus.totalRounds ?? '∞'}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {t.swissTotalRounds}
                          </div>
                        </div>
                        <div className="bg-neutral-900/50 rounded-xl p-3 text-center">
                          <div className="text-2xl font-bold text-emerald-400">
                            {swissStatus.roundStatus.finished}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {format(t.swissFinishedMatches, {
                              round: swissStatus.currentRound,
                            })}
                          </div>
                        </div>
                        <div className="bg-neutral-900/50 rounded-xl p-3 text-center">
                          <div className="text-2xl font-bold text-orange-400">
                            {swissStatus.roundStatus.pending +
                              swissStatus.roundStatus.ongoing}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {format(t.swissPendingMatches, {
                              round: swissStatus.currentRound,
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      {swissStatus.totalRounds && (
                        <div className="mb-4">
                          <div className="flex justify-between text-xs text-neutral-500 mb-1">
                            <span>{t.swissGlobalProgress}</span>
                            <span>
                              {format(t.swissRoundsProgress, {
                                current: swissStatus.currentRound,
                                total: swissStatus.totalRounds,
                              })}
                            </span>
                          </div>
                          <div className="h-2 bg-neutral-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-500 rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, (swissStatus.currentRound / swissStatus.totalRounds) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {swissStatus.isComplete ? (
                        <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-xl p-4 flex items-center gap-3">
                          <svg
                            className="w-6 h-6 text-emerald-400 flex-shrink-0"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <div>
                            <div className="font-medium text-emerald-300">
                              {t.swissCompleteTitle}
                            </div>
                            <div className="text-xs text-emerald-400/70">
                              {format(t.swissCompleteDesc, {
                                total: swissStatus.totalRounds ?? 0,
                              })}
                            </div>
                          </div>
                        </div>
                      ) : swissStatus.canGenerateNext ? (
                        <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <svg
                              className="w-6 h-6 text-amber-400 flex-shrink-0"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 10V3L4 14h7v7l9-11h-7z"
                              />
                            </svg>
                            <div>
                              <div className="font-medium text-amber-200">
                                {format(t.swissRoundDoneTitle, {
                                  round: swissStatus.currentRound,
                                })}
                              </div>
                              <div className="text-xs text-amber-400/70">
                                {format(t.swissRoundDoneDesc, {
                                  next: swissStatus.currentRound + 1,
                                  suffix: swissStatus.totalRounds
                                    ? format(t.swissRoundSuffix, {
                                        total: swissStatus.totalRounds,
                                      })
                                    : '',
                                })}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={handleGenerateSwissRound}
                            disabled={loadingActions}
                            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-sm font-medium transition-colors flex-shrink-0 disabled:opacity-50 flex items-center gap-2"
                          >
                            {loadingActions ? (
                              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
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
                                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                                />
                              </svg>
                            )}
                            {format(t.swissGenerateRound, {
                              round: swissStatus.currentRound + 1,
                            })}
                          </button>
                        </div>
                      ) : (
                        <div className="bg-neutral-900/50 border border-neutral-700 rounded-xl p-4 flex items-center gap-3">
                          <div className="w-6 h-6 text-neutral-500">
                            <svg
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          </div>
                          <div>
                            <div className="font-medium text-neutral-300">
                              {format(t.swissRoundInProgressTitle, {
                                round: swissStatus.currentRound,
                              })}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {format(t.swissRoundInProgressDesc, {
                                count:
                                  swissStatus.roundStatus.pending +
                                  swissStatus.roundStatus.ongoing,
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </section>
                  )}

                  {/* Stage Completion & Auto-Advance Banner */}
                  {completionStatus &&
                    completionStatus.totalMatches > 0 &&
                    completionStatus.isComplete && (
                      <section className="bg-emerald-900/20 backdrop-blur border border-emerald-700/40 rounded-2xl p-6">
                        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-emerald-200">
                          <svg
                            className="w-5 h-5 text-emerald-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {t.phaseCompleteTitle}
                        </h2>

                        <p className="text-sm text-emerald-300/80 mb-4">
                          {format(t.phaseCompleteDesc, {
                            count: completionStatus.finishedMatches,
                          })}
                        </p>

                        {completionStatus.canAdvance &&
                          completionStatus.nextStage && (
                            <div className="bg-emerald-900/30 border border-emerald-600/40 rounded-xl p-4 flex items-center justify-between gap-4">
                              <div>
                                <div className="font-medium text-emerald-200 text-sm">
                                  {format(t.advanceToward, {
                                    name: completionStatus.nextStage.name,
                                  })}
                                </div>
                                <div className="text-xs text-emerald-400/60">
                                  {completionStatus.nextStage.stage_type
                                    ? stageTypeLabel(
                                        completionStatus.nextStage
                                          .stage_type as StageType,
                                        t
                                      )
                                    : t.nextPhaseFallback}
                                </div>
                              </div>
                              <button
                                onClick={openAdvanceModal}
                                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex-shrink-0 flex items-center gap-2"
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
                                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                                  />
                                </svg>
                                {t.advanceTeams}
                              </button>
                            </div>
                          )}

                        {!completionStatus.canAdvance &&
                          !completionStatus.nextStage && (
                            <p className="text-xs text-emerald-400/60">
                              {t.noNextPhase}
                            </p>
                          )}
                      </section>
                    )}

                  {/* Advancement Rules */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
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
                          d="M13 7l5 5m0 0l-5 5m5-5H6"
                        />
                      </svg>
                      {t.advancementRulesTitle}
                    </h2>
                    <p className="text-xs text-neutral-500 mb-4">
                      {t.advancementRulesDesc}
                    </p>

                    <AdvancementRulesEditor
                      value={advancementRulesDraft}
                      availableStages={advancementSiblingStages}
                      onChange={setAdvancementRulesDraft}
                      disabled={advancementSaving}
                      sourceStageType={stage?.stage_type ?? null}
                    />

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        disabled={advancementSaving}
                        onClick={async () => {
                          if (!stageId) return;
                          setAdvancementSaving(true);
                          setErrorMsg(null);
                          try {
                            const currentSettings = stage.settings ?? {};
                            const newSettings = { ...currentSettings };
                            if (advancementRulesDraft) {
                              newSettings.advancement_rules =
                                advancementRulesDraft;
                            } else {
                              delete newSettings.advancement_rules;
                            }
                            await adminFetchJson(
                              `/api/admin/stages/${stageId}`,
                              {
                                method: 'PATCH',
                                body: JSON.stringify({ settings: newSettings }),
                              }
                            );
                            addToast(t.toastAdvancementRules, 'success');
                            await fetchStage();
                          } catch (err: unknown) {
                            setErrorMsg(
                              (err as Error)?.message ?? t.errUnexpected
                            );
                          } finally {
                            setAdvancementSaving(false);
                          }
                        }}
                        className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                          advancementSaving
                            ? 'bg-blue-800 cursor-wait text-blue-200'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {advancementSaving
                          ? t.advancementSaving
                          : t.advancementSave}
                      </button>
                    </div>
                  </section>

                  {/* Settings JSON (autres parametres) */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
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
                          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                        />
                      </svg>
                      {t.advancedConfigTitle}
                    </h2>
                    <p className="text-xs text-neutral-500 mb-4">
                      {t.advancedConfigDesc}
                    </p>
                    <pre className="bg-neutral-900/80 border border-neutral-700 rounded-xl p-4 text-xs overflow-x-auto text-neutral-300 font-mono">
                      {JSON.stringify(
                        (() => {
                          const { advancement_rules: _, ...rest } =
                            stage.settings ?? {};
                          return rest;
                        })(),
                        null,
                        2
                      )}
                    </pre>
                  </section>
                </div>

                {/* Right Column - Quick Links & Meta */}
                <div className="space-y-6">
                  {/* Navigation Card */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">{t.navTitle}</h2>
                    <div className="space-y-2">
                      {matchesUrl && (
                        <Link
                          href={matchesUrl}
                          className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-700/50 transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                              <svg
                                className="w-5 h-5 text-blue-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                />
                              </svg>
                            </div>
                            <div>
                              <div className="font-medium text-sm">
                                {t.navMatches}
                              </div>
                              <div className="text-xs text-neutral-500">
                                {t.navMatchesDesc}
                              </div>
                            </div>
                          </div>
                          <svg
                            className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </Link>
                      )}

                      {(stage.stage_type === 'group' ||
                        stage.stage_type === 'round_robin') && (
                        <Link
                          href={`/admin/stages/${stage.id}/groups`}
                          className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-700/50 transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                              <svg
                                className="w-5 h-5 text-blue-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                                />
                              </svg>
                            </div>
                            <div>
                              <div className="font-medium text-sm">
                                {t.navGroups}
                              </div>
                              <div className="text-xs text-neutral-500">
                                {t.navGroupsDesc}
                              </div>
                            </div>
                          </div>
                          <svg
                            className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </Link>
                      )}

                      {stage.stage_type === 'swiss' && (
                        <Link
                          href={`/admin/stages/${stage.id}/swiss`}
                          className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-700/50 transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center">
                              <svg
                                className="w-5 h-5 text-amber-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                                />
                              </svg>
                            </div>
                            <div>
                              <div className="font-medium text-sm">
                                {t.navSwiss}
                              </div>
                              <div className="text-xs text-neutral-500">
                                {t.navSwissDesc}
                              </div>
                            </div>
                          </div>
                          <svg
                            className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </Link>
                      )}

                      <Link
                        href={`/admin/stages/${stage.id}/teams`}
                        className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-700/50 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center">
                            <svg
                              className="w-5 h-5 text-emerald-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                              />
                            </svg>
                          </div>
                          <div>
                            <div className="font-medium text-sm">
                              {t.navTeams}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {t.navTeamsDesc}
                            </div>
                          </div>
                        </div>
                        <svg
                          className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </Link>

                      <Link
                        href={tournamentDashboardUrl}
                        className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-700/50 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
                            <svg
                              className="w-5 h-5 text-purple-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                              />
                            </svg>
                          </div>
                          <div>
                            <div className="font-medium text-sm">
                              {t.navTournament}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {tournament?.name || t.navTournamentFallback}
                            </div>
                          </div>
                        </div>
                        <svg
                          className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </Link>
                    </div>
                  </section>

                  {/* Meta Info */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <h2 className="text-sm font-semibold text-neutral-400 mb-3">
                      {t.sysInfoTitle}
                    </h2>
                    <div className="space-y-3 text-sm">
                      <div>
                        <div className="text-xs text-neutral-500 mb-1">
                          {t.sysStageId}
                        </div>
                        <div className="font-mono text-xs bg-neutral-900 px-3 py-2 rounded-lg border border-neutral-700 break-all">
                          {stage.id}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 mb-1">
                          {t.sysTournamentId}
                        </div>
                        <div className="font-mono text-xs bg-neutral-900 px-3 py-2 rounded-lg border border-neutral-700 break-all">
                          {stage.tournament_id}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 mb-1">
                          {t.sysLastModified}
                        </div>
                        <div className="text-neutral-300">
                          {formatDateTime(stage.updated_at || stage.created_at)}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <Modal
        open={Boolean(isEditing && stage)}
        onClose={() => setIsEditing(false)}
        title={t.editModalTitle}
        footer={
          <>
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={saving || !editForm.name.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? t.saving : t.save}
            </button>
          </>
        }
      >
        {stage && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                {t.editNameLabel}
              </label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                {t.editTournamentLabel}
              </label>
              <select
                value={editForm.tournament_id}
                onChange={(e) =>
                  setEditForm({ ...editForm, tournament_id: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t.editNoTournament}</option>
                {allTournaments.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(e) =>
                    setEditForm({ ...editForm, is_active: e.target.checked })
                  }
                  className="rounded border-neutral-500 bg-neutral-700"
                />
                <span>{t.editActiveLabel}</span>
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.is_public}
                  onChange={(e) =>
                    setEditForm({ ...editForm, is_public: e.target.checked })
                  }
                  className="rounded border-neutral-500 bg-neutral-700"
                />
                <span>{t.editPublicLabel}</span>
              </label>
            </div>
          </div>
        )}
      </Modal>
      {/* Auto-Seed Modal */}
      <Modal
        open={Boolean(showAutoSeedModal && stage)}
        onClose={() => setShowAutoSeedModal(false)}
        title={
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <svg
              className="w-5 h-5 text-purple-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
              />
            </svg>
            {t.autoSeedModalTitle}
          </h3>
        }
        footer={
          <>
            <button
              onClick={() => setShowAutoSeedModal(false)}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            <button
              onClick={handleAutoSeedSubmit}
              disabled={
                autoSeedSubmitting ||
                !autoSeedSourceStageId ||
                autoSeedOtherStages.length === 0
              }
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {autoSeedSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t.autoSeedSubmitting}
                </>
              ) : (
                t.autoSeedApply
              )}
            </button>
          </>
        }
      >
        {autoSeedLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                {t.sourceStageLabel}
              </label>
              {autoSeedOtherStages.length === 0 ? (
                <p className="text-sm text-neutral-500">{t.noSourceStages}</p>
              ) : (
                <select
                  value={autoSeedSourceStageId}
                  onChange={(e) => setAutoSeedSourceStageId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                >
                  {autoSeedOtherStages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.stage_type})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-2">
                {t.methodLabel}
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="autoSeedPattern"
                    checked={autoSeedPattern === 'standard'}
                    onChange={() => setAutoSeedPattern('standard')}
                    className="border-neutral-500 bg-neutral-700"
                  />
                  <div>
                    <span className="font-medium">{t.patternStandard}</span>
                    <span className="text-neutral-500 ml-1">
                      {t.patternStandardDesc}
                    </span>
                  </div>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="autoSeedPattern"
                    checked={autoSeedPattern === 'sequential'}
                    onChange={() => setAutoSeedPattern('sequential')}
                    className="border-neutral-500 bg-neutral-700"
                  />
                  <div>
                    <span className="font-medium">{t.patternSequential}</span>
                    <span className="text-neutral-500 ml-1">
                      {t.patternSequentialDesc}
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Advance Modal */}
      <Modal
        open={Boolean(showAdvanceModal && stage)}
        onClose={() => setShowAdvanceModal(false)}
        size="2xl"
        panelClassName="max-h-[90vh]"
        title={
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <svg
              className="w-5 h-5 text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
            {t.advanceModalTitle}
          </h3>
        }
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-xs text-neutral-500">
              {format(t.advanceSelectedCount, {
                count: advanceSelectedIds.size,
              })}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAdvanceModal(false)}
                className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleAdvanceSubmit}
                disabled={
                  advanceSubmitting ||
                  advanceSelectedIds.size === 0 ||
                  !advanceTargetStageId
                }
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {advanceSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t.advanceSubmitting}
                  </>
                ) : (
                  t.advanceSubmit
                )}
              </button>
            </div>
          </div>
        }
      >
        {advanceLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Target stage selector */}
            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                {t.targetStageLabel}
              </label>
              {advanceOtherStages.length === 0 ? (
                <p className="text-sm text-neutral-500">{t.noOtherStages}</p>
              ) : (
                <select
                  value={advanceTargetStageId}
                  onChange={(e) => setAdvanceTargetStageId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                >
                  {advanceOtherStages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.stage_type || t.stageTypeOtherFallback})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Criteria filters */}
            <div className="bg-neutral-900/50 border border-neutral-700 rounded-xl p-4 space-y-3">
              <p className="text-xs text-neutral-400 uppercase tracking-wider font-semibold mb-2">
                {t.criteriaTitle}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">
                    {t.topNLabel}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={advanceStandings.length}
                      value={advanceTopN}
                      onChange={(e) => handleAdvanceTopN(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      placeholder={t.topNPlaceholder}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">
                    {t.minScoreLabel}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={advanceMinScore}
                    onChange={(e) => handleAdvanceMinScore(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    placeholder={t.minScorePlaceholder}
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">
                    {t.minWinsLabel}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={advanceMinWins}
                    onChange={(e) => handleAdvanceMinWins(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    placeholder={t.minWinsPlaceholder}
                  />
                </div>
              </div>
              <p className="text-xs text-neutral-500">
                {format(t.advanceRatio, {
                  selected: advanceSelectedIds.size,
                  total: advanceStandings.length,
                })}
              </p>
            </div>

            {/* Standings table with checkboxes */}
            {advanceStandings.length > 0 ? (
              <div className="border border-neutral-700 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-900/80 text-neutral-400 text-xs uppercase tracking-wider">
                      <th className="px-3 py-2 text-left w-10">
                        <input
                          type="checkbox"
                          checked={
                            advanceSelectedIds.size === advanceStandings.length
                          }
                          onChange={() => {
                            if (
                              advanceSelectedIds.size ===
                              advanceStandings.length
                            ) {
                              setAdvanceSelectedIds(new Set());
                            } else {
                              setAdvanceSelectedIds(
                                new Set(advanceStandings.map((s) => s.teamId))
                              );
                            }
                            setAdvanceTopN('');
                          }}
                          className="rounded border-neutral-500 bg-neutral-700"
                        />
                      </th>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">{t.thTeam}</th>
                      <th className="px-3 py-2 text-center">{t.thWins}</th>
                      <th className="px-3 py-2 text-center">{t.thLosses}</th>
                      <th className="px-3 py-2 text-center">{t.thDraws}</th>
                      <th className="px-3 py-2 text-right">{t.thPoints}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {advanceStandings.map((s) => (
                      <tr
                        key={s.teamId}
                        onClick={() => toggleAdvanceTeam(s.teamId)}
                        className={`cursor-pointer transition-colors ${
                          advanceSelectedIds.has(s.teamId)
                            ? 'bg-emerald-900/30'
                            : 'hover:bg-neutral-700/50'
                        }`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={advanceSelectedIds.has(s.teamId)}
                            onChange={() => toggleAdvanceTeam(s.teamId)}
                            className="rounded border-neutral-500 bg-neutral-700"
                          />
                        </td>
                        <td className="px-3 py-2 text-neutral-500 font-mono text-xs">
                          {s.rank}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {s.teamName || s.teamId.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2 text-center text-emerald-400">
                          {s.wins}
                        </td>
                        <td className="px-3 py-2 text-center text-red-400">
                          {s.losses}
                        </td>
                        <td className="px-3 py-2 text-center text-neutral-400">
                          {s.draws}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {s.score}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">{t.noStandings}</p>
            )}

            {/* Seed mode */}
            <div>
              <label className="block text-sm text-neutral-400 mb-2">
                {t.seedModeLabel}
              </label>
              <div className="flex flex-wrap gap-3">
                {(['rank', 'manual', 'none'] as const).map((mode) => (
                  <label
                    key={mode}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="seedMode"
                      checked={advanceSeedMode === mode}
                      onChange={() => setAdvanceSeedMode(mode)}
                      className="border-neutral-500 bg-neutral-700"
                    />
                    <span>
                      {mode === 'rank' && t.seedModeRank}
                      {mode === 'manual' && t.seedModeManual}
                      {mode === 'none' && t.seedModeNone}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default AdminStagePage;
