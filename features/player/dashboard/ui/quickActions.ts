// features/player/dashboard/ui/quickActions.ts — les raccourcis du tableau
// de bord, filtrés par les permissions EFFECTIVES de l'équipe affichée : on ne
// propose jamais un geste que le serveur refusera.

import type { QuickActionProps } from '@/components/player/QuickAction';
import type nsPlayerIndex from '@/lib/i18n/locales/fr/playerIndex';
import type { TeamPermission } from '@/utils/teamRoles';
import type { DashboardTeam } from '../hooks/usePlayerDashboard';

export const SVG_PATHS = {
  transfer: 'M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7',
  scrim: 'M22 12a10 10 0 11-20 0 10 10 0 0120 0zM10 8l6 4-6 4z',
  messages: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  team: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  publicTeam: 'M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3',
  caster:
    'M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8',
};

export function buildQuickActions(args: {
  team: NonNullable<DashboardTeam>;
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
