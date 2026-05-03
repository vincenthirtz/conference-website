// pages/player/manage-team.tsx
// Page de gestion d'equipe pour le capitaine

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { supabaseClient } from '@/utils/supabase';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import CopyButton from '@/components/player/CopyButton';

type Member = {
  id: string;
  user_id: string | null;
  role: string | null;
  battle_tag: string | null;
  is_substitute: boolean;
  is_captain?: boolean;
};

type TeamInfo = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  description: string | null;
  is_joinable?: boolean;
};

type JoinRequest = {
  id: string;
  user_id: string;
  status: string;
  comment: string | null;
  payload: {
    user_display_name?: string;
    user_battle_tag?: string;
    desired_role?: string;
  } | null;
  created_at: string;
  user: {
    id: string;
    email: string | null;
    display_name: string | null;
    battle_tag: string | null;
  } | null;
};

export default function ManageTeamPage() {
  const { token, loading: authLoading, ready } = usePlayerSession();
  const [loading, setLoading] = useState(true);

  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [isCaptain, setIsCaptain] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    if (token) return token;
    const { data } = await supabaseClient.auth.getSession();
    return data.session?.access_token ?? null;
  }, [token]);

  const loadData = useCallback(async (accessToken: string) => {
    const [teamRes, requestsRes] = await Promise.all([
      fetch('/api/admin/teams/my', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch('/api/teams/join-requests', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);

    if (teamRes.ok) {
      const data = await teamRes.json();
      setTeam(data.team || null);
      setMembers(data.members || []);
      setIsCaptain(data.isCaptain || false);
      setIsManager(data.isManager || false);
    }

    if (requestsRes.ok) {
      const data = await requestsRes.json();
      setJoinRequests(data.demandes || []);
    }
  }, []);

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    setLoading(true);
    loadData(token)
      .catch(() => {
        if (!cancelled) setError('Erreur de chargement.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, token, loadData]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleToggleJoinable = async () => {
    const t = await getToken();
    if (!t) return;
    setActionLoading('joinable');
    setError(null);
    try {
      const res = await fetch('/api/teams/toggle-joinable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ joinable: !team?.is_joinable }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTeam((prev) =>
        prev ? { ...prev, is_joinable: data.is_joinable } : prev
      );
      showSuccess(
        data.is_joinable ? 'Recrutement ouvert' : 'Recrutement ferme'
      );
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    const t = await getToken();
    if (!t || !team) return;
    setActionLoading(`remove-${memberId}`);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${team.id}/members`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ memberId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      showSuccess('Membre retire');
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateRole = async (memberId: string, role: string) => {
    const t = await getToken();
    if (!t) return;
    setActionLoading(`role-${memberId}`);
    setError(null);
    try {
      const res = await fetch('/api/teams/update-member-role', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ memberId, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId
            ? { ...m, role: data.newRole, is_substitute: data.isSubstitute }
            : m
        )
      );
      showSuccess('Role mis a jour');
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleJoinAction = async (
    demandeId: string,
    action: 'approve' | 'reject'
  ) => {
    const t = await getToken();
    if (!t) return;
    setActionLoading(`join-${demandeId}`);
    setError(null);
    try {
      const res = await fetch('/api/teams/join-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ demandeId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJoinRequests((prev) => prev.filter((r) => r.id !== demandeId));
      if (action === 'approve') {
        await loadData(t);
      }
      showSuccess(action === 'approve' ? 'Joueur accepte' : 'Demande rejetee');
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading || loading) {
    return <PlayerPageSkeleton rows={4} />;
  }

  if (!team || (!isCaptain && !isManager)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-4">Acces refuse</h1>
          <p className="text-gray-400 mb-6">
            Tu dois etre capitaine ou manager d&apos;une equipe pour acceder a
            cette page.
          </p>
          <Link
            href="/player"
            className="inline-block px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 font-semibold transition"
          >
            Retour a mon espace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Gerer {team.name} | OW Women&apos;s Cup</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-3xl mx-auto px-4 py-10 pt-24">
          <Link
            href="/player"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6"
          >
            &larr; Retour a mon espace
          </Link>

          {/* Team header */}
          <div className="flex items-center gap-4 mb-8">
            {team.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={team.logo_url}
                alt={team.name}
                className="w-16 h-16 rounded-full object-cover border border-white/10"
              />
            )}
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{team.name}</h1>
              {team.short_name && (
                <div className="text-sm text-gray-400">{team.short_name}</div>
              )}
            </div>
            <Link
              href={`/team/${team.id}`}
              className="text-sm text-purple-300 hover:text-purple-200"
            >
              Page publique &rarr;
            </Link>
          </div>

          {successMsg && (
            <div className="mb-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {successMsg}
            </div>
          )}

          {error && (
            <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          {/* Recrutement toggle */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Recrutement</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {team.is_joinable
                    ? 'Ton equipe est ouverte aux demandes de joueurs.'
                    : 'Ton equipe est fermee au recrutement.'}
                </p>
              </div>
              <button
                onClick={handleToggleJoinable}
                disabled={actionLoading === 'joinable'}
                className={`relative w-12 h-7 rounded-full transition-colors ${
                  team.is_joinable ? 'bg-emerald-500' : 'bg-gray-600'
                } ${actionLoading === 'joinable' ? 'opacity-50' : ''}`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                    team.is_joinable ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Roster */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">
              Roster ({members.length} membre{members.length > 1 ? 's' : ''})
            </h2>
            <div className="space-y-3">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-gray-500">
                        {(m.battle_tag || '??').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm truncate">
                          {m.battle_tag || 'Inconnu'}
                        </span>
                        {m.battle_tag && (
                          <CopyButton
                            value={m.battle_tag}
                            label="Copier le BattleTag"
                            className="h-5 w-5 shrink-0"
                          />
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {m.is_captain ? (
                          <span className="text-purple-300">Capitaine</span>
                        ) : (
                          m.role || 'player'
                        )}
                      </div>
                    </div>
                  </div>

                  {!m.is_captain && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <select
                        value={m.role || 'player'}
                        onChange={(e) => handleUpdateRole(m.id, e.target.value)}
                        disabled={!!actionLoading}
                        className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-400"
                      >
                        <option value="player">Joueur</option>
                        <option value="substitute">Remplacant</option>
                        <option value="coach">Coach</option>
                      </select>
                      <button
                        onClick={() => handleRemoveMember(m.id)}
                        disabled={actionLoading === `remove-${m.id}`}
                        className="p-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition disabled:opacity-50"
                        title="Retirer"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
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
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Demandes en attente */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <h2 className="text-lg font-semibold mb-4">
              Demandes en attente
              {joinRequests.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">
                  {joinRequests.length}
                </span>
              )}
            </h2>

            {joinRequests.length === 0 ? (
              <p className="text-sm text-gray-500">
                Aucune demande en attente.
              </p>
            ) : (
              <div className="space-y-3">
                {joinRequests.map((req) => {
                  const name =
                    req.user?.display_name ||
                    req.payload?.user_display_name ||
                    req.user?.email?.split('@')[0] ||
                    'Joueur';
                  const btag =
                    req.user?.battle_tag || req.payload?.user_battle_tag;
                  const role = req.payload?.desired_role || 'player';

                  return (
                    <div
                      key={req.id}
                      className="p-4 rounded-xl bg-white/5 border border-white/5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-sm">
                            {name}
                            {btag && (
                              <span className="text-gray-400 font-mono ml-2 text-xs">
                                {btag}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Souhaite rejoindre en tant que{' '}
                            <span className="text-gray-300">{role}</span>
                            {' · '}
                            {new Date(req.created_at).toLocaleDateString()}
                          </div>
                          {req.comment && (
                            <div className="mt-2 text-xs text-gray-400 italic bg-white/5 rounded-lg px-3 py-2">
                              &ldquo;{req.comment}&rdquo;
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleJoinAction(req.id, 'approve')}
                            disabled={actionLoading === `join-${req.id}`}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold transition disabled:opacity-50"
                          >
                            Accepter
                          </button>
                          <button
                            onClick={() => handleJoinAction(req.id, 'reject')}
                            disabled={actionLoading === `join-${req.id}`}
                            className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-semibold transition disabled:opacity-50"
                          >
                            Refuser
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
