// components/admin/commandPaletteActions.ts — les raccourcis fixes de la
// palette ⌘K, AVEC la règle d'accès de leur cible (lot L14).
//
// Ils étaient proposés à tout le staff : un arbitre voyait « Tâches » et
// « Support », qui le menaient à un 403. Ils sont désormais filtrés comme le
// menu (`canAccess`), et `adminLinkGuards.test.ts` vérifie que chaque règle
// n'est pas plus ouverte que la page cible.

import type { AccessRule } from '@/utils/admin/adminAccess';

export type PaletteActionTitleKey =
  | 'actionCurrentTournament'
  | 'actionTasks'
  | 'actionSupport';

export type PaletteAction = {
  id: string;
  kind: 'tournament' | 'task' | 'ticket';
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
];
