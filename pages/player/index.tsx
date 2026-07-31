// pages/player/index.tsx
// Dashboard joueur - page principale pour les utilisateurs connectes

import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import ProfileSummaryCard from '@/components/player/ProfileSummaryCard';
import DiscordLinkCard from '@/components/player/DiscordLinkCard';
import NetworkOnboardingCard from '@/components/player/NetworkOnboardingCard';
import MyScrimsCard from '@/components/player/MyScrimsCard';
import TeamRhythmCard from '@/components/player/TeamRhythmCard';
import TeamMemoryCard from '@/components/player/TeamMemoryCard';
import TeamHealthCard from '@/components/player/TeamHealthCard';
import TeamCard, { type TeamMemberLite } from '@/components/player/TeamCard';
import DemandesHistory from '@/components/player/DemandesHistory';
import QuickAction, {
  type QuickActionProps,
} from '@/components/player/QuickAction';
import NextMatchCard from '@/components/player/NextMatchCard';
import { PlayerDashboardSkeleton } from '@/components/player/Skeletons';
import ScrimNegotiationCard, {
  type PendingScrim,
  type ScrimAction,
  type ScrimActionPayload,
} from '@/components/player/ScrimNegotiationCard';
import ScrimPlanningsDashboardCard, {
  type PlanningEntry,
} from '@/components/player/ScrimPlanningsDashboardCard';
import ScrimsHubCard from '@/components/player/ScrimsHubCard';
import SupportAssoCard from '@/components/player/SupportAssoCard';
import PushOptIn from '@/components/shared/PushOptIn';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';

import { logger } from '../../utils/logger';

type TeamInfo = {
  id: string;
  slug?: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  // Disponibilité aux scrims — déjà renvoyée par /api/player/dashboard via
  // loadManagedTeamSlice. Sert d'état initial au toggle de ScrimsHubCard.
  open_for_scrim?: boolean;
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

// Section de catégorie du dashboard : un « eyebrow » discret (muet, uppercase,
// tracking large — le style de label du site) suivi des cartes de la catégorie
// avec un rythme vertical constant. À ne rendre QUE si la catégorie contient au
// moins une carte visible (l'appelant décide via `visible`).
function CategorySection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
        {label}
      </h2>
      <div className="space-y-6">{children}</div>
    </section>
  );
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

  const readiness = nextMatch.readiness;
  const shortfall = readiness?.shortfall ?? 0;
  const hasWarning = shortfall > 0;

  const checkin = nextMatch.checkin;
  const matchHref = `/match/${nextMatch.match.id}`;

  let checkinStatus: string;
  if (checkin?.alreadyCheckedIn) checkinStatus = t.readinessCheckinDone;
  else if (checkin?.isPassed) checkinStatus = t.readinessCheckinClosed;
  else checkinStatus = t.readinessCheckinTodo;

  const needsCheckin =
    !!checkin && !checkin.alreadyCheckedIn && !checkin.isPassed;

  return (
    <div
      className={`rounded-2xl border backdrop-blur-xl p-6 ${
        hasWarning
          ? 'border-amber-400/30 bg-amber-500/[0.06]'
          : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <h2 className="text-lg font-semibold mb-3">{t.readinessTitle}</h2>

      {hasWarning ? (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {format(t.readinessRosterWarning, { n: shortfall })}
        </div>
      ) : (
        <p className="mb-4 text-sm text-gray-300">{t.readinessRosterOk}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-gray-400">{t.readinessCheckinLabel}</span>
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
            {t.readinessCheckinAction}
            <span aria-hidden>→</span>
          </Link>
        ) : (
          <Link
            href={matchHref}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
          >
            {t.readinessViewMatch}
            <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </div>
  );
}

function PlayerDashboard() {
  const t = useT('playerIndex');
  const locale = useLocale();
  const { user, token, loading: authLoading, ready } = usePlayerSession();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<TeamInfo>(null);
  const [members, setMembers] = useState<TeamMemberLite[]>([]);
  const [isCaptain, setIsCaptain] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [pendingScrims, setPendingScrims] = useState<PendingScrim[]>([]);
  const [scrimActionId, setScrimActionId] = useState<string | null>(null);
  const [scrimError, setScrimError] = useState<string | null>(null);
  // Grilles de dispo (scrim plannings) : fetch remonté ICI une seule fois, puis
  // partagé — le compteur alimente ScrimsHubCard et les entrées alimentent
  // ScrimPlanningsDashboardCard (qui ne re-fetch donc pas).
  const [scrimPlannings, setScrimPlannings] = useState<PlanningEntry[]>([]);
  const [togglingScrim, setTogglingScrim] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [nextMatch, setNextMatch] = useState<NextMatchData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = isCaptain || isManager;

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
  //  - 'reject'  (confirmation required — destructive)
  // Each removes the row optimistically once the server confirms.
  //
  // Stable (useCallback) so the memoized ScrimNegotiationCard rows don't re-render
  // on every dashboard state change. The per-card input state lives inside each
  // card; the payload is passed up here on submission only.
  const handleScrimAction = useCallback(
    async (
      demandeId: string,
      action: ScrimAction,
      payload?: ScrimActionPayload
    ) => {
      setScrimError(null);

      let body: Record<string, unknown> = { demandeId, action };

      if (action === 'accept') {
        const slot = payload?.slot;
        if (!slot) {
          setScrimError(t.selectSlotFirst);
          return;
        }
        body = { ...body, slot };
      }

      if (action === 'counter') {
        const slots = (payload?.slots || [])
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => new Date(s).toISOString());
        if (slots.length === 0) {
          setScrimError(t.atLeastOneSlot);
          return;
        }
        body = { ...body, slots };
      }

      if (action === 'reject') {
        const ok = await confirm({
          title: t.rejectConfirmTitle,
          subtitle: t.rejectConfirmBody,
          variant: 'warning',
          confirmLabel: t.rejectConfirmCta,
          cancelLabel: t.rejectConfirmCancel,
        });
        if (!ok) return;
      }

      setScrimActionId(demandeId);
      try {
        await adminFetchJson('/api/teams/scrim-requests', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        // Awaiting MY action either way: agreeing, rejecting, or sending the
        // ball back to the opponent all remove the card from my actionable list.
        setPendingScrims((prev) => prev.filter((s) => s.id !== demandeId));
      } catch (err) {
        setScrimError((err as Error).message);
      } finally {
        setScrimActionId(null);
      }
    },
    [adminFetchJson, confirm, t]
  );

  // Grilles de dispo ouvertes : chargées une fois pour la catégorie Scrims.
  // Réservé aux capitaines/managers avec équipe (les seuls à voir le hub).
  useEffect(() => {
    if (!ready || !token || !canManage) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/teams/scrim-plannings', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.plannings)) {
          setScrimPlannings(data.plannings as PlanningEntry[]);
        }
      } catch (err) {
        logger.error('[player] scrim-plannings load error:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, token, canManage]);

  // Bascule la disponibilité aux scrims. L'état vit ici (page) : mise à jour
  // optimiste de team.open_for_scrim + feedback toast, cohérent avec le reste.
  const handleToggleScrimOpen = useCallback(async () => {
    if (togglingScrim) return;
    setTogglingScrim(true);
    try {
      const data = await adminFetchJson<{ open_for_scrim: boolean }>(
        '/api/teams/toggle-scrim-open',
        {
          method: 'POST',
          body: JSON.stringify({ open: !team?.open_for_scrim }),
        }
      );
      setTeam((prev) =>
        prev ? { ...prev, open_for_scrim: data.open_for_scrim } : prev
      );
      addToast(
        data.open_for_scrim ? t.scrimsHubToggleOn : t.scrimsHubToggleOff,
        'success'
      );
    } catch (err) {
      logger.error('[player] toggle scrim-open error:', err);
      addToast(t.scrimsHubToggleError, 'error');
    } finally {
      setTogglingScrim(false);
    }
  }, [adminFetchJson, addToast, t, team?.open_for_scrim, togglingScrim]);

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
      {dialog}
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
            <div
              className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
              role="alert"
              aria-live="assertive"
            >
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

          {/* Identité réseau : ce qui manque pour EXISTER dans le réseau
              (Discord lié, BattleTag vérifié, découverte). Ne s'affiche que
              s'il reste quelque chose à faire, et refermable. */}
          {user?.id && <NetworkOnboardingCard userId={user.id} />}

          {/* ─────────────  Profil & équipe  ───────────── */}
          <CategorySection label={t.catProfileTeam}>
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
            {/* Santé d'équipe (N3) — réservée à qui gère : les constats portent
                sur le roster entier et les gestes de réparation sont des gestes
                de gestion. Se masque d'elle-même quand il n'y a rien à
                signaler ; l'équivalent individuel est NetworkOnboardingCard. */}
            {team && canManage && <TeamHealthCard />}
            {/* Rythme d'équipe (N1) — délibérément DANS cette section et non
                dans « Scrims » : déclarer sa disponibilité récurrente est un
                geste de membre, pas de capitaine. C'est le premier objet
                auquel les 4 personnes d'un roster qui ne gèrent rien peuvent
                contribuer. */}
            {team && <TeamRhythmCard />}
            {/* id : cible du lien « lier Discord » de la checklist réseau. */}
            <div id="discord-link" className="scroll-mt-24">
              <DiscordLinkCard />
            </div>
          </CategorySection>

          {/* ─────────────  Compétition  ─────────────
              NextMatchCard rend toujours un contenu (placeholder sobre s'il n'y
              a pas de match), la catégorie est donc toujours pertinente. */}
          <CategorySection label={t.catCompetition}>
            <NextMatchCard initialData={nextMatch} />
            <MatchReadinessCard nextMatch={nextMatch} t={t} />
            {/* Mémoire d'équipe (N2) — ouverte à tout le roster, comme le
                rythme : une revue est le document partagé de l'équipe, pas le
                carnet de sa capitaine. Se masque d'elle-même tant qu'aucun
                affrontement n'a été joué. */}
            {team && <TeamMemoryCard />}
          </CategorySection>

          {/* ─────────────  Scrims  ─────────────
              Réservée aux capitaines/managers avec équipe : le hub en est
              l'en-tête permanent, les blocs de détail (négociations, grilles)
              s'affichent dessous quand ils sont non vides. */}
          {team && canManage && (
            <CategorySection label={t.catScrims}>
              <ScrimsHubCard
                team={team}
                isCaptain={isCaptain}
                isManager={isManager}
                pendingCount={pendingScrims.length}
                gridsCount={scrimPlannings.length}
                openForScrim={!!team.open_for_scrim}
                onToggle={handleToggleScrimOpen}
                toggling={togglingScrim}
                t={t}
              />

              {/* Les scrims eux-mêmes : à rapporter, à venir, récents. Le hub
                  au-dessus pilote la disponibilité ; ce bloc porte les
                  rencontres et le report de score. */}
              <MyScrimsCard />

              {/* Scrims en attente de MON action */}
              {pendingScrims.length > 0 && (
                <div className="rounded-2xl border border-blue-400/20 bg-blue-500/5 backdrop-blur-xl p-6">
                  <h3 className="text-lg font-semibold mb-4">
                    {t.pendingScrims}
                    <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-blue-500 text-[10px] font-bold text-white">
                      {pendingScrims.length}
                    </span>
                  </h3>
                  {scrimError && (
                    <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                      {scrimError}
                    </div>
                  )}
                  <div className="space-y-3">
                    {pendingScrims.map((scrim) => (
                      <ScrimNegotiationCard
                        key={scrim.id}
                        scrim={scrim}
                        busy={scrimActionId === scrim.id}
                        locale={locale}
                        t={t}
                        onAction={handleScrimAction}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Grilles de dispo ouvertes — s'auto-masque si vide. Ancre ciblée
                  par le CTA « Voir les grilles » du hub. Entrées fournies par la
                  page pour éviter un second fetch. */}
              <div id="scrim-plannings" className="scroll-mt-24">
                <ScrimPlanningsDashboardCard
                  token={token}
                  entries={scrimPlannings}
                />
              </div>
            </CategorySection>
          )}

          {/* ─────────────  Actions rapides  ───────────── */}
          {team && (
            <CategorySection label={t.catQuickActions}>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
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
            </CategorySection>
          )}

          {/* Rejoindre le cast — flux simple pour les joueuses SANS équipe
              (pas de catégorie forcée). */}
          {!team && (
            <div className="mt-10 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] backdrop-blur-xl p-6">
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

          {/* ─────────────  Activité  ─────────────
              DemandesHistory s'auto-masque quand il n'y a aucune demande ; on
              n'affiche donc l'en-tête de catégorie que dans ce cas. */}
          {demandes.length > 0 && (
            <CategorySection label={t.catActivity}>
              <DemandesHistory
                demandes={demandes}
                onCancel={handleCancelDemande}
              />
            </CategorySection>
          )}

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
