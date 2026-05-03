// pages/player/requests.tsx
// Page pour demander un transfert de joueur ou un scrim contre une autre equipe

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';

import { logger } from '../../utils/logger';
type Tab = 'transfer' | 'scrim';

type Team = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  member_count?: number;
  is_joinable?: boolean;
};

export default function PlayerRequestsPage() {
  const router = useRouter();
  const { user, token, loading: authLoading, ready } = usePlayerSession();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('transfer');

  // Contexte joueur
  const [hasTeam, setHasTeam] = useState(false);
  const [isCaptain, setIsCaptain] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);

  // Equipes
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamSearch, setTeamSearch] = useState('');

  // Transfert
  const [desiredRole, setDesiredRole] = useState<
    'player' | 'substitute' | 'coach'
  >('player');
  const [transferMode, setTransferMode] = useState<'self' | 'propose'>('self');
  const [teamMembers, setTeamMembers] = useState<
    {
      user_id: string;
      role: string;
      battle_tag: string | null;
      display_name?: string;
    }[]
  >([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');

  // Scrim
  const [preferredDate, setPreferredDate] = useState('');

  // Commun
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !token || !user) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const teamRes = await fetch('/api/admin/teams/my', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (teamRes.ok) {
          const data = await teamRes.json();
          if (data.team && !cancelled) {
            setHasTeam(true);
            setMyTeamId(data.team.id);
            setIsCaptain(data.isCaptain || false);
            setIsManager(data.isManager || false);
            if (data.isCaptain || data.isManager) {
              setTeamMembers(
                (data.members || []).filter(
                  (m: { user_id: string }) => m.user_id !== user.id
                )
              );
            }
          }
        }

        const urlTab = router.query.tab;
        if (urlTab === 'scrim' && !cancelled) setTab('scrim');

        await loadTeams();
      } catch (err) {
        logger.error('[requests] auth error:', err);
        if (!cancelled) setError('Erreur de connexion.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, token, user, router.query.tab]);

  const loadTeams = async (search?: string) => {
    setTeamsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search?.trim()) params.set('search', search.trim());
      params.set('limit', '50');
      const res = await fetch(`/api/teams?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams || []);
      }
    } catch (err) {
      logger.error('[requests] load teams error:', err);
    } finally {
      setTeamsLoading(false);
    }
  };

  const handleTeamSearchChange = (value: string) => {
    setTeamSearch(value);
    const timeout = setTimeout(() => loadTeams(value), 300);
    return () => clearTimeout(timeout);
  };

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    setSelectedTeamId('');
    setSelectedPlayerId('');
    setTransferMode('self');
    setMessage('');
    setError(null);
    setSuccess(null);
  };

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedTeamId) {
      setError('Selectionne une equipe cible.');
      return;
    }

    if (transferMode === 'propose' && !selectedPlayerId) {
      setError('Selectionne un joueur a transferer.');
      return;
    }

    setSubmitting(true);
    try {
      const bodyData: Record<string, unknown> = {
        teamId: selectedTeamId,
        message: message.trim() || undefined,
        desiredRole,
      };

      if (transferMode === 'propose') {
        bodyData.targetPlayerId = selectedPlayerId;
      }

      const res = await fetch('/api/demandes/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(bodyData),
      });

      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || 'Impossible de creer la demande.');

      const team = teams.find((t) => t.id === selectedTeamId);
      if (transferMode === 'propose') {
        const player = teamMembers.find((m) => m.user_id === selectedPlayerId);
        const playerName =
          player?.display_name || player?.battle_tag || 'le joueur';
        setSuccess(
          `La proposition de transfert de ${playerName} vers "${team?.name || "l'equipe"}" a ete envoyee.`
        );
      } else {
        setSuccess(
          `Ta demande de transfert vers "${team?.name || "l'equipe"}" a ete envoyee. Le capitaine de l'equipe cible la validera.`
        );
      }
      setSelectedTeamId('');
      setSelectedPlayerId('');
      setMessage('');
    } catch (err: unknown) {
      setError((err as Error).message || 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitScrim = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedTeamId) {
      setError('Selectionne une equipe adverse.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/demandes/scrim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          teamId: selectedTeamId,
          message: message.trim() || undefined,
          preferredDate: preferredDate || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || 'Impossible de creer la demande.');

      const team = teams.find((t) => t.id === selectedTeamId);
      setSuccess(
        `Ta demande de scrim contre "${team?.name || "l'equipe"}" a ete envoyee.`
      );
      setSelectedTeamId('');
      setMessage('');
      setPreferredDate('');
    } catch (err: unknown) {
      setError((err as Error).message || 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtrer les equipes : exclure sa propre equipe
  const filteredTeams = teams.filter((t) => t.id !== myTeamId);
  // Pour le transfert, ne montrer que les equipes rejoignables
  const transferTeams = filteredTeams.filter((t) => t.is_joinable);

  const displayTeams = tab === 'transfer' ? transferTeams : filteredTeams;

  if (authLoading || loading) {
    return <PlayerPageSkeleton rows={3} />;
  }

  if (!user) return null;

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
            <p className="text-gray-400 mb-6">{success}</p>
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
        <title>Demandes | OW Women&apos;s Cup</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-2xl mx-auto px-4 py-10 pt-24">
          <Link
            href="/player"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6"
          >
            &larr; Retour a mon espace
          </Link>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <h1 className="text-2xl font-bold mb-2">Demandes</h1>
            <p className="text-gray-400 text-sm mb-6">
              Demande un transfert vers une autre equipe ou propose un scrim.
            </p>

            {/* Onglets */}
            <div className="flex gap-2 mb-6">
              <button
                type="button"
                onClick={() => handleTabChange('transfer')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition border ${
                  tab === 'transfer'
                    ? 'bg-purple-600/30 border-purple-400/50 text-white'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                }`}
              >
                <svg
                  className="w-4 h-4"
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
                Transfert
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('scrim')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition border ${
                  tab === 'scrim'
                    ? 'bg-blue-600/30 border-blue-400/50 text-white'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                }`}
              >
                <svg
                  className="w-4 h-4"
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
                Scrim
              </button>
            </div>

            {/* Contenu transfert */}
            {tab === 'transfer' && (
              <>
                {!hasTeam ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
                    <p className="font-semibold mb-1">Pas d&apos;equipe</p>
                    <p>
                      Tu dois etre membre d&apos;une equipe pour demander un
                      transfert.{' '}
                      <Link
                        href="/player/join-team"
                        className="text-purple-300 hover:text-purple-200 underline"
                      >
                        Rejoindre une equipe
                      </Link>
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Mode toggle pour les capitaines/managers */}
                    {(isCaptain || isManager) && (
                      <div className="flex gap-2 mb-6">
                        <button
                          type="button"
                          onClick={() => {
                            setTransferMode('propose');
                            setSelectedTeamId('');
                            setSelectedPlayerId('');
                            setError(null);
                          }}
                          className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition border ${
                            transferMode === 'propose'
                              ? 'bg-purple-600/30 border-purple-400/50 text-white'
                              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                          }`}
                        >
                          Proposer un transfert
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTransferMode('self');
                            setSelectedTeamId('');
                            setSelectedPlayerId('');
                            setError(null);
                          }}
                          className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition border ${
                            transferMode === 'self'
                              ? 'bg-purple-600/30 border-purple-400/50 text-white'
                              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                          }`}
                        >
                          Mon transfert
                        </button>
                      </div>
                    )}

                    {/* Capitaine : mode "mon transfert" bloque */}
                    {isCaptain && transferMode === 'self' && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
                        <p className="font-semibold mb-1">Capitaine</p>
                        <p>
                          En tant que capitaine, tu dois d&apos;abord transferer
                          le role de capitaine avant de pouvoir demander ton
                          propre transfert.
                        </p>
                      </div>
                    )}

                    {/* Mode "proposer un transfert" (capitaine ou manager) */}
                    {(isCaptain || isManager) && transferMode === 'propose' && (
                      <form
                        onSubmit={handleSubmitTransfer}
                        className="space-y-6"
                      >
                        <div>
                          <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
                            Joueur a transferer
                          </label>
                          <div className="max-h-48 overflow-y-auto space-y-2 rounded-xl border border-white/10 bg-black/40 p-2">
                            {teamMembers.length === 0 && (
                              <div className="text-sm text-gray-500 text-center py-4">
                                Aucun joueur dans ton equipe
                              </div>
                            )}
                            {teamMembers.map((m) => (
                              <button
                                key={m.user_id}
                                type="button"
                                onClick={() => setSelectedPlayerId(m.user_id)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition ${
                                  selectedPlayerId === m.user_id
                                    ? 'bg-purple-600/30 border border-purple-400/50'
                                    : 'bg-white/5 border border-transparent hover:bg-white/10'
                                }`}
                              >
                                <div className="w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center flex-shrink-0">
                                  <span className="text-xs text-gray-400">
                                    {(m.display_name || m.battle_tag || '?')
                                      .slice(0, 2)
                                      .toUpperCase()}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-white text-sm truncate">
                                    {m.display_name || m.battle_tag || 'Joueur'}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    {m.role === 'substitute'
                                      ? 'Remplacant'
                                      : m.role === 'coach'
                                        ? 'Coach'
                                        : 'Joueur'}
                                    {m.battle_tag && ` \u00b7 ${m.battle_tag}`}
                                  </div>
                                </div>
                                {selectedPlayerId === m.user_id && (
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

                        <div>
                          <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
                            Equipe cible
                          </label>
                          <input
                            type="text"
                            value={teamSearch}
                            onChange={(e) =>
                              handleTeamSearchChange(e.target.value)
                            }
                            className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 mb-3"
                            placeholder="Rechercher une equipe..."
                          />
                          <TeamList
                            teams={displayTeams}
                            loading={teamsLoading}
                            selectedId={selectedTeamId}
                            onSelect={setSelectedTeamId}
                            emptyMessage="Aucune equipe ouverte au recrutement"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
                            Role souhaite
                          </label>
                          <div className="flex gap-3">
                            {(['player', 'substitute', 'coach'] as const).map(
                              (role) => (
                                <button
                                  key={role}
                                  type="button"
                                  onClick={() => setDesiredRole(role)}
                                  className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition border ${
                                    desiredRole === role
                                      ? 'bg-purple-600/30 border-purple-400/50 text-white'
                                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                  }`}
                                >
                                  {role === 'player'
                                    ? 'Joueur'
                                    : role === 'substitute'
                                      ? 'Remplacant'
                                      : 'Coach'}
                                </button>
                              )
                            )}
                          </div>
                        </div>

                        <MessageField
                          value={message}
                          onChange={setMessage}
                          label="Message au capitaine cible (optionnel)"
                        />

                        {error && <ErrorBanner message={error} />}

                        <SubmitButton
                          disabled={
                            submitting || !selectedTeamId || !selectedPlayerId
                          }
                          loading={submitting}
                          label="Proposer le transfert"
                        />
                      </form>
                    )}

                    {/* Mode "mon transfert" (joueur non-capitaine ou manager en self) */}
                    {!isCaptain && transferMode === 'self' && (
                      <form
                        onSubmit={handleSubmitTransfer}
                        className="space-y-6"
                      >
                        <div>
                          <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
                            Equipe cible
                          </label>
                          <input
                            type="text"
                            value={teamSearch}
                            onChange={(e) =>
                              handleTeamSearchChange(e.target.value)
                            }
                            className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 mb-3"
                            placeholder="Rechercher une equipe..."
                          />
                          <TeamList
                            teams={displayTeams}
                            loading={teamsLoading}
                            selectedId={selectedTeamId}
                            onSelect={setSelectedTeamId}
                            emptyMessage="Aucune equipe ouverte au recrutement"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
                            Role souhaite
                          </label>
                          <div className="flex gap-3">
                            {(['player', 'substitute', 'coach'] as const).map(
                              (role) => (
                                <button
                                  key={role}
                                  type="button"
                                  onClick={() => setDesiredRole(role)}
                                  className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition border ${
                                    desiredRole === role
                                      ? 'bg-purple-600/30 border-purple-400/50 text-white'
                                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                  }`}
                                >
                                  {role === 'player'
                                    ? 'Joueur'
                                    : role === 'substitute'
                                      ? 'Remplacant'
                                      : 'Coach'}
                                </button>
                              )
                            )}
                          </div>
                        </div>

                        <MessageField
                          value={message}
                          onChange={setMessage}
                          label="Message au capitaine (optionnel)"
                        />

                        {error && <ErrorBanner message={error} />}

                        <SubmitButton
                          disabled={submitting || !selectedTeamId}
                          loading={submitting}
                          label="Envoyer la demande de transfert"
                        />
                      </form>
                    )}
                  </>
                )}
              </>
            )}

            {/* Contenu scrim */}
            {tab === 'scrim' && (
              <>
                {!hasTeam ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
                    <p className="font-semibold mb-1">Pas d&apos;equipe</p>
                    <p>
                      Tu dois etre membre d&apos;une equipe pour proposer un
                      scrim.{' '}
                      <Link
                        href="/player/join-team"
                        className="text-purple-300 hover:text-purple-200 underline"
                      >
                        Rejoindre une equipe
                      </Link>
                    </p>
                  </div>
                ) : !isCaptain && !isManager ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
                    <p className="font-semibold mb-1">Capitaine ou manager requis</p>
                    <p>
                      Seul le capitaine ou un manager de l&apos;equipe peut
                      envoyer une demande de scrim.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitScrim} className="space-y-6">
                    <div>
                      <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
                        Equipe adverse
                      </label>
                      <input
                        type="text"
                        value={teamSearch}
                        onChange={(e) => handleTeamSearchChange(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400/80 mb-3"
                        placeholder="Rechercher une equipe..."
                      />
                      <TeamList
                        teams={displayTeams}
                        loading={teamsLoading}
                        selectedId={selectedTeamId}
                        onSelect={setSelectedTeamId}
                        emptyMessage="Aucune equipe trouvee"
                        accentColor="blue"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="preferred-date"
                        className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                      >
                        Date souhaitee (optionnel)
                      </label>
                      <input
                        id="preferred-date"
                        type="datetime-local"
                        value={preferredDate}
                        onChange={(e) => setPreferredDate(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-400/80 transition"
                      />
                    </div>

                    <MessageField
                      value={message}
                      onChange={setMessage}
                      label="Message a l'equipe adverse (optionnel)"
                      placeholder="Propose un creneau, un format, des maps..."
                    />

                    {error && <ErrorBanner message={error} />}

                    <SubmitButton
                      disabled={submitting || !selectedTeamId}
                      loading={submitting}
                      label="Envoyer la demande de scrim"
                      color="blue"
                    />
                  </form>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Sous-composants                                                    */
/* ------------------------------------------------------------------ */

function TeamList({
  teams,
  loading,
  selectedId,
  onSelect,
  emptyMessage,
  accentColor = 'purple',
}: {
  teams: Team[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  emptyMessage: string;
  accentColor?: 'purple' | 'blue';
}) {
  const accent =
    accentColor === 'blue'
      ? {
          bg: 'bg-blue-600/30',
          border: 'border-blue-400/50',
          check: 'text-blue-400',
        }
      : {
          bg: 'bg-purple-600/30',
          border: 'border-purple-400/50',
          check: 'text-purple-400',
        };

  return (
    <div className="max-h-72 overflow-y-auto space-y-2 rounded-xl border border-white/10 bg-black/40 p-2">
      {loading && (
        <div className="text-sm text-gray-500 text-center py-4">
          Chargement...
        </div>
      )}
      {!loading && teams.length === 0 && (
        <div className="text-sm text-gray-500 text-center py-4">
          {emptyMessage}
        </div>
      )}
      {!loading &&
        teams.map((team) => (
          <button
            key={team.id}
            type="button"
            onClick={() => onSelect(team.id)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition ${
              selectedId === team.id
                ? `${accent.bg} border ${accent.border}`
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
                  {(team.short_name || team.name).slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-white truncate">{team.name}</div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                {team.short_name && <span>{team.short_name}</span>}
                {team.country && (
                  <>
                    {team.short_name && <span>&middot;</span>}
                    <span>{team.country}</span>
                  </>
                )}
                {typeof team.member_count === 'number' && (
                  <>
                    {(team.short_name || team.country) && <span>&middot;</span>}
                    <span>{team.member_count}/5 membres</span>
                  </>
                )}
              </div>
            </div>
            {selectedId === team.id && (
              <svg
                className={`w-5 h-5 ${accent.check} flex-shrink-0`}
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
  );
}

function MessageField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 transition resize-none"
        placeholder={placeholder || 'Un message pour accompagner ta demande...'}
        maxLength={1000}
      />
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
      {message}
    </div>
  );
}

function SubmitButton({
  disabled,
  loading,
  label,
  color = 'purple',
}: {
  disabled: boolean;
  loading: boolean;
  label: string;
  color?: 'purple' | 'blue';
}) {
  const gradient =
    color === 'blue'
      ? 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400'
      : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400';

  return (
    <button
      type="submit"
      disabled={disabled}
      className={`w-full px-4 py-3 rounded-xl font-semibold transition ${
        disabled ? 'bg-gray-600 cursor-not-allowed' : gradient
      }`}
    >
      {loading ? 'Envoi en cours...' : label}
    </button>
  );
}
