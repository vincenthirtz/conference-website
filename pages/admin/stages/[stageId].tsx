// pages/admin/stages/[stageId].tsx

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import type { StaffProps, Stage, StageType, Tournament } from '@/types/admin';

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

function stageTypeLabel(type: StageType | null) {
  switch (type) {
    case 'group':
      return 'Groupes / Poules';
    case 'bracket':
      return 'Bracket';
    case 'swiss':
      return 'Swiss';
    case 'round_robin':
      return 'Round Robin';
    case 'showmatch':
      return 'Showmatch';
    case 'other':
      return 'Autre';
    default:
      return 'Non défini';
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
    default:
      return 'bg-neutral-500/20 text-neutral-300 border-neutral-500/30';
  }
}

function stageTypeIcon(type: StageType | null) {
  switch (type) {
    case 'bracket':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
      );
    case 'swiss':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      );
    case 'group':
    case 'round_robin':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case 'showmatch':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      );
    default:
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      );
  }
}

function AdminStagePage({ staff }: StaffProps) {
  const router = useRouter();
  const { stageId } = router.query;

  const [stage, setStage] = useState<Stage | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingActions, setLoadingActions] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Advance modal state
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceStandings, setAdvanceStandings] = useState<
    { teamId: string; teamName: string | null; rank: number; wins: number; losses: number; draws: number; score: number }[]
  >([]);
  const [advanceSelectedIds, setAdvanceSelectedIds] = useState<Set<string>>(new Set());
  const [advanceTopN, setAdvanceTopN] = useState('');
  const [advanceTargetStageId, setAdvanceTargetStageId] = useState('');
  const [advanceSeedMode, setAdvanceSeedMode] = useState<'rank' | 'manual' | 'none'>('rank');
  const [advanceOtherStages, setAdvanceOtherStages] = useState<{ id: string; name: string; stage_type: string | null }[]>([]);
  const [advanceMinScore, setAdvanceMinScore] = useState('');
  const [advanceMinWins, setAdvanceMinWins] = useState('');
  const [advanceLoading, setAdvanceLoading] = useState(false);
  const [advanceSubmitting, setAdvanceSubmitting] = useState(false);

  // Auto-seed modal state
  const [showAutoSeedModal, setShowAutoSeedModal] = useState(false);
  const [autoSeedSourceStageId, setAutoSeedSourceStageId] = useState('');
  const [autoSeedPattern, setAutoSeedPattern] = useState<'standard' | 'sequential'>('standard');
  const [autoSeedOtherStages, setAutoSeedOtherStages] = useState<{ id: string; name: string; stage_type: string | null }[]>([]);
  const [autoSeedLoading, setAutoSeedLoading] = useState(false);
  const [autoSeedSubmitting, setAutoSeedSubmitting] = useState(false);

  // Clone state
  const [cloning, setCloning] = useState(false);

  // Swiss status state
  const [swissStatus, setSwissStatus] = useState<{
    currentRound: number;
    totalRounds: number | null;
    roundStatus: { round: number; total: number; finished: number; pending: number; ongoing: number };
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
  const [allTournaments, setAllTournaments] = useState<{ id: string; name: string }[]>([]);

  const fetchStage = useCallback(async () => {
    if (!stageId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/stages/${stageId}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger la phase');
      }
      const json: StageApiResponse = await res.json();
      const s = json.stage;
      setStage(s);
      setEditForm({
        name: s.name || '',
        tournament_id: s.tournament_id || '',
        is_active: s.is_active || false,
        is_public: s.is_public || false,
      });

      // Charger le tournoi parent
      if (s.tournament_id) {
        try {
          const res2 = await fetch(`/api/admin/tournament/${s.tournament_id}`);
          if (res2.ok) {
            const json2: TournamentApiResponse = await res2.json();
            setTournament(json2.tournament);
          }
        } catch (e) {
          console.error('fetch parent tournament error', e);
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [stageId]);

  const fetchSwissStatus = useCallback(async () => {
    if (!stageId) return;
    try {
      const res = await fetch(`/api/admin/stages/${stageId}/swiss-status`);
      if (res.ok) {
        const json = await res.json();
        setSwissStatus(json);
      }
    } catch (e) {
      console.error('fetchSwissStatus error', e);
    }
  }, [stageId]);

  const fetchCompletionStatus = useCallback(async () => {
    if (!stageId) return;
    try {
      const res = await fetch(`/api/admin/stages/${stageId}/completion-status`);
      if (res.ok) {
        const json = await res.json();
        setCompletionStatus(json);
      }
    } catch (e) {
      console.error('fetchCompletionStatus error', e);
    }
  }, [stageId]);

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
      const res = await fetch('/api/admin/tournaments?limit=100');
      if (res.ok) {
        const json = await res.json();
        setAllTournaments(
          (json.tournaments || []).map((t: any) => ({ id: t.id, name: t.name }))
        );
      }
    } catch (e) {
      console.error('fetch tournaments error', e);
    }
  }

  async function handleSaveEdit() {
    if (!stageId || !stage) return;
    setSaving(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/stages/${stageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors de la mise à jour');
      }

      const json = await res.json();
      setStage(json.stage);
      setIsEditing(false);
      setSuccessMsg('Phase mise à jour avec succès');
      setTimeout(() => setSuccessMsg(null), 3000);

      // Recharger le tournoi parent si changé
      if (json.stage.tournament_id !== stage.tournament_id) {
        try {
          const res2 = await fetch(`/api/admin/tournament/${json.stage.tournament_id}`);
          if (res2.ok) {
            const json2 = await res2.json();
            setTournament(json2.tournament);
          }
        } catch (e) {
          console.error('fetch updated tournament error', e);
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setSaving(false);
    }
  }

  async function handleAutoByes() {
    if (!stageId) return;
    setLoadingActions(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/stages/${stageId}/auto-byes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Erreur lors de l'application des BYE");
      }

      const json = await res.json();
      setSuccessMsg(
        `Auto-BYEs appliqués : ${json.updatedMatchIds?.length ?? 0} matchs mis à jour.`
      );
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur lors de l'auto-BYE");
    } finally {
      setLoadingActions(false);
    }
  }

  async function handleGenerateSwissRound() {
    if (!stageId || stage?.stage_type !== 'swiss') return;
    setLoadingActions(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch(
        `/api/admin/stages/${stageId}/generate-swiss-round`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          json.error || 'Erreur lors de la génération de la ronde Swiss'
        );
      }

      const json = await res.json();
      setSuccessMsg(
        `Nouvelle ronde Swiss #${json.roundNumber} générée : ${json.createdMatches?.length ?? 0} matchs.`
      );
      setTimeout(() => setSuccessMsg(null), 5000);
      // Refresh Swiss and completion status
      fetchSwissStatus();
      fetchCompletionStatus();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur lors de la génération Swiss');
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
        fetch(`/api/admin/stages/${stageId}/standings`),
        fetch(`/api/admin/tournament/${stage.tournament_id}/stages`),
      ]);

      if (standingsRes.ok) {
        const json = await standingsRes.json();
        setAdvanceStandings(json.standings || []);
      }

      if (stagesRes.ok) {
        const json = await stagesRes.json();
        const others = (json.stages || [])
          .filter((s: any) => s.id !== stageId)
          .map((s: any) => ({ id: s.id, name: s.name, stage_type: s.stage_type }));
        setAdvanceOtherStages(others);
        if (others.length > 0) setAdvanceTargetStageId(others[0].id);
      }
    } catch (err) {
      console.error('openAdvanceModal error:', err);
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
        advanceStandings.filter((s) => s.score >= threshold).map((s) => s.teamId)
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
    if (!stageId || advanceSelectedIds.size === 0 || !advanceTargetStageId) return;
    setAdvanceSubmitting(true);
    setErrorMsg(null);

    // Preserve standings order for the selected teams
    const orderedIds = advanceStandings
      .filter((s) => advanceSelectedIds.has(s.teamId))
      .map((s) => s.teamId);

    try {
      const res = await fetch(`/api/admin/stages/${stageId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetStageId: advanceTargetStageId,
          teamIds: orderedIds,
          seedMode: advanceSeedMode,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Erreur lors de l'avancement");
      }

      const json = await res.json();
      const advancedCount = json.advanced?.length ?? 0;
      const skippedCount = json.skipped?.length ?? 0;

      let msg = `${advancedCount} equipe(s) avancee(s) avec succes.`;
      if (skippedCount > 0) {
        msg += ` ${skippedCount} deja presente(s) dans le stage cible.`;
      }

      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 5000);
      setShowAdvanceModal(false);
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur lors de l'avancement");
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
      const stagesRes = await fetch(`/api/admin/tournament/${stage.tournament_id}/stages`);
      if (stagesRes.ok) {
        const json = await stagesRes.json();
        const sources = (json.stages || [])
          .filter((s: any) => s.id !== stageId && ['swiss', 'group', 'round_robin'].includes(s.stage_type))
          .map((s: any) => ({ id: s.id, name: s.name, stage_type: s.stage_type }));
        setAutoSeedOtherStages(sources);
        if (sources.length > 0) setAutoSeedSourceStageId(sources[0].id);
      }
    } catch (err) {
      console.error('openAutoSeedModal error:', err);
    } finally {
      setAutoSeedLoading(false);
    }
  }

  async function handleAutoSeedSubmit() {
    if (!stageId || !autoSeedSourceStageId) return;
    setAutoSeedSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/stages/${stageId}/auto-seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceStageId: autoSeedSourceStageId,
          seedingPattern: autoSeedPattern,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors du seeding automatique');
      }

      const json = await res.json();
      setSuccessMsg(
        `Seeding automatique applique : ${json.seeded?.length ?? 0} equipes placees dans ${json.totalMatches} matchs.`
      );
      setTimeout(() => setSuccessMsg(null), 5000);
      setShowAutoSeedModal(false);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur lors du seeding automatique');
    } finally {
      setAutoSeedSubmitting(false);
    }
  }

  async function handleClone(includeMatches: boolean) {
    if (!stageId || !stage) return;
    setCloning(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/stages/${stageId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeMatches }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors du clonage');
      }

      const json = await res.json();
      const matchMsg = includeMatches
        ? ` avec ${json.clonedMatchCount ?? 0} match(es)`
        : '';
      setSuccessMsg(`Phase clonee${matchMsg}. Nouvelle phase : ${json.stage?.name ?? 'copie'}`);
      setTimeout(() => setSuccessMsg(null), 5000);

      // Navigate to the cloned stage
      if (json.stage?.id) {
        router.push(`/admin/stages/${json.stage.id}`);
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur lors du clonage');
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
          Admin – Phase {stage ? `: ${stage.name}` : ''}
        </title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
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
              Retour au tournoi
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                {stage && (
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center border ${stageTypeColor(stage.stage_type)}`}>
                    {stageTypeIcon(stage.stage_type)}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                      {stage?.name || 'Chargement...'}
                    </h1>
                    {stage && (
                      <span className={`px-3 py-1 rounded-full text-sm font-medium border ${stageTypeColor(stage.stage_type)}`}>
                        {stageTypeLabel(stage.stage_type)}
                      </span>
                    )}
                  </div>
                  {tournament && (
                    <p className="text-sm text-neutral-400 mt-1 flex items-center gap-2">
                      <span>Tournoi :</span>
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
                      Active
                    </span>
                  )}
                  {stage.is_public && (
                    <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-blue-600/20 text-blue-300 border border-blue-500/30">
                      Publique
                    </span>
                  )}
                  {!stage.is_active && !stage.is_public && (
                    <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-neutral-700/50 text-neutral-400 border border-neutral-600/30">
                      Brouillon
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="mb-6 rounded-xl bg-emerald-900/40 border border-emerald-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {successMsg}
            </div>
          )}

          {loading && !stage && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {!loading && !stage && !errorMsg && (
            <div className="text-center py-20 text-neutral-400">
              Phase introuvable.
            </div>
          )}

          {stage && (
            <div className="space-y-6">
              {/* Quick Actions Bar */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setIsEditing(true); fetchTournaments(); }}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Modifier la phase
                </button>
                {matchesUrl && (
                  <Link
                    href={matchesUrl}
                    className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Voir les matchs
                  </Link>
                )}
                <button
                  onClick={openAdvanceModal}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  Avancer des equipes
                </button>
                <button
                  onClick={() => handleClone(false)}
                  disabled={cloning}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {cloning ? 'Clonage…' : 'Cloner la phase'}
                </button>
                <button
                  onClick={() => handleClone(true)}
                  disabled={cloning}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {cloning ? 'Clonage…' : 'Cloner avec matchs'}
                </button>
                <Link
                  href={`/admin/stages/${stage.id}/history`}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Historique
                </Link>
              </div>

              {/* Main Grid */}
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Left Column - Info */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Stage Overview Card */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Informations
                    </h2>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          Type
                        </div>
                        <div className="font-medium">
                          {stageTypeLabel(stage.stage_type)}
                        </div>
                      </div>

                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          Ordre
                        </div>
                        <div className="font-medium">
                          {stage.order_index !== null ? `#${stage.order_index + 1}` : '—'}
                        </div>
                      </div>

                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          Statut
                        </div>
                        <div className="font-medium">
                          {stage.is_active ? 'Active' : 'Inactive'}
                        </div>
                      </div>

                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          Date de début
                        </div>
                        <div className="font-medium text-sm">
                          {formatDateTime(stage.start_date)}
                        </div>
                      </div>

                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          Date de fin
                        </div>
                        <div className="font-medium text-sm">
                          {formatDateTime(stage.end_date)}
                        </div>
                      </div>

                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          Créée le
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
                      <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Outils automatiques
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
                            <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </div>
                          <div>
                            <div className="font-medium text-sm">Auto-BYE</div>
                            <div className="text-xs text-neutral-500">
                              Détecter et valider les matchs BYE
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
                              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                              </svg>
                            </div>
                            <div>
                              <div className="font-medium text-sm text-purple-200">Seeding automatique</div>
                              <div className="text-xs text-purple-400/70">
                                Peupler le bracket depuis un classement
                              </div>
                            </div>
                          </div>
                        </button>
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
                              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                            </div>
                            <div>
                              <div className="font-medium text-sm text-amber-200">Générer ronde Swiss</div>
                              <div className="text-xs text-amber-400/70">
                                Créer la prochaine ronde automatiquement
                              </div>
                            </div>
                          </div>
                        </button>
                      )}
                    </div>

                    {loadingActions && (
                      <div className="mt-4 text-xs text-neutral-400 flex items-center gap-2">
                        <div className="w-3 h-3 border border-neutral-500 border-t-white rounded-full animate-spin" />
                        Traitement en cours...
                      </div>
                    )}
                  </section>

                  {/* Swiss Status Panel */}
                  {stage.stage_type === 'swiss' && swissStatus && (
                    <section className="bg-neutral-800/50 backdrop-blur border border-amber-700/30 rounded-2xl p-6">
                      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Progression Swiss
                      </h2>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="bg-neutral-900/50 rounded-xl p-3 text-center">
                          <div className="text-2xl font-bold text-amber-300">{swissStatus.currentRound}</div>
                          <div className="text-xs text-neutral-500">Round actuel</div>
                        </div>
                        <div className="bg-neutral-900/50 rounded-xl p-3 text-center">
                          <div className="text-2xl font-bold">{swissStatus.totalRounds ?? '∞'}</div>
                          <div className="text-xs text-neutral-500">Rounds total</div>
                        </div>
                        <div className="bg-neutral-900/50 rounded-xl p-3 text-center">
                          <div className="text-2xl font-bold text-emerald-400">{swissStatus.roundStatus.finished}</div>
                          <div className="text-xs text-neutral-500">Matchs finis (R{swissStatus.currentRound})</div>
                        </div>
                        <div className="bg-neutral-900/50 rounded-xl p-3 text-center">
                          <div className="text-2xl font-bold text-orange-400">
                            {swissStatus.roundStatus.pending + swissStatus.roundStatus.ongoing}
                          </div>
                          <div className="text-xs text-neutral-500">En attente (R{swissStatus.currentRound})</div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      {swissStatus.totalRounds && (
                        <div className="mb-4">
                          <div className="flex justify-between text-xs text-neutral-500 mb-1">
                            <span>Progression globale</span>
                            <span>{swissStatus.currentRound} / {swissStatus.totalRounds} rounds</span>
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
                          <svg className="w-6 h-6 text-emerald-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <div className="font-medium text-emerald-300">Swiss terminé</div>
                            <div className="text-xs text-emerald-400/70">
                              Tous les {swissStatus.totalRounds} rounds sont completes.
                            </div>
                          </div>
                        </div>
                      ) : swissStatus.canGenerateNext ? (
                        <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <svg className="w-6 h-6 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <div>
                              <div className="font-medium text-amber-200">Round {swissStatus.currentRound} terminé</div>
                              <div className="text-xs text-amber-400/70">
                                Tous les matchs sont finis. Prêt pour le round {swissStatus.currentRound + 1}
                                {swissStatus.totalRounds ? ` / ${swissStatus.totalRounds}` : ''}.
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
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                            )}
                            Generer Round {swissStatus.currentRound + 1}
                          </button>
                        </div>
                      ) : (
                        <div className="bg-neutral-900/50 border border-neutral-700 rounded-xl p-4 flex items-center gap-3">
                          <div className="w-6 h-6 text-neutral-500">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div>
                            <div className="font-medium text-neutral-300">Round {swissStatus.currentRound} en cours</div>
                            <div className="text-xs text-neutral-500">
                              {swissStatus.roundStatus.pending + swissStatus.roundStatus.ongoing} match(s) restant(s) à terminer.
                            </div>
                          </div>
                        </div>
                      )}
                    </section>
                  )}

                  {/* Stage Completion & Auto-Advance Banner */}
                  {completionStatus && completionStatus.totalMatches > 0 && completionStatus.isComplete && (
                    <section className="bg-emerald-900/20 backdrop-blur border border-emerald-700/40 rounded-2xl p-6">
                      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-emerald-200">
                        <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Phase terminée
                      </h2>

                      <p className="text-sm text-emerald-300/80 mb-4">
                        Les {completionStatus.finishedMatches} matchs de cette phase sont terminés.
                      </p>

                      {completionStatus.canAdvance && completionStatus.nextStage && (
                        <div className="bg-emerald-900/30 border border-emerald-600/40 rounded-xl p-4 flex items-center justify-between gap-4">
                          <div>
                            <div className="font-medium text-emerald-200 text-sm">
                              Avancer vers : {completionStatus.nextStage.name}
                            </div>
                            <div className="text-xs text-emerald-400/60">
                              {completionStatus.nextStage.stage_type
                                ? stageTypeLabel(completionStatus.nextStage.stage_type as StageType)
                                : 'Phase suivante'}
                            </div>
                          </div>
                          <button
                            onClick={openAdvanceModal}
                            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex-shrink-0 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            Avancer des equipes
                          </button>
                        </div>
                      )}

                      {!completionStatus.canAdvance && !completionStatus.nextStage && (
                        <p className="text-xs text-emerald-400/60">
                          Aucune phase suivante configurée. Créez une nouvelle phase dans le tournoi pour avancer des equipes.
                        </p>
                      )}
                    </section>
                  )}

                  {/* Settings JSON */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                      Configuration (settings)
                    </h2>
                    <p className="text-xs text-neutral-500 mb-4">
                      Configuration avancée de la phase (format, options spécifiques...).
                    </p>
                    <pre className="bg-neutral-900/80 border border-neutral-700 rounded-xl p-4 text-xs overflow-x-auto text-neutral-300 font-mono">
                      {JSON.stringify(stage.settings ?? {}, null, 2)}
                    </pre>
                  </section>
                </div>

                {/* Right Column - Quick Links & Meta */}
                <div className="space-y-6">
                  {/* Navigation Card */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Navigation</h2>
                    <div className="space-y-2">
                      {matchesUrl && (
                        <Link
                          href={matchesUrl}
                          className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-700/50 transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                            </div>
                            <div>
                              <div className="font-medium text-sm">Matchs</div>
                              <div className="text-xs text-neutral-500">De cette phase</div>
                            </div>
                          </div>
                          <svg className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      )}

                      {(stage.stage_type === 'group' || stage.stage_type === 'round_robin') && (
                        <Link
                          href={`/admin/stages/${stage.id}/groups`}
                          className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-700/50 transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                              </svg>
                            </div>
                            <div>
                              <div className="font-medium text-sm">Poules / Groupes</div>
                              <div className="text-xs text-neutral-500">Gérer les assignations</div>
                            </div>
                          </div>
                          <svg className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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
                              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                            </div>
                            <div>
                              <div className="font-medium text-sm">Classement Swiss</div>
                              <div className="text-xs text-neutral-500">Standings & rondes</div>
                            </div>
                          </div>
                          <svg className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      )}

                      <Link
                        href={`/admin/stages/${stage.id}/teams`}
                        className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-700/50 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </div>
                          <div>
                            <div className="font-medium text-sm">Équipes</div>
                            <div className="text-xs text-neutral-500">Gérer les participants</div>
                          </div>
                        </div>
                        <svg className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>

                      <Link
                        href={tournamentDashboardUrl}
                        className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-700/50 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
                            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                          </div>
                          <div>
                            <div className="font-medium text-sm">Tournoi</div>
                            <div className="text-xs text-neutral-500">{tournament?.name || 'Dashboard'}</div>
                          </div>
                        </div>
                        <svg className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </section>

                  {/* Meta Info */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <h2 className="text-sm font-semibold text-neutral-400 mb-3">
                      Informations système
                    </h2>
                    <div className="space-y-3 text-sm">
                      <div>
                        <div className="text-xs text-neutral-500 mb-1">ID de la phase</div>
                        <div className="font-mono text-xs bg-neutral-900 px-3 py-2 rounded-lg border border-neutral-700 break-all">
                          {stage.id}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 mb-1">ID du tournoi</div>
                        <div className="font-mono text-xs bg-neutral-900 px-3 py-2 rounded-lg border border-neutral-700 break-all">
                          {stage.tournament_id}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 mb-1">Dernière modification</div>
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
      {isEditing && stage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold mb-4">Modifier la phase</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Nom de la phase
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Tournoi rattaché
                </label>
                <select
                  value={editForm.tournament_id}
                  onChange={(e) => setEditForm({ ...editForm, tournament_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Aucun --</option>
                  {allTournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.is_active}
                    onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                    className="rounded border-neutral-500 bg-neutral-700"
                  />
                  <span>Phase active</span>
                </label>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.is_public}
                    onChange={(e) => setEditForm({ ...editForm, is_public: e.target.checked })}
                    className="rounded border-neutral-500 bg-neutral-700"
                  />
                  <span>Visible publiquement</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editForm.name.trim()}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Auto-Seed Modal */}
      {showAutoSeedModal && stage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
              Seeding automatique
            </h3>

            {autoSeedLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-neutral-400 mb-1">
                    Stage source (classement)
                  </label>
                  {autoSeedOtherStages.length === 0 ? (
                    <p className="text-sm text-neutral-500">
                      Aucun stage group/swiss/round-robin dans ce tournoi.
                    </p>
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
                    Methode de placement
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
                        <span className="font-medium">Standard</span>
                        <span className="text-neutral-500 ml-1">
                          — 1vN, 2v(N-1)... evite les confrontations precoces
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
                        <span className="font-medium">Sequentiel</span>
                        <span className="text-neutral-500 ml-1">
                          — 1v2, 3v4... placement lineaire
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAutoSeedModal(false)}
                className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleAutoSeedSubmit}
                disabled={autoSeedSubmitting || !autoSeedSourceStageId || autoSeedOtherStages.length === 0}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {autoSeedSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Seeding...
                  </>
                ) : (
                  'Appliquer le seeding'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advance Modal */}
      {showAdvanceModal && stage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              Avancer des equipes
            </h3>

            {advanceLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-5">
                {/* Target stage selector */}
                <div>
                  <label className="block text-sm text-neutral-400 mb-1">
                    Stage cible
                  </label>
                  {advanceOtherStages.length === 0 ? (
                    <p className="text-sm text-neutral-500">Aucun autre stage dans ce tournoi.</p>
                  ) : (
                    <select
                      value={advanceTargetStageId}
                      onChange={(e) => setAdvanceTargetStageId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    >
                      {advanceOtherStages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.stage_type || 'autre'})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Criteria filters */}
                <div className="bg-neutral-900/50 border border-neutral-700 rounded-xl p-4 space-y-3">
                  <p className="text-xs text-neutral-400 uppercase tracking-wider font-semibold mb-2">
                    Criteres de selection
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">Top N</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={advanceStandings.length}
                          value={advanceTopN}
                          onChange={(e) => handleAdvanceTopN(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                          placeholder="N"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">Score minimum</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={advanceMinScore}
                        onChange={(e) => handleAdvanceMinScore(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                        placeholder="Ex: 6"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">Victoires minimum</label>
                      <input
                        type="number"
                        min={1}
                        value={advanceMinWins}
                        onChange={(e) => handleAdvanceMinWins(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                        placeholder="Ex: 3"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-neutral-500">
                    {advanceSelectedIds.size} / {advanceStandings.length} equipe(s) selectionnee(s)
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
                              checked={advanceSelectedIds.size === advanceStandings.length}
                              onChange={() => {
                                if (advanceSelectedIds.size === advanceStandings.length) {
                                  setAdvanceSelectedIds(new Set());
                                } else {
                                  setAdvanceSelectedIds(new Set(advanceStandings.map((s) => s.teamId)));
                                }
                                setAdvanceTopN('');
                              }}
                              className="rounded border-neutral-500 bg-neutral-700"
                            />
                          </th>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Equipe</th>
                          <th className="px-3 py-2 text-center">V</th>
                          <th className="px-3 py-2 text-center">D</th>
                          <th className="px-3 py-2 text-center">N</th>
                          <th className="px-3 py-2 text-right">Pts</th>
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
                            <td className="px-3 py-2 text-center text-emerald-400">{s.wins}</td>
                            <td className="px-3 py-2 text-center text-red-400">{s.losses}</td>
                            <td className="px-3 py-2 text-center text-neutral-400">{s.draws}</td>
                            <td className="px-3 py-2 text-right font-semibold">{s.score}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">
                    Aucune equipe ou aucun match termine dans cette phase.
                  </p>
                )}

                {/* Seed mode */}
                <div>
                  <label className="block text-sm text-neutral-400 mb-2">
                    Attribution des seeds
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {(['rank', 'manual', 'none'] as const).map((mode) => (
                      <label key={mode} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="seedMode"
                          checked={advanceSeedMode === mode}
                          onChange={() => setAdvanceSeedMode(mode)}
                          className="border-neutral-500 bg-neutral-700"
                        />
                        <span>
                          {mode === 'rank' && 'Par classement'}
                          {mode === 'manual' && 'Par ordre de selection'}
                          {mode === 'none' && 'Aucun seed'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mt-6">
              <span className="text-xs text-neutral-500">
                {advanceSelectedIds.size} equipe(s) selectionnee(s)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAdvanceModal(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleAdvanceSubmit}
                  disabled={advanceSubmitting || advanceSelectedIds.size === 0 || !advanceTargetStageId}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {advanceSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Avancement...
                    </>
                  ) : (
                    'Avancer'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AdminStagePage;
