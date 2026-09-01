// Ce qu'un BÉNÉVOLE et un ARBITRE atteignent réellement — lot A2
// (docs/PLAN-espace-admin.md).
//
// Les deux rôles étroits n'existent que si trois choses tiennent ensemble :
// la page les laisse entrer, le menu la leur montre, et rien d'autre ne leur
// est proposé. Un seul des trois qui lâche et on retombe sur le symptôme que
// le lot voulait supprimer — un menu mort, ou un 403 après clic.
//
// Ce test lit la SOURCE des pages (la permission qu'elles déclarent) et la
// croise avec la navigation : il vérifie le trio, pas une intention.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { filterAdminLinks } from '../../components/Navbar/adminLinks';
import { staffPermissionsFor } from '../../utils/staffPermissions';
import type { AdminLink } from '../../types/components';

/** Toutes les routes atteignables, à plat. */
function flatten(links: AdminLink[]): string[] {
  const out: string[] = [];
  const walk = (list: AdminLink[]) => {
    for (const l of list) {
      if (l.ref) out.push(l.ref);
      if (l.children) walk(l.children);
    }
  };
  walk(links);
  return out;
}

/** Permission déclarée par la page servant cette route, si elle en déclare une. */
function permissionOfRoute(route: string): string | null {
  const base = path.join(process.cwd(), 'pages', route.replace(/^\//, ''));
  for (const candidate of [`${base}.tsx`, path.join(base, 'index.tsx')]) {
    if (!fs.existsSync(candidate)) continue;
    const src = fs.readFileSync(candidate, 'utf8');
    const m = src.match(
      /withStaffPage(?:<[^>]*>)?\(\s*\{\s*permission:\s*'([a-z_]+)'/
    );
    return m ? m[1] : null;
  }
  return null;
}

describe('bénévole (helper)', () => {
  const links = filterAdminLinks('helper');
  const routes = flatten(links);

  it('atteint le check-in du tournoi', () => {
    expect(routes.some((r) => r.includes('checkin'))).toBe(true);
  });

  it('ne se voit proposer AUCUNE page qu’il ne peut pas ouvrir', () => {
    const perms = new Set(staffPermissionsFor('helper'));
    const dead = routes.filter((route) => {
      const needed = permissionOfRoute(route);
      // Route sans permission déclarée : c'est une page gardée par rôle,
      // couverte par le filtrage historique — hors sujet ici.
      return needed !== null && !perms.has(needed as never);
    });

    expect(
      dead,
      `Entrées de menu menant à un 403 pour un bénévole :\n  ${dead.join('\n  ')}`
    ).toEqual([]);
  });

  it('ne voit ni les réglages, ni la facturation, ni le staff', () => {
    const forbidden = ['/admin/site-settings', '/admin/billing', '/admin/users'];
    for (const route of forbidden) {
      expect(routes.some((r) => r.startsWith(route))).toBe(false);
    }
  });
});

describe('arbitre (referee)', () => {
  const routes = flatten(filterAdminLinks('referee'));

  it('ne se voit proposer aucune page hors de son périmètre', () => {
    const perms = new Set(staffPermissionsFor('referee'));
    const dead = routes.filter((route) => {
      const needed = permissionOfRoute(route);
      return needed !== null && !perms.has(needed as never);
    });
    expect(dead).toEqual([]);
  });

  it('n’a pas la gestion des équipes ni les tournois', () => {
    const perms = staffPermissionsFor('referee');
    expect(perms).not.toContain('manage_teams');
    expect(perms).not.toContain('manage_tournaments');
  });
});

describe('non-régression des rôles historiques', () => {
  it('un admin garde accès à tout ce que le menu propose', () => {
    const perms = new Set(staffPermissionsFor('admin'));
    const routes = flatten(filterAdminLinks('admin'));
    const dead = routes.filter((route) => {
      const needed = permissionOfRoute(route);
      return needed !== null && !perms.has(needed as never);
    });
    expect(dead).toEqual([]);
  });
});
