// tests/unit/adminBreadcrumb.test.ts
//
// Couvre utils/admin/adminBreadcrumb.ts — le fil d'Ariane des pages admin
// profondes, déduit du VRAI menu (ADMIN_NAV).

import { describe, it, expect } from 'vitest';
import { adminBreadcrumb, ENTITY_ROUTES } from '@/utils/admin/adminBreadcrumb';
import { ADMIN_NAV } from '@/components/admin/navigation/adminNav';

const labels = {
  root: 'Administration',
  entities: {
    tournament: 'Tournoi',
    match: 'Match',
    stage: 'Phase',
    team: 'Équipe',
    user: 'Utilisateur',
    tenant: 'Espace',
    scrim: 'Scrim',
    planning: 'Planning',
    league: 'Ligue',
    event: 'Événement',
  },
};
const crumb = (pathname: string, asPath: string) =>
  adminBreadcrumb(pathname, asPath, ADMIN_NAV, labels);

describe('adminBreadcrumb', () => {
  it('résultats d’un tournoi : on remonte au tournoi et à la liste', () => {
    const c = crumb(
      '/admin/tournament/[id]/stats',
      '/admin/tournament/abc/stats?tab=entry'
    );
    expect(c[0]).toEqual({ label: 'Administration', href: '/admin' });
    expect(c.some((x) => x.href === '/admin/tournaments')).toBe(true);
    expect(c.at(-1)).toEqual({
      label: 'Tournoi',
      href: '/admin/tournament/abc',
    });
  });

  it('la page d’accueil d’une entité ne se liste pas elle-même', () => {
    const c = crumb('/admin/tournament/[id]', '/admin/tournament/abc');
    expect(c.some((x) => x.label === 'Tournoi')).toBe(false);
    expect(c.some((x) => x.href === '/admin/tournaments')).toBe(true);
  });

  it('entités à motif long : planning de scrim, config Discord d’un espace', () => {
    expect(
      crumb(
        '/admin/scrims/plannings/[planningId]',
        '/admin/scrims/plannings/p1'
      ).some((x) => x.href === '/admin/scrims')
    ).toBe(true);
    expect(
      crumb(
        '/admin/tenants/[id]/discord-config/[guildId]',
        '/admin/tenants/t1/discord-config/g1'
      ).at(-1)
    ).toEqual({ label: 'Espace', href: '/admin/tenants/t1' });
  });

  it('rien sur le tableau de bord ni hors admin', () => {
    expect(crumb('/admin', '/admin')).toEqual([]);
    expect(crumb('/tournament/[id]', '/tournament/x')).toEqual([]);
  });

  it('chaque liste d’entité existe dans le menu (sinon le fil serait vide)', () => {
    const hrefs = new Set<string>();
    const walk = (nodes: typeof ADMIN_NAV) => {
      for (const n of nodes) {
        if (n.href) hrefs.add(n.href);
        if (n.children) walk(n.children);
      }
    };
    walk(ADMIN_NAV);
    for (const e of ENTITY_ROUTES) {
      expect(hrefs.has(e.list), `${e.pattern} → ${e.list}`).toBe(true);
    }
  });
});
