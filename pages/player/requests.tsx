// pages/player/requests.tsx
// Page pour demander un transfert de joueur ou un scrim contre une autre equipe

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useDebounce } from '@/hooks/useDebounce';
import { useManagedTeam } from '@/hooks/useManagedTeam';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import RequestTabs from '@/components/player/requests/RequestTabs';
import TransferRequestForm from '@/components/player/requests/TransferRequestForm';
import ScrimRequestForm from '@/components/player/requests/ScrimRequestForm';
import type { Team } from '@/components/player/requests/types';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

import { logger } from '../../utils/logger';

type Tab = 'transfer' | 'scrim';

export default function PlayerRequestsPage() {
  const router = useRouter();
  const { user, token, loading: authLoading, ready } = usePlayerSession();
  const {
    data: managedTeam,
    loading: teamLoading,
    error: teamError,
  } = useManagedTeam();
  const t = useT('playerRequests');
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('transfer');
  // Which field a validation error concerns, so we only flag the relevant input
  // as aria-invalid (not every input on the form).
  const [errorField, setErrorField] = useState<
    'team' | 'player' | 'slots' | null
  >(null);

  // Contexte joueur — derive depuis le cache partage useManagedTeam.
  const hasTeam = !!managedTeam?.team;
  const isCaptain = managedTeam?.isCaptain ?? false;
  const isManager = managedTeam?.isManager ?? false;
  const myTeamId = managedTeam?.team?.id ?? null;

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

  // Scrim — multi-slot negotiation. Each entry is a `datetime-local` value;
  // converted to ISO on submit. Always at least one row.
  const [scrimSlots, setScrimSlots] = useState<string[]>(['']);

  // Commun
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const debouncedSearch = useDebounce(teamSearch, 300);

  const loadTeams = useCallback(async (search?: string) => {
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
  }, []);

  const loading = authLoading || teamLoading;

  // Surface a connection error if the shared team fetch failed.
  useEffect(() => {
    if (teamError) setError(t.connectionError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamError]);

  // Derive the transfer-target roster (captains/managers can propose a
  // teammate) from the shared payload, excluding the current user.
  useEffect(() => {
    if (!user || !managedTeam?.team) {
      setTeamMembers([]);
      return;
    }
    if (managedTeam.isCaptain || managedTeam.isManager) {
      setTeamMembers(
        managedTeam.members
          .filter((m) => m.user_id && m.user_id !== user.id)
          .map((m) => ({
            user_id: m.user_id as string,
            role: m.role ?? 'player',
            battle_tag: m.battle_tag,
          }))
      );
    } else {
      setTeamMembers([]);
    }
  }, [user, managedTeam]);

  // Pre-select the scrim tab from the URL.
  useEffect(() => {
    if (router.query.tab === 'scrim') setTab('scrim');
  }, [router.query.tab]);

  // Recharge la liste d'equipes quand la recherche (debouncee) change.
  useEffect(() => {
    if (!ready) return;
    loadTeams(debouncedSearch);
  }, [debouncedSearch, ready, loadTeams]);

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    setSelectedTeamId('');
    setSelectedPlayerId('');
    setTransferMode('self');
    setMessage('');
    setScrimSlots(['']);
    setError(null);
    setErrorField(null);
    setSuccess(null);
    // Keep the URL in sync so the tab is shareable / survives a reload.
    router.replace(
      { pathname: router.pathname, query: { tab: newTab } },
      undefined,
      { shallow: true }
    );
  };

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    // Garde anti double-submit : le disabled ne protège pas d'un double-Enter
    // envoyé avant le re-render.
    if (submitting) return;
    setError(null);
    setErrorField(null);

    if (!selectedTeamId) {
      setError(t.errSelectTargetTeam);
      setErrorField('team');
      return;
    }

    if (transferMode === 'propose' && !selectedPlayerId) {
      setError(t.errSelectPlayer);
      setErrorField('player');
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
      if (!res.ok) throw new Error(data.error || t.errCreateRequest);

      const team = teams.find((tm) => tm.id === selectedTeamId);
      let successMsg: string;
      if (transferMode === 'propose') {
        const player = teamMembers.find((m) => m.user_id === selectedPlayerId);
        const playerName =
          player?.display_name || player?.battle_tag || t.fallbackPlayer;
        successMsg = format(t.successProposeTransfer, {
          playerName,
          teamName: team?.name || t.fallbackTeam,
        });
      } else {
        successMsg = format(t.successSelfTransfer, {
          teamName: team?.name || t.fallbackTeam,
        });
      }
      setSuccess(successMsg);
      addToast(successMsg, 'success');
      // Reset the form in place so the captain can chain another request.
      setSelectedTeamId('');
      setSelectedPlayerId('');
      setMessage('');
    } catch (err: unknown) {
      setError((err as Error).message || t.errGeneric);
      setErrorField(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitScrim = async (e: React.FormEvent) => {
    e.preventDefault();
    // Garde anti double-submit : le disabled ne protège pas d'un double-Enter
    // envoyé avant le re-render.
    if (submitting) return;
    setError(null);
    setErrorField(null);

    if (!selectedTeamId) {
      setError(t.errSelectOpponent);
      setErrorField('team');
      return;
    }

    // Convert filled `datetime-local` rows to ISO; require at least one.
    const proposedSlots = scrimSlots
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => new Date(s).toISOString());

    if (proposedSlots.length === 0) {
      setError(t.atLeastOneSlot);
      setErrorField('slots');
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
          proposedSlots,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.errCreateRequest);

      const team = teams.find((tm) => tm.id === selectedTeamId);
      const successMsg = format(t.successScrim, {
        teamName: team?.name || t.fallbackTeam,
      });
      setSuccess(successMsg);
      addToast(successMsg, 'success');
      setSelectedTeamId('');
      setMessage('');
      setScrimSlots(['']);
    } catch (err: unknown) {
      setError((err as Error).message || t.errGeneric);
      setErrorField(null);
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

  return (
    <>
      <Head>
        <title>{t.pageTitleTab}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-2xl mx-auto px-4 py-10 pt-24">
          <Link
            href="/player"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6"
          >
            &larr; {t.backToSpace}
          </Link>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <h1 className="text-2xl font-bold mb-2">{t.heading}</h1>
            <p className="text-gray-400 text-sm mb-6">{t.intro}</p>

            {success && (
              <div
                id="requests-success"
                role="status"
                aria-live="polite"
                className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
              >
                <svg
                  className="w-5 h-5 flex-shrink-0 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>{success}</span>
              </div>
            )}

            {/* Onglets */}
            <RequestTabs tab={tab} onTabChange={handleTabChange} />

            <div
              role="tabpanel"
              id="requests-tabpanel"
              aria-labelledby={`requests-tab-${tab}`}
            >
              {/* Contenu transfert */}
              {tab === 'transfer' && (
                <TransferRequestForm
                  hasTeam={hasTeam}
                  isCaptain={isCaptain}
                  isManager={isManager}
                  transferMode={transferMode}
                  setTransferMode={setTransferMode}
                  teamMembers={teamMembers}
                  selectedPlayerId={selectedPlayerId}
                  setSelectedPlayerId={setSelectedPlayerId}
                  teamSearch={teamSearch}
                  setTeamSearch={setTeamSearch}
                  errorField={errorField}
                  displayTeams={displayTeams}
                  selectedTeamId={selectedTeamId}
                  setSelectedTeamId={setSelectedTeamId}
                  teamsLoading={teamsLoading}
                  desiredRole={desiredRole}
                  setDesiredRole={setDesiredRole}
                  message={message}
                  setMessage={setMessage}
                  error={error}
                  submitting={submitting}
                  onSubmit={handleSubmitTransfer}
                  setError={setError}
                  setErrorField={setErrorField}
                />
              )}

              {/* Contenu scrim */}
              {tab === 'scrim' && (
                <ScrimRequestForm
                  hasTeam={hasTeam}
                  isCaptain={isCaptain}
                  isManager={isManager}
                  teamSearch={teamSearch}
                  setTeamSearch={setTeamSearch}
                  errorField={errorField}
                  displayTeams={displayTeams}
                  selectedTeamId={selectedTeamId}
                  setSelectedTeamId={setSelectedTeamId}
                  teamsLoading={teamsLoading}
                  scrimSlots={scrimSlots}
                  setScrimSlots={setScrimSlots}
                  message={message}
                  setMessage={setMessage}
                  error={error}
                  submitting={submitting}
                  onSubmit={handleSubmitScrim}
                />
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

const playerRequestsSeo: SeoProps = {
  title: {
    fr: 'Demandes',
    en: 'Requests',
  },
  description: {
    fr: "Gère tes demandes de transfert et de scrim sur l'OW Women's Cup.",
    en: "Manage your transfer and scrim requests on OW Women's Cup.",
  },
  noindex: true,
};

PlayerRequestsPage.seo = playerRequestsSeo;
