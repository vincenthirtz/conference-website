// pages/admin/stages/[stageId].tsx

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
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

type StageType =
  | 'group'
  | 'bracket'
  | 'swiss'
  | 'round_robin'
  | 'showmatch'
  | 'other';

type Stage = {
  id: string;
  tournament_id: string;
  name: string;
  slug: string | null;
  stage_type: StageType | null;
  order_index: number | null;
  is_active: boolean;
  is_public: boolean;
  start_date: string | null;
  end_date: string | null;
  settings: any | null;
  created_at: string;
  updated_at: string | null;
};

type StageApiResponse = {
  stage: Stage;
};

type Tournament = {
  id: string;
  name: string;
  slug: string | null;
  game: string | null;
  logo_url: string | null;
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

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    is_active: false,
    is_public: false,
  });
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    if (!stageId) return;
    fetchStage();
  }, [stageId, fetchStage]);

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
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur lors de la génération Swiss');
    } finally {
      setLoadingActions(false);
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
                  onClick={() => setIsEditing(true)}
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
    </>
  );
}

export default AdminStagePage;
