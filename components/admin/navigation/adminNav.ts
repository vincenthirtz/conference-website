import type { AdminLink } from '@/types/components';
import type { StaffRole } from '@/utils/staff';

/**
 * Source unique de vérité de la navigation admin.
 *
 * Historiquement, l'arbre du menu top-bar (`components/Navbar/adminLinks.ts`)
 * et les cartes de raccourci du dashboard (`pages/admin/index.tsx`) étaient
 * maintenus en parallèle : ajouter/supprimer une page imposait d'éditer les
 * deux. Ce module fusionne les deux en un seul arbre `ADMIN_NAV`, dont on
 * dérive :
 *   - l'arbre `AdminLink[]` du top-bar via `buildAdminLinks()`
 *   - les cartes du dashboard via `collectAdminNavCards()`
 *
 * Contrat de non-régression : les deux surfaces doivent rendre exactement comme
 * avant (mêmes entrées, mêmes rôles, mêmes routes, même ordre). Certaines
 * entrées n'existent que sur une surface — un flag par surface le gère :
 *   - `topBarLabel` absent  => l'item n'apparaît PAS dans le top-bar
 *     (ex. quick-bracket / leagues / ratings / api-tokens, historiquement
 *     dashboard-only).
 *   - `card` absent         => l'item n'apparaît PAS comme carte dashboard.
 *
 * Les LIBELLÉS divergent volontairement entre surfaces et ce module conserve
 * cette divergence (voir le rapport) :
 *   - le top-bar affiche des libellés FR figés (`topBarLabel`), non i18n —
 *     comme aujourd'hui ;
 *   - les cartes affichent des libellés/descriptions i18n via `useAdminT`
 *     (`card.titleKey` / `card.descKey`, résolus par la page).
 */

/** Clés d'icônes SVG. Le rendu JSX vit dans `pages/admin/index.tsx` (map ICON). */
export type AdminNavIcon =
  | 'trophy'
  | 'users'
  | 'inbox'
  | 'ticket'
  | 'shield'
  | 'mail'
  | 'clock'
  | 'cog'
  | 'signal'
  | 'chart'
  | 'medal'
  | 'bolt'
  | 'key';

/** Métadonnées propres à la carte dashboard (absentes du top-bar). */
export type AdminNavCardMeta = {
  /** Position dans la grille de cartes (ordre stable, indépendant de l'arbre). */
  order: number;
  /** Clé i18n du titre dans le dictionnaire `adminDashboard`. */
  titleKey: string;
  /** Clé i18n de la description dans le dictionnaire `adminDashboard`. */
  descKey: string;
  icon: AdminNavIcon;
  /** Classes Tailwind d'accent (bordure + dégradé + texte). */
  accent: string;
};

export type AdminNavNode = {
  /** Identifiant stable (debug / clés React). */
  id: string;
  /** Libellé FR figé du top-bar. Absent => item non exposé dans le top-bar. */
  topBarLabel?: string;
  /** Route. Vide/absent pour un conteneur (section/sous-section) pur. */
  href?: string;
  /** Rôle minimum requis. Partagé par les deux surfaces (gating identique). */
  minRole?: StaffRole;
  /** Métadonnées de carte dashboard. Absent => pas de carte. */
  card?: AdminNavCardMeta;
  children?: AdminNavNode[];
};

/**
 * Arbre unifié. L'ordre des nœuds `topBarLabel` reproduit l'ordre historique
 * du menu ; l'ordre des cartes est piloté par `card.order` (voir plus bas).
 */
export const ADMIN_NAV: AdminNavNode[] = [
  {
    id: 'dashboard',
    topBarLabel: 'Dashboard',
    href: '/admin',
    minRole: 'caster',
  },
  {
    id: 'profile',
    topBarLabel: 'Mon profil',
    href: '/admin/profile',
    minRole: 'caster',
  },
  {
    id: 'tournoi-en-cours',
    topBarLabel: 'Tournoi en cours',
    href: '/admin/tournoi-en-cours',
    minRole: 'caster',
    card: {
      order: 0,
      titleKey: 'navTournoiEnCoursTitle',
      descKey: 'navTournoiEnCoursDesc',
      icon: 'signal',
      accent: 'border-pink-500/30 from-pink-500/10 text-pink-300',
    },
  },
  {
    id: 'tournois',
    topBarLabel: 'Tournois',
    href: '',
    minRole: 'manager',
    children: [
      {
        id: 'tournaments-list',
        topBarLabel: 'Tournois – liste',
        href: '/admin/tournaments',
        minRole: 'manager',
        card: {
          order: 1,
          titleKey: 'navTournoisTitle',
          descKey: 'navTournoisDesc',
          icon: 'trophy',
          accent: 'border-amber-500/30 from-amber-500/10 text-amber-300',
        },
      },
      {
        id: 'tournaments-create',
        topBarLabel: 'Créer un tournoi',
        href: '/admin/tournaments/create',
        minRole: 'manager',
      },
      {
        id: 'tournaments-webhooks',
        topBarLabel: 'Webhooks Discord (par tournoi)',
        href: '/admin/tournaments',
        minRole: 'admin',
      },
      {
        id: 'tournaments-checkin',
        topBarLabel: 'Check-in matchs (par tournoi)',
        href: '/admin/tournaments',
        minRole: 'manager',
      },
      {
        id: 'disputes',
        topBarLabel: 'Disputes ouvertes (board)',
        href: '/admin/disputes',
        minRole: 'manager',
      },
      {
        id: 'broadcast-live',
        topBarLabel: 'Broadcast live (cockpit)',
        href: '/admin/broadcast/live',
        minRole: 'manager',
        card: {
          order: 8,
          titleKey: 'navRunOfShowTitle',
          descKey: 'navRunOfShowDesc',
          icon: 'clock',
          accent: 'border-pink-500/30 from-pink-500/10 text-pink-300',
        },
      },
      // Dashboard-only (pas d'entrée top-bar historiquement).
      {
        id: 'quick-bracket',
        href: '/admin/quick-bracket',
        minRole: 'manager',
        card: {
          order: 2,
          titleKey: 'navQuickBracketTitle',
          descKey: 'navQuickBracketDesc',
          icon: 'bolt',
          accent: 'border-amber-500/30 from-amber-500/10 text-amber-300',
        },
      },
      {
        id: 'leagues',
        href: '/admin/leagues',
        minRole: 'manager',
        card: {
          order: 11,
          titleKey: 'navLeaguesTitle',
          descKey: 'navLeaguesDesc',
          icon: 'medal',
          accent: 'border-amber-500/30 from-amber-500/10 text-amber-300',
        },
      },
      {
        id: 'ratings',
        href: '/admin/ratings',
        minRole: 'manager',
        card: {
          order: 12,
          titleKey: 'navRatingsTitle',
          descKey: 'navRatingsDesc',
          icon: 'chart',
          accent: 'border-blue-500/30 from-blue-500/10 text-blue-300',
        },
      },
    ],
  },
  {
    id: 'scrims',
    topBarLabel: 'Scrims',
    href: '',
    minRole: 'manager',
    children: [
      {
        id: 'scrims-list',
        topBarLabel: 'Scrims – liste',
        href: '/admin/scrims',
        minRole: 'manager',
      },
      {
        id: 'scrims-create',
        topBarLabel: 'Créer un scrim',
        href: '/admin/scrims/create',
        minRole: 'manager',
      },
      {
        id: 'scrims-demandes',
        topBarLabel: 'Demandes de scrim',
        href: '/admin/demandes?type=scrim',
        minRole: 'manager',
      },
    ],
  },
  {
    id: 'equipes',
    topBarLabel: 'Équipes',
    href: '',
    minRole: 'manager',
    children: [
      {
        id: 'teams-list',
        topBarLabel: 'Équipes – liste',
        href: '/admin/teams',
        minRole: 'manager',
        card: {
          order: 3,
          titleKey: 'navTeamsTitle',
          descKey: 'navTeamsDesc',
          icon: 'users',
          accent: 'border-blue-500/30 from-blue-500/10 text-blue-300',
        },
      },
      {
        id: 'teams-create',
        topBarLabel: 'Créer une équipe',
        href: '/admin/teams/new',
        minRole: 'manager',
      },
      {
        id: 'teams-my',
        topBarLabel: 'Gérer mon équipe (capitaine)',
        href: '/admin/teams/my',
        minRole: 'caster',
      },
      {
        id: 'demandes',
        topBarLabel: 'Demandes joueurs / équipes',
        href: '/admin/demandes',
        minRole: 'manager',
        card: {
          order: 4,
          titleKey: 'navDemandesTitle',
          descKey: 'navDemandesDesc',
          icon: 'inbox',
          accent: 'border-emerald-500/30 from-emerald-500/10 text-emerald-300',
        },
      },
    ],
  },
  {
    id: 'contenu',
    topBarLabel: 'Contenu',
    href: '',
    minRole: 'manager',
    children: [
      {
        id: 'announcements',
        topBarLabel: 'Annonces',
        href: '',
        minRole: 'admin',
        children: [
          {
            id: 'announcements-list',
            topBarLabel: 'Liste des annonces',
            href: '/admin/announcements',
            minRole: 'admin',
          },
          {
            id: 'announcements-new',
            topBarLabel: 'Créer une annonce',
            href: '/admin/announcements/new',
            minRole: 'admin',
          },
        ],
      },
      {
        id: 'news',
        topBarLabel: 'News',
        href: '',
        minRole: 'admin',
        children: [
          {
            id: 'news-list',
            topBarLabel: 'Liste des news',
            href: '/admin/news',
            minRole: 'admin',
          },
          {
            id: 'news-new',
            topBarLabel: 'Créer une news',
            href: '/admin/news/new',
            minRole: 'admin',
          },
        ],
      },
      {
        id: 'twitch-channels',
        topBarLabel: 'Chaînes Twitch',
        href: '/admin/twitch-channels',
        minRole: 'admin',
      },
      {
        id: 'cast-members',
        topBarLabel: 'Casteuses',
        href: '/admin/cast-members',
        minRole: 'admin',
      },
      {
        id: 'pole-members',
        topBarLabel: 'Pôles de l’asso',
        href: '/admin/pole-members',
        minRole: 'admin',
      },
      {
        id: 'partners',
        topBarLabel: 'Partenaires',
        href: '',
        minRole: 'admin',
        children: [
          {
            id: 'partners-list',
            topBarLabel: 'Partenaires – liste',
            href: '/admin/partners',
            minRole: 'admin',
          },
          {
            id: 'partnership-requests',
            topBarLabel: 'Demandes de partenariat',
            href: '/admin/partnership-requests',
            minRole: 'admin',
          },
        ],
      },
      {
        id: 'comments',
        topBarLabel: 'Commentaires',
        href: '/admin/comments',
        minRole: 'manager',
        card: {
          order: 6,
          titleKey: 'navModerationTitle',
          descKey: 'navModerationDesc',
          icon: 'shield',
          accent: 'border-red-500/30 from-red-500/10 text-red-300',
        },
      },
      {
        id: 'support',
        topBarLabel: 'Tickets de support',
        href: '/admin/support',
        minRole: 'manager',
        card: {
          order: 5,
          titleKey: 'navSupportTitle',
          descKey: 'navSupportDesc',
          icon: 'ticket',
          accent: 'border-purple-500/30 from-purple-500/10 text-purple-300',
        },
      },
      {
        id: 'blacklist',
        topBarLabel: 'Blacklist joueurs',
        href: '/admin/moderation/blacklist',
        minRole: 'manager',
      },
    ],
  },
  {
    id: 'configuration',
    topBarLabel: 'Configuration',
    href: '',
    minRole: 'manager',
    children: [
      {
        id: 'notifications',
        topBarLabel: 'Notifications',
        href: '/admin/notifications',
        minRole: 'caster',
      },
      {
        id: 'site-settings',
        topBarLabel: 'Paramètres du site',
        href: '/admin/site-settings',
        minRole: 'admin',
        card: {
          order: 13,
          titleKey: 'navSiteSettingsTitle',
          descKey: 'navSiteSettingsDesc',
          icon: 'cog',
          accent: 'border-amber-500/30 from-amber-500/10 text-amber-300',
        },
      },
      {
        id: 'users-manage',
        topBarLabel: 'Gérer les utilisateurs',
        href: '/admin/users/manage',
        minRole: 'admin',
        card: {
          order: 9,
          titleKey: 'navUsersTitle',
          descKey: 'navUsersDesc',
          icon: 'users',
          accent: 'border-emerald-500/30 from-emerald-500/10 text-emerald-300',
        },
      },
      {
        id: 'users-new',
        topBarLabel: 'Créer un utilisateur',
        href: '/admin/users/new',
        minRole: 'admin',
      },
      {
        id: 'adherents',
        topBarLabel: 'Adhérents',
        href: '',
        minRole: 'admin',
        children: [
          {
            id: 'adherents-list',
            topBarLabel: 'Liste des adhérents',
            href: '/admin/adherents',
            minRole: 'admin',
          },
          {
            id: 'adherents-new',
            topBarLabel: 'Ajouter un adhérent',
            href: '/admin/adherents/new',
            minRole: 'admin',
          },
        ],
      },
      {
        id: 'campaigns',
        topBarLabel: 'Campagnes emails',
        href: '/admin/campaigns',
        minRole: 'admin',
        card: {
          order: 7,
          titleKey: 'navCampaignsTitle',
          descKey: 'navCampaignsDesc',
          icon: 'mail',
          accent: 'border-blue-500/30 from-blue-500/10 text-blue-300',
        },
      },
      {
        id: 'logs-stats',
        topBarLabel: 'Logs & stats',
        href: '',
        minRole: 'manager',
        children: [
          {
            id: 'logs',
            topBarLabel: 'Journaux',
            href: '/admin/logs',
            minRole: 'manager',
          },
          {
            id: 'stats',
            topBarLabel: 'Statistiques',
            href: '/admin/stats',
            minRole: 'manager',
            card: {
              order: 10,
              titleKey: 'navStatsTitle',
              descKey: 'navStatsDesc',
              icon: 'chart',
              accent: 'border-purple-500/30 from-purple-500/10 text-purple-300',
            },
          },
        ],
      },
      {
        id: 'tenants',
        topBarLabel: 'Tenants',
        href: '',
        minRole: 'manager',
        children: [
          {
            id: 'onboarding-queue',
            topBarLabel: 'Onboarding queue (unifiée)',
            href: '/admin/onboarding-queue',
            minRole: 'manager',
          },
          {
            id: 'tenants-list',
            topBarLabel: 'Liste des tenants',
            href: '/admin/tenants',
            minRole: 'manager',
          },
          {
            id: 'tenants-new',
            topBarLabel: 'Créer un tenant',
            href: '/admin/tenants/new',
            minRole: 'manager',
          },
          {
            id: 'pending-guild-links',
            topBarLabel: 'Serveurs Discord en attente',
            href: '/admin/pending-guild-links',
            minRole: 'manager',
          },
          {
            id: 'tenant-requests',
            topBarLabel: 'Demandes self-service',
            href: '/admin/tenant-requests',
            minRole: 'owner',
          },
        ],
      },
      // Dashboard-only (pas d'entrée top-bar historiquement).
      {
        id: 'api-tokens',
        href: '/admin/api-tokens',
        minRole: 'admin',
        card: {
          order: 14,
          titleKey: 'navApiTokensTitle',
          descKey: 'navApiTokensDesc',
          icon: 'key',
          accent: 'border-teal-500/30 from-teal-500/10 text-teal-300',
        },
      },
    ],
  },
];

/**
 * Dérive l'arbre `AdminLink[]` consommé par le top-bar (structure historique
 * de `ADMIN_LINKS`). Les nœuds sans `topBarLabel` (dashboard-only) sont ignorés.
 * La clé `children` n'est présente que si le nœud a des enfants exposés — comme
 * dans le littéral d'origine (les feuilles n'ont pas de `children`).
 */
export function buildAdminLinks(
  nodes: AdminNavNode[] = ADMIN_NAV
): AdminLink[] {
  const out: AdminLink[] = [];
  for (const node of nodes) {
    if (!node.topBarLabel) continue;
    const children = node.children ? buildAdminLinks(node.children) : [];
    const link: AdminLink = {
      title: node.topBarLabel,
      ref: node.href ?? '',
      minRole: node.minRole,
    };
    if (children.length > 0) link.children = children;
    out.push(link);
  }
  return out;
}

/** Carte dashboard résolue depuis l'arbre (métadonnées + href/rôle du nœud). */
export type AdminNavCard = {
  id: string;
  href: string;
  minRole: StaffRole;
  card: AdminNavCardMeta;
};

/**
 * Collecte tous les nœuds porteurs de métadonnées `card`, quel que soit leur
 * niveau dans l'arbre, triés par `card.order` pour reproduire l'ordre
 * historique de la grille du dashboard.
 */
export function collectAdminNavCards(
  nodes: AdminNavNode[] = ADMIN_NAV
): AdminNavCard[] {
  const out: AdminNavCard[] = [];
  const walk = (list: AdminNavNode[]) => {
    for (const node of list) {
      if (node.card && node.href) {
        out.push({
          id: node.id,
          href: node.href,
          minRole: node.minRole ?? 'admin',
          card: node.card,
        });
      }
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return out.sort((a, b) => a.card.order - b.card.order);
}
