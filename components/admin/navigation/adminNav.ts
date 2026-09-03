import type { AdminLink } from '@/types/components';
import { hasAtLeastRole } from '@/utils/staff';
import type { StaffRole } from '@/utils/staff';
import {
  roleHasStaffPermission,
  type StaffPermission,
} from '@/utils/staffPermissions';
import type { TenantKind } from '@/utils/tenantKind';

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
  | 'beaker'
  | 'map'
  | 'key'
  | 'trash'
  | 'help';

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
  /**
   * Permission exigée par la PAGE cible (lot A2). Quand elle est présente, elle
   * l'emporte sur `minRole` : c'est elle que la page applique côté serveur, et
   * un menu qui filtrerait autrement afficherait des entrées menant à un 403.
   *
   * Absente = gating historique par rôle, inchangé.
   */
  permission?: StaffPermission;
  /** Métadonnées de carte dashboard. Absent => pas de carte. */
  card?: AdminNavCardMeta;
  /**
   * Marque un nœud comme faisant partie de la « console développeur » (tenant
   * `kind='developer'`) : facturation, clés API, webhooks, hub dev, docs.
   * Un tenant développeur ne voit QUE les nœuds `devConsole:true` (le reste de
   * la nav admin est masqué). Absent/false pour tout le reste (cas organizer).
   */
  devConsole?: boolean;
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
    devConsole: true,
  },
  {
    // Regroupement top-bar « Compétition » : rassemble Tournoi en cours,
    // Tournois, Scrims et Équipes sous une seule entrée de menu (le top-bar
    // rend 3 niveaux). Regroupement pur : routes, rôles et cartes dashboard
    // inchangés (collectAdminNavCards parcourt tout l'arbre). Rôle du conteneur
    // = caster (le plus permissif : Tournoi en cours + « Gérer mon équipe »).
    id: 'competition',
    topBarLabel: 'Compétition',
    href: '',
    minRole: 'caster',
    children: [
      {
        // Porte du check-in : la seule entrée de menu d'un bénévole, dont
        // c'est l'unique permission. La cible réelle est une route dynamique
        // (`/admin/tournament/[id]/checkin`), donc invisible du menu — d'où ce
        // raccourci (lot A2).
        id: 'checkin-entry',
        topBarLabel: 'Check-in',
        href: '/admin/checkin',
        permission: 'run_checkin',
        card: {
          order: 0.5,
          titleKey: 'navCheckinTitle',
          descKey: 'navCheckinDesc',
          icon: 'clock',
          accent: 'border-amber-500/30 from-amber-500/10 text-amber-300',
        },
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
        minRole: 'admin',
        children: [
          {
            id: 'tournaments-list',
            topBarLabel: 'Tournois – liste',
            href: '/admin/tournaments',
            permission: 'manage_tournaments',
            minRole: 'admin',
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
            permission: 'manage_tournaments',
            minRole: 'admin',
          },
          {
            id: 'tournaments-webhooks',
            topBarLabel: 'Webhooks Discord (par tournoi)',
            href: '/admin/tournaments',
            permission: 'manage_tournaments',
            minRole: 'admin',
          },
          {
            id: 'tournaments-checkin',
            topBarLabel: 'Check-in matchs (par tournoi)',
            href: '/admin/tournaments',
            permission: 'manage_tournaments',
            minRole: 'admin',
          },
          {
            id: 'broadcast-live',
            topBarLabel: 'Broadcast live (cockpit)',
            href: '/admin/broadcast/live',
            minRole: 'admin',
            card: {
              order: 8,
              titleKey: 'navRunOfShowTitle',
              descKey: 'navRunOfShowDesc',
              icon: 'clock',
              accent: 'border-pink-500/30 from-pink-500/10 text-pink-300',
            },
          },
          // Régie : page admin /admin/regie (ex-cockpit caster). Ouverte
          // owner/admin/caster via une fiche cast_members interne
          // auto-provisionnée pour admin/owner (cf. utils/casterAuth.ts). La
          // card reste minRole 'admin' (raccourci dashboard) ; les casters
          // atteignent la régie via leur propre flux.
          {
            id: 'caster-cockpit',
            href: '/admin/regie',
            minRole: 'admin',
            card: {
              order: 8.5,
              titleKey: 'navCasterCockpitTitle',
              descKey: 'navCasterCockpitDesc',
              icon: 'signal',
              accent: 'border-rose-500/30 from-rose-500/10 text-rose-300',
            },
          },
          // Scènes caster : édition web des scènes de stream (`caster_scenes`,
          // table partagée avec l'app desktop womenscup-caster — synchro
          // Realtime bidirectionnelle) + overlays hébergés /overlay/caster/*.
          // Comme la régie : carte minRole 'admin', page accessible à tout
          // staff (gate SSR 'caster' + RLS écriture staff actif).
          {
            id: 'caster-scenes',
            href: '/admin/caster',
            minRole: 'admin',
            card: {
              order: 8.7,
              titleKey: 'navCasterScenesTitle',
              descKey: 'navCasterScenesDesc',
              icon: 'signal',
              accent: 'border-cyan-500/30 from-cyan-500/10 text-cyan-300',
            },
          },
          // Dashboard-only (pas d'entrée top-bar historiquement).
          {
            id: 'quick-bracket',
            href: '/admin/quick-bracket',
            permission: 'manage_tournaments',
            minRole: 'admin',
            card: {
              order: 2,
              titleKey: 'navQuickBracketTitle',
              descKey: 'navQuickBracketDesc',
              icon: 'bolt',
              accent: 'border-amber-500/30 from-amber-500/10 text-amber-300',
            },
          },
          // Simulateur de tournoi : outil « what-if » (test de formats/scénarios
          // de bracket sans toucher aux vraies données). Dashboard-only, groupé
          // avec les autres outils tournoi.
          {
            id: 'tournament-simulator',
            href: '/admin/tournament-simulator',
            permission: 'manage_tournaments',
            minRole: 'admin',
            card: {
              order: 17,
              titleKey: 'navSimulatorTitle',
              descKey: 'navSimulatorDesc',
              icon: 'beaker',
              accent: 'border-indigo-500/30 from-indigo-500/10 text-indigo-300',
            },
          },
          // Map pool (global tenant) : catalogue réutilisable de maps par jeu,
          // édité une fois puis pioché par le flux par-tournoi. Dashboard-only,
          // groupé avec les autres outils tournoi.
          {
            id: 'map-pool',
            href: '/admin/map-pool',
            permission: 'manage_tournaments',
            minRole: 'admin',
            card: {
              order: 18,
              titleKey: 'navMapPoolTitle',
              descKey: 'navMapPoolDesc',
              icon: 'map',
              accent: 'border-teal-500/30 from-teal-500/10 text-teal-300',
            },
          },
          // Presets de partie personnalisée : code d'import du jeu poussé à
          // l'hôte du match (aucune API éditeur ne permet de créer le lobby).
          // Voisin naturel du map pool — même famille « config de jeu ».
          {
            id: 'custom-game-presets',
            href: '/admin/custom-game-presets',
            permission: 'manage_tournaments',
            minRole: 'admin',
            card: {
              order: 19,
              titleKey: 'navCustomGamePresetsTitle',
              descKey: 'navCustomGamePresetsDesc',
              icon: 'key',
              accent: 'border-amber-500/30 from-amber-500/10 text-amber-300',
            },
          },
          {
            id: 'leagues',
            href: '/admin/leagues',
            permission: 'manage_tournaments',
            minRole: 'admin',
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
            permission: 'manage_tournaments',
            minRole: 'admin',
            card: {
              order: 12,
              titleKey: 'navRatingsTitle',
              descKey: 'navRatingsDesc',
              icon: 'chart',
              accent: 'border-blue-500/30 from-blue-500/10 text-blue-300',
            },
          },
          // Aide tournoi : miroir staff (caster+) de l'aide `/aide-tournoi` du bot
          // Discord. Page existante mais jusque-là orpheline (aucun lien) → exposée
          // en carte dashboard-only pour la rendre découvrable.
          {
            id: 'aide-tournoi',
            href: '/admin/aide-tournoi',
            minRole: 'caster',
            card: {
              order: 16,
              titleKey: 'navAideTournoiTitle',
              descKey: 'navAideTournoiDesc',
              icon: 'help',
              accent:
                'border-emerald-500/30 from-emerald-500/10 text-emerald-300',
            },
          },
        ],
      },
      {
        id: 'scrims',
        topBarLabel: 'Scrims',
        href: '',
        minRole: 'admin',
        children: [
          {
            id: 'scrims-list',
            topBarLabel: 'Scrims – liste',
            href: '/admin/scrims',
            permission: 'manage_teams',
            minRole: 'admin',
          },
          {
            id: 'scrims-create',
            topBarLabel: 'Créer un scrim',
            href: '/admin/scrims?new=1',
            minRole: 'admin',
          },
          {
            // Hub actionnable des scrims : validation/traitement des demandes de
            // scrim entre équipes. Porte la carte dashboard « Scrims » (les nœuds
            // liste/création restent top-bar-only). minRole 'admin' inchangé.
            id: 'scrims-demandes',
            topBarLabel: 'Demandes de scrim',
            href: '/admin/demandes?type=scrim',
            minRole: 'admin',
            card: {
              order: 4.5,
              titleKey: 'navScrimsTitle',
              descKey: 'navScrimsDesc',
              icon: 'bolt',
              accent: 'border-cyan-500/30 from-cyan-500/10 text-cyan-300',
            },
          },
        ],
      },
      {
        id: 'equipes',
        topBarLabel: 'Équipes',
        href: '',
        minRole: 'admin',
        children: [
          {
            id: 'teams-list',
            topBarLabel: 'Équipes – liste',
            href: '/admin/teams',
            permission: 'manage_teams',
            minRole: 'admin',
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
            permission: 'manage_teams',
            minRole: 'admin',
          },
          {
            id: 'teams-my',
            topBarLabel: 'Gérer mon équipe (capitaine)',
            href: '/admin/teams/my',
            minRole: 'caster',
          },
          {
            id: 'free-players',
            topBarLabel: 'Joueuses libres',
            href: '/admin/free-players',
            permission: 'manage_teams',
            minRole: 'admin',
          },
          {
            id: 'demandes',
            topBarLabel: 'Demandes joueurs / équipes',
            href: '/admin/demandes',
            permission: 'manage_teams',
            minRole: 'admin',
            card: {
              order: 4,
              titleKey: 'navDemandesTitle',
              descKey: 'navDemandesDesc',
              icon: 'inbox',
              accent:
                'border-emerald-500/30 from-emerald-500/10 text-emerald-300',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'contenu',
    topBarLabel: 'Contenu',
    href: '',
    minRole: 'admin',
    children: [
      {
        id: 'twitch-channels',
        topBarLabel: 'Chaînes Twitch',
        href: '/admin/twitch-channels',
        permission: 'manage_broadcast',
        minRole: 'admin',
      },
      {
        // Hub « Partenaires » : fusion des ex-pages Partenaires – liste et
        // Demandes de partenariat en une page à onglets (/admin/partners?tab=…).
        // Comme pour les fusions Modération / Onboarding, une SEULE entrée
        // top-bar pointe vers le hub — les onglets (« Partenaires » / « Demandes »)
        // se découvrent sur la page. L'ex-route /admin/partnership-requests
        // 308-redirige vers `?tab=requests`.
        id: 'partners',
        topBarLabel: 'Partenaires',
        href: '/admin/partners',
        permission: 'manage_communications',
        minRole: 'admin',
      },
      {
        // Hub « Modération » (lot B) : fusion des ex-pages Commentaires,
        // Litiges, Blacklist et Support en une page à onglets
        // (/admin/moderation?tab=…). Comme pour les fusions stats/logs, une
        // SEULE entrée top-bar pointe vers le hub — les onglets se découvrent
        // sur la page (le filtre nav n'a que 2 niveaux, un sous-menu par onglet
        // sur-exposerait des onglets manager à un caster). L'onglet Litiges
        // reste joignable par URL/deep-link pour les casters (host caster-gated),
        // comme l'ex-board disputes l'était sous la section Tournois (manager).
        id: 'moderation',
        topBarLabel: 'Modération',
        href: '/admin/moderation',
        minRole: 'admin',
        card: {
          order: 6,
          titleKey: 'navModerationTitle',
          descKey: 'navModerationDesc',
          icon: 'shield',
          accent: 'border-red-500/30 from-red-500/10 text-red-300',
        },
      },
      // Carte dashboard « Support » (dashboard-only) : deep-link direct vers
      // l'onglet Support du hub Modération, conservée telle quelle.
      {
        id: 'moderation-support-card',
        href: '/admin/moderation?tab=support',
        minRole: 'admin',
        card: {
          order: 5,
          titleKey: 'navSupportTitle',
          descKey: 'navSupportDesc',
          icon: 'ticket',
          accent: 'border-purple-500/30 from-purple-500/10 text-purple-300',
        },
      },
    ],
  },
  {
    // Section « Communication » : REGROUPEMENT de navigation dont les
    // ex-listes (Actualités, Campagnes, Notifications) sont désormais
    // FUSIONNÉES dans le hub à onglets /admin/communications?tab=… Comme pour
    // les fusions Modération / Partenaires / Onboarding, une SEULE entrée
    // top-bar pointe vers le hub ; les onglets se découvrent sur la page. Le
    // host est caster-gated (rôle le plus permissif : Notifications) et chaque
    // onglet re-gate son propre minRole (news/campagnes = admin,
    // notifications = caster). L'éditeur `news/new` reste une page à part
    // entière (trop lourd pour une modale/un onglet) : son entrée « Créer »
    // est conservée telle quelle.
    id: 'communication',
    topBarLabel: 'Communication',
    href: '',
    minRole: 'caster',
    children: [
      {
        id: 'communications',
        topBarLabel: 'Communications',
        href: '/admin/communications',
        minRole: 'caster',
        card: {
          order: 7,
          titleKey: 'navCampaignsTitle',
          descKey: 'navCampaignsDesc',
          icon: 'mail',
          accent: 'border-blue-500/30 from-blue-500/10 text-blue-300',
        },
      },
      {
        id: 'news-new',
        topBarLabel: 'Créer une actualité',
        href: '/admin/news/new',
        permission: 'manage_communications',
        minRole: 'admin',
      },
    ],
  },
  {
    // Section « Staff & Asso » : REGROUPEMENT de navigation des écrans
    // « People/Staff » auparavant dispersés entre Contenu (Casteuses, Pôles) et
    // Configuration (Utilisateurs, Adhérents). Les trois ex-listes Casteuses,
    // Pôles de l'asso et Adhérents sont désormais FUSIONNÉES dans le hub à
    // onglets /admin/association?tab=cast|poles|adherents. Comme pour les fusions
    // Modération / Communication / Partenaires, une SEULE entrée top-bar
    // « Association » pointe vers le hub ; les onglets se découvrent sur la page.
    // Les trois domaines sont admin-gated, d'où un host admin homogène (pas de
    // re-gate par onglet). Les éditeurs (adherents/new, cast/pole new + [id])
    // restent des routes à part : l'entrée « Ajouter un adhérent » est conservée.
    // La carte dashboard « Gérer les utilisateurs » (order 9) suit son nœud.
    id: 'staff-asso',
    topBarLabel: 'Staff & Asso',
    href: '',
    minRole: 'admin',
    children: [
      {
        id: 'users-manage',
        topBarLabel: 'Gérer les utilisateurs',
        href: '/admin/users/manage',
        permission: 'manage_staff',
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
        permission: 'manage_staff',
        minRole: 'admin',
      },
      {
        id: 'association',
        topBarLabel: 'Association',
        href: '/admin/association',
        permission: 'manage_communications',
        minRole: 'admin',
      },
      {
        // Le Drive de l'asso (statuts, PV, rapports, factures). Droit dédié :
        // ni le caster, ni l'arbitre, ni le bénévole — un PV nomme des
        // personnes physiques. Cf. docs/ETUDE-drive-et-chat.md.
        id: 'documents',
        topBarLabel: 'Documents de l’asso',
        href: '/admin/documents',
        // LECTURE : la page s'ouvre à qui peut consulter. Le dépôt et la
        // corbeille demandent `manage_documents`, vérifié dans la page et
        // re-vérifié par la route.
        permission: 'read_documents',
        minRole: 'admin',
      },
      {
        id: 'adherents-new',
        topBarLabel: 'Ajouter un adhérent',
        href: '/admin/adherents/new',
        permission: 'manage_communications',
        minRole: 'admin',
      },
    ],
  },
  {
    id: 'configuration',
    topBarLabel: 'Configuration',
    href: '',
    minRole: 'admin',
    children: [
      {
        id: 'site-settings',
        topBarLabel: 'Paramètres du site',
        href: '/admin/site-settings',
        permission: 'manage_settings',
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
        id: 'logs-stats',
        topBarLabel: 'Logs & stats',
        href: '',
        minRole: 'admin',
        children: [
          {
            id: 'logs',
            topBarLabel: 'Journaux',
            href: '/admin/logs',
            permission: 'manage_settings',
            minRole: 'admin',
          },
          {
            id: 'stats',
            topBarLabel: 'Statistiques',
            href: '/admin/stats',
            permission: 'manage_tournaments',
            minRole: 'admin',
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
        // Hub « Onboarding » : File d'onboarding, Demandes self-service,
        // Serveurs Discord en attente et état de mise en service des espaces,
        // en une page à onglets (/admin/onboarding?tab=…).
        //
        // OWNER-ONLY : la gestion des espaces est du ressort du propriétaire de
        // la plateforme. `manage_tenant` n'est portée que par ce rôle, et le
        // lien doit disparaître pour les autres — un menu qui propose une page
        // interdite est un menu qui ment.
        id: 'onboarding',
        topBarLabel: 'Onboarding',
        href: '/admin/onboarding',
        permission: 'manage_tenant',
        minRole: 'owner',
      },
      // Salons Discord des équipes. Cette page EXISTE parce que le cron qui
      // gérait ces salons tout seul a été supprimé : il en a détruit, puis en a
      // recréé dont personne ne voulait. La gestion est redevenue un geste
      // humain, il lui faut donc un endroit.
      {
        id: 'discord-team-channels',
        topBarLabel: 'Salons Discord',
        href: '/admin/discord/team-channels',
        permission: 'manage_settings',
        minRole: 'admin',
        card: {
          order: 19.5,
          titleKey: 'navDiscordTeamChannelsTitle',
          descKey: 'navDiscordTeamChannelsDesc',
          icon: 'signal',
          accent: 'border-indigo-500/30 from-indigo-500/10 text-indigo-300',
        },
      },
      // Gestion des tenants : déplacée de la top-bar Configuration vers une
      // CARTE du dashboard (dashboard-only, plus d'entrée top-bar). La création
      // reste accessible via le bouton « Créer un tenant » de la liste (?new=1).
      {
        id: 'tenants-list',
        href: '/admin/tenants',
        permission: 'manage_settings',
        minRole: 'admin',
        card: {
          order: 19,
          titleKey: 'navTenantsTitle',
          descKey: 'navTenantsDesc',
          icon: 'shield',
          accent: 'border-sky-500/30 from-sky-500/10 text-sky-300',
        },
      },
      // Facturation / Abonnement (axe 06, revenus récurrents) : page self-serve
      // du plan du TENANT ACTIF. Lecture admin ; l'achat (lien HelloAsso) reste
      // owner-only, re-gaté dans la page. Exposée en top-bar Configuration ET en
      // carte dashboard (order 20, à la suite des tenants).
      {
        id: 'billing',
        topBarLabel: 'Facturation',
        href: '/admin/billing',
        permission: 'manage_billing',
        minRole: 'admin',
        devConsole: true,
        card: {
          order: 20,
          titleKey: 'navBillingTitle',
          descKey: 'navBillingDesc',
          icon: 'ticket',
          accent: 'border-emerald-500/30 from-emerald-500/10 text-emerald-300',
        },
      },
      // Dashboard-only (pas d'entrée top-bar historiquement).
      {
        id: 'api-tokens',
        href: '/admin/api-tokens',
        permission: 'manage_settings',
        minRole: 'admin',
        devConsole: true,
        card: {
          order: 14,
          titleKey: 'navApiTokensTitle',
          descKey: 'navApiTokensDesc',
          icon: 'key',
          accent: 'border-teal-500/30 from-teal-500/10 text-teal-300',
        },
      },
      // Webhooks sortants (API dev) : dashboard-only, groupé juste après les
      // tokens API (même famille « écosystème développeur », secret révélé une
      // fois). À NE PAS confondre avec l'entrée top-bar « Webhooks Discord (par
      // tournoi) » (notifications Discord par tournoi, → /admin/tournaments).
      // order 14.5 pour s'insérer entre api-tokens (14) et recycle-bin (15).
      {
        id: 'webhooks',
        href: '/admin/webhooks',
        permission: 'manage_settings',
        minRole: 'admin',
        devConsole: true,
        card: {
          order: 14.5,
          titleKey: 'navWebhooksTitle',
          descKey: 'navWebhooksDesc',
          icon: 'signal',
          accent: 'border-teal-500/30 from-teal-500/10 text-teal-300',
        },
      },
      // Tableau de bord développeur (self-serve, axe 03) : point d'entrée
      // authentifié unique vers l'écosystème API (entitlement/usage + clés +
      // webhooks + catalogue d'events + upgrade). Vit sous /developpeurs/* mais
      // gaté staff comme les pages admin. order 14.7 pour rester dans la famille
      // « écosystème développeur » (tokens 14 / webhooks 14.5).
      {
        id: 'developer-hub',
        href: '/developpeurs/dashboard',
        minRole: 'admin',
        devConsole: true,
        card: {
          order: 14.7,
          titleKey: 'navDeveloperHubTitle',
          descKey: 'navDeveloperHubDesc',
          icon: 'bolt',
          accent: 'border-teal-500/30 from-teal-500/10 text-teal-300',
        },
      },
      // Documentation API (dashboard-only, comme api-tokens) : référence de
      // l'API publique + guides. Fait partie de la « console développeur »
      // (devConsole), juste après le hub dev. order 14.8 pour rester dans la
      // famille « écosystème développeur » (hub 14.7 / webhooks 14.5).
      {
        id: 'docs',
        href: '/developpeurs/reference',
        minRole: 'admin',
        devConsole: true,
        card: {
          order: 14.8,
          titleKey: 'navDocsTitle',
          descKey: 'navDocsDesc',
          icon: 'help',
          accent: 'border-teal-500/30 from-teal-500/10 text-teal-300',
        },
      },
      // Corbeille : UI de restauration soft-delete (stages/équipes/matchs/…).
      // Outil de récupération occasionnel → dashboard-only (pas de top-bar),
      // comme les autres utilitaires ci-dessus, pour ne pas surcharger le menu.
      {
        id: 'recycle-bin',
        href: '/admin/recycle-bin',
        permission: 'manage_settings',
        minRole: 'admin',
        card: {
          order: 15,
          titleKey: 'navRecycleBinTitle',
          descKey: 'navRecycleBinDesc',
          icon: 'trash',
          accent: 'border-amber-500/30 from-amber-500/10 text-amber-300',
        },
      },
      // Kanban interne staff-only (task_boards) : organisation du travail par
      // board/colonne/carte. Exposé en top-bar Configuration ET en carte
      // dashboard. Réutilise l'icône 'inbox' existante (pas de nouvel SVG).
      {
        id: 'task-board',
        topBarLabel: 'Tâches',
        href: '/admin/tasks',
        permission: 'manage_tasks',
        minRole: 'admin',
        card: {
          order: 21,
          titleKey: 'navTaskBoardTitle',
          descKey: 'navTaskBoardDesc',
          icon: 'inbox',
          accent: 'border-indigo-500/30 from-indigo-500/10 text-indigo-300',
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
      permission: node.permission,
      devConsole: node.devConsole,
    };
    if (children.length > 0) link.children = children;
    out.push(link);
  }
  return out;
}

/**
 * Cartes du dashboard : la projection vit dans `adminNavCards.ts` (lot A7).
 * Ré-exportée ici pour que les appelants gardent un point d'entrée unique.
 */
export {
  collectAdminNavCards,
  collectAdminNavCardGroups,
} from './adminNavCards';
export type { AdminNavCard, AdminNavCardGroup } from './adminNavCards';
