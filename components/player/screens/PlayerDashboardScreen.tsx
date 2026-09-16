// components/player/screens/PlayerDashboardScreen.tsx
//
// Corps du dashboard joueur — extrait de pages/player/index.tsx (S2 de
// docs/PLAN-espace-unifie.md) pour que l'admin puisse afficher LE VRAI espace
// joueur au lieu d'en maintenir une copie.
//
// Deux modes, pilotés par PlayerAreaContext :
//   - self : /player, l'utilisateur connecté agit sur ses propres données ;
//   - inspection : /admin/users/[id]/player-view, `?as=` sur chaque lecture et
//     toute mutation masquée (readOnly).
//
// Ce composant ne connaît PAS le mode : il lit le contexte. Les cartes qui
// fetchent leur propre tranche (NextMatchCard, TeamHealthCard, MyScrimsCard…)
// font pareil de leur côté.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import Router from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import ProfileSummaryCard from '@/components/player/ProfileSummaryCard';
import WelcomeGiftCard from '@/components/player/WelcomeGiftCard';
import SupporterWelcomeCard from '@/components/player/SupporterWelcomeCard';
import DiscordLinkCard from '@/components/player/DiscordLinkCard';
import NetworkOnboardingCard from '@/components/player/NetworkOnboardingCard';
import RegistrationDeadlineBanner from '@/components/player/RegistrationDeadlineBanner';
import InvitationsSection from '@/components/player/InvitationsSection';
import MyScrimsCard from '@/components/player/MyScrimsCard';
import TeamRhythmCard from '@/components/player/TeamRhythmCard';
import TeamMemoryCard from '@/components/player/TeamMemoryCard';
import TeamHealthCard from '@/components/player/TeamHealthCard';
import ProgressionCard from '@/components/player/ProgressionCard';
import TeamCard, { type TeamMemberLite } from '@/components/player/TeamCard';
import DemandesHistory from '@/components/player/DemandesHistory';
import QuickAction, {
  type QuickActionProps,
} from '@/components/player/QuickAction';
import NextMatchCard from '@/components/player/NextMatchCard';
import MatchLineupCard from '@/components/player/MatchLineupCard';
import { PlayerDashboardSkeleton } from '@/components/player/Skeletons';
import TodoBanner from '@/components/player/TodoBanner';
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
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import {
  useActiveTeam,
  type ActiveTeamOption,
} from '@/components/player/ActiveTeamContext';
import ActiveTeamSwitcher from '@/components/player/ActiveTeamSwitcher';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import {
  makeTeamPermissionCheck,
  readTeamPermissions,
} from '@/utils/teams/clientPermissions';
import type { TeamPermission } from '@/utils/teamRoles';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';

import type { TodoItem } from '@/pages/api/player/dashboard';
import type { NetworkStatus } from '@/pages/api/player/network-status';
import type { PlayerWelcomeGiftResponse } from '@/pages/api/player/tcg/welcome-gift';
import {
  DASHBOARD_ANCHORS,
  hashTargetId,
  sectionPanelId,
  shouldExpandForHash,
} from '@/utils/player/dashboardAnchors';

import { logger } from '../../../utils/logger';
import nsPlayerIndex from '@/lib/i18n/locales/fr/playerIndex';

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
  /**
   * Permissions EFFECTIVES sur l'équipe affichée. `isManager` ne dit que « ce
   * rôle accorde au moins une permission » : un coach (scrims + feuille de
   * match) le voyait donc `true` et se faisait proposer roster, transferts et
   * gestion d'équipe, refusés ensuite par le serveur.
   */
  permissions?: TeamPermission[];
  demandesCaptain?: Demande[];
  demandesJoin?: Demande[];
  pendingScrims?: PendingScrim[];
  unreadMessages?: number;
  nextMatch?: NextMatchData;
  /** Gestes en attente, calculés serveur et plafonnés à trois (lot J6). */
  todo?: TodoItem[];
  /** Équipes gérées — alimente le sélecteur (manager multi-équipes). */
  managedTeams?: ActiveTeamOption[];
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
  /** Prédicat de permission effective (cf. utils/teams/clientPermissions). */
  can: (permission: TeamPermission) => boolean;
  unreadMessages: number;
  t: typeof nsPlayerIndex.fr;
}): QuickActionProps[] {
  const { team, isCaptain, isManager, can, unreadMessages, t } = args;
  const canManage = isCaptain || isManager;
  const actions: QuickActionProps[] = [];

  // Proposer le transfert de QUELQU'UN D'AUTRE demande `manage_roster` (cf.
  // /api/demandes/transfer). Sans la permission, l'action reste — mais dans sa
  // variante « demander MON transfert », qui, elle, est ouverte à tous.
  actions.push({
    href: '/player/requests?tab=transfer',
    label: can('manage_roster') ? t.qaProposeTransfer : t.qaRequestTransfer,
    description: can('manage_roster')
      ? t.qaTransferPlayer
      : t.qaTransferToOther,
    iconPath: SVG_PATHS.transfer,
    tone: 'purple',
  });

  if (can('manage_scrims')) {
    actions.push({
      href: '/player/requests?tab=scrim',
      label: t.qaProposeScrim,
      description: t.qaFriendlyMatch,
      iconPath: SVG_PATHS.scrim,
      tone: 'blue',
    });
  }

  if (canManage) {
    // Messagerie : la LECTURE des conversations est ouverte à qui gère
    // l'équipe, seul l'envoi exige `send_captain_messages` (la page masque son
    // formulaire le cas échéant). L'entrée reste donc visible.
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
export function CategorySection({
  id,
  label,
  action,
  children,
}: {
  /** Clé de mémorisation du pli — stable, jamais le libellé traduit. */
  id: string;
  label: string;
  /**
   * Lien d'en-tête, à droite du libellé (« Voir tous mes matchs »). Hors du
   * bouton de pli : il reste atteignable section repliée.
   */
  action?: ReactNode;
  children: ReactNode;
}) {
  const t = useT(nsPlayerIndex);
  // Pli mémorisé PAR PERSONNE et par navigateur (lot J6). Ouvert par défaut :
  // on ne cache rien à quelqu'un qui n'a rien demandé — on lui donne le moyen
  // de ranger ce qu'il ne regarde jamais.
  const storageKey = `player.section.${id}.collapsed`;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(storageKey) === '1');
    } catch {
      /* navigation privée / stockage bloqué : on reste déplié */
    }
  }, [storageKey]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        /* idem : le pli reste alors le temps de la page */
      }
      return next;
    });
  };

  const panelId = sectionPanelId(id);
  const panelRef = useRef<HTMLDivElement>(null);

  // Un lien vers une ancre de CETTE section (mail « on veut jouer contre
  // vous » → `#section-scrims`, bandeau « à faire » → `#pending-scrims`) doit
  // l'ouvrir : une ancre dans un élément `hidden` ne fait pas défiler, et le
  // pli est mémorisé — quelqu'un qui avait replié « Scrims » ne pouvait plus y
  // être amené par aucun lien. Le dépli est TEMPORAIRE (non écrit en
  // localStorage) : suivre un lien n'est pas changer d'avis sur le rangement.
  //
  // Déclaré APRÈS l'effet de restauration : au montage, le dépli passe après
  // la lecture du pli mémorisé. `hashChangeComplete` couvre le clic sur un
  // `<Link>` depuis /player même (Next pousse l'URL sans `hashchange` natif) ;
  // `hashchange` couvre le reste. Le défilement lui-même est fait par l'écran.
  useEffect(() => {
    const reveal = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const expand = shouldExpandForHash(
        window.location.hash,
        panelId,
        (targetId) => {
          const el = document.getElementById(targetId);
          return !!el && panel.contains(el);
        }
      );
      if (expand) setCollapsed(false);
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    Router.events.on('hashChangeComplete', reveal);
    return () => {
      window.removeEventListener('hashchange', reveal);
      Router.events.off('hashChangeComplete', reveal);
    };
  }, [panelId]);

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="min-w-0 flex-1">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls={panelId}
            className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 transition hover:text-gray-300"
          >
            <span
              aria-hidden
              className={`inline-block transition-transform ${collapsed ? '' : 'rotate-90'}`}
            >
              ›
            </span>
            {label}
            <span className="sr-only">
              {collapsed ? t.sectionExpand : t.sectionCollapse}
            </span>
          </button>
        </h2>
        {action}
      </div>
      <div
        id={panelId}
        ref={panelRef}
        hidden={collapsed}
        className="scroll-mt-24 space-y-6"
      >
        {children}
      </div>
    </section>
  );
}

/**
 * Défile jusqu'à la cible du hash courant, deux images plus tard : le temps
 * qu'une `CategorySection` repliée se déplie (son effet a posé l'état, le rendu
 * suit). Sans cible dans le DOM, ne fait rien.
 */
function scrollToHashTarget() {
  const targetId = hashTargetId(window.location.hash);
  if (!targetId) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document
        .getElementById(targetId)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  });
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
  t: typeof nsPlayerIndex.fr;
}) {
  if (!nextMatch?.match || !nextMatch.team) return null;

  const readiness = nextMatch.readiness;
  const shortfall = readiness?.shortfall ?? 0;
  const hasWarning = shortfall > 0;

  const checkin = nextMatch.checkin;
  // Fil du match (J1) plutôt que la fiche publique : d'ici, le geste attendu
  // est de préparer SON match, pas de le consulter.
  const matchHref = `/player/match/${nextMatch.match.id}`;

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
            href={matchHref}
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

export default function PlayerDashboardScreen() {
  const t = useT(nsPlayerIndex);
  const locale = useLocale();
  // `next` : sans lui, une visiteuse déconnectée arrivée par un lien (mail de
  // scrim, notification) repartait de /login vers la page d'accueil.
  const {
    user,
    token,
    loading: authLoading,
    ready,
  } = usePlayerSession({ redirectTo: '/login?next=/player' });
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  // `withSubject` redirige chaque lecture vers l'utilisateur inspecté ;
  // `readOnly` masque tout ce qui écrit. En mode self, les deux sont neutres.
  const { withSubject, readOnly, isInspecting, subjectName } = usePlayerArea();
  // Équipe sur laquelle le tableau de bord travaille (manager multi-équipes).
  const { withTeam, publishManagedTeams } = useActiveTeam();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<TeamInfo>(null);
  const [members, setMembers] = useState<TeamMemberLite[]>([]);
  const [isCaptain, setIsCaptain] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [permissions, setPermissions] = useState<TeamPermission[]>([]);
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
  const [todo, setTodo] = useState<TodoItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Lectures PARTAGÉES par deux cartes voisines, faites ici une seule fois
  // (même motif que `NextMatchCard initialData=`). `null` = pas encore de
  // réponse, ou échec : chaque carte se comporte alors comme pendant son
  // propre chargement. Avant : `RegistrationDeadlineBanner` et
  // `NetworkOnboardingCard` appelaient `/api/player/network-status` au même
  // instant, `WelcomeGiftCard` et `SupporterWelcomeCard` faisaient de même sur
  // `/api/player/tcg/welcome-gift` — qui exécute un calcul d'éligibilité.
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(
    null
  );
  const [welcomeGift, setWelcomeGift] =
    useState<PlayerWelcomeGiftResponse | null>(null);

  const canManage = isCaptain || isManager;
  /**
   * Ce que l'utilisateur peut RÉELLEMENT faire sur l'équipe affichée. Sert à la
   * VISIBILITÉ (pas de readOnly ici) : en inspection staff, l'écran doit rester
   * une photo fidèle de ce que la personne voit — seuls les gestes sont
   * neutralisés, comme partout ailleurs (`readOnly ? undefined : handler`).
   */
  const can = useMemo(
    () => makeTeamPermissionCheck(permissions),
    [permissions]
  );

  // Single aggregated call (one request, one wave). Each section is optional in
  // the payload and defaulted defensively, so a server-side section failure
  // (returned as empty/null) never blanks out the rest of the dashboard.
  const loadData = useCallback(async () => {
    const data = await adminFetchJson<DashboardResponse>(
      withTeam(withSubject('/api/player/dashboard'))
    ).catch(() => null);

    if (!data) {
      throw new Error('dashboard fetch failed');
    }

    setTeam(data.team || null);
    setMembers(Array.isArray(data.members) ? data.members : []);
    setIsCaptain(data.isCaptain || false);
    setIsManager(data.isManager || false);
    // Champ absent (payload d'un serveur antérieur) = repli sur l'ancien
    // comportement : tout, si l'appelant gère l'équipe. Cf. clientPermissions.
    setPermissions(
      readTeamPermissions({
        permissions: data.permissions,
        isCaptain: data.isCaptain,
        isManager: data.isManager,
      })
    );

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
    setTodo(Array.isArray(data.todo) ? data.todo : []);
    // La liste vient de la MÊME réponse que l'équipe affichée : le sélecteur
    // ne peut pas proposer une équipe que cet écran ne saurait pas charger.
    publishManagedTeams(data.managedTeams ?? []);
  }, [adminFetchJson, withSubject, withTeam, publishManagedTeams]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    // Hors inspection seulement : les deux cartes qui la lisent sont masquées
    // en inspection, et la route ne suit pas `?as=`.
    if (!isInspecting) {
      adminFetchJson<NetworkStatus>('/api/player/network-status', {
        skipAuthRedirect: true,
      })
        .then((data) => {
          if (!cancelled) setNetworkStatus(data);
        })
        .catch((err: unknown) => {
          logger.error('[player] network-status load error:', err);
        });
    }
    adminFetchJson<PlayerWelcomeGiftResponse>(
      withSubject('/api/player/tcg/welcome-gift'),
      { skipAuthRedirect: true }
    )
      .then((data) => {
        if (!cancelled) setWelcomeGift(data);
      })
      .catch((err: unknown) => {
        logger.error('[player] welcome-gift load error:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, isInspecting, adminFetchJson, withSubject]);

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
        await adminFetchJson(withTeam('/api/teams/scrim-requests'), {
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
    [adminFetchJson, confirm, t, withTeam]
  );

  // Grilles de dispo ouvertes : chargées une fois pour la catégorie Scrims.
  // Réservé à qui peut gérer les scrims — les seuls à voir le hub.
  const canManageScrims = can('manage_scrims');
  useEffect(() => {
    if (!ready || !token || !canManageScrims) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          withTeam(withSubject('/api/teams/scrim-plannings')),
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
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
  }, [ready, token, canManageScrims, withSubject, withTeam]);

  // Bascule la disponibilité aux scrims. L'état vit ici (page) : mise à jour
  // optimiste de team.open_for_scrim + feedback toast, cohérent avec le reste.
  const handleToggleScrimOpen = useCallback(async () => {
    if (togglingScrim) return;
    setTogglingScrim(true);
    try {
      const data = await adminFetchJson<{ open_for_scrim: boolean }>(
        withTeam('/api/teams/toggle-scrim-open'),
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
  }, [
    adminFetchJson,
    addToast,
    t,
    team?.open_for_scrim,
    togglingScrim,
    withTeam,
  ]);

  const handleLeaveTeam = async () => {
    setError(null);
    try {
      await adminFetchJson(withTeam('/api/teams/leave'), { method: 'POST' });
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

  // Arrivée sur `/player#…` : le navigateur a tenté le défilement pendant le
  // squelette, quand la cible n'existait pas. On le refait une fois le contenu
  // rendu, puis à chaque changement de hash sur la page.
  useEffect(() => {
    if (loading) return;
    scrollToHashTarget();
    window.addEventListener('hashchange', scrollToHashTarget);
    Router.events.on('hashChangeComplete', scrollToHashTarget);
    return () => {
      window.removeEventListener('hashchange', scrollToHashTarget);
      Router.events.off('hashChangeComplete', scrollToHashTarget);
    };
  }, [loading]);

  // `loading` n'est remis à `false` que par le `finally` de loadData, qui ne
  // tourne que session prête. Déconnectée, la condition `authLoading ||
  // loading` restait donc vraie pour toujours : un squelette qui ne se remplit
  // jamais, et le bloc « Connecte-toi » ci-dessous, inatteignable.
  if (authLoading || (ready && loading)) {
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

  // En inspection, `user` est le STAFF connecté : afficher son nom ici
  // donnerait un dashboard qui prétend être celui de quelqu'un d'autre. On
  // prend donc le nom fourni par l'hôte (la page admin connaît la cible).
  const displayName = isInspecting
    ? subjectName || t.fallbackName
    : user.user_metadata?.display_name ||
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

          {/* Ce qui attend une action, avant tout le reste : c'est la seule
              chose de cette page qui coûte quelque chose si on la rate. Se
              masque de lui-même quand il n'y a rien à faire. */}
          {!isInspecting && <TodoBanner items={todo} />}

          {/* Date butoir des inscriptions 2026 — en tête, avant tout le reste :
              c'est la seule information de cette page qui périme. Vaut pour
              les quatre rôles qui atterrissent ici (joueuse, capitaine, coach,
              manager), d'où l'absence de gate. Se masque tout seul une fois la
              date passée. */}
          {!isInspecting && user?.id && (
            <RegistrationDeadlineBanner
              userId={user.id}
              networkStatus={networkStatus}
            />
          )}

          {/* Sélecteur d'équipe — rendu seulement pour un manager qui en
              encadre plusieurs. Tout ce qui suit (équipe, scrims, prochain
              match, messages) porte sur l'équipe choisie. */}
          <ActiveTeamSwitcher className="mb-6" />

          {error && (
            <div
              className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </div>
          )}

          {/* Invitations reçues. Elles ne vivaient que sur /player/notifications :
              une joueuse invitée arrivait ici, ne voyait rien, et finissait par
              DEMANDER à rejoindre l'équipe qui l'avait déjà invitée. La section
              ne rend rien quand il n'y a aucune invitation en attente.
              L'enveloppe porte l'ancre du bandeau « à faire » : elle existe
              même avant que la liste soit chargée. */}
          {!isInspecting && (
            <div
              id={DASHBOARD_ANCHORS.invitations}
              className="mb-6 scroll-mt-24"
            >
              <InvitationsSection
                onJoined={() => {
                  void loadData();
                }}
              />
            </div>
          )}

          {/* ─────────────  Compétition  ─────────────
              JUSTE après ce qui attend une action : c'est la porte d'entrée
              d'un soir de match. Avant, une capitaine sur mobile faisait
              défiler l'opt-in push, le soutien à l'asso, la checklist réseau
              et tout « Profil & équipe » avant de voir son prochain match.
              NextMatchCard rend toujours un contenu (placeholder sobre s'il n'y
              a pas de match), la catégorie est donc toujours pertinente.
              L'agenda complet n'existe que sur /player/matches : l'en-tête y
              mène (masqué en inspection, où il ouvrirait l'agenda du staff). */}
          <CategorySection
            id="competition"
            label={t.catCompetition}
            action={
              isInspecting ? undefined : (
                <Link
                  href="/player/matches"
                  className="shrink-0 text-xs font-medium text-purple-300 transition hover:text-purple-200"
                >
                  {t.competitionAllMatches} <span aria-hidden>→</span>
                </Link>
              )
            }
          >
            <NextMatchCard initialData={nextMatch} />
            <MatchReadinessCard nextMatch={nextMatch} t={t} />
            {/* Feuille de match : qui joue CE match. Se tait d'elle-même sans
                match, sans permission `validate_lineup`, ou avant le check-in
                de l'équipe (cf. MatchLineupCard). */}
            {nextMatch?.match?.id && (
              <MatchLineupCard matchId={nextMatch.match.id} />
            )}
            {/* Progression (N8) — MA courbe de niveau et les jalons de mon
                équipe. Pas de gate d'équipe : le niveau appartient à la
                joueuse, la carte se masque d'elle-même si rien n'est mesuré. */}
            <ProgressionCard />
            {/* Mémoire d'équipe (N2) — ouverte à tout le roster, comme le
                rythme : une revue est le document partagé de l'équipe, pas le
                carnet de sa capitaine. Se masque d'elle-même tant qu'aucun
                affrontement n'a été joué. */}
            {team && !isInspecting && <TeamMemoryCard />}
          </CategorySection>

          {/* Push opt-in : carte visible tant que le user n'a pas activé /
              refusé / "plus tard". Routes vers /api/player/push/subscribe.
              loginPath='/login' : login universel qui route captain/player
              vers /player et le staff vers /admin. Sous la compétition : utile,
              mais jamais plus urgent que le prochain match. */}
          {!isInspecting && (
            <div className="mt-10 mb-6">
              <PushOptIn audience="player" variant="card" loginPath="/login" />
            </div>
          )}

          {/* Soutien à l'asso : billetterie gratuite, mais don / adhésion
              appréciés. Dismissible (localStorage). */}
          {!isInspecting && (
            <div className="mb-6">
              <SupportAssoCard />
            </div>
          )}

          {/* Identité réseau : ce qui manque pour EXISTER dans le réseau
              (Discord lié, BattleTag vérifié, découverte). Ne s'affiche que
              s'il reste quelque chose à faire, et refermable. */}
          {!isInspecting && user?.id && (
            <NetworkOnboardingCard userId={user.id} status={networkStatus} />
          )}

          {/* ─────────────  Profil & équipe  ───────────── */}
          <CategorySection id="profile-team" label={t.catProfileTeam}>
            <div className="grid gap-6 md:grid-cols-2">
              {/* ProfileSummaryCard rend la session courante : en inspection ce
                  serait la fiche du staff. La page admin porte déjà l'identité
                  de la cible, on ne la duplique pas ici. */}
              {!isInspecting && (
                <ProfileSummaryCard user={user} displayName={displayName} />
              )}
              <TeamCard
                team={team}
                isCaptain={isCaptain}
                pendingCaptainRequest={pendingCaptainRequest}
                pendingJoinRequest={pendingJoinRequest}
                onLeaveTeam={readOnly ? undefined : handleLeaveTeam}
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
            {!isInspecting && (
              <div id="discord-link" className="scroll-mt-24">
                <DiscordLinkCard />
              </div>
            )}
          </CategorySection>

          {/* ─────────────  Scrims  ─────────────
              Réservée aux capitaines/managers avec équipe : le hub en est
              l'en-tête permanent, les blocs de détail (négociations, grilles)
              s'affichent dessous quand ils sont non vides. */}
          {team && canManageScrims && (
            <CategorySection id="scrims" label={t.catScrims}>
              <ScrimsHubCard
                team={team}
                isCaptain={isCaptain}
                isManager={isManager}
                pendingCount={pendingScrims.length}
                gridsCount={scrimPlannings.length}
                openForScrim={!!team.open_for_scrim}
                onToggle={readOnly ? undefined : handleToggleScrimOpen}
                toggling={togglingScrim}
                t={t}
              />

              {/* Les scrims eux-mêmes : à rapporter, à venir, récents. Le hub
                  au-dessus pilote la disponibilité ; ce bloc porte les
                  rencontres et le report de score. */}
              <MyScrimsCard />

              {/* Scrims en attente de MON action. Ancre du bandeau « à
                  faire » (item `scrims`). */}
              {pendingScrims.length > 0 && (
                <div
                  id={DASHBOARD_ANCHORS.pendingScrims}
                  className="scroll-mt-24 rounded-2xl border border-blue-400/20 bg-blue-500/5 backdrop-blur-xl p-6"
                >
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
                        onAction={readOnly ? undefined : handleScrimAction}
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
            <CategorySection id="quick-actions" label={t.catQuickActions}>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {buildQuickActions({
                    team,
                    isCaptain,
                    isManager,
                    can,
                    unreadMessages,
                    t,
                  }).map((action) => (
                    <QuickAction key={action.href} {...action} />
                  ))}
                </div>
              </div>
            </CategorySection>
          )}

          {/* ─────────────  Ma collection (TCG)  ─────────────
              SANS condition sur `team`, à la différence des « Actions
              rapides » : on reçoit un paquet dès sa première victoire, y
              compris en scrim, et une joueuse sans équipe a donc une
              collection. La placer dans la section précédente l'aurait rendue
              invisible à celles-là mêmes qui débutent. */}
          <CategorySection id="tcg" label={t.catTcg}>
            {/* Le cadeau d'accueil, AVANT le raccourci : c'est une nouvelle,
                pas une action permanente. Il se retire de lui-même quand il
                n'y a rien à annoncer, et sa route honore `?as=` — il montre
                donc le cadeau de la personne inspectée, pas celui du staff. */}
            <WelcomeGiftCard data={welcomeGift} />
            {/* Le cadeau d'accueil SUPPORTRICE, qui se RÉCLAME. Il ne s'affiche
                qu'à qui peut réellement le prendre (rôle de compte
                « supporter », hors roster, pas déjà réclamé) — la route le
                calcule avec les conditions exactes du chemin d'écriture. */}
            <SupporterWelcomeCard data={welcomeGift} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <QuickAction
                href="/player/tcg"
                label={t.qaTcg}
                description={t.qaTcgDesc}
                tone="purple"
              />
              {/* Le guide, à côté de la collection et non caché dedans : les
                  questions qu'il traite — d'où viennent les paquets, ce que
                  devient ma photo — se posent souvent AVANT d'avoir une seule
                  carte à regarder. */}
              <QuickAction
                href="/player/tcg-guide"
                label={t.qaTcgGuide}
                description={t.qaTcgGuideDesc}
                tone="purple"
              />
            </div>
          </CategorySection>

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
            <CategorySection id="activity" label={t.catActivity}>
              <DemandesHistory
                demandes={demandes}
                onCancel={readOnly ? undefined : handleCancelDemande}
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
