// tests/unit/adminNavDevConsole.test.ts
//
// Filtrage de la navigation admin pour la « console développeur » :
// `filterAdminLinks(staffRole, links, tenantKind?)`.
//
//  - En mode developer, seuls les nœuds `devConsole` (feuilles) subsistent ;
//    les conteneurs purs (ref vide) ne restent que pour porter un descendant
//    devConsole.
//  - Le mode organizer (ou tenantKind absent) est identique au comportement
//    historique (toute la nav, gating rôle seul) et contient des liens
//    non-devConsole (ex. « Compétition »).
//  - Le filtre par rôle continue de s'appliquer même en mode developer.

import { describe, it, expect } from 'vitest';
import type { AdminLink } from '../../types/components';
import { ADMIN_LINKS, filterAdminLinks } from '../../components/Navbar/adminLinks';

/** Aplati récursif : tous les nœuds porteurs d'un `ref` non vide (vrais liens). */
function collectLinks(nodes: AdminLink[]): AdminLink[] {
  const out: AdminLink[] = [];
  const walk = (list: AdminLink[]) => {
    for (const n of list) {
      if (n.ref) out.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Aplati récursif : tous les nœuds (liens ET conteneurs). */
function collectAll(nodes: AdminLink[]): AdminLink[] {
  const out: AdminLink[] = [];
  const walk = (list: AdminLink[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

describe('filterAdminLinks — console développeur', () => {
  it('mode developer (owner) : ne conserve QUE des liens devConsole', () => {
    const filtered = filterAdminLinks('owner', ADMIN_LINKS, 'developer');

    const links = collectLinks(filtered);
    expect(links.length).toBeGreaterThan(0);
    // Tout vrai lien conservé doit être devConsole.
    for (const link of links) {
      expect(link.devConsole).toBe(true);
    }

    // Les libellés attendus = les nœuds devConsole exposés dans le top-bar
    // (ceux qui ont un topBarLabel) : Dashboard + Facturation. Les autres
    // devConsole (api-tokens/webhooks/developer-hub/docs) sont dashboard-only
    // (pas de topBarLabel) → absents de ADMIN_LINKS.
    const titles = links.map((l) => l.title).sort();
    expect(titles).toEqual(['Dashboard', 'Facturation']);

    // Aucun lien non-devConsole ne subsiste (ex. « Tournois », « Équipes »).
    const allTitles = collectAll(filtered).map((n) => n.title);
    expect(allTitles).not.toContain('Tournois');
    expect(allTitles).not.toContain('Équipes');
  });

  it('mode organizer === tenantKind absent (non-régression)', () => {
    const organizer = filterAdminLinks('owner', ADMIN_LINKS, 'organizer');
    const defaultKind = filterAdminLinks('owner', ADMIN_LINKS);

    expect(organizer).toEqual(defaultKind);

    // Le cas organizer contient bien des nœuds non-devConsole.
    const allTitles = collectAll(organizer).map((n) => n.title);
    expect(allTitles).toContain('Compétition');
    // Et il est strictement plus riche que la console développeur.
    const dev = filterAdminLinks('owner', ADMIN_LINKS, 'developer');
    expect(collectAll(organizer).length).toBeGreaterThan(
      collectAll(dev).length
    );
  });

  it('mode developer : le filtre par rôle s’applique toujours', () => {
    // « Facturation » exige minRole admin ; un caster ne doit voir que le
    // Dashboard (minRole caster), même en mode développeur.
    const casterDev = filterAdminLinks('caster', ADMIN_LINKS, 'developer');
    const titles = collectLinks(casterDev).map((l) => l.title).sort();
    expect(titles).toEqual(['Dashboard']);
    expect(titles).not.toContain('Facturation');
  });
});
