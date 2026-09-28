// components/admin/navigation/adminNavTrail.ts
//
// Le fil d'Ariane de chaque page admin, PRÉCALCULÉ.
//
// POURQUOI CE FICHIER EXISTE — un constat de build, pas une préférence.
// `AdminBreadcrumbs` dérivait le fil de `ADMIN_NAV`, la source unique du menu :
// 844 lignes portant les rôles, les permissions, les icônes et les cartes du
// tableau de bord. Rien de tout cela n'entre dans un fil d'Ariane, mais un
// import est un import : l'arbre entier se retrouvait recopié dans **19 chunks
// distincts**, un par page profonde, pour ~7 ko gzippés chacun. Les pages de
// détail admin et les onglets tournoi/phase ont tous pris ce poids d'un coup —
// c'est la dérive qu'a révélée le budget de bundle le 2026-09-27.
//
// Ce module est la PROJECTION MINIMALE dont le fil a besoin : pour chaque URL
// navigable du menu, la suite de ses ancêtres nommés. Une cinquantaine
// d'entrées, ~6 ko de source, sans rôle, sans icône, sans carte.
//
// SOURCE DE VÉRITÉ : `ADMIN_NAV` reste la seule. Ce fichier en est DÉRIVÉ, et
// `tests/unit/adminNavTrail.test.ts` refait la dérivation à chaque exécution
// pour la comparer entrée par entrée. Une entrée de menu ajoutée, renommée ou
// déplacée sans régénérer ce fichier fait échouer le test — la duplication
// existe, mais elle ne peut pas dériver en silence.
//
// POUR RÉGÉNÉRER : le test dit exactement quoi corriger. En cas de refonte
// large, le plus simple est de réappliquer la même marche que lui
// (`buildTrailsFromNav`, exporté par le test) et de recopier sa sortie ici.

/** Un maillon : un libellé, et l'URL vers laquelle il mène (ou aucune). */
export type NavCrumb = { label: string; href: string | null };

/**
 * URL de menu → suite de ses ancêtres NOMMÉS, elle-même comprise.
 *
 * Les conteneurs sans page propre (« Compétition », « Tournois ») y figurent
 * avec `href: null` : ils nomment une étape du chemin sans être cliquables.
 */
export const ADMIN_NAV_TRAILS: Record<string, NavCrumb[]> = {
  '/admin': [{ label: 'Dashboard', href: '/admin' }],
  '/admin/checkin': [
    { label: 'Compétition', href: null },
    { label: 'Check-in', href: '/admin/checkin' },
  ],
  '/admin/tournoi-en-cours': [
    { label: 'Compétition', href: null },
    { label: 'Tournoi en cours', href: '/admin/tournoi-en-cours' },
  ],
  '/admin/tournaments': [
    { label: 'Compétition', href: null },
    { label: 'Tournois', href: null },
    { label: 'Tournois – liste', href: '/admin/tournaments' },
  ],
  '/admin/tournaments/create': [
    { label: 'Compétition', href: null },
    { label: 'Tournois', href: null },
    { label: 'Créer un tournoi', href: '/admin/tournaments/create' },
  ],
  '/admin/regie': [
    { label: 'Diffusion', href: null },
    { label: 'Cockpit', href: '/admin/regie' },
  ],
  '/admin/broadcast/live': [
    { label: 'Diffusion', href: null },
    { label: 'Console live', href: '/admin/broadcast/live' },
  ],
  '/admin/caster': [
    { label: 'Diffusion', href: null },
    { label: 'Scènes', href: '/admin/caster' },
  ],
  '/admin/quick-bracket': [
    { label: 'Compétition', href: null },
    { label: 'Tournois', href: null },
  ],
  '/admin/tournament-simulator': [
    { label: 'Compétition', href: null },
    { label: 'Tournois', href: null },
  ],
  '/admin/map-pool': [
    { label: 'Compétition', href: null },
    { label: 'Tournois', href: null },
  ],
  '/admin/custom-game-presets': [
    { label: 'Compétition', href: null },
    { label: 'Tournois', href: null },
  ],
  '/admin/leagues': [
    { label: 'Compétition', href: null },
    { label: 'Tournois', href: null },
  ],
  '/admin/ratings': [
    { label: 'Compétition', href: null },
    { label: 'Tournois', href: null },
  ],
  '/admin/aide-tournoi': [
    { label: 'Compétition', href: null },
    { label: 'Tournois', href: null },
  ],
  '/admin/scrims': [
    { label: 'Compétition', href: null },
    { label: 'Scrims', href: null },
    { label: 'Scrims – liste', href: '/admin/scrims' },
  ],
  '/admin/scrims?new=1': [
    { label: 'Compétition', href: null },
    { label: 'Scrims', href: null },
    { label: 'Créer un scrim', href: '/admin/scrims?new=1' },
  ],
  '/admin/demandes?type=scrim': [
    { label: 'Compétition', href: null },
    { label: 'Scrims', href: null },
    { label: 'Demandes de scrim', href: '/admin/demandes?type=scrim' },
  ],
  '/admin/teams': [
    { label: 'Compétition', href: null },
    { label: 'Équipes', href: null },
    { label: 'Équipes – liste', href: '/admin/teams' },
  ],
  '/admin/teams/new': [
    { label: 'Compétition', href: null },
    { label: 'Équipes', href: null },
    { label: 'Créer une équipe', href: '/admin/teams/new' },
  ],
  '/admin/teams/my': [
    { label: 'Compétition', href: null },
    { label: 'Équipes', href: null },
    { label: 'Gérer mon équipe (capitaine)', href: '/admin/teams/my' },
  ],
  '/admin/free-players': [
    { label: 'Compétition', href: null },
    { label: 'Équipes', href: null },
    { label: 'Joueuses libres', href: '/admin/free-players' },
  ],
  '/admin/demandes': [
    { label: 'Compétition', href: null },
    { label: 'Équipes', href: null },
    { label: 'Demandes joueurs / équipes', href: '/admin/demandes' },
  ],
  '/admin/twitch-channels': [
    { label: 'Contenu', href: null },
    { label: 'Chaînes Twitch', href: '/admin/twitch-channels' },
  ],
  '/admin/partners': [
    { label: 'Contenu', href: null },
    { label: 'Partenaires', href: '/admin/partners' },
  ],
  '/admin/tcg': [
    { label: 'Contenu', href: null },
    { label: 'TCG', href: '/admin/tcg' },
  ],
  '/admin/moderation': [
    { label: 'Contenu', href: null },
    { label: 'Modération', href: '/admin/moderation' },
  ],
  '/admin/moderation?tab=support': [{ label: 'Contenu', href: null }],
  '/admin/communications': [
    { label: 'Communication', href: null },
    { label: 'Communications', href: '/admin/communications' },
  ],
  '/admin/news/new': [
    { label: 'Communication', href: null },
    { label: 'Créer une actualité', href: '/admin/news/new' },
  ],
  '/admin/users/manage': [
    { label: 'Staff & Asso', href: null },
    { label: 'Gérer les utilisateurs', href: '/admin/users/manage' },
  ],
  '/admin/users/new': [
    { label: 'Staff & Asso', href: null },
    { label: 'Créer un utilisateur', href: '/admin/users/new' },
  ],
  '/admin/association': [
    { label: 'Staff & Asso', href: null },
    { label: 'Association', href: '/admin/association' },
  ],
  '/admin/documents': [
    { label: 'Staff & Asso', href: null },
    { label: 'Documents de l’asso', href: '/admin/documents' },
  ],
  '/admin/adherents/new': [
    { label: 'Staff & Asso', href: null },
    { label: 'Ajouter un adhérent', href: '/admin/adherents/new' },
  ],
  '/admin/site-settings': [
    { label: 'Configuration', href: null },
    { label: 'Paramètres du site', href: '/admin/site-settings' },
  ],
  '/admin/logs': [
    { label: 'Configuration', href: null },
    { label: 'Logs & stats', href: null },
    { label: 'Journaux', href: '/admin/logs' },
  ],
  '/admin/reseau': [
    { label: 'Configuration', href: null },
    { label: 'Logs & stats', href: null },
    { label: 'Réseau', href: '/admin/reseau' },
  ],
  '/admin/stats': [
    { label: 'Configuration', href: null },
    { label: 'Logs & stats', href: null },
    { label: 'Statistiques', href: '/admin/stats' },
  ],
  '/admin/onboarding': [
    { label: 'Configuration', href: null },
    { label: 'Onboarding', href: '/admin/onboarding' },
  ],
  '/admin/discord/team-channels': [
    { label: 'Configuration', href: null },
    { label: 'Salons Discord', href: '/admin/discord/team-channels' },
  ],
  '/admin/tenants': [{ label: 'Configuration', href: null }],
  '/admin/billing': [
    { label: 'Configuration', href: null },
    { label: 'Facturation', href: '/admin/billing' },
  ],
  '/admin/api-tokens': [{ label: 'Configuration', href: null }],
  '/admin/webhooks': [{ label: 'Configuration', href: null }],
  '/developpeurs/dashboard': [{ label: 'Configuration', href: null }],
  '/developpeurs/reference': [{ label: 'Configuration', href: null }],
  '/admin/recycle-bin': [{ label: 'Configuration', href: null }],
  '/admin/tasks': [
    { label: 'Configuration', href: null },
    { label: 'Tâches', href: '/admin/tasks' },
  ],
};

/**
 * Toutes les URL du menu, de la plus longue à la plus courte.
 *
 * Pré-triées pour que la recherche du plus long préfixe soit un simple
 * parcours : c'est l'ordre qui portait la comparaison `h.length > best.length`
 * dans la version qui marchait sur l'arbre.
 */
export const ADMIN_NAV_HREFS: readonly string[] = Object.keys(
  ADMIN_NAV_TRAILS
).sort((a, b) => b.length - a.length);
