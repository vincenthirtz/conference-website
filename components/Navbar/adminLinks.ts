import type { AdminLink } from '@/types/components';
import { hasAtLeastRole, type StaffRole } from '@/utils/staff';

export const ADMIN_LINKS: AdminLink[] = [
  { title: 'Dashboard', ref: '/admin', minRole: 'caster' },
  {
    title: 'Tournoi en cours',
    ref: '/admin/tournoi-en-cours',
    minRole: 'caster',
  },
  {
    title: 'Tournois',
    ref: '',
    minRole: 'manager',
    children: [
      {
        title: 'Tournois – liste',
        ref: '/admin/tournaments',
        minRole: 'manager',
      },
      {
        title: 'Créer un tournoi',
        ref: '/admin/tournaments/create',
        minRole: 'manager',
      },
      {
        title: 'Webhooks Discord (par tournoi)',
        ref: '/admin/tournaments',
        minRole: 'admin',
      },
      {
        title: 'Check-in matchs (par tournoi)',
        ref: '/admin/tournaments',
        minRole: 'manager',
      },
    ],
  },
  {
    title: 'Équipes',
    ref: '',
    minRole: 'manager',
    children: [
      { title: 'Équipes – liste', ref: '/admin/teams', minRole: 'manager' },
      {
        title: 'Créer une équipe',
        ref: '/admin/teams/new',
        minRole: 'manager',
      },
      {
        title: 'Ajouter membre équipe',
        ref: '/admin/teams/add-member',
        minRole: 'manager',
      },
      {
        title: 'Gérer mon équipe (capitaine)',
        ref: '/admin/teams/my',
        minRole: 'caster',
      },
      {
        title: 'Demandes joueurs / équipes',
        ref: '/admin/demandes',
        minRole: 'manager',
      },
    ],
  },
  {
    title: 'Contenu',
    ref: '',
    minRole: 'manager',
    children: [
      {
        title: 'Annonces',
        ref: '',
        minRole: 'admin',
        children: [
          {
            title: 'Liste des annonces',
            ref: '/admin/announcements',
            minRole: 'admin',
          },
          {
            title: 'Créer une annonce',
            ref: '/admin/announcements/new',
            minRole: 'admin',
          },
        ],
      },
      {
        title: 'News',
        ref: '',
        minRole: 'admin',
        children: [
          { title: 'Liste des news', ref: '/admin/news', minRole: 'admin' },
          {
            title: 'Créer une news',
            ref: '/admin/news/new',
            minRole: 'admin',
          },
        ],
      },
      {
        title: 'Chaînes Twitch',
        ref: '',
        minRole: 'admin',
        children: [
          {
            title: 'Liste des chaînes',
            ref: '/admin/twitch-channels',
            minRole: 'admin',
          },
          {
            title: 'Ajouter une chaîne',
            ref: '/admin/twitch-channels/new',
            minRole: 'admin',
          },
        ],
      },
      {
        title: 'Casteuses',
        ref: '',
        minRole: 'admin',
        children: [
          {
            title: 'Liste des casteuses',
            ref: '/admin/cast-members',
            minRole: 'admin',
          },
          {
            title: 'Ajouter une casteuse',
            ref: '/admin/cast-members/new',
            minRole: 'admin',
          },
        ],
      },
      {
        title: 'Partenaires',
        ref: '',
        minRole: 'admin',
        children: [
          {
            title: 'Partenaires – liste',
            ref: '/admin/partners',
            minRole: 'admin',
          },
          {
            title: 'Ajouter un partenaire',
            ref: '/admin/partners/new',
            minRole: 'admin',
          },
          {
            title: 'Demandes de partenariat',
            ref: '/admin/partnership-requests',
            minRole: 'admin',
          },
        ],
      },
      {
        title: 'Commentaires',
        ref: '/admin/comments',
        minRole: 'manager',
      },
      {
        title: 'Tickets de support',
        ref: '/admin/support',
        minRole: 'manager',
      },
    ],
  },
  {
    title: 'Configuration',
    ref: '',
    minRole: 'manager',
    children: [
      {
        title: 'Paramètres du site',
        ref: '/admin/site-settings',
        minRole: 'admin',
      },
      {
        title: 'Gérer les utilisateurs',
        ref: '/admin/users/manage',
        minRole: 'admin',
      },
      {
        title: 'Créer un utilisateur',
        ref: '/admin/users/new',
        minRole: 'admin',
      },
      {
        title: 'Adhérents',
        ref: '',
        minRole: 'admin',
        children: [
          {
            title: 'Liste des adhérents',
            ref: '/admin/adherents',
            minRole: 'admin',
          },
          {
            title: 'Ajouter un adhérent',
            ref: '/admin/adherents/new',
            minRole: 'admin',
          },
        ],
      },
      {
        title: 'Campagnes emails',
        ref: '/admin/campaigns',
        minRole: 'admin',
      },
      {
        title: 'Logs & stats',
        ref: '',
        minRole: 'manager',
        children: [
          { title: 'Logs staff', ref: '/admin/logs', minRole: 'manager' },
          {
            title: 'Logs emails',
            ref: '/admin/email-logs',
            minRole: 'admin',
          },
          {
            title: 'Stats équipes',
            ref: '/admin/stats/teams',
            minRole: 'manager',
          },
          {
            title: 'Stats maps',
            ref: '/admin/stats/maps',
            minRole: 'manager',
          },
        ],
      },
    ],
  },
];

export function filterAdminLinks(
  staffRole: StaffRole | null,
  links: AdminLink[] = ADMIN_LINKS
): AdminLink[] {
  const canAccess = (minRole?: StaffRole) =>
    hasAtLeastRole(staffRole, minRole ?? 'admin');

  return links
    .map((item): AdminLink | null => {
      const itemMinRole = item.minRole ?? 'admin';
      const children: AdminLink[] =
        item.children
          ?.map((child) => ({
            ...child,
            minRole: child.minRole ?? itemMinRole,
          }))
          .filter((child) => canAccess(child.minRole)) ?? [];

      const selfAccessible = !!item.ref && canAccess(itemMinRole);
      if (!selfAccessible && children.length === 0) return null;

      return { ...item, children };
    })
    .filter((item): item is AdminLink => item !== null);
}
