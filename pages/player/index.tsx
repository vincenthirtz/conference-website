// pages/player/index.tsx
// Dashboard joueur - page principale pour les utilisateurs connectes

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import ProfileCard from '@/components/player/ProfileCard';
import DiscordLinkCard from '@/components/player/DiscordLinkCard';
import TeamCard, { type TeamMemberLite } from '@/components/player/TeamCard';
import DemandesHistory from '@/components/player/DemandesHistory';
import QuickAction, {
  type QuickActionProps,
} from '@/components/player/QuickAction';
import NextMatchCard from '@/components/player/NextMatchCard';
import { PlayerDashboardSkeleton } from '@/components/player/Skeletons';
import PushOptIn from '@/components/shared/PushOptIn';

import { logger } from '../../utils/logger';
type TeamInfo = {
  id: string;
  slug?: string | null;
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
  source?: string | null;
  payload: {
    from_team_name?: string;
    preferred_date?: string;
    format?: string | null;
    requester_email?: string | null;
    requester_discord?: string | null;
  };
  user: {
    display_name: string | null;
    email?: string | null;
    discord?: string | null;
  } | null;
};

const SVG_PATHS = {
  transfer: 'M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7',
  scrim: 'M22 12a10 10 0 11-20 0 10 10 0 0120 0zM10 8l6 4-6 4z',
  messages: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  team: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  publicTeam: 'M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3',
  caster:
    'M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8',
};

function buildQuickActions(args: {
  team: NonNullable<TeamInfo>;
  isCaptain: boolean;
  isManager: boolean;
  unreadMessages: number;
}): QuickActionProps[] {
  const { team, isCaptain, isManager, unreadMessages } = args;
  const canManage = isCaptain || isManager;
  const actions: QuickActionProps[] = [];

  actions.push({
    href: '/player/requests?tab=transfer',
    label: canManage ? 'Proposer un transfert' : 'Demander un transfert',
    description: canManage ? 'Transférer un joueur' : 'Vers une autre équipe',
    iconPath: SVG_PATHS.transfer,
    tone: 'purple',
  });

  if (canManage) {
    actions.push({
      href: '/player/requests?tab=scrim',
      label: 'Proposer un scrim',
      description: 'Match amical',
      iconPath: SVG_PATHS.scrim,
      tone: 'blue',
    });
    actions.push({
      href: '/player/messages',
      label: 'Messagerie',
      description: 'Discuter entre capitaines',
      iconPath: SVG_PATHS.messages,
      tone: 'emerald',
      badge: unreadMessages,
    });
    actions.push({
      href: '/player/manage-team',
      label: "Gérer l'équipe",
      description: 'Roster et demandes',
      iconPath: SVG_PATHS.team,
    });
  }

  actions.push({
    href: `/team/${encodeURIComponent(team.slug || team.id)}`,
    label: 'Page équipe',
    description: 'Profil public',
    iconPath: SVG_PATHS.publicTeam,
  });

  actions.push({
    href: '/player/caster-application',
    label: 'Devenir casteuse',
    description: 'Rejoindre le cast',
    iconPath: SVG_PATHS.caster,
    tone: 'cyan',
  });

  return actions;
}

export default function PlayerDashboard() {
  const router = useRouter();
  const { user, loading: authLoading, ready } = usePlayerSession();
  const { adminFetchJson } = useAdminFetch();
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<TeamInfo>(null);
  const [members, setMembers] = useState<TeamMemberLite[]>([]);
  const [isCaptain, setIsCaptain] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [pendingScrims, setPendingScrims] = useState<PendingScrim[]>([]);
  const [scrimActionId, setScrimActionId] = useState<string | null>(null);
  const [scrimError, setScrimError] = useState<string | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [teamData, captainData, joinData] = await Promise.all([
      adminFetchJson<{
        team?: TeamInfo;
        members?: TeamMemberLite[];
        isCaptain?: boolean;
        isManager?: boolean;
      }>('/api/admin/teams/my').catch(() => null),
      adminFetchJson<{ demandes?: Demande[] }>('/api/demandes/captain').catch(
        () => null
      ),
      adminFetchJson<{ demandes?: Demande[] }>('/api/demandes/join').catch(
        () => null
      ),
    ]);

    let isCaptainNow = false;
    let isManagerNow = false;

    if (teamData) {
      setTeam(teamData.team || null);
      setMembers(Array.isArray(teamData.members) ? teamData.members : []);
      isCaptainNow = teamData.isCaptain || false;
      isManagerNow = teamData.isManager || false;
      setIsCaptain(isCaptainNow);
      setIsManager(isManagerNow);
    }

    const allDemandes: Demande[] = [];
    if (captainData) allDemandes.push(...(captainData.demandes || []));
    if (joinData) allDemandes.push(...(joinData.demandes || []));

    allDemandes.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    setDemandes(allDemandes);

    // Captain or manager: load pending scrims and unread messages
    if (isCaptainNow || isManagerNow) {
      const [scrimData, msgData] = await Promise.all([
        adminFetchJson<{ demandes?: PendingScrim[] }>(
          '/api/teams/scrim-requests'
        ).catch(() => null),
        adminFetchJson<{ conversations?: { unreadCount: number }[] }>(
          '/api/player/messages'
        ).catch(() => null),
      ]);

      if (scrimData) {
        setPendingScrims(scrimData.demandes || []);
      }

      if (msgData) {
        const total = (msgData.conversations || []).reduce(
          (sum: number, c: { unreadCount: number }) => sum + c.unreadCount,
          0
        );
        setUnreadMessages(total);
      }
    }
  }, [adminFetchJson]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    loadData()
      .catch((err: unknown) => {
        logger.error('[player] load error:', err);
        if (!cancelled) setError('Erreur lors du chargement de ton profil.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, loadData]);

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.replace('/');
  };

  const handleCancelDemande = async (demandeId: string) => {
    await adminFetchJson('/api/demandes/cancel', {
      method: 'DELETE',
      body: JSON.stringify({ demandeId }),
    });
    await loadData();
  };

  const handleScrimAction = async (
    demandeId: string,
    action: 'approve' | 'reject' | 'report'
  ) => {
    setScrimError(null);
    setScrimActionId(demandeId);
    try {
      await adminFetchJson('/api/teams/scrim-requests', {
        method: 'POST',
        body: JSON.stringify({ demandeId, action }),
      });
      setPendingScrims((prev) => prev.filter((s) => s.id !== demandeId));
    } catch (err) {
      setScrimError((err as Error).message);
    } finally {
      setScrimActionId(null);
    }
  };

  const handleLeaveTeam = async () => {
    await adminFetchJson('/api/teams/leave', { method: 'POST' });

    setTeam(null);
    setMembers([]);
    setIsCaptain(false);
    await loadData();
  };

  // The session hook listens to onAuthStateChange (incl. USER_UPDATED), so
  // a profile save propagates automatically — no extra plumbing needed here.
  const handleProfileUpdate = async () => {};

  const pendingCaptainRequest = demandes.find(
    (d) => d.type === 'captain_request' && d.status === 'pending'
  );

  const pendingJoinRequest = demandes.find(
    (d) => d.type === 'join' && d.status === 'pending'
  );

  if (authLoading || loading) {
    return <PlayerDashboardSkeleton />;
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

          {/* Push opt-in : carte visible tant que le user n'a pas activé /
              refusé / "plus tard". Routes vers /api/player/push/subscribe.
              loginPath='/login' : login universel qui route captain/player
              vers /player et le staff vers /admin. */}
          <div className="mb-6">
            <PushOptIn
              audience="player"
              variant="card"
              loginPath="/login"
            />
          </div>

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
              members={members}
            />
          </div>

          <DiscordLinkCard />

          <NextMatchCard />

          {/* Rejoindre le cast — toujours visible (indépendant de l'équipe) */}
          {!team && (
            <div className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] backdrop-blur-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Envie de caster ?</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <QuickAction
                  href="/player/caster-application"
                  label="Devenir casteuse"
                  description="Rejoindre le cast"
                  iconPath={SVG_PATHS.caster}
                  tone="cyan"
                />
              </div>
            </div>
          )}

          {/* Actions rapides */}
          {team && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Actions rapides</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {buildQuickActions({
                  team,
                  isCaptain,
                  isManager,
                  unreadMessages,
                }).map((action) => (
                  <QuickAction key={action.href} {...action} />
                ))}
              </div>
            </div>
          )}

          {/* Scrims en attente (capitaine ou manager) */}
          {(isCaptain || isManager) && pendingScrims.length > 0 && (
            <div className="mt-6 rounded-2xl border border-blue-400/20 bg-blue-500/5 backdrop-blur-xl p-6">
              <h2 className="text-lg font-semibold mb-4">
                Demandes de scrim en attente
                <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-blue-500 text-[10px] font-bold text-white">
                  {pendingScrims.length}
                </span>
              </h2>
              {scrimError && (
                <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  {scrimError}
                </div>
              )}
              <div className="space-y-3">
                {pendingScrims.map((scrim) => {
                  const isExternal = scrim.source === 'public';
                  const contactEmail =
                    scrim.user?.email || scrim.payload?.requester_email || null;
                  const contactDiscord =
                    scrim.user?.discord ||
                    scrim.payload?.requester_discord ||
                    null;
                  const busy = scrimActionId === scrim.id;
                  return (
                    <div
                      key={scrim.id}
                      className="p-4 rounded-xl border border-white/10 bg-black/30 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-white">
                              {scrim.payload?.from_team_name ||
                                'Equipe inconnue'}
                            </span>
                            {isExternal && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40 text-[10px] uppercase tracking-wide">
                                Externe
                              </span>
                            )}
                          </div>
                          {scrim.user?.display_name && !isExternal && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Capitaine : {scrim.user.display_name}
                            </p>
                          )}
                          {isExternal && scrim.user?.display_name && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Contact : {scrim.user.display_name}
                            </p>
                          )}
                          {scrim.comment && (
                            <p className="text-xs text-gray-300 mt-2 whitespace-pre-line">
                              {scrim.comment}
                            </p>
                          )}
                          <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500 mt-2">
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
                            {scrim.payload?.format && (
                              <span>Format : {scrim.payload.format}</span>
                            )}
                            <span>
                              Reçu le{' '}
                              {new Date(scrim.created_at).toLocaleDateString(
                                'fr-FR'
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {isExternal && (contactEmail || contactDiscord) && (
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100 space-y-0.5">
                          <p className="uppercase tracking-wide text-[10px] text-amber-300/80">
                            Contact pour répondre
                          </p>
                          {contactEmail && (
                            <p>
                              <span className="text-gray-400">Email :</span>{' '}
                              <a
                                href={`mailto:${contactEmail}`}
                                className="underline hover:text-white"
                              >
                                {contactEmail}
                              </a>
                            </p>
                          )}
                          {contactDiscord && (
                            <p>
                              <span className="text-gray-400">Discord :</span>{' '}
                              {contactDiscord}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleScrimAction(scrim.id, 'approve')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-medium text-white"
                        >
                          Accepter
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleScrimAction(scrim.id, 'reject')}
                          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 text-xs"
                        >
                          Refuser
                        </button>
                        {isExternal && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              handleScrimAction(scrim.id, 'report')
                            }
                            className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-200 hover:bg-red-500/10 disabled:opacity-50 text-xs ml-auto"
                          >
                            Signaler
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
