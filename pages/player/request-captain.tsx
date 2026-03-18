// pages/player/request-captain.tsx
// Page pour demander à devenir capitaine d'une équipe (existante ou nouvelle)

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';
import type { User } from '@supabase/supabase-js';
import ExistingTeamSelector from '@/components/player/ExistingTeamSelector';
import NewTeamForm from '@/components/player/NewTeamForm';

type Team = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type TeamMember = {
  email: string;
  battleTag: string;
  displayName: string;
};

export default function RequestCaptainPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Mode de sélection
  const [mode, setMode] = useState<'existing' | 'new'>('new');

  // Équipes existantes
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamSearch, setTeamSearch] = useState('');

  // Nouvelle équipe
  const [teamName, setTeamName] = useState('');

  // Membres (pour nouvelle équipe)
  const [members, setMembers] = useState<TeamMember[]>([]);

  // Message et états
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

        const res = await fetch('/api/demandes/captain', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.ok) {
          const data = await res.json();
          const pending = data.demandes?.find(
            (d: any) => d.status === 'pending'
          );
          if (pending) {
            router.replace('/player');
            return;
          }
        }

        await loadTeams();
      } catch (err) {
        console.error('[request-captain] auth error:', err);
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
      const res = await fetch(`/api/teams?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams || []);
      }
    } catch (err) {
      console.error('[request-captain] load teams error:', err);
    } finally {
      setTeamsLoading(false);
    }
  };

  const handleTeamSearchChange = (value: string) => {
    setTeamSearch(value);
    const timeout = setTimeout(() => {
      loadTeams(value);
    }, 300);
    return () => clearTimeout(timeout);
  };

  const addMember = () => {
    if (members.length >= 5) return;
    setMembers([...members, { email: '', battleTag: '', displayName: '' }]);
  };

  const updateMember = (
    index: number,
    field: keyof TeamMember,
    value: string
  ) => {
    const updated = [...members];
    updated[index][field] = value;
    setMembers(updated);
  };

  const removeMember = (index: number) => {
    setMembers(members.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'existing') {
      if (!selectedTeamId) {
        setError('Sélectionne une équipe.');
        return;
      }
    } else {
      if (!teamName.trim()) {
        setError("Le nom de l'équipe est requis.");
        return;
      }
      if (teamName.trim().length < 2) {
        setError("Le nom de l'équipe doit contenir au moins 2 caractères.");
        return;
      }
    }

    const validMembers = members.filter((m) => m.email.trim());
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const m of validMembers) {
      if (!emailRegex.test(m.email.trim())) {
        setError(`Email invalide : ${m.email}`);
        return;
      }
    }

    setSubmitting(true);

    try {
      const body: any = {
        message: message.trim() || undefined,
      };

      if (mode === 'existing') {
        body.existingTeamId = selectedTeamId;
      } else {
        body.teamName = teamName.trim();
        if (validMembers.length > 0) {
          body.members = validMembers.map((m) => ({
            email: m.email.trim(),
            battleTag: m.battleTag.trim() || undefined,
            displayName: m.displayName.trim() || undefined,
          }));
        }
      }

      const res = await fetch('/api/demandes/captain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Impossible de créer la demande.');
      }

      if (mode === 'existing') {
        const team = teams.find((t) => t.id === selectedTeamId);
        setSuccessTeamName(team?.name || "l'équipe sélectionnée");
      } else {
        setSuccessTeamName(teamName.trim());
      }

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
              Ta demande pour devenir capitaine de &quot;{successTeamName}&quot;
              a bien ete envoyee. Un admin la validera prochainement.
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
        <title>Devenir capitaine | OW Women&apos;s Cup</title>
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
            <h1 className="text-2xl font-bold mb-2">
              Devenir capitaine d&apos;equipe
            </h1>
            <p className="text-gray-400 text-sm mb-6">
              Choisis une equipe existante ou cree-en une nouvelle. Un admin
              validera ta demande.
            </p>

            {/* Toggle mode */}
            <div className="flex gap-2 mb-6">
              <button
                type="button"
                onClick={() => setMode('new')}
                className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  mode === 'new'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                Creer une equipe
              </button>
              <button
                type="button"
                onClick={() => setMode('existing')}
                className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  mode === 'existing'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                Equipe existante
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {mode === 'existing' && (
                <ExistingTeamSelector
                  teams={teams}
                  teamsLoading={teamsLoading}
                  selectedTeamId={selectedTeamId}
                  teamSearch={teamSearch}
                  onTeamSearchChange={handleTeamSearchChange}
                  onSelectTeam={setSelectedTeamId}
                />
              )}

              {mode === 'new' && (
                <NewTeamForm
                  teamName={teamName}
                  onTeamNameChange={setTeamName}
                  members={members}
                  onAddMember={addMember}
                  onUpdateMember={updateMember}
                  onRemoveMember={removeMember}
                />
              )}

              {/* Message */}
              <div>
                <label
                  htmlFor="message"
                  className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                >
                  Message (optionnel)
                </label>
                <textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 transition resize-none"
                  placeholder="Informations complementaires pour les admins..."
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
                disabled={submitting}
                className={`w-full px-4 py-3 rounded-xl font-semibold transition ${
                  submitting
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
              En devenant capitaine, tu pourras gerer les membres de ton equipe
              et l&apos;inscrire aux tournois.
            </p>
          </div>
        </main>
      </div>
    </>
  );
}
