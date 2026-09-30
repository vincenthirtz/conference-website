import { describe, it, expect } from 'vitest';
import { adminMenuIconKey } from '../../components/admin/navigation/adminMenuIcons';
import { ADMIN_LINKS } from '../../components/Navbar/adminLinks';
import type { AdminLink } from '../../types/components';

type Line = { title: string; ref: string; isSection: boolean };

function lines(links: AdminLink[], depth = 0): Line[] {
  return links.flatMap((l) => {
    const isSection = !!l.children?.length;
    // Les sections de 1er niveau sont des titres (h2), pas des lignes.
    const self =
      depth === 0 && isSection
        ? []
        : [{ title: l.title, ref: l.ref, isSection }];
    return [...self, ...(l.children ? lines(l.children, depth + 1) : [])];
  });
}

describe('icônes du menu admin', () => {
  const all = lines(ADMIN_LINKS);

  it('le menu a bien des lignes à illustrer', () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it('chaque ligne a une icône propre (jamais le point de repli)', () => {
    const sansIcone = all
      .filter((l) =>
        ['dot', 'folder'].includes(
          adminMenuIconKey(l.title, l.ref, l.isSection)
        )
      )
      .map((l) => `${l.title} (${l.ref || 'section'})`);
    expect(
      sansIcone,
      'ajouter la ligne à BY_TITLE dans adminMenuIcons.tsx'
    ).toEqual([]);
  });

  it('le libellé départage les lignes qui partagent une route', () => {
    expect(adminMenuIconKey('Tournois – liste', '/admin/tournaments')).toBe(
      'list'
    );
    expect(
      adminMenuIconKey('Webhooks Discord (par tournoi)', '/admin/tournaments')
    ).toBe('webhook');
  });

  it('une entrée inconnue retombe sur sa route', () => {
    expect(adminMenuIconKey('Nouvelle page', '/admin/scrims/archive')).toBe(
      'swords'
    );
    expect(adminMenuIconKey('Autre', '/admin/foo/new')).toBe('plus');
    expect(adminMenuIconKey('Rien', '/admin/zzz')).toBe('dot');
  });
});
