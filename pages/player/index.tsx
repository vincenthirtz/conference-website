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

export default function PlayerDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [team, setTeam] = useState<TeamInfo>(null);
  const [isCaptain, setIsCaptain] = useState(false);
  const [demandes, setDemandes] = useState<Demande[]>([]);
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

    if (teamRes.ok) {
      const data = await teamRes.json();
      setTeam(data.team || null);
      setIsCaptain(data.isCaptain || false);
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
    if (!res.ok) throw new Error(data.error || 'Echec de l\'annulation.');

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
    const { data: { session } } = await supabaseClient.auth.getSession();
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

          <DemandesHistory
            demandes={demandes}
            onCancel={handleCancelDemande}
          />

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
