// pages/admin/tournament/[id].tsx

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import {
  requireStaffRoleFromRequest,
  StaffUnauthenticatedError,
  StaffUnauthorizedError,
} from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { isValidUUID } from '@/utils/apiHelpers';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import Breadcrumb from '@/components/admin/Breadcrumb';
import { useToast } from '@/components/Toast';
import type { MatchStatus } from '@/types/admin';

import { logger } from '../../../utils/logger';
type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type Tournament = {
  id: string;
  name: string;
  slug: string | null;
  game: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  format_type: string | null;
  max_teams: number | null;
  visibility: string | null;
  is_featured: boolean;
  logo_url: string | null;
  banner_url: string | null;
  created_at: string;
  updated_at: string | null;
};

type Stage = {
  id: string;
  name: string;
  stage_type: string | null;
  order_index: number | null;
  is_active: boolean;
  is_public: boolean;
  start_date: string | null;
  end_date: string | null;
};

type Team = {
  id: string;
  name: string;
  logo_url?: string | null;
  is_active?: boolean;
};

type TournamentTeam = {
  id: string;
  team_id: string;
  seed?: number | null;
  status?: string | null;
  team: Team;
};

type RecentMatch = {
  id: string;
  stage_id: string | null;
  round_number: number | null;
  status: MatchStatus;
  scheduled_at: string | null;
  team1?: { id: string; name: string; logo_url?: string | null } | null;
  team2?: { id: string; name: string; logo_url?: string | null } | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
};

type ApiResponse = {
  tournament: Tournament;
};

type MatchesApiResponse = {
  tournament: { id: string; name: string; slug: string | null } | null;
  stages: Stage[];
  matches: any[];
  pagination: { total: number; limit: number; offset: number };
};

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { req, res } = ctx;

  // --- Auth (same as withStaffPage) ---
  let staff: { id: string | null; role: string; display_name: string | null };
  let tenantId: string;
  try {
    const staffCtx = await requireStaffRoleFromRequest(
      req as any,
      res as any,
      'manager'
    );
    staff = {
      id: staffCtx.staff?.id ?? null,
      role: staffCtx.role ?? 'manager',
      display_name: staffCtx.staff?.display_name ?? null,
    };
    tenantId = staffCtx.tenantId;
  } catch (err: unknown) {
    if (err instanceof StaffUnauthenticatedError) {
      return { redirect: { destination: '/admin/login', permanent: false } };
    }
    if (err instanceof StaffUnauthorizedError) {
      return { redirect: { destination: '/403', permanent: false } };
    }
    return { redirect: { destination: '/500', permanent: false } };
  }

  // --- Validate id ---
  const id = typeof ctx.params?.id === 'string' ? ctx.params.id : '';
  if (!id || !isValidUUID(id)) {
    return { notFound: true };
  }

  if (!supabaseAdmin) {
    return { props: { staff, initialData: null } };
  }

  // --- Fetch all data in parallel ---
  const [tournamentRes, stagesRes, teamsRes, matchesRes, guardsCountsRes] =
    await Promise.all([
      supabaseAdmin
        .from('tournaments')
        .select(
          'id, name, slug, game, status, start_date, end_date, timezone, format_type, max_teams, visibility, is_featured, logo_url, banner_url, created_at, updated_at'
        )
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .maybeSingle(),
      supabaseAdmin
        .from('tournament_stages')
        .select(
          'id, name, stage_type, order_index, is_active, is_public, start_date, end_date'
        )
        .eq('tenant_id', tenantId)
        .eq('tournament_id', id)
        .order('order_index', { ascending: true, nullsFirst: false }),
      supabaseAdmin
        .from('tournament_teams')
        .select(
          'id, tournament_id, team_id, seed, status, created_at, team:teams ( id, name, logo_url )'
        )
        .eq('tenant_id', tenantId)
        .eq('tournament_id', id)
        .order('seed', { ascending: true, nullsFirst: false }),
      supabaseAdmin
        .from('matches')
        .select(
          'id, stage_id, round_number, status, scheduled_at, team1_id, team2_id, team1_score, team2_score, winner_team_id'
        )
        .eq('tenant_id', tenantId)
        .eq('tournament_id', id)
        .order('scheduled_at', { ascending: false, nullsFirst: true })
        .limit(3),
      // Status guards: 3 counts in one Promise.all
      Promise.all([
        supabaseAdmin
          .from('tournament_stages')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('tournament_id', id),
        supabaseAdmin
          .from('tournament_teams')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('tournament_id', id),
        supabaseAdmin
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('tournament_id', id)
          .neq('status', 'cancelled'),
      ]),
    ]);

  if (tournamentRes.error) {
    logger.error('SSR tournament fetch error:', tournamentRes.error);
  }
  const tournament = tournamentRes.data;
  if (!tournament) {
    return { notFound: true };
  }

  // Build status guards
  const [stagesCountRes, teamsCountRes, matchesCountRes] = guardsCountsRes;
  const stagesCount = stagesCountRes.count ?? 0;
  const teamsCount = teamsCountRes.count ?? 0;
  const currentStatus = tournament.status ?? 'draft';

  const STATUS_LABELS_MAP: Record<string, string> = {
    draft: 'Brouillon',
    published: 'Publié',
    running: 'En cours',
    completed: 'Terminé',
    archived: 'Archivé',
  };

  const guards: {
    status: string;
    label: string;
    allowed: boolean;
    reason: string | null;
  }[] = [];
  for (const s of ['draft', 'published', 'running', 'completed', 'archived']) {
    if (s === currentStatus) {
      guards.push({
        status: s,
        label: STATUS_LABELS_MAP[s],
        allowed: false,
        reason: 'Statut actuel',
      });
      continue;
    }
    let allowed = true;
    let reason: string | null = null;
    if (s === 'published' && stagesCount === 0) {
      allowed = false;
      reason = 'Le tournoi doit avoir au moins 1 phase';
    } else if (s === 'running') {
      if (stagesCount === 0) {
        allowed = false;
        reason = 'Le tournoi doit avoir au moins 1 phase';
      } else if (teamsCount === 0) {
        allowed = false;
        reason = 'Le tournoi doit avoir au moins 1 équipe';
      }
    } else if (s === 'completed' && currentStatus !== 'running') {
      allowed = false;
      reason = 'Le tournoi doit être en cours';
    }
    guards.push({ status: s, label: STATUS_LABELS_MAP[s], allowed, reason });
  }

  // Resolve team names for recent matches
  const recentMatches = matchesRes.data || [];
  const teamIdsSet = new Set<string>();
  for (const m of recentMatches) {
    if (m.team1_id) teamIdsSet.add(m.team1_id);
    if (m.team2_id) teamIdsSet.add(m.team2_id);
  }

  let teamNameMap: Record<
    string,
    { id: string; name: string; logo_url: string | null }
  > = {};
  if (teamIdsSet.size > 0) {
    const { data: teamsData } = await supabaseAdmin
      .from('teams')
      .select('id, name, logo_url')
      .eq('tenant_id', tenantId)
      .in('id', Array.from(teamIdsSet));
    for (const t of teamsData || []) {
      teamNameMap[t.id] = t;
    }
  }

  const enrichedMatches = recentMatches.map((m: any) => ({
    id: m.id,
    stage_id: m.stage_id,
    round_number: m.round_number,
    status: m.status,
    scheduled_at: m.scheduled_at,
    team1: m.team1_id ? (teamNameMap[m.team1_id] ?? null) : null,
    team2: m.team2_id ? (teamNameMap[m.team2_id] ?? null) : null,
    team1_score: m.team1_score,
    team2_score: m.team2_score,
    winner_team_id: m.winner_team_id,
  }));

  return {
    props: {
      staff,
      initialData: {
        tournament,
        stages: stagesRes.data || [],
        teams: teamsRes.data || [],
        recentMatches: enrichedMatches,
        statusGuards: guards,
      },
    },
  };
};

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

function statusLabel(status: string | null) {
  switch (status) {
    case 'draft':
      return 'Brouillon';
    case 'published':
      return 'Publié';
    case 'running':
      return 'En cours';
    case 'completed':
      return 'Terminé';
    case 'archived':
      return 'Archivé';
    default:
      return status || 'Inconnu';
  }
}

function statusColor(status: string | null) {
  switch (status) {
    case 'draft':
      return 'bg-neutral-600 text-neutral-100';
    case 'published':
      return 'bg-blue-600 text-white';
    case 'running':
      return 'bg-emerald-600 text-white';
    case 'completed':
      return 'bg-purple-600 text-white';
    case 'archived':
      return 'bg-neutral-700 text-neutral-300';
    default:
      return 'bg-neutral-700 text-neutral-200';
  }
}

function formatLabel(format: string | null) {
  switch (format) {
    case 'single_elim':
      return 'Single Elimination';
    case 'double_elim':
      return 'Double Elimination';
    case 'swiss':
      return 'Swiss';
    case 'round_robin':
      return 'Round Robin';
    case 'showmatch':
      return 'Showmatch';
    default:
      return format || 'Non défini';
  }
}

function stageTypeLabel(t: string | null) {
  switch (t) {
    case 'group':
      return 'Poule';
    case 'bracket':
      return 'Bracket';
    case 'swiss':
      return 'Swiss';
    case 'round_robin':
      return 'Round Robin';
    case 'showmatch':
      return 'Showmatch';
    default:
      return 'Autre';
  }
}

function stageTypeColor(t: string | null) {
  switch (t) {
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

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Brouillon', color: 'bg-neutral-600', icon: '📝' },
  { value: 'published', label: 'Publié', color: 'bg-blue-600', icon: '📢' },
  { value: 'running', label: 'En cours', color: 'bg-emerald-600', icon: '▶️' },
  { value: 'completed', label: 'Terminé', color: 'bg-purple-600', icon: '🏆' },
  { value: 'archived', label: 'Archivé', color: 'bg-neutral-700', icon: '📦' },
];

const STATUS_ORDER: Record<string, number> = {
  draft: 0,
  published: 1,
  running: 2,
  completed: 3,
  archived: 4,
};

const STAGE_TYPE_OPTIONS = [
  { value: 'bracket', label: 'Bracket' },
  { value: 'swiss', label: 'Swiss' },
  { value: 'group', label: 'Poule / Groupe' },
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'showmatch', label: 'Showmatch' },
  { value: 'other', label: 'Autre' },
];

function matchStatusLabel(status: MatchStatus) {
  switch (status) {
    case 'pending':
      return 'A venir';
    case 'ongoing':
      return 'En cours';
    case 'finished':
      return 'Terminé';
    case 'cancelled':
      return 'Annulé';
    default:
      return status;
  }
}

function matchStatusColor(status: MatchStatus) {
  switch (status) {
    case 'pending':
      return 'bg-neutral-600 text-neutral-100';
    case 'ongoing':
      return 'bg-amber-600 text-white';
    case 'finished':
      return 'bg-emerald-600 text-white';
    case 'cancelled':
      return 'bg-red-600 text-white';
    default:
      return 'bg-neutral-600 text-neutral-100';
  }
}

type InitialData = {
  tournament: Tournament;
  stages: Stage[];
  teams: TournamentTeam[];
  recentMatches: RecentMatch[];
  statusGuards: {
    status: string;
    label: string;
    allowed: boolean;
    reason?: string;
  }[];
};

function AdminTournamentPage({
  staff,
  initialData,
}: StaffProps & { initialData: InitialData | null }) {
  const router = useRouter();
  const { id } = router.query;
  const { mutate: mutateIdempotent } = useIdempotentMutation();

  const [loading, setLoading] = useState(!initialData);
  const [tournament, setTournament] = useState<Tournament | null>(
    initialData?.tournament ?? null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const { addToast } = useToast();

  // Stages
  const [stages, setStages] = useState<Stage[]>(initialData?.stages ?? []);
  const [loadingStages, setLoadingStages] = useState(false);

  // Teams
  const [tournamentTeams, setTournamentTeams] = useState<TournamentTeam[]>(
    initialData?.teams ?? []
  );
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [teamSeed, setTeamSeed] = useState<string>('');
  const [addingTeam, setAddingTeam] = useState(false);

  // Status regression confirmation
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [pendingStatusValue, setPendingStatusValue] = useState<string | null>(
    null
  );

  // Remove team confirmation
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [pendingRemoveTeamId, setPendingRemoveTeamId] = useState<string | null>(
    null
  );

  // Bulk team add
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
  const [bulkSelectedTeamIds, setBulkSelectedTeamIds] = useState<Set<string>>(
    new Set()
  );
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [bulkSearchFilter, setBulkSearchFilter] = useState('');

  // New stage modal
  const [showNewStageModal, setShowNewStageModal] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageType, setNewStageType] = useState('bracket');
  const [creatingStage, setCreatingStage] = useState(false);

  // Match stats
  const [matchStats, setMatchStats] = useState<{
    total: number;
    pending: number;
    ongoing: number;
    finished: number;
  } | null>(null);

  // Recent matches
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>(
    initialData?.recentMatches ?? []
  );
  const [loadingMatches, setLoadingMatches] = useState(false);

  // Status guards
  type StatusGuard = {
    status: string;
    label: string;
    allowed: boolean;
    reason?: string;
  };
  const [statusGuards, setStatusGuards] = useState<StatusGuard[]>(
    initialData?.statusGuards ?? []
  );

  // Conflict detection
  type Conflict = {
    type: string;
    team_id: string;
    team_name: string;
    match_a: {
      id: string;
      scheduled_at: string;
      estimated_end: string;
      stage_name: string | null;
      round_number: number | null;
    };
    match_b: {
      id: string;
      scheduled_at: string;
      estimated_end: string;
      stage_name: string | null;
      round_number: number | null;
    };
    overlap_minutes: number;
  };
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [loadingConflicts, setLoadingConflicts] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);

  // Clone
  const [cloning, setCloning] = useState(false);
  const [showCloneConfirm, setShowCloneConfirm] = useState(false);

  // Notify captains
  const [notifyingCaptains, setNotifyingCaptains] = useState(false);

  const notifyCaptains = useCallback(async () => {
    if (!id || notifyingCaptains) return;
    setNotifyingCaptains(true);
    try {
      const res = await fetch('/api/admin/tournaments/notify-captains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast(json.error || 'Echec de la notification', 'error');
        return;
      }
      const errCount = json.errors?.length ?? 0;
      const baseMsg = `${json.notified ?? 0} responsable(s) notifie(s) (${json.emailsSent ?? 0} email(s), ${json.messagesSent ?? 0} message(s)).`;
      if (errCount > 0) {
        addToast(`${baseMsg} ${errCount} erreur(s) — voir /admin/logs.`, 'info');
      } else {
        addToast(baseMsg, 'success');
      }
    } catch (err: unknown) {
      addToast(
        (err as Error)?.message || 'Echec de la notification',
        'error'
      );
    } finally {
      setNotifyingCaptains(false);
    }
  }, [id, notifyingCaptains, addToast]);

  const fetchTournament = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/tournament/${id}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger le tournoi');
      }
      const json: ApiResponse = await res.json();
      setTournament(json.tournament);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchStages = useCallback(async () => {
    if (!id) return;
    setLoadingStages(true);
    try {
      const res = await fetch(`/api/admin/tournament/${id}/stages`);
      if (res.ok) {
        const json = await res.json();
        setStages(json.stages || []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingStages(false);
    }
  }, [id]);

  const fetchTournamentTeams = useCallback(async () => {
    if (!id) return;
    setLoadingTeams(true);
    try {
      const res = await fetch(`/api/admin/tournament/${id}/teams`);
      if (res.ok) {
        const json = await res.json();
        setTournamentTeams(json.teams || []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingTeams(false);
    }
  }, [id]);

  const fetchAllTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/teams?limit=200');
      if (res.ok) {
        const json = await res.json();
        setAllTeams(json.teams || []);
      }
    } catch {
      // Silently fail
    }
  }, []);

  const fetchRecentMatches = useCallback(async () => {
    if (!id) return;
    setLoadingMatches(true);
    try {
      const res = await fetch(
        `/api/admin/tournament/${id}/matches?limit=3&includeTeams=1`
      );
      if (res.ok) {
        const json = await res.json();
        setRecentMatches(json.matches || []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingMatches(false);
    }
  }, [id]);

  const fetchStatusGuards = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/admin/tournament/${id}/status-guards`);
      if (res.ok) {
        const json = await res.json();
        setStatusGuards(json.guards || []);
      }
    } catch {
      // Silently fail
    }
  }, [id]);

  const fetchConflicts = useCallback(async () => {
    if (!id) return;
    setLoadingConflicts(true);
    try {
      const res = await fetch(`/api/admin/tournament/${id}/conflicts`);
      if (res.ok) {
        const json = await res.json();
        setConflicts(json.conflicts || []);
      }
    } catch {
      setConflicts(null);
    } finally {
      setLoadingConflicts(false);
    }
  }, [id]);

  async function handleCloneTournament() {
    if (!id || cloning) return;
    setCloning(true);
    setErrorMsg(null);
    try {
      const res = await mutateIdempotent(`/api/admin/tournament/${id}/clone`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de cloner le tournoi');
      }
      const json = await res.json();
      if (json.tournament?.id) {
        router.push(`/admin/tournament/${json.tournament.id}`);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur lors du clonage');
    } finally {
      setCloning(false);
      setShowCloneConfirm(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    // Skip initial fetch when SSR data is already available
    if (initialData && tournament) return;
    fetchTournament();
    fetchStages();
    fetchTournamentTeams();
    fetchRecentMatches();
    fetchStatusGuards();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateStatus(newStatus: string) {
    if (!id || !tournament) return;
    if (newStatus === tournament.status) return;

    const currentOrder = STATUS_ORDER[tournament.status ?? 'draft'] ?? 0;
    const newOrder = STATUS_ORDER[newStatus] ?? 0;

    if (newOrder < currentOrder) {
      setPendingStatusValue(newStatus);
      setShowStatusConfirm(true);
      return;
    }

    performStatusUpdate(newStatus);
  }

  async function performStatusUpdate(newStatus: string) {
    if (!id || !tournament) return;

    setUpdatingStatus(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/tournament/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Impossible de modifier le statut');
      }

      setTournament(json.tournament);
      addToast(`Statut modifié : ${statusLabel(newStatus)}`, 'success');
      fetchStatusGuards();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleAddTeam() {
    if (!selectedTeamId || !id) return;
    setAddingTeam(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/tournament/${id}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: selectedTeamId,
          seed: teamSeed ? parseInt(teamSeed, 10) : null,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Impossible d'ajouter l'équipe");
      }

      setShowAddTeamModal(false);
      setSelectedTeamId('');
      setTeamSeed('');
      addToast('Équipe ajoutée avec succès', 'success');
      fetchTournamentTeams();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setAddingTeam(false);
    }
  }

  function handleRemoveTeam(tournamentTeamId: string) {
    setPendingRemoveTeamId(tournamentTeamId);
    setShowRemoveConfirm(true);
  }

  async function performRemoveTeam() {
    if (!pendingRemoveTeamId) return;

    try {
      const res = await fetch(
        `/api/admin/tournament/${id}/teams/${pendingRemoveTeamId}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Impossible de retirer l'équipe");
      }

      addToast('Équipe retirée', 'success');
      fetchTournamentTeams();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setShowRemoveConfirm(false);
      setPendingRemoveTeamId(null);
    }
  }

  async function handleBulkAddTeams() {
    if (bulkSelectedTeamIds.size === 0 || !id) return;
    setBulkAdding(true);
    setErrorMsg(null);

    const teamIds = Array.from(bulkSelectedTeamIds);
    setBulkProgress({ done: 0, total: teamIds.length });

    let failCount = 0;
    for (let i = 0; i < teamIds.length; i++) {
      try {
        const res = await fetch(`/api/admin/tournament/${id}/teams`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ team_id: teamIds[i] }),
        });

        if (!res.ok) {
          failCount++;
        }
      } catch {
        failCount++;
      }
      setBulkProgress({ done: i + 1, total: teamIds.length });
    }

    setBulkAdding(false);
    setShowBulkAddModal(false);
    setBulkSelectedTeamIds(new Set());
    setBulkSearchFilter('');

    if (failCount === 0) {
      addToast(`${teamIds.length} équipe(s) ajoutée(s) avec succès`, 'success');
    } else {
      addToast(
        `${teamIds.length - failCount}/${teamIds.length} équipe(s) ajoutée(s) (${failCount} erreur(s))`,
        'success'
      );
    }
    fetchTournamentTeams();
  }

  async function handleCreateStage() {
    if (!newStageName.trim() || !id) return;
    setCreatingStage(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/tournament/${id}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStageName.trim(),
          stage_type: newStageType,
          order_index: stages.length,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de créer la phase');
      }

      setShowNewStageModal(false);
      setNewStageName('');
      setNewStageType('bracket');
      addToast('Phase créée avec succès', 'success');
      fetchStages();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setCreatingStage(false);
    }
  }

  const publicUrl = tournament?.slug
    ? `/tournament/${tournament.slug}`
    : `/tournament/${tournament?.id}`;

  const availableTeamsToAdd = allTeams.filter(
    (t) => !tournamentTeams.some((tt) => tt.team_id === t.id)
  );

  return (
    <>
      <Head>
        <title>{`Admin – Tournoi${tournament ? ` : ${tournament.name}` : ''}`}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        {/* Banner */}
        {tournament?.banner_url && (
          <div className="relative h-48 md:h-64 w-full overflow-hidden">
            <Image
              src={tournament.banner_url}
              alt=""
              fill
              className="object-cover opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-transparent" />
          </div>
        )}

        <div
          className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${
            tournament?.banner_url ? '-mt-24 relative z-10' : 'pt-20'
          } pb-12`}
        >
          {/* Header */}
          <div className="mb-8">
            <Breadcrumb
              items={[
                { label: 'Tournois', href: '/admin/tournaments' },
                { label: tournament?.name || 'Tournoi' },
              ]}
            />
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
              Retour à la liste
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                {tournament?.logo_url && (
                  <Image
                    src={tournament.logo_url}
                    alt={tournament.name}
                    width={64}
                    height={64}
                    className="w-16 h-16 rounded-xl object-cover border-2 border-neutral-700 shadow-lg"
                  />
                )}
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                    {tournament?.name || 'Chargement...'}
                  </h1>
                  {tournament?.slug && (
                    <p className="text-sm text-neutral-400 mt-1 flex items-center gap-2">
                      <span className="font-mono text-xs bg-neutral-800/80 px-2 py-0.5 rounded">
                        /{tournament.slug}
                      </span>
                      <span>•</span>
                      <span>{tournament.game || 'Jeu non spécifié'}</span>
                    </p>
                  )}
                </div>
              </div>

              {tournament && (
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-3 py-1.5 rounded-full text-sm font-semibold ${statusColor(
                      tournament.status
                    )}`}
                  >
                    {statusLabel(tournament.status)}
                  </span>
                  {tournament.visibility === 'public' && (
                    <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                      Public
                    </span>
                  )}
                  {tournament.is_featured && (
                    <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-amber-600/20 text-amber-300 border border-amber-500/30">
                      Mis en avant
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

          {loading && !tournament && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {!loading && !tournament && !errorMsg && (
            <div className="text-center py-20 text-neutral-400">
              Tournoi introuvable.
            </div>
          )}

          {tournament && (
            <div className="space-y-6">
              {/* Quick Actions Bar */}
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/admin/tournament/${tournament.id}/dashboard`}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                  Dashboard
                </Link>
                <Link
                  href={`/admin/tournament/${tournament.id}/edit`}
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
                  Modifier le tournoi
                </Link>
                <Link
                  href={publicUrl}
                  target="_blank"
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
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  Voir la page publique
                </Link>
                <Link
                  href={`/admin/tournament/${tournament.id}/history`}
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
                  Historique
                </Link>
                <Link
                  href={`/admin/tournament/${tournament.id}/discord`}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.078.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.683 12.683 0 0 0-.617-1.249.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.319 13.58.099 18.057a.082.082 0 0 0 .031.056 19.908 19.908 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.21 14.21 0 0 0 1.226-1.994.076.076 0 0 0-.041-.105 13.166 13.166 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.099.246.198.372.291a.077.077 0 0 1-.006.128c-.598.349-1.22.645-1.873.891a.076.076 0 0 0-.04.106c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.418 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.418 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  Discord
                </Link>
                <Link
                  href={`/admin/tournament/${tournament.id}/checkin`}
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
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Check-in
                </Link>
                <Link
                  href={`/admin/tournament/${tournament.id}/podium`}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                      d="M5 3v18h14V3H5zm7 11l3 3-3 3-3-3 3-3z"
                    />
                  </svg>
                  Podium &amp; clôture
                </Link>
                <button
                  type="button"
                  onClick={notifyCaptains}
                  disabled={notifyingCaptains}
                  title="Envoie un email + un message interne au capitaine et aux managers de chaque equipe active"
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {notifyingCaptains ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                      />
                    </svg>
                  )}
                  {notifyingCaptains
                    ? 'Envoi en cours...'
                    : 'Notifier les capitaines'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowConflicts(true);
                    fetchConflicts();
                  }}
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
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  Conflits
                </button>
                <button
                  type="button"
                  onClick={() => setShowCloneConfirm(true)}
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
                  Cloner
                </button>
              </div>

              {/* Main Grid */}
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Left Column - Info & Status */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Tournament Overview Card */}
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
                      Informations
                    </h2>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          Format
                        </div>
                        <div className="font-medium">
                          {formatLabel(tournament.format_type)}
                        </div>
                      </div>

                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          Max équipes
                        </div>
                        <div className="font-medium">
                          {tournament.max_teams ?? '∞'}
                        </div>
                      </div>

                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          Équipes inscrites
                        </div>
                        <div className="font-medium">
                          {tournamentTeams.length}
                          {tournament.max_teams && (
                            <span className="text-neutral-500">
                              {' '}
                              / {tournament.max_teams}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          Date de début
                        </div>
                        <div className="font-medium text-sm">
                          {formatDate(tournament.start_date)}
                        </div>
                      </div>

                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          Date de fin
                        </div>
                        <div className="font-medium text-sm">
                          {formatDate(tournament.end_date)}
                        </div>
                      </div>

                      <div className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                          Phases
                        </div>
                        <div className="font-medium">{stages.length}</div>
                      </div>
                    </div>
                  </section>

                  {/* Status Workflow */}
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
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Workflow du tournoi
                    </h2>

                    {/* Progress bar */}
                    <div className="mb-5">
                      <div className="flex items-center justify-between mb-2">
                        {STATUS_OPTIONS.map((option, idx) => {
                          const currentIdx = STATUS_OPTIONS.findIndex(
                            (o) => o.value === tournament.status
                          );
                          const isCurrent = option.value === tournament.status;
                          const isPast = idx < currentIdx;
                          const guard = statusGuards.find(
                            (g) => g.status === option.value
                          );

                          return (
                            <div
                              key={option.value}
                              className="flex flex-col items-center flex-1"
                            >
                              <div className="relative flex items-center w-full">
                                {idx > 0 && (
                                  <div
                                    className={`absolute left-0 right-1/2 h-0.5 top-1/2 -translate-y-1/2 ${
                                      isPast || isCurrent
                                        ? 'bg-emerald-500'
                                        : 'bg-neutral-700'
                                    }`}
                                  />
                                )}
                                {idx < STATUS_OPTIONS.length - 1 && (
                                  <div
                                    className={`absolute left-1/2 right-0 h-0.5 top-1/2 -translate-y-1/2 ${
                                      isPast
                                        ? 'bg-emerald-500'
                                        : 'bg-neutral-700'
                                    }`}
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (
                                      !isCurrent &&
                                      guard?.allowed !== false
                                    ) {
                                      updateStatus(option.value);
                                    }
                                  }}
                                  disabled={
                                    updatingStatus ||
                                    isCurrent ||
                                    guard?.allowed === false
                                  }
                                  title={
                                    isCurrent
                                      ? 'Statut actuel'
                                      : guard?.allowed === false
                                        ? guard.reason
                                        : `Passer en ${option.label}`
                                  }
                                  className={`relative z-10 mx-auto w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                                    isCurrent
                                      ? `${option.color} border-white/40 text-white ring-2 ring-white/20 shadow-lg scale-110`
                                      : isPast
                                        ? 'bg-emerald-600 border-emerald-400 text-white'
                                        : guard?.allowed === false
                                          ? 'bg-neutral-800 border-neutral-600 text-neutral-500 cursor-not-allowed'
                                          : 'bg-neutral-800 border-neutral-600 text-neutral-400 hover:border-neutral-400 hover:text-white cursor-pointer'
                                  }`}
                                >
                                  {isPast ? (
                                    <svg
                                      className="w-4 h-4"
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  ) : (
                                    <span>{idx + 1}</span>
                                  )}
                                </button>
                              </div>
                              <span
                                className={`text-[10px] mt-1.5 text-center leading-tight ${
                                  isCurrent
                                    ? 'text-white font-semibold'
                                    : 'text-neutral-500'
                                }`}
                              >
                                {option.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Guard warnings */}
                    {statusGuards.filter(
                      (g) =>
                        !g.allowed &&
                        g.status !== tournament.status &&
                        g.reason &&
                        g.reason !== 'Statut actuel'
                    ).length > 0 && (
                      <div className="space-y-1.5 mt-3">
                        {statusGuards
                          .filter(
                            (g) =>
                              !g.allowed &&
                              g.status !== tournament.status &&
                              g.reason &&
                              g.reason !== 'Statut actuel'
                          )
                          .map((g) => (
                            <div
                              key={g.status}
                              className="flex items-start gap-2 text-xs text-amber-300/80 bg-amber-900/20 border border-amber-500/20 rounded-lg px-3 py-2"
                            >
                              <svg
                                className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              <span>
                                <strong>{g.label}</strong> : {g.reason}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}

                    {updatingStatus && (
                      <div className="text-xs text-neutral-400 mt-3 flex items-center gap-2">
                        <div className="w-3 h-3 border border-neutral-500 border-t-white rounded-full animate-spin" />
                        Mise à jour en cours...
                      </div>
                    )}
                  </section>

                  {/* Teams Section */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold flex items-center gap-2">
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
                            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                          />
                        </svg>
                        Équipes ({tournamentTeams.length})
                      </h2>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setShowAddTeamModal(true);
                            fetchAllTeams();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-1.5"
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
                          Ajouter
                        </button>
                        <button
                          onClick={() => {
                            setShowBulkAddModal(true);
                            setBulkSelectedTeamIds(new Set());
                            setBulkSearchFilter('');
                            fetchAllTeams();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-1.5"
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
                              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          Ajouter en masse
                        </button>
                      </div>
                    </div>

                    {loadingTeams ? (
                      <div className="text-neutral-400 text-sm py-4">
                        Chargement...
                      </div>
                    ) : tournamentTeams.length === 0 ? (
                      <div className="text-neutral-400 text-sm py-8 text-center bg-neutral-900/30 rounded-xl">
                        Aucune équipe inscrite
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                        {tournamentTeams
                          .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999))
                          .map((tt) => (
                            <div
                              key={tt.id}
                              className="flex items-center justify-between gap-2 bg-neutral-900/50 rounded-lg px-3 py-2 group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {tt.seed && (
                                  <span className="text-xs text-neutral-500 font-mono w-6">
                                    #{tt.seed}
                                  </span>
                                )}
                                {tt.team?.logo_url && (
                                  <Image
                                    src={tt.team.logo_url}
                                    alt=""
                                    width={24}
                                    height={24}
                                    className="w-6 h-6 rounded object-cover"
                                  />
                                )}
                                <span className="truncate text-sm font-medium">
                                  {tt.team?.name || 'Équipe inconnue'}
                                </span>
                              </div>
                              <button
                                onClick={() => handleRemoveTeam(tt.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/50 text-red-400 transition-all"
                                title="Retirer du tournoi"
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
                            </div>
                          ))}
                      </div>
                    )}
                  </section>

                  {/* Stages Section */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold flex items-center gap-2">
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
                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                          />
                        </svg>
                        Phases ({stages.length})
                      </h2>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowNewStageModal(true)}
                          className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors flex items-center gap-1.5"
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
                          Nouvelle phase
                        </button>
                        <Link
                          href={`/admin/tournament/${tournament.id}/stages`}
                          className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
                        >
                          Gérer
                        </Link>
                      </div>
                    </div>

                    {loadingStages ? (
                      <div className="text-neutral-400 text-sm py-4">
                        Chargement...
                      </div>
                    ) : stages.length === 0 ? (
                      <div className="text-neutral-400 text-sm py-8 text-center bg-neutral-900/30 rounded-xl">
                        Aucune phase créée
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {stages
                          .sort(
                            (a, b) =>
                              (a.order_index ?? 0) - (b.order_index ?? 0)
                          )
                          .map((stage) => (
                            <Link
                              key={stage.id}
                              href={`/admin/stages/${stage.id}`}
                              className="flex items-center justify-between gap-3 bg-neutral-900/50 hover:bg-neutral-900 rounded-xl px-4 py-3 transition-colors group"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-mono text-neutral-500 w-6">
                                  {(stage.order_index ?? 0) + 1}.
                                </span>
                                <div>
                                  <div className="font-medium text-sm group-hover:text-white transition-colors">
                                    {stage.name}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-xs border ${stageTypeColor(
                                        stage.stage_type
                                      )}`}
                                    >
                                      {stageTypeLabel(stage.stage_type)}
                                    </span>
                                    {stage.is_active && (
                                      <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                        Active
                                      </span>
                                    )}
                                    {stage.is_public && (
                                      <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                        Publique
                                      </span>
                                    )}
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
                          ))}
                      </div>
                    )}
                  </section>
                </div>

                {/* Right Column - Quick Links & Tools */}
                <div className="space-y-6">
                  {/* Navigation Card */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">
                      Outils & Gestion
                    </h2>
                    <div className="space-y-2">
                      <Link
                        href={`/admin/tournament/${tournament.id}/matches`}
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
                            <div className="font-medium text-sm">Matches</div>
                            <div className="text-xs text-neutral-500">
                              Scores & planning
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
                        href={`/admin/tournament/${tournament.id}/bracket`}
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
                                d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                              />
                            </svg>
                          </div>
                          <div>
                            <div className="font-medium text-sm">Bracket</div>
                            <div className="text-xs text-neutral-500">
                              Arbre visuel
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
                        href={`/admin/tournament/${tournament.id}/maps`}
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
                                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                              />
                            </svg>
                          </div>
                          <div>
                            <div className="font-medium text-sm">
                              Pool de maps
                            </div>
                            <div className="text-xs text-neutral-500">
                              Maps autorisées
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
                        href={`/admin/tournament/${tournament.id}/stats`}
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
                              Statistiques
                            </div>
                            <div className="text-xs text-neutral-500">
                              Perf & analytics
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

                  {/* Recent Matches */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold flex items-center gap-2">
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
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                        Derniers matches
                      </h2>
                      <Link
                        href={`/admin/tournament/${tournament.id}/matches`}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Voir tout →
                      </Link>
                    </div>

                    {loadingMatches ? (
                      <div className="flex items-center justify-center py-6">
                        <div className="w-5 h-5 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
                      </div>
                    ) : recentMatches.length === 0 ? (
                      <div className="text-neutral-400 text-sm py-6 text-center bg-neutral-900/30 rounded-xl">
                        Aucun match
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {recentMatches.map((match) => (
                          <Link
                            key={match.id}
                            href={`/admin/matches/${match.id}`}
                            className="block bg-neutral-900/50 hover:bg-neutral-900 rounded-xl p-3 transition-colors group"
                          >
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${matchStatusColor(
                                  match.status
                                )}`}
                              >
                                {matchStatusLabel(match.status)}
                              </span>
                              {match.round_number && (
                                <span className="text-[10px] text-neutral-500">
                                  Round {match.round_number}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              {/* Team 1 */}
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {match.team1?.logo_url ? (
                                  <Image
                                    src={match.team1.logo_url}
                                    alt=""
                                    width={24}
                                    height={24}
                                    className="w-6 h-6 rounded object-cover"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded bg-neutral-700 flex items-center justify-center text-[10px] font-semibold">
                                    {(match.team1?.name || 'TBD')
                                      .slice(0, 2)
                                      .toUpperCase()}
                                  </div>
                                )}
                                <span
                                  className={`text-xs font-medium truncate ${
                                    match.winner_team_id === match.team1?.id
                                      ? 'text-emerald-400'
                                      : 'text-neutral-300'
                                  }`}
                                >
                                  {match.team1?.name || 'TBD'}
                                </span>
                              </div>

                              {/* Score */}
                              <div className="text-sm font-bold px-2 py-0.5 bg-neutral-800 rounded">
                                {typeof match.team1_score === 'number' ||
                                typeof match.team2_score === 'number'
                                  ? `${match.team1_score ?? 0} - ${match.team2_score ?? 0}`
                                  : 'vs'}
                              </div>

                              {/* Team 2 */}
                              <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                                <span
                                  className={`text-xs font-medium truncate ${
                                    match.winner_team_id === match.team2?.id
                                      ? 'text-emerald-400'
                                      : 'text-neutral-300'
                                  }`}
                                >
                                  {match.team2?.name || 'TBD'}
                                </span>
                                {match.team2?.logo_url ? (
                                  <Image
                                    src={match.team2.logo_url}
                                    alt=""
                                    width={24}
                                    height={24}
                                    className="w-6 h-6 rounded object-cover"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded bg-neutral-700 flex items-center justify-center text-[10px] font-semibold">
                                    {(match.team2?.name || 'TBD')
                                      .slice(0, 2)
                                      .toUpperCase()}
                                  </div>
                                )}
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Meta Info */}
                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                    <h2 className="text-sm font-semibold text-neutral-400 mb-3">
                      Informations système
                    </h2>
                    <div className="space-y-3 text-sm">
                      <div>
                        <div className="text-xs text-neutral-500 mb-1">
                          ID du tournoi
                        </div>
                        <div className="font-mono text-xs bg-neutral-900 px-3 py-2 rounded-lg border border-neutral-700 break-all">
                          {tournament.id}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 mb-1">
                          Créé le
                        </div>
                        <div className="text-neutral-300">
                          {formatDate(tournament.created_at)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 mb-1">
                          Dernière modification
                        </div>
                        <div className="text-neutral-300">
                          {formatDate(
                            tournament.updated_at || tournament.created_at
                          )}
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

      {/* Add Team Modal */}
      {showAddTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold mb-4">Ajouter une équipe</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Équipe
                </label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sélectionner une équipe...</option>
                  {availableTeamsToAdd.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Seed (optionnel)
                </label>
                <input
                  type="number"
                  value={teamSeed}
                  onChange={(e) => setTeamSeed(e.target.value)}
                  placeholder="1, 2, 3..."
                  min={1}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowAddTeamModal(false);
                  setSelectedTeamId('');
                  setTeamSeed('');
                }}
                className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleAddTeam}
                disabled={!selectedTeamId || addingTeam}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addingTeam ? 'Ajout...' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Regression Confirm Dialog */}
      {showStatusConfirm && pendingStatusValue && (
        <ConfirmDialog
          title="Rétrograder le statut ?"
          subtitle={`Vous allez passer de « ${statusLabel(tournament?.status ?? null)} » à « ${statusLabel(pendingStatusValue)} ». Cette action peut avoir des conséquences sur les données du tournoi.`}
          variant="warning"
          loading={updatingStatus}
          confirmLabel="Rétrograder"
          confirmingLabel="Mise à jour..."
          onCancel={() => {
            setShowStatusConfirm(false);
            setPendingStatusValue(null);
          }}
          onConfirm={() => {
            setShowStatusConfirm(false);
            performStatusUpdate(pendingStatusValue);
            setPendingStatusValue(null);
          }}
        />
      )}

      {/* Remove Team Confirm Dialog */}
      {showRemoveConfirm && pendingRemoveTeamId && (
        <ConfirmDialog
          title="Retirer cette équipe ?"
          subtitle="L'équipe sera retirée du tournoi. Cette action est irréversible."
          variant="danger"
          loading={false}
          confirmLabel="Retirer"
          onCancel={() => {
            setShowRemoveConfirm(false);
            setPendingRemoveTeamId(null);
          }}
          onConfirm={performRemoveTeam}
        />
      )}

      {/* Bulk Add Teams Modal */}
      {showBulkAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-lg font-semibold mb-4">
              Ajouter plusieurs équipes
            </h3>

            {/* Search filter */}
            <input
              type="text"
              value={bulkSearchFilter}
              onChange={(e) => setBulkSearchFilter(e.target.value)}
              placeholder="Rechercher une équipe..."
              className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3 text-sm"
            />

            {/* Select all / deselect all */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-neutral-400">
                {bulkSelectedTeamIds.size} équipe(s) sélectionnée(s)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const filtered = availableTeamsToAdd
                      .filter((t) =>
                        t.name
                          .toLowerCase()
                          .includes(bulkSearchFilter.toLowerCase())
                      )
                      .map((t) => t.id);
                    setBulkSelectedTeamIds(new Set(filtered));
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Tout sélectionner
                </button>
                <button
                  type="button"
                  onClick={() => setBulkSelectedTeamIds(new Set())}
                  className="text-xs text-neutral-400 hover:text-neutral-300 transition-colors"
                >
                  Tout désélectionner
                </button>
              </div>
            </div>

            {/* Team checkbox list */}
            <div className="max-h-64 overflow-y-auto space-y-1 mb-4 border border-neutral-700 rounded-lg p-2">
              {availableTeamsToAdd
                .filter((t) =>
                  t.name.toLowerCase().includes(bulkSearchFilter.toLowerCase())
                )
                .map((team) => (
                  <label
                    key={team.id}
                    className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-neutral-700/50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={bulkSelectedTeamIds.has(team.id)}
                      onChange={(e) => {
                        const next = new Set(bulkSelectedTeamIds);
                        if (e.target.checked) {
                          next.add(team.id);
                        } else {
                          next.delete(team.id);
                        }
                        setBulkSelectedTeamIds(next);
                      }}
                      className="rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                    />
                    {team.logo_url && (
                      <Image
                        src={team.logo_url}
                        alt=""
                        width={20}
                        height={20}
                        className="w-5 h-5 rounded object-cover"
                      />
                    )}
                    <span className="text-sm">{team.name}</span>
                  </label>
                ))}
              {availableTeamsToAdd.filter((t) =>
                t.name.toLowerCase().includes(bulkSearchFilter.toLowerCase())
              ).length === 0 && (
                <div className="text-neutral-500 text-sm text-center py-4">
                  Aucune équipe disponible
                </div>
              )}
            </div>

            {/* Progress indicator */}
            {bulkAdding && (
              <div className="mb-4">
                <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1">
                  <div className="w-3 h-3 border border-neutral-500 border-t-white rounded-full animate-spin" />
                  Ajout en cours... {bulkProgress.done}/{bulkProgress.total}
                </div>
                <div className="w-full bg-neutral-700 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                    style={{
                      width: `${bulkProgress.total > 0 ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowBulkAddModal(false);
                  setBulkSelectedTeamIds(new Set());
                  setBulkSearchFilter('');
                }}
                disabled={bulkAdding}
                className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleBulkAddTeams}
                disabled={bulkSelectedTeamIds.size === 0 || bulkAdding}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkAdding
                  ? `Ajout... (${bulkProgress.done}/${bulkProgress.total})`
                  : `Ajouter ${bulkSelectedTeamIds.size > 0 ? `(${bulkSelectedTeamIds.size})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Stage Modal */}
      {showNewStageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold mb-4">Créer une phase</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Nom de la phase
                </label>
                <input
                  type="text"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  placeholder="Ex: Phase de groupes, Playoffs..."
                  className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Type de phase
                </label>
                <select
                  value={newStageType}
                  onChange={(e) => setNewStageType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {STAGE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowNewStageModal(false);
                  setNewStageName('');
                  setNewStageType('bracket');
                }}
                className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleCreateStage}
                disabled={!newStageName.trim() || creatingStage}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingStage ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clone Confirm Dialog */}
      {showCloneConfirm && (
        <ConfirmDialog
          title="Cloner ce tournoi ?"
          subtitle={`Une copie de « ${tournament?.name ?? ''} » sera créée en mode brouillon, avec les mêmes stages, map pool et settings, mais sans équipes ni résultats.`}
          variant="warning"
          loading={cloning}
          confirmLabel="Cloner"
          confirmingLabel="Clonage..."
          onCancel={() => setShowCloneConfirm(false)}
          onConfirm={handleCloneTournament}
        />
      )}

      {/* Conflicts Modal */}
      {showConflicts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
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
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                Rapport de conflits
              </h3>
              <button
                onClick={() => setShowConflicts(false)}
                className="p-1.5 rounded-lg hover:bg-neutral-700 transition-colors"
              >
                <svg
                  className="w-5 h-5"
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
            </div>

            {loadingConflicts ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : conflicts === null ? (
              <div className="text-neutral-400 text-sm py-8 text-center">
                Erreur lors du chargement des conflits.
              </div>
            ) : conflicts.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <svg
                  className="w-12 h-12 text-emerald-400 mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-emerald-300 font-medium">
                  Aucun conflit détecté
                </p>
                <p className="text-neutral-500 text-xs mt-1">
                  Aucune équipe ne joue deux matchs en même temps.
                </p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 space-y-3 pr-1">
                <div className="text-sm text-amber-300 bg-amber-900/30 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">
                  {conflicts.length} conflit{conflicts.length > 1 ? 's' : ''}{' '}
                  détecté{conflicts.length > 1 ? 's' : ''}
                </div>
                {conflicts.map((c, i) => (
                  <div
                    key={i}
                    className="bg-neutral-900/70 border border-red-500/20 rounded-xl p-4 space-y-2"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-300 border border-red-500/30">
                        Chevauchement {c.overlap_minutes} min
                      </span>
                      <span className="font-medium text-white">
                        {c.team_name}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-neutral-800/50 rounded-lg p-2.5">
                        <div className="text-neutral-500 mb-1">Match A</div>
                        <div className="text-neutral-300">
                          {c.match_a.stage_name && (
                            <span>{c.match_a.stage_name} · </span>
                          )}
                          {c.match_a.round_number && (
                            <span>Round {c.match_a.round_number}</span>
                          )}
                        </div>
                        <div className="text-neutral-400 mt-1">
                          {new Date(c.match_a.scheduled_at).toLocaleString(
                            'fr-FR',
                            { dateStyle: 'short', timeStyle: 'short' }
                          )}
                          {' → '}
                          {new Date(c.match_a.estimated_end).toLocaleTimeString(
                            'fr-FR',
                            { hour: '2-digit', minute: '2-digit' }
                          )}
                        </div>
                      </div>
                      <div className="bg-neutral-800/50 rounded-lg p-2.5">
                        <div className="text-neutral-500 mb-1">Match B</div>
                        <div className="text-neutral-300">
                          {c.match_b.stage_name && (
                            <span>{c.match_b.stage_name} · </span>
                          )}
                          {c.match_b.round_number && (
                            <span>Round {c.match_b.round_number}</span>
                          )}
                        </div>
                        <div className="text-neutral-400 mt-1">
                          {new Date(c.match_b.scheduled_at).toLocaleString(
                            'fr-FR',
                            { dateStyle: 'short', timeStyle: 'short' }
                          )}
                          {' → '}
                          {new Date(c.match_b.estimated_end).toLocaleTimeString(
                            'fr-FR',
                            { hour: '2-digit', minute: '2-digit' }
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-neutral-700">
              <button
                onClick={() => {
                  setShowConflicts(false);
                  setConflicts(null);
                }}
                className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
              >
                Fermer
              </button>
              <button
                onClick={fetchConflicts}
                disabled={loadingConflicts}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loadingConflicts ? 'Analyse...' : 'Re-analyser'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AdminTournamentPage;
