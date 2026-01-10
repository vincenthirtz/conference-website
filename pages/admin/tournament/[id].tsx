// pages/admin/tournament/[id].tsx

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';

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
  is_public: boolean;
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
  end_at: string | null;
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

type ApiResponse = {
  tournament: Tournament;
};

type MatchesApiResponse = {
  tournament: { id: string; name: string; slug: string | null } | null;
  stages: Stage[];
  matches: any[];
  pagination: { total: number; limit: number; offset: number };
};

export const getServerSideProps = withStaffPage('manager');

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

const STAGE_TYPE_OPTIONS = [
  { value: 'bracket', label: 'Bracket' },
  { value: 'swiss', label: 'Swiss' },
  { value: 'group', label: 'Poule / Groupe' },
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'showmatch', label: 'Showmatch' },
  { value: 'other', label: 'Autre' },
];

function AdminTournamentPage({ staff }: StaffProps) {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Stages
  const [stages, setStages] = useState<Stage[]>([]);
  const [loadingStages, setLoadingStages] = useState(false);

  // Teams
  const [tournamentTeams, setTournamentTeams] = useState<TournamentTeam[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [teamSeed, setTeamSeed] = useState<string>('');
  const [addingTeam, setAddingTeam] = useState(false);

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
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
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

  useEffect(() => {
    if (!id) return;
    fetchTournament();
    fetchStages();
    fetchTournamentTeams();
  }, [id, fetchTournament, fetchStages, fetchTournamentTeams]);

  async function updateStatus(newStatus: string) {
    if (!id || !tournament) return;
    if (newStatus === tournament.status) return;

    setUpdatingStatus(true);
    setErrorMsg(null);
    setSuccessMsg(null);

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
      setSuccessMsg(`Statut modifié : ${statusLabel(newStatus)}`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
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
      setSuccessMsg('Équipe ajoutée avec succès');
      setTimeout(() => setSuccessMsg(null), 3000);
      fetchTournamentTeams();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setAddingTeam(false);
    }
  }

  async function handleRemoveTeam(tournamentTeamId: string) {
    if (!confirm('Retirer cette équipe du tournoi ?')) return;

    try {
      const res = await fetch(`/api/admin/tournament/${id}/teams/${tournamentTeamId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Impossible de retirer l'équipe");
      }

      setSuccessMsg('Équipe retirée');
      setTimeout(() => setSuccessMsg(null), 3000);
      fetchTournamentTeams();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    }
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
      setSuccessMsg('Phase créée avec succès');
      setTimeout(() => setSuccessMsg(null), 3000);
      fetchStages();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
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
        <title>
          Admin – Tournoi {tournament ? `: ${tournament.name}` : ''}
        </title>
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
                  {tournament.is_public && (
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

          {successMsg && (
            <div className="mb-6 rounded-xl bg-emerald-900/40 border border-emerald-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg
                className="w-5 h-5 text-emerald-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              {successMsg}
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

                  {/* Status Control */}
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
                      Statut du tournoi
                    </h2>

                    <div className="flex flex-wrap gap-2">
                      {STATUS_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateStatus(option.value)}
                          disabled={updatingStatus}
                          className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                            tournament.status === option.value
                              ? `${option.color} text-white ring-2 ring-white/20 shadow-lg`
                              : 'bg-neutral-700/50 text-neutral-300 hover:bg-neutral-700 hover:text-white'
                          } ${updatingStatus ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <span>{option.icon}</span>
                          {option.label}
                          {tournament.status === option.value && (
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
                          )}
                        </button>
                      ))}
                    </div>
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
    </>
  );
}

export default AdminTournamentPage;
