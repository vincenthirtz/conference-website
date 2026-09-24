// utils/admin/adminBreadcrumb.ts
//
// Fil d'Ariane des pages admin PROFONDES (refonte des menus, plan 8).
//
// Sur `/admin/tournament/[id]/stats` ou `/admin/stages/[stageId]/seeding`,
// rien ne disait où l'on était ni comment remonter : la barre admin ne mène
// qu'aux listes. Le fil se DÉDUIT du menu admin (source unique, ADMIN_NAV) et
// de la route — aucune page n'a à le décrire.
//
// Il s'arrête AVANT la page courante : elle a déjà son titre. Pas de nom
// propre (le nom du tournoi) : il faudrait un chargement de plus ; l'entité
// est nommée par son type (« Tournoi »), lien vers sa page d'accueil.
//
// PUR : motif de route, URL réelle et arbre de menu passés en paramètres.

import type { AdminNavNode } from '@/components/admin/navigation/adminNavTypes';

export type Crumb = { label: string; href: string | null };

export type EntityKey =
  | 'tournament'
  | 'match'
  | 'stage'
  | 'team'
  | 'user'
  | 'tenant'
  | 'scrim'
  | 'planning'
  | 'league'
  | 'event';

/**
 * Pages d'entité : leur motif, la liste dont elles relèvent dans le menu, et
 * leur page d'accueil (le motif lui-même quand il existe comme page).
 */
export const ENTITY_ROUTES: {
  pattern: string;
  list: string;
  key: EntityKey;
}[] = [
  {
    pattern: '/admin/tournament/[id]',
    list: '/admin/tournaments',
    key: 'tournament',
  },
  // Un match appartient à un tournoi : pas de liste des matchs au menu.
  {
    pattern: '/admin/matches/[matchId]',
    list: '/admin/tournaments',
    key: 'match',
  },
  {
    pattern: '/admin/stages/[stageId]',
    list: '/admin/tournaments',
    key: 'stage',
  },
  { pattern: '/admin/teams/[teamId]', list: '/admin/teams', key: 'team' },
  {
    pattern: '/admin/users/[userId]',
    list: '/admin/users/manage',
    key: 'user',
  },
  { pattern: '/admin/tenants/[id]', list: '/admin/tenants', key: 'tenant' },
  {
    pattern: '/admin/scrims/plannings/[planningId]',
    list: '/admin/scrims',
    key: 'planning',
  },
  { pattern: '/admin/scrims/[id]', list: '/admin/scrims', key: 'scrim' },
  { pattern: '/admin/leagues/[id]', list: '/admin/leagues', key: 'league' },
  // Déroulé d'émission (run-of-show) : son entrée de menu est la Régie.
  { pattern: '/admin/events/[runId]', list: '/admin/regie', key: 'event' },
];

/** Chemin des nœuds jusqu'au premier nœud dont `href` vaut `target`. */
function findTrail(
  nodes: AdminNavNode[],
  target: string
): AdminNavNode[] | null {
  for (const node of nodes) {
    if (node.href === target) return [node];
    if (node.children) {
      const sub = findTrail(node.children, target);
      if (sub) return [node, ...sub];
    }
  }
  return null;
}

/** Le nœud dont `href` est le plus long préfixe (à la frontière de segment). */
function longestPrefixHref(nodes: AdminNavNode[], path: string): string | null {
  let best: string | null = null;
  const walk = (list: AdminNavNode[]) => {
    for (const n of list) {
      const h = n.href;
      if (
        h &&
        h !== '/admin' &&
        (path === h || path.startsWith(`${h}/`)) &&
        (!best || h.length > best.length)
      ) {
        best = h;
      }
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return best;
}

function cleanPath(asPath: string): string {
  const p = asPath.split(/[?#]/)[0] || '/';
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

/**
 * Le fil de la page `pathname` (motif de route) vue à l'URL `asPath`.
 * Vide sur le tableau de bord et sur une page de premier niveau, où il
 * n'apprendrait rien.
 */
export function adminBreadcrumb(
  pathname: string,
  asPath: string,
  nodes: AdminNavNode[],
  labels: { root: string; entities: Record<EntityKey, string> }
): Crumb[] {
  if (pathname === '/admin' || !pathname.startsWith('/admin/')) return [];
  const url = cleanPath(asPath);

  const entity = ENTITY_ROUTES.find(
    (e) => pathname === e.pattern || pathname.startsWith(`${e.pattern}/`)
  );
  const listHref = entity?.list ?? longestPrefixHref(nodes, pathname);
  if (!listHref) return [];

  const trail = findTrail(nodes, listHref) ?? [];
  const crumbs: Crumb[] = [{ label: labels.root, href: '/admin' }];
  for (const node of trail) {
    if (!node.topBarLabel) continue;
    crumbs.push({ label: node.topBarLabel, href: node.href || null });
  }

  // Page SOUS une entité (…/[id]/stats) : l'entité elle-même, vers sa page
  // d'accueil — l'URL réelle tronquée au nombre de segments du motif.
  if (entity && pathname !== entity.pattern) {
    const depth = entity.pattern.split('/').length;
    const href = url.split('/').slice(0, depth).join('/');
    crumbs.push({ label: labels.entities[entity.key], href });
  }

  // Jamais la page courante, ni un fil réduit à « Administration ».
  const out = crumbs.filter((c) => c.href !== url);
  return out.length > 1 ? out : [];
}
