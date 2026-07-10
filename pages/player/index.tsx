// pages/player/index.tsx
// Dashboard joueur - page principale pour les utilisateurs connectes

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import ProfileSummaryCard from '@/components/player/ProfileSummaryCard';
import DiscordLinkCard from '@/components/player/DiscordLinkCard';
import TeamCard, { type TeamMemberLite } from '@/components/player/TeamCard';
import DemandesHistory from '@/components/player/DemandesHistory';
import QuickAction, {
  type QuickActionProps,
} from '@/components/player/QuickAction';
import NextMatchCard from '@/components/player/NextMatchCard';
import { PlayerDashboardSkeleton } from '@/components/player/Skeletons';
import ScrimSlotPicker from '@/components/player/ScrimSlotPicker';
import ScrimPlanningsDashboardCard from '@/components/player/ScrimPlanningsDashboardCard';
import SupportAssoCard from '@/components/player/SupportAssoCard';
import PushOptIn from '@/components/shared/PushOptIn';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';

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

type ScrimNego = {
  slots: string[];
  proposedBy: string;
  rounds: number;
  agreedSlot: string | null;
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
  // Multi-slot negotiation context (scrims awaiting MY action; I am always the
  // non-proposer of the current slots).
  scrimNego?: ScrimNego;
  iAmRequester?: boolean;
  myTeamId?: string;
};

// Mirror of the next-match slice the aggregated /api/player/dashboard returns
// (same shape as NextMatchCard's NextMatch, plus the readiness block).
type NextMatchData = {
  match: {
    id: string;
    scheduledAt: string | null;
    status: string;
    format: string | null;
    roundName: string | null;
    streamUrl: string | null;
    bestOf: number | null;
  } | null;
  team: { id: string; name: string; slot: 1 | 2 } | null;
  opponent: { id: string; name: string } | null;
  tournament: { id: string; name: string; slug: string | null } | null;
  checkin: {
    token: string | null;
    alreadyCheckedIn: boolean;
    checkedInAt: string | null;
    opensAt: string | null;
    closesAt: string | null;
    isOpen: boolean;
    isPassed: boolean;
  } | null;
  readiness: {
    minPlayers: number | null;
    rosterSize: number;
    shortfall: number;
  } | null;
};

type DashboardResponse = {
  team?: TeamInfo;
  members?: TeamMemberLite[];
  isCaptain?: boolean;
  isManager?: boolean;
  demandesCaptain?: Demande[];
  demandesJoin?: Demande[];
  pendingScrims?: PendingScrim[];
  unreadMessages?: number;
  nextMatch?: NextMatchData;
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
  t: ReturnType<typeof useT<'playerIndex'>>;
}): QuickActionProps[] {
  const { team, isCaptain, isManager, unreadMessages, t } = args;
  const canManage = isCaptain || isManager;
  const actions: QuickActionProps[] = [];

  actions.push({
    href: '/player/requests?tab=transfer',
    label: canManage ? t.qaProposeTransfer : t.qaRequestTransfer,
    description: canManage ? t.qaTransferPlayer : t.qaTransferToOther,
    iconPath: SVG_PATHS.transfer,
    tone: 'purple',
  });

  if (canManage) {
    actions.push({
      href: '/player/requests?tab=scrim',
      label: t.qaProposeScrim,
      description: t.qaFriendlyMatch,
      iconPath: SVG_PATHS.scrim,
      tone: 'blue',
    });
    actions.push({
      href: '/player/messages',
      label: t.qaMessaging,
      description: t.qaCaptainChat,
      iconPath: SVG_PATHS.messages,
      tone: 'emerald',
      badge: unreadMessages,
    });
    actions.push({
      href: '/player/manage-team',
      label: t.qaManageTeam,
      description: t.qaRosterRequests,
      iconPath: SVG_PATHS.team,
    });
  }

  actions.push({
    href: `/team/${encodeURIComponent(team.slug || team.id)}`,
    label: t.qaTeamPage,
    description: t.qaPublicProfile,
    iconPath: SVG_PATHS.publicTeam,
  });

  actions.push({
    href: '/player/caster-application',
    label: t.qaBecomeCaster,
    description: t.qaJoinCast,
    iconPath: SVG_PATHS.caster,
    tone: 'cyan',
  });

  return actions;
}

// Product card — "Match readiness". Renders only when there is an upcoming
// match. Surfaces (a) a roster-shortfall warning when the team is below the
// tournament min_players, and (b) the per-team check-in status for that match.
//
// Visually consistent with the other dashboard cards (rounded-2xl, border,
// blurred translucent surface).
function MatchReadinessCard({
  nextMatch,
  t,
}: {
  nextMatch: NextMatchData | null;
  t: ReturnType<typeof useT<'playerIndex'>>;
}) {
  if (!nextMatch?.match || !nextMatch.team) return null;

  // New keys live in the i18n fragment (merged separately); bridge them here so
  // this stays decoupled from the typed locale until the fragment lands.
  const tr = t as unknown as Record<string, string>;

  const readiness = nextMatch.readiness;
  const shortfall = readiness?.shortfall ?? 0;
  const hasWarning = shortfall > 0;

  const checkin = nextMatch.checkin;
  const matchHref = `/match/${nextMatch.match.id}`;

  let checkinStatus: string;
  if (checkin?.alreadyCheckedIn) checkinStatus = tr.readinessCheckinDone;
  else if (checkin?.isPassed) checkinStatus = tr.readinessCheckinClosed;
  else checkinStatus = tr.readinessCheckinTodo;

  const needsCheckin =
    !!checkin && !checkin.alreadyCheckedIn && !checkin.isPassed;

  return (
    <div
      className={`mt-6 rounded-2xl border backdrop-blur-xl p-6 ${
        hasWarning
          ? 'border-amber-400/30 bg-amber-500/[0.06]'
          : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <h2 className="text-lg font-semibold mb-3">{tr.readinessTitle}</h2>

      {hasWarning ? (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {format(tr.readinessRosterWarning, { n: shortfall })}
        </div>
      ) : (
        <p className="mb-4 text-sm text-gray-300">{tr.readinessRosterOk}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-gray-400">{tr.readinessCheckinLabel}</span>
        <span
          className={
            checkin?.alreadyCheckedIn
              ? 'text-emerald-300 font-medium'
              : checkin?.isPassed
                ? 'text-rose-300 font-medium'
                : 'text-amber-200 font-medium'
          }
        >
          {checkinStatus}
        </span>

        {needsCheckin && checkin?.token && checkin.isOpen ? (
          <Link
            href="/player/checkin"
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-neutral-900 transition hover:-translate-y-0.5"
          >
            {tr.readinessCheckinAction}
            <span aria-hidden>→</span>
          </Link>
        ) : (
          <Link
            href={matchHref}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
          >
            {tr.readinessViewMatch}
            <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </div>
  );
}

function PlayerDashboard() {
  const t = useT('playerIndex');
  // Bridge for keys that live in the i18n fragment (merged separately) and are
  // not yet present in the typed locale.
  const tr = t as unknown as Record<string, string>;
  const locale = useLocale();
  const { user, token, loading: authLoading, ready } = usePlayerSession();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<TeamInfo>(null);
  const [members, setMembers] = useState<TeamMemberLite[]>([]);
  const [isCaptain, setIsCaptain] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [pendingScrims, setPendingScrims] = useState<PendingScrim[]>([]);
  const [scrimActionId, setScrimActionId] = useState<string | null>(null);
  const [scrimError, setScrimError] = useState<string | null>(null);
  // Selected slot (for "accept") keyed by scrim id.
  const [selectedScrimSlot, setSelectedScrimSlot] = useState<
    Record<string, string>
  >({});
  // Id of the scrim whose inline counter-proposal picker is open.
  const [counterOpenId, setCounterOpenId] = useState<string | null>(null);
  // Counter-proposal slots (datetime-local rows) keyed by scrim id.
  const [counterSlots, setCounterSlots] = useState<Record<string, string[]>>(
    {}
  );
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [nextMatch, setNextMatch] = useState<NextMatchData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Single aggregated call (one request, one wave). Each section is optional in
  // the payload and defaulted defensively, so a server-side section failure
  // (returned as empty/null) never blanks out the rest of the dashboard.
  const loadData = useCallback(async () => {
    const data = await adminFetchJson<DashboardResponse>(
      '/api/player/dashboard'
    ).catch(() => null);

    if (!data) {
      throw new Error('dashboard fetch failed');
    }

    setTeam(data.team || null);
    setMembers(Array.isArray(data.members) ? data.members : []);
    setIsCaptain(data.isCaptain || false);
    setIsManager(data.isManager || false);

    const allDemandes: Demande[] = [
      ...(data.demandesCaptain || []),
      ...(data.demandesJoin || []),
    ];
    allDemandes.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    setDemandes(allDemandes);

    setPendingScrims(
      Array.isArray(data.pendingScrims) ? data.pendingScrims : []
    );
    setUnreadMessages(
      typeof data.unreadMessages === 'number' ? data.unreadMessages : 0
    );
    setNextMatch(data.nextMatch ?? null);
  }, [adminFetchJson]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    loadData()
      .catch((err: unknown) => {
        logger.error('[player] load error:', err);
        if (!cancelled) setError(t.loadError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, loadData, t]);

  const handleCancelDemande = async (demandeId: string) => {
    setError(null);
    try {
      await adminFetchJson('/api/demandes/cancel', {
        method: 'DELETE',
        body: JSON.stringify({ demandeId }),
      });
      await loadData();
    } catch (err) {
      logger.error('[player] cancel demande error:', err);
      setError(t.cancelError);
    }
  };

  // Multi-slot negotiation actions:
  //  - 'accept'  + { slot }  → agree on one of the proposed slots
  //  - 'counter' + { slots } → propose new times back to the opponent
  //  - 'reject'
  // Each removes the row optimistically once the server confirms.
  const handleScrimAction = async (
    demandeId: string,
    action: 'accept' | 'counter' | 'reject'
  ) => {
    setScrimError(null);

    let body: Record<string, unknown> = { demandeId, action };

    if (action === 'accept') {
      const slot = selectedScrimSlot[demandeId];
      if (!slot) {
        setScrimError(tr.selectSlotFirst);
        return;
      }
      body = { ...body, slot };
    }

    if (action === 'counter') {
      const slots = (counterSlots[demandeId] || [])
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => new Date(s).toISOString());
      if (slots.length === 0) {
        setScrimError(tr.atLeastOneSlot);
        return;
      }
      body = { ...body, slots };
    }

    setScrimActionId(demandeId);
    try {
      await adminFetchJson('/api/teams/scrim-requests', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      // Awaiting MY action either way: agreeing, rejecting, or sending the ball
      // back to the opponent all remove the card from my actionable list.
      setPendingScrims((prev) => prev.filter((s) => s.id !== demandeId));
      setCounterOpenId((id) => (id === demandeId ? null : id));
    } catch (err) {
      setScrimError((err as Error).message);
    } finally {
      setScrimActionId(null);
    }
  };

  const handleLeaveTeam = async () => {
    setError(null);
    try {
      await adminFetchJson('/api/teams/leave', { method: 'POST' });
      // Ne pas vider l'état localement avant confirmation : on reconcilie
      // depuis le serveur via loadData (qui remettra team/members/isCaptain).
      await loadData();
    } catch (err) {
      logger.error('[player] leave team error:', err);
      setError(t.leaveError);
    }
  };

  const formatSlot = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

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
    return (
      <>
        <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
          <main className="max-w-md mx-auto px-4 py-10 pt-32 text-center">
            <h1 className="text-3xl font-bold text-gradient">
              {t.playerSpace}
            </h1>
            <p className="mt-4 text-gray-300">{t.connectPrompt}</p>
            <Link
              href="/login?next=/player"
              className="mt-8 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-purple-500/20 transition hover:brightness-110"
            >
              {t.signIn}
            </Link>
          </main>
        </div>
      </>
    );
  }

  const displayName =
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    t.fallbackName;

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-4xl mx-auto px-4 py-10 pt-24">
          {/* Header */}
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gradient">
                {format(t.welcome, { name: displayName })}
              </h1>
              <p className="text-gray-400 text-sm mt-1">{t.headerSubtitle}</p>
            </div>
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
            <PushOptIn audience="player" variant="card" loginPath="/login" />
          </div>

          {/* Soutien à l'asso : billetterie gratuite, mais don / adhésion
              appréciés. Dismissible (localStorage). */}
          <div className="mb-6">
            <SupportAssoCard />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <ProfileSummaryCard user={user} displayName={displayName} />
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

          <NextMatchCard initialData={nextMatch} />

          <MatchReadinessCard nextMatch={nextMatch} t={t} />

          {/* Rejoindre le cast — toujours visible (indépendant de l'équipe) */}
          {!team && (
            <div className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] backdrop-blur-xl p-6">
              <h2 className="text-lg font-semibold mb-4">{t.wantToCast}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <QuickAction
                  href="/player/caster-application"
                  label={t.qaBecomeCaster}
                  description={t.qaJoinCast}
                  iconPath={SVG_PATHS.caster}
                  tone="cyan"
                />
              </div>
            </div>
          )}

          {/* Actions rapides */}
          {team && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
              <h2 className="text-lg font-semibold mb-4">{t.quickActions}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {buildQuickActions({
                  team,
                  isCaptain,
                  isManager,
                  unreadMessages,
                  t,
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
                {t.pendingScrims}
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
                  const nego = scrim.scrimNego;
                  const negoSlots = nego?.slots ?? [];
                  const round = nego?.rounds ?? 1;
                  const agreedSlot = nego?.agreedSlot ?? null;
                  const counterIsOpen = counterOpenId === scrim.id;
                  const currentCounterSlots = counterSlots[scrim.id] ?? [''];
                  // The proposer of the *current* slots is the opponent when I
                  // am the requester (they countered), and "me" otherwise.
                  const proposedByOpponent = !!scrim.iAmRequester;
                  return (
                    <div
                      key={scrim.id}
                      className="p-4 rounded-xl border border-white/10 bg-black/30 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-white">
                              {scrim.payload?.from_team_name || t.unknownTeam}
                            </span>
                            {isExternal && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40 text-[10px] uppercase tracking-wide">
                                {t.external}
                              </span>
                            )}
                          </div>
                          {scrim.user?.display_name && !isExternal && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {format(t.captainLabel, {
                                name: scrim.user.display_name,
                              })}
                            </p>
                          )}
                          {isExternal && scrim.user?.display_name && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {format(t.contactLabel, {
                                name: scrim.user.display_name,
                              })}
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
                                {t.dateLabel}{' '}
                                {new Date(
                                  scrim.payload.preferred_date
                                ).toLocaleDateString(locale, {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            )}
                            {scrim.payload?.format && (
                              <span>
                                {format(t.formatLabel, {
                                  format: scrim.payload.format,
                                })}
                              </span>
                            )}
                            <span>
                              {format(t.receivedOn, {
                                date: new Date(
                                  scrim.created_at
                                ).toLocaleDateString(locale),
                              })}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-wide text-gray-300">
                              {format(tr.round, { n: round })}
                            </span>
                            <span className="text-gray-400">
                              {proposedByOpponent
                                ? tr.proposedByOpponent
                                : tr.proposedByYou}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Agreed slot (negotiation already concluded) */}
                      {agreedSlot && (
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                          {format(tr.agreedOn, { date: formatSlot(agreedSlot) })}
                        </div>
                      )}

                      {/* Proposed slots — selectable (accept one) */}
                      {!agreedSlot && negoSlots.length > 0 && (
                        <fieldset className="space-y-1.5">
                          <legend className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                            {tr.proposedSlotsLabel}
                          </legend>
                          {negoSlots.map((slot) => {
                            const checked =
                              selectedScrimSlot[scrim.id] === slot;
                            return (
                              <label
                                key={slot}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition ${
                                  checked
                                    ? 'bg-blue-600/30 border-blue-400/50 text-white'
                                    : 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/10'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`scrim-slot-${scrim.id}`}
                                  value={slot}
                                  checked={checked}
                                  onChange={() =>
                                    setSelectedScrimSlot((prev) => ({
                                      ...prev,
                                      [scrim.id]: slot,
                                    }))
                                  }
                                  className="accent-blue-500"
                                />
                                <span>{formatSlot(slot)}</span>
                              </label>
                            );
                          })}
                        </fieldset>
                      )}

                      {isExternal && (contactEmail || contactDiscord) && (
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100 space-y-0.5">
                          <p className="uppercase tracking-wide text-[10px] text-amber-300/80">
                            {t.contactToReply}
                          </p>
                          {contactEmail && (
                            <p>
                              <span className="text-gray-400">
                                {t.emailLabel}
                              </span>{' '}
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
                              <span className="text-gray-400">
                                {t.discordLabel}
                              </span>{' '}
                              {contactDiscord}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Inline counter-proposal picker */}
                      {counterIsOpen && (
                        <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                          <ScrimSlotPicker
                            slots={currentCounterSlots}
                            onChange={(next) =>
                              setCounterSlots((prev) => ({
                                ...prev,
                                [scrim.id]: next,
                              }))
                            }
                            accent="blue"
                            idPrefix={`counter-${scrim.id}`}
                            labels={{
                              slotsLabel: tr.slotsLabel,
                              addSlot: tr.addSlot,
                              removeSlot: tr.removeSlot,
                              maxSlotsHint: tr.maxSlotsHint,
                              timezoneNote: tr.scrimTzNote,
                            }}
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              handleScrimAction(scrim.id, 'counter')
                            }
                            className="mt-3 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-medium text-white"
                          >
                            {tr.counterSubmit}
                          </button>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {!agreedSlot && (
                          <button
                            type="button"
                            disabled={busy || !selectedScrimSlot[scrim.id]}
                            onClick={() => handleScrimAction(scrim.id, 'accept')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-white"
                          >
                            {tr.acceptSlot}
                          </button>
                        )}
                        {!agreedSlot && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setCounterOpenId((id) =>
                                id === scrim.id ? null : scrim.id
                              );
                              setCounterSlots((prev) =>
                                prev[scrim.id]
                                  ? prev
                                  : { ...prev, [scrim.id]: [''] }
                              );
                            }}
                            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 text-xs"
                          >
                            {tr.counterCta}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleScrimAction(scrim.id, 'reject')}
                          className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-200 hover:bg-red-500/10 disabled:opacity-50 text-xs ml-auto"
                        >
                          {tr.rejectScrim}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Grilles de dispo (scrim plannings ouverts) — s'auto-masque si vide */}
          <ScrimPlanningsDashboardCard token={token} />

          <DemandesHistory demandes={demandes} onCancel={handleCancelDemande} />

          {/* Liens utiles */}
          <div className="mt-8 flex flex-wrap gap-4 text-sm">
            <Link href="/" className="text-gray-400 hover:text-white">
              {t.backToSite}
            </Link>
            <Link
              href="/tournaments"
              className="text-purple-300 hover:text-purple-200"
            >
              {t.viewTournaments}
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}

// Espace joueur : gate cote client, contenu prive. Le titre passe par le
// mecanisme `seo` consomme par _app.tsx ; `noindex` est de toute facon force
// pour toutes les routes /player (cf. _app.tsx → effectiveSeo).
const playerSeo: SeoProps = {
  title: {
    fr: 'Mon espace joueur',
    en: 'My player space',
  },
  description: {
    fr: "Espace joueur OW Women's Cup : profil, equipe, prochains matchs et demandes.",
    en: "OW Women's Cup player space: profile, team, upcoming matches and requests.",
  },
  noindex: true,
};

PlayerDashboard.seo = playerSeo;

export default PlayerDashboard;
