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

  it('entités à motif long : planning de scrim, sous-page de phase', () => {
    expect(
      crumb(
        '/admin/scrims/plannings/[planningId]',
        '/admin/scrims/plannings/p1'
      ).some((x) => x.href === '/admin/scrims')
    ).toBe(true);
    expect(
      crumb('/admin/stages/[stageId]/seeding', '/admin/stages/s1/seeding').at(
        -1
      )
    ).toEqual({ label: 'Phase', href: '/admin/stages/s1' });
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

describe('pages au fil fait main', () => {
  it('le fil automatique s’y tait (pas de doublon)', () => {
    expect(crumb('/admin/stages/[stageId]', '/admin/stages/s1')).toEqual([]);
    expect(crumb('/admin/teams/[teamId]', '/admin/teams/t1')).toEqual([]);
    // … mais pas sur les sous-pages, qui n'en ont pas.
    expect(
      crumb('/admin/stages/[stageId]/seeding', '/admin/stages/s1/seeding')
        .length
    ).toBeGreaterThan(1);
  });
});
