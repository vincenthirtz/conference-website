// pages/player/join-team.tsx
// Page pour demander a rejoindre une equipe existante (sans etre capitaine)

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';
import type { User } from '@supabase/supabase-js';

type Team = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  member_count?: number;
  is_joinable?: boolean;
};

export default function JoinTeamPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Equipes
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamSearch, setTeamSearch] = useState('');

  // Role souhaite
  const [desiredRole, setDesiredRole] = useState<'player' | 'substitute'>('player');

  // Message et etats
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successTeamName, setSuccessTeamName] = useState('');

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();

        if (!session?.user) {
          router.replace('/register');
          return;
        }

        setUser(session.user);
        setToken(session.access_token);

        // Verifier s'il y a deja une demande en attente
        const res = await fetch('/api/demandes/join', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.ok) {
          const data = await res.json();
          const pending = data.demandes?.find(
            (d: any) => d.status === 'pending'
          );
          if (pending) {
            // Rediriger vers player avec un message
            router.replace('/player');
            return;
          }
        }

        // Charger les equipes
        await loadTeams();
      } catch (err) {
        console.error('[join-team] auth error:', err);
        setError('Erreur de connexion.');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  const loadTeams = async (search?: string) => {
    setTeamsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search?.trim()) {
        params.set('search', search.trim());
      }
      params.set('limit', '50');
      params.set('joinable', '1');
      const res = await fetch(`/api/teams?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams || []);
      }
    } catch (err) {
      console.error('[join-team] load teams error:', err);
    } finally {
      setTeamsLoading(false);
    }
  };

  const handleTeamSearchChange = (value: string) => {
    setTeamSearch(value);
    // Debounce la recherche
    const timeout = setTimeout(() => {
      loadTeams(value);
    }, 300);
    return () => clearTimeout(timeout);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedTeamId) {
      setError('Selectionne une equipe a rejoindre.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/demandes/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          teamId: selectedTeamId,
          message: message.trim() || undefined,
          desiredRole,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Impossible de creer la demande.');
      }

      const team = teams.find((t) => t.id === selectedTeamId);
      setSuccessTeamName(team?.name || 'l\'equipe selectionnee');
      setSuccess(true);
    } catch (err: unknown) {
      setError((err as Error).message || 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

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

  if (success) {
    return (
      <>
        <Head>
          <title>Demande envoyee | OW Women&apos;s Cup</title>
        </Head>

        <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white flex items-center justify-center px-4">
          <div className="max-w-md text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-4">Demande envoyee</h1>
            <p className="text-gray-400 mb-6">
              Ta demande pour rejoindre &quot;{successTeamName}&quot; a bien ete
              envoyee. Le capitaine de l&apos;equipe la validera prochainement.
            </p>
            <Link
              href="/player"
              className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-semibold transition"
            >
              Retour a mon espace
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Rejoindre une equipe | OW Women&apos;s Cup</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-2xl mx-auto px-4 py-10 pt-24">
          <Link
            href="/player"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6"
          >
            ← Retour a mon espace
          </Link>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <h1 className="text-2xl font-bold mb-2">Rejoindre une equipe</h1>
            <p className="text-gray-400 text-sm mb-6">
              Recherche et selectionne l&apos;equipe que tu souhaites rejoindre.
              Le capitaine de l&apos;equipe validera ta demande.
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Recherche d'equipe */}
              <div>
                <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
                  Rechercher une equipe
                </label>
                <input
                  type="text"
                  value={teamSearch}
                  onChange={(e) => handleTeamSearchChange(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 mb-3"
                  placeholder="Rechercher par nom..."
                />

                <div className="max-h-72 overflow-y-auto space-y-2 rounded-xl border border-white/10 bg-black/40 p-2">
                  {teamsLoading && (
                    <div className="text-sm text-gray-500 text-center py-4">
                      Chargement...
                    </div>
                  )}

                  {!teamsLoading && teams.length === 0 && (
                    <div className="text-sm text-gray-500 text-center py-4">
                      Aucune equipe ouverte au recrutement pour le moment
                    </div>
                  )}

                  {!teamsLoading &&
                    teams.map((team) => (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => setSelectedTeamId(team.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition ${
                          selectedTeamId === team.id
                            ? 'bg-purple-600/30 border border-purple-400/50'
                            : 'bg-white/5 border border-transparent hover:bg-white/10'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {team.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={team.logo_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-xs text-gray-500">
                              {(team.short_name || team.name)
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white truncate">
                            {team.name}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            {team.short_name && <span>{team.short_name}</span>}
                            {team.country && (
                              <>
                                {team.short_name && <span>·</span>}
                                <span>{team.country}</span>
                              </>
                            )}
                            {typeof team.member_count === 'number' && (
                              <>
                                {(team.short_name || team.country) && <span>·</span>}
                                <span>{team.member_count}/5 membres</span>
                              </>
                            )}
                          </div>
                        </div>
                        {selectedTeamId === team.id && (
                          <svg
                            className="w-5 h-5 text-purple-400 flex-shrink-0"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </button>
                    ))}
                </div>
              </div>

              {/* Role souhaite */}
              <div>
                <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
                  Role souhaite
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDesiredRole('player')}
                    className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition border ${
                      desiredRole === 'player'
                        ? 'bg-purple-600/30 border-purple-400/50 text-white'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    Joueur
                  </button>
                  <button
                    type="button"
                    onClick={() => setDesiredRole('substitute')}
                    className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition border ${
                      desiredRole === 'substitute'
                        ? 'bg-purple-600/30 border-purple-400/50 text-white'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    Remplacant (sub)
                  </button>
                </div>
              </div>

              {/* Message optionnel */}
              <div>
                <label
                  htmlFor="message"
                  className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                >
                  Message au capitaine (optionnel)
                </label>
                <textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 transition resize-none"
                  placeholder="Presente-toi brievement au capitaine..."
                  maxLength={500}
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !selectedTeamId}
                className={`w-full px-4 py-3 rounded-xl font-semibold transition ${
                  submitting || !selectedTeamId
                    ? 'bg-gray-600 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400'
                }`}
              >
                {submitting ? 'Envoi en cours...' : 'Envoyer ma demande'}
              </button>
            </form>
          </div>

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>
              Tu veux creer ta propre equipe ?{' '}
              <Link
                href="/player/request-captain"
                className="text-purple-400 hover:text-purple-300"
              >
                Devenir capitaine
              </Link>
            </p>
          </div>
        </main>
      </div>
    </>
  );
}
