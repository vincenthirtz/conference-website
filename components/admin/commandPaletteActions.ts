// components/admin/commandPaletteActions.ts — les raccourcis fixes de la
// palette ⌘K, AVEC la règle d'accès de leur cible (lot L14).
//
// Ils étaient proposés à tout le staff : un arbitre voyait « Tâches » et
// « Support », qui le menaient à un 403. Ils sont désormais filtrés comme le
// menu (`canAccess`), et `adminLinkGuards.test.ts` vérifie que chaque règle
// n'est pas plus ouverte que la page cible.
//
// Deux familles : « aller à » (kind tournament/task/ticket) et « créer »
// (kind create) — les créations qu'on fait un soir de match sans vouloir
// passer par trois menus.

import type { AccessRule } from '@/utils/admin/adminAccess';

export type PaletteActionTitleKey =
  | 'actionCurrentTournament'
  | 'actionTasks'
  | 'actionSupport'
  | 'createTournament'
  | 'createTeam'
  | 'createNews'
  | 'createStaff';

export type PaletteAction = {
  id: string;
  kind: 'tournament' | 'task' | 'ticket' | 'create';
  titleKey: PaletteActionTitleKey;
  href: string;
  access: AccessRule;
};

export const PALETTE_ACTIONS: readonly PaletteAction[] = [
  {
    id: 'action-current',
    kind: 'tournament',
    titleKey: 'actionCurrentTournament',
    href: '/admin/tournoi-en-cours',
    access: { minRole: 'caster' },
  },
  {
    id: 'action-tasks',
    kind: 'task',
    titleKey: 'actionTasks',
    href: '/admin/tasks',
    access: { permission: 'manage_tasks' },
  },
  {
    // Le hub Modération admet le caster (onglet Litiges), mais l'onglet
    // SUPPORT est réservé à l'admin : la règle suit l'onglet, pas le hub.
    id: 'action-support',
    kind: 'ticket',
    titleKey: 'actionSupport',
    href: '/admin/moderation?tab=support',
    access: { minRole: 'admin' },
  },
  {
    id: 'create-tournament',
    kind: 'create',
    titleKey: 'createTournament',
    href: '/admin/tournaments/create',
    access: { permission: 'manage_tournaments' },
  },
  {
    id: 'create-team',
    kind: 'create',
    titleKey: 'createTeam',
    href: '/admin/teams/new',
    access: { permission: 'manage_teams' },
  },
  {
    id: 'create-news',
    kind: 'create',
    titleKey: 'createNews',
    href: '/admin/news/new',
    access: { permission: 'manage_communications' },
  },
  {
    id: 'create-staff',
    kind: 'create',
    titleKey: 'createStaff',
    href: '/admin/users/new',
    access: { permission: 'manage_staff' },
  },
];
