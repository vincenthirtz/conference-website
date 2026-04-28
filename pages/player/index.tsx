// pages/player/index.tsx
// Dashboard joueur - page principale pour les utilisateurs connectes

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';
import type { User } from '@supabase/supabase-js';
import ProfileCard from '@/components/player/ProfileCard';
import TeamCard from '@/components/player/TeamCard';
import DemandesHistory from '@/components/player/DemandesHistory';

type TeamInfo = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
} | null;

type Demande = {
  id: string;
  type: 'captain_request' | 'join' | 'leave' | 'other';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
  updated_at?: string;
  processed_at?: string;
  comment?: string | null;
  staff_note?: string | null;
  payload?: {
    team_name?: string;
    existing_team_name?: string;
    message?: string;
  };
  team?: {
    id: string;
    name: string;
  } | null;
};

type PendingScrim = {
  id: string;
  comment: string | null;
  created_at: string;
  payload: {
    from_team_name?: string;
    preferred_date?: string;
  };
  user: {
    display_name: string | null;
  } | null;
};

export default function PlayerDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [team, setTeam] = useState<TeamInfo>(null);
  const [isCaptain, setIsCaptain] = useState(false);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [pendingScrims, setPendingScrims] = useState<PendingScrim[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    const { data } = await supabaseClient.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const loadData = useCallback(async () => {
    const token = await getToken();
    if (!token) return;

    const [teamRes, captainRes, joinRes] = await Promise.all([
      fetch('/api/admin/teams/my', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch('/api/demandes/captain', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch('/api/demandes/join', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    let isCaptainNow = false;

    if (teamRes.ok) {
      const data = await teamRes.json();
      setTeam(data.team || null);
      isCaptainNow = data.isCaptain || false;
      setIsCaptain(isCaptainNow);
    }

    const allDemandes: Demande[] = [];

    if (captainRes.ok) {
      const data = await captainRes.json();
      allDemandes.push(...(data.demandes || []));
    }

    if (joinRes.ok) {
      const data = await joinRes.json();
      allDemandes.push(...(data.demandes || []));
    }

    allDemandes.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    setDemandes(allDemandes);

    // Captain-only: load pending scrims and unread messages
    if (isCaptainNow) {
      const [scrimRes, msgRes] = await Promise.all([
        fetch('/api/teams/scrim-requests', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/player/messages', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (scrimRes.ok) {
        const data = await scrimRes.json();
        setPendingScrims(data.demandes || []);
      }

      if (msgRes.ok) {
        const data = await msgRes.json();
        const total = (data.conversations || []).reduce(
          (sum: number, c: { unreadCount: number }) => sum + c.unreadCount,
          0
        );
        setUnreadMessages(total);
      }
    }
  }, [getToken]);

  useEffect(() => {
    const init = async () => {
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();

        if (!session?.user) {
          router.replace('/admin/login');
          return;
        }

        setUser(session.user);
        await loadData();
      } catch (err: unknown) {
        console.error('[player] load error:', err);
        setError('Erreur lors du chargement de ton profil.');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [router, loadData]);

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.replace('/');
  };

  const handleCancelDemande = async (demandeId: string) => {
    const token = await getToken();
    if (!token) throw new Error('Session expiree.');

    const res = await fetch('/api/demandes/cancel', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ demandeId }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Echec de l'annulation.");

    await loadData();
  };

  const handleLeaveTeam = async () => {
    const token = await getToken();
    if (!token) throw new Error('Session expiree.');

    const res = await fetch('/api/teams/leave', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Echec.');

    setTeam(null);
    setIsCaptain(false);
    await loadData();
  };

  const handleProfileUpdate = async () => {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    if (session?.user) setUser(session.user);
  };

  const pendingCaptainRequest = demandes.find(
    (d) => d.type === 'captain_request' && d.status === 'pending'
  );

  const pendingJoinRequest = demandes.find(
    (d) => d.type === 'join' && d.status === 'pending'
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white flex items-center justify-center">
        <div className="text-sm text-gray-400">Chargement...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const displayName =
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    'Joueur';

  return (
    <>
      <Head>
        <title>Mon espace joueur | OW Women&apos;s Cup</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-4xl mx-auto px-4 py-10 pt-24">
          {/* Header */}
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gradient">
                Bienvenue, {displayName}
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Gere ton profil joueur et ton equipe depuis cet espace.
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm rounded-xl border border-white/15 bg-black/50 hover:border-red-400/50 hover:text-red-300 transition"
            >
              Deconnexion
            </button>
          </div>

          {error && (
            <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <ProfileCard
              user={user}
              displayName={displayName}
              onProfileUpdate={handleProfileUpdate}
            />
            <TeamCard
              team={team}
              isCaptain={isCaptain}
              pendingCaptainRequest={pendingCaptainRequest}
              pendingJoinRequest={pendingJoinRequest}
              onLeaveTeam={handleLeaveTeam}
            />
          </div>

          {/* Actions rapides */}
          {team && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Actions rapides</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {!isCaptain && (
                  <Link
                    href="/player/requests?tab=transfer"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
                  >
                    <svg
                      className="w-5 h-5 text-purple-400 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M16 3h5v5" />
                      <line x1="21" y1="3" x2="14" y2="10" />
                      <path d="M8 21H3v-5" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                    <div>
                      <div className="text-sm font-medium text-white">
                        Demander un transfert
                      </div>
                      <div className="text-xs text-gray-500">
                        Vers une autre equipe
                      </div>
                    </div>
                  </Link>
                )}

                {isCaptain && (
                  <Link
                    href="/player/requests?tab=transfer"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
                  >
                    <svg
                      className="w-5 h-5 text-purple-400 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M16 3h5v5" />
                      <line x1="21" y1="3" x2="14" y2="10" />
                      <path d="M8 21H3v-5" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                    <div>
                      <div className="text-sm font-medium text-white">
                        Proposer un transfert
                      </div>
                      <div className="text-xs text-gray-500">
                        Transferer un joueur
                      </div>
                    </div>
                  </Link>
                )}

                {isCaptain && (
                  <Link
                    href="/player/requests?tab=scrim"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-blue-400/20 bg-blue-500/10 hover:bg-blue-500/20 transition"
                  >
                    <svg
                      className="w-5 h-5 text-blue-400 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polygon points="10 8 16 12 10 16 10 8" />
                    </svg>
                    <div>
                      <div className="text-sm font-medium text-white">
                        Proposer un scrim
                      </div>
                      <div className="text-xs text-gray-500">Match amical</div>
                    </div>
                  </Link>
                )}

                {isCaptain && (
                  <Link
                    href="/player/messages"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 hover:bg-emerald-500/20 transition"
                  >
                    <svg
                      className="w-5 h-5 text-emerald-400 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                    <div>
                      <div className="text-sm font-medium text-white">
                        Messagerie
                        {unreadMessages > 0 && (
                          <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                            {unreadMessages}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        Discuter entre capitaines
                      </div>
                    </div>
                  </Link>
                )}

                {isCaptain && (
                  <Link
                    href="/player/manage-team"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
                  >
                    <svg
                      className="w-5 h-5 text-gray-400 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 00-3-3.87" />
                      <path d="M16 3.13a4 4 0 010 7.75" />
                    </svg>
                    <div>
                      <div className="text-sm font-medium text-white">
                        Gerer l&apos;equipe
                      </div>
                      <div className="text-xs text-gray-500">
                        Roster et demandes
                      </div>
                    </div>
                  </Link>
                )}

                <Link
                  href={`/team/${team.id}`}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
                >
                  <svg
                    className="w-5 h-5 text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  <div>
                    <div className="text-sm font-medium text-white">
                      Page equipe
                    </div>
                    <div className="text-xs text-gray-500">Profil public</div>
                  </div>
                </Link>
              </div>
            </div>
          )}

          {/* Scrims en attente (capitaine) */}
          {isCaptain && pendingScrims.length > 0 && (
            <div className="mt-6 rounded-2xl border border-blue-400/20 bg-blue-500/5 backdrop-blur-xl p-6">
              <h2 className="text-lg font-semibold mb-4">
                Demandes de scrim en attente
                <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-blue-500 text-[10px] font-bold text-white">
                  {pendingScrims.length}
                </span>
              </h2>
              <div className="space-y-3">
                {pendingScrims.map((scrim) => (
                  <div
                    key={scrim.id}
                    className="flex items-center justify-between gap-4 p-4 rounded-xl border border-white/10 bg-black/30"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">
                        {scrim.payload?.from_team_name || 'Equipe inconnue'}
                      </div>
                      {scrim.comment && (
                        <p className="text-xs text-gray-400 mt-1 truncate">
                          {scrim.comment}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                        {scrim.payload?.preferred_date && (
                          <span>
                            Date :{' '}
                            {new Date(
                              scrim.payload.preferred_date
                            ).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                        <span>
                          Recu le{' '}
                          {new Date(scrim.created_at).toLocaleDateString(
                            'fr-FR'
                          )}
                        </span>
                      </div>
                    </div>
                    <Link
                      href="/player/manage-team"
                      className="flex-shrink-0 px-3 py-2 rounded-lg bg-blue-500/20 border border-blue-400/30 text-xs font-medium text-blue-200 hover:bg-blue-500/30 transition"
                    >
                      Repondre
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DemandesHistory demandes={demandes} onCancel={handleCancelDemande} />

          {/* Liens utiles */}
          <div className="mt-8 flex flex-wrap gap-4 text-sm">
            <Link href="/" className="text-gray-400 hover:text-white">
              &larr; Retour au site
            </Link>
            <Link
              href="/tournaments"
              className="text-purple-300 hover:text-purple-200"
            >
              Voir les tournois
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
