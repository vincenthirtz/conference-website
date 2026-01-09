// pages/player/index.tsx
// Dashboard joueur - page principale pour les utilisateurs connectés

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';
import type { User } from '@supabase/supabase-js';

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
  payload?: {
    team_name?: string;
    existing_team_name?: string;
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

  useEffect(() => {
    const loadData = async () => {
      try {
        // 1) Vérifier la session
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();

        if (!session?.user) {
          router.replace('/register');
          return;
        }

        setUser(session.user);
        const token = session.access_token;

        // 2) Charger les infos d'équipe (si membre)
        const teamRes = await fetch('/api/admin/teams/my', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (teamRes.ok) {
          const teamData = await teamRes.json();
          setTeam(teamData.team || null);
          setIsCaptain(teamData.isCaptain || false);
        }

        // 3) Charger les demandes (capitaine + join)
        const [captainRes, joinRes] = await Promise.all([
          fetch('/api/demandes/captain', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/demandes/join', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const allDemandes: Demande[] = [];

        if (captainRes.ok) {
          const captainData = await captainRes.json();
          allDemandes.push(...(captainData.demandes || []));
        }

        if (joinRes.ok) {
          const joinData = await joinRes.json();
          allDemandes.push(...(joinData.demandes || []));
        }

        // Trier par date decroissante
        allDemandes.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setDemandes(allDemandes);
      } catch (err: any) {
        console.error('[player] load error:', err);
        setError('Erreur lors du chargement de ton profil.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [router]);

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.replace('/');
  };

  const pendingCaptainRequest = demandes.find(
    (d) => d.type === 'captain_request' && d.status === 'pending'
  );

  const pendingJoinRequest = demandes.find(
    (d) => d.type === 'join' && d.status === 'pending'
  );

  const hasPendingRequest = pendingCaptainRequest || pendingJoinRequest;

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
                Gère ton profil joueur et ton équipe depuis cet espace.
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm rounded-xl border border-white/15 bg-black/50 hover:border-red-400/50 hover:text-red-300 transition"
            >
              Déconnexion
            </button>
          </div>

          {error && (
            <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {/* Carte Profil */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Mon profil</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Email</span>
                  <span>{user.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Nom affiché</span>
                  <span>{displayName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Rôle</span>
                  <span className="capitalize">
                    {user.user_metadata?.role || 'player'}
                  </span>
                </div>
                {user.user_metadata?.battle_tag && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">BattleTag</span>
                    <span className="font-mono">
                      {user.user_metadata.battle_tag}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Carte Équipe */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Mon équipe</h2>

              {team ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {team.logo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={team.logo_url}
                        alt={team.name}
                        className="w-12 h-12 rounded-full object-cover border border-white/10"
                      />
                    )}
                    <div>
                      <div className="font-semibold">{team.name}</div>
                      {team.short_name && (
                        <div className="text-xs text-gray-400">
                          {team.short_name}
                        </div>
                      )}
                    </div>
                  </div>

                  {isCaptain && (
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30 text-xs text-purple-200">
                      <span>Capitaine</span>
                    </div>
                  )}

                  {isCaptain && (
                    <Link
                      href="/admin/teams/my"
                      className="block w-full text-center px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold transition"
                    >
                      Gerer mon equipe
                    </Link>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-400">
                  <p className="mb-4">
                    Tu n&apos;es pas encore membre d&apos;une equipe.
                  </p>

                  {/* Demande en attente */}
                  {hasPendingRequest && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-4">
                      <div className="text-amber-200 font-medium mb-1">
                        {pendingCaptainRequest
                          ? 'Demande de capitaine en attente'
                          : 'Demande en attente'}
                      </div>
                      <div className="text-xs text-amber-300/70">
                        {pendingCaptainRequest ? (
                          <>
                            Equipe :{' '}
                            {pendingCaptainRequest.payload?.team_name ||
                              pendingCaptainRequest.payload?.existing_team_name ||
                              '—'}
                          </>
                        ) : pendingJoinRequest ? (
                          <>
                            Rejoindre :{' '}
                            {pendingJoinRequest.team?.name ||
                              pendingJoinRequest.payload?.team_name ||
                              '—'}
                          </>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Envoyee le{' '}
                        {new Date(
                          (pendingCaptainRequest || pendingJoinRequest)!.created_at
                        ).toLocaleDateString()}
                      </div>
                    </div>
                  )}

                  {/* Boutons d'action si pas de demande en attente */}
                  {!hasPendingRequest && (
                    <div className="space-y-3">
                      <Link
                        href="/player/join-team"
                        className="block w-full text-center px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white text-sm font-semibold transition"
                      >
                        Rejoindre une equipe
                      </Link>
                      <Link
                        href="/player/request-captain"
                        className="block w-full text-center px-4 py-3 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition"
                      >
                        Creer ma propre equipe
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Historique des demandes */}
          {demandes.length > 0 && (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
              <h2 className="text-lg font-semibold mb-4">
                Historique des demandes
              </h2>
              <div className="space-y-3">
                {demandes.map((d) => {
                  const teamName =
                    d.team?.name ||
                    d.payload?.team_name ||
                    d.payload?.existing_team_name ||
                    null;

                  const typeLabel =
                    d.type === 'captain_request'
                      ? 'Demande de capitaine'
                      : d.type === 'join'
                        ? 'Rejoindre une equipe'
                        : d.type === 'leave'
                          ? 'Quitter l\'equipe'
                          : 'Demande';

                  return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between text-sm border-b border-white/5 pb-3 last:border-0"
                    >
                      <div>
                        <span className="font-medium">{typeLabel}</span>
                        {teamName && (
                          <span className="text-gray-400 ml-2">
                            ({teamName})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            d.status === 'pending'
                              ? 'bg-amber-500/20 text-amber-300'
                              : d.status === 'approved'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : d.status === 'rejected'
                                  ? 'bg-red-500/20 text-red-300'
                                  : 'bg-gray-500/20 text-gray-300'
                          }`}
                        >
                          {d.status === 'pending'
                            ? 'En attente'
                            : d.status === 'approved'
                              ? 'Approuvee'
                              : d.status === 'rejected'
                                ? 'Refusee'
                                : 'Annulee'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(d.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Liens utiles */}
          <div className="mt-8 flex flex-wrap gap-4 text-sm">
            <Link href="/" className="text-gray-400 hover:text-white">
              ← Retour au site
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
