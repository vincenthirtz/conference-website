import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/supabase', () => ({
  supabaseAdmin: {},
  getServerClient: () => ({}),
  supabaseClient: {},
}));

import {
  ADMIN_LINKS,
  filterAdminLinks,
} from '../../components/Navbar/adminLinks';
import type { AdminLink } from '../../types/components';
import type { StaffRole } from '../../utils/staff';

// Recherche récursive : depuis le regroupement « Compétition », plusieurs
// entrées (Tournoi en cours, Tournois, Scrims, Équipes) vivent au 2e niveau.
function findByTitle(links: AdminLink[], title: string): AdminLink | undefined {
  for (const l of links) {
    if (l.title === title) return l;
    if (l.children) {
      const found = findByTitle(l.children, title);
      if (found) return found;
    }
  }
  return undefined;
}

describe('filterAdminLinks – static structure invariants', () => {
  it('does not mutate the original ADMIN_LINKS array', () => {
    const before = JSON.stringify(ADMIN_LINKS);
    filterAdminLinks('owner');
    filterAdminLinks('caster');
    filterAdminLinks(null);
    expect(JSON.stringify(ADMIN_LINKS)).toBe(before);
  });

  it('returns an empty array when role is null', () => {
    expect(filterAdminLinks(null)).toEqual([]);
  });

  it('returns the same set of top-level entries for owner as for admin or higher', () => {
    const owner = filterAdminLinks('owner').map((l) => l.title);
    expect(owner).toContain('Dashboard');
    // Tournoi en cours / Tournois / Scrims / Équipes sont regroupés sous
    // l'entrée top-bar « Compétition » (ne sont plus au premier niveau).
    expect(owner).toContain('Compétition');
    expect(owner).not.toContain('Tournois');
    expect(owner).not.toContain('Tournoi en cours');
    expect(owner).toContain('Contenu');
    expect(owner).toContain('Communication');
    expect(owner).toContain('Configuration');
  });

  it('groups Tournoi en cours, Tournois, Scrims, Équipes sous "Compétition"', () => {
    const competition = filterAdminLinks('owner').find(
      (l) => l.title === 'Compétition'
    );
    expect(competition).toBeDefined();
    expect(competition?.children?.map((c) => c.title)).toEqual([
      'Tournoi en cours',
      'Tournois',
      'Scrims',
      'Équipes',
    ]);
  });
});

describe('filterAdminLinks – owner role', () => {
  const links = filterAdminLinks('owner');

  it('exposes every top-level admin link', () => {
    expect(links).toHaveLength(ADMIN_LINKS.length);
  });

  it('keeps every direct child of "Tournois"', () => {
    const tournois = findByTitle(links, 'Tournois');
    expect(tournois?.children).toBeDefined();
    // Lot 7 ajoute "Broadcast live (cockpit)". Lot B a retiré "Disputes
    // ouvertes (board)" d'ici : les litiges vivent désormais dans le hub
    // "Modération" (onglet Litiges), sous la section Contenu.
    expect(tournois!.children!).toHaveLength(5);
  });

  it('keeps admin-only sub-sections of "Contenu" (Twitch, Partenaires, Modération)', () => {
    const contenu = findByTitle(links, 'Contenu');
    const childTitles = contenu?.children?.map((c) => c.title) ?? [];
    expect(childTitles).toContain('Chaînes Twitch');
    expect(childTitles).toContain('Partenaires');
    // Lot B : Commentaires / Support / Blacklist fusionnés en un seul
    // hub "Modération" (page à onglets /admin/moderation).
    expect(childTitles).toContain('Modération');
    expect(childTitles).not.toContain('Commentaires');
    expect(childTitles).not.toContain('Tickets de support');
    // Lot D : Annonces / News déplacées vers la section "Communication".
    expect(childTitles).not.toContain('Annonces');
    expect(childTitles).not.toContain('Actualités');
    // Points ouverts : Casteuses / Pôles déplacées vers "Staff & Asso".
    expect(childTitles).not.toContain('Casteuses');
    expect(childTitles).not.toContain('Pôles de l’asso');
  });

  it('collapses Annonces, Actualités, Campagnes et Notifications into the "Communications" hub under "Communication"', () => {
    // Les quatre ex-listes sont désormais fusionnées dans le hub à onglets
    // /admin/communications. Une seule entrée « Communications » y pointe ; les
    // éditeurs dédiés (« Créer une annonce » / « Créer une actualité ») restent.
    const comm = findByTitle(links, 'Communication');
    expect(comm).toBeDefined();
    const childTitles = comm?.children?.map((c) => c.title) ?? [];
    expect(childTitles).toEqual([
      'Communications',
      'Créer une annonce',
      'Créer une actualité',
    ]);
    const hub = comm?.children?.find((c) => c.title === 'Communications');
    expect(hub?.ref).toBe('/admin/communications');
    // Leaf hub entry: no sub-menu (the tabs are discovered on the page).
    expect(hub?.children ?? []).toEqual([]);
  });

  it('collapses Casteuses, Pôles et Adhérents into the "Association" hub sous "Staff & Asso"', () => {
    // Les trois ex-listes (Casteuses, Pôles de l'asso, Adhérents) sont
    // désormais fusionnées dans le hub à onglets /admin/association. Une seule
    // entrée « Association » y pointe ; les entrées Utilisateurs et l'éditeur
    // « Ajouter un adhérent » restent des routes à part.
    const staff = findByTitle(links, 'Staff & Asso');
    expect(staff).toBeDefined();
    const childTitles = staff?.children?.map((c) => c.title) ?? [];
    expect(childTitles).toEqual([
      'Gérer les utilisateurs',
      'Créer un utilisateur',
      'Association',
      'Ajouter un adhérent',
    ]);
    const hub = staff?.children?.find((c) => c.title === 'Association');
    expect(hub?.ref).toBe('/admin/association');
    // Leaf hub entry: no sub-menu (the tabs are discovered on the page).
    expect(hub?.children ?? []).toEqual([]);
  });
});

describe('filterAdminLinks – admin role', () => {
  const links = filterAdminLinks('admin');

  it('keeps the same top-level entries as owner', () => {
    expect(links.map((l) => l.title)).toEqual(
      filterAdminLinks('owner').map((l) => l.title)
    );
  });

  it('still includes admin-restricted children (e.g. Webhooks Discord)', () => {
    const tournois = findByTitle(links, 'Tournois');
    const titles = tournois?.children?.map((c) => c.title) ?? [];
    expect(titles).toContain('Webhooks Discord (par tournoi)');
  });
});

describe('filterAdminLinks – manager role', () => {
  const links = filterAdminLinks('manager');

  it('hides admin-only direct children inside "Tournois"', () => {
    const tournois = findByTitle(links, 'Tournois');
    const titles = tournois?.children?.map((c) => c.title) ?? [];
    expect(titles).not.toContain('Webhooks Discord (par tournoi)');
    expect(titles).toContain('Tournois – liste');
  });

  it('hides admin-only sub-sections of "Contenu" but keeps manager-level ones', () => {
    const contenu = findByTitle(links, 'Contenu');
    const titles = contenu?.children?.map((c) => c.title) ?? [];
    expect(titles).not.toContain('Annonces');
    expect(titles).not.toContain('Actualités');
    expect(titles).not.toContain('Chaînes Twitch');
    expect(titles).not.toContain('Casteuses');
    expect(titles).not.toContain('Partenaires');
    // Lot B : le hub "Modération" (manager) remplace les entrées éparses
    // Commentaires / Support / Blacklist.
    expect(titles).toContain('Modération');
    expect(titles).not.toContain('Commentaires');
    expect(titles).not.toContain('Tickets de support');
  });

  it('keeps "Configuration" with Logs & stats + Tenants (manager)', () => {
    // Lot D : Notifications (+ Campagnes) déplacées vers "Communication".
    const config = findByTitle(links, 'Configuration');
    expect(config).toBeDefined();
    const titles = config?.children?.map((c) => c.title) ?? [];
    expect(titles).toEqual(['Logs & stats', 'Tenants']);
  });

  it('keeps "Communication" with only the caster-level "Communications" hub child', () => {
    // Le hub « Communications » est caster-gated (contient l'onglet
    // Notifications) ; les éditeurs « Créer … » sont admin → masqués pour un
    // manager.
    const comm = findByTitle(links, 'Communication');
    expect(comm).toBeDefined();
    const titles = comm?.children?.map((c) => c.title) ?? [];
    expect(titles).toEqual(['Communications']);
  });
});

describe('filterAdminLinks – caster role', () => {
  const links = filterAdminLinks('caster');

  it('exposes Dashboard and Tournoi en cours', () => {
    expect(findByTitle(links, 'Dashboard')).toBeDefined();
    expect(findByTitle(links, 'Tournoi en cours')).toBeDefined();
  });

  it('drops "Tournois" entirely (no caster-level child, no self ref)', () => {
    expect(findByTitle(links, 'Tournois')).toBeUndefined();
  });

  it('keeps "Équipes" but only with the single caster-level child', () => {
    const equipes = findByTitle(links, 'Équipes');
    expect(equipes).toBeDefined();
    const titles = equipes?.children?.map((c) => c.title) ?? [];
    expect(titles).toEqual(['Gérer mon équipe (capitaine)']);
  });

  it('drops "Contenu" entirely', () => {
    expect(findByTitle(links, 'Contenu')).toBeUndefined();
  });

  it('drops "Configuration" entirely (no caster-level child anymore)', () => {
    // Lot D : sa seule entrée caster (Notifications) a migré vers Communication.
    expect(findByTitle(links, 'Configuration')).toBeUndefined();
  });

  it('keeps "Communication" with only the caster-level "Communications" hub child', () => {
    const comm = findByTitle(links, 'Communication');
    expect(comm).toBeDefined();
    const titles = comm?.children?.map((c) => c.title) ?? [];
    expect(titles).toEqual(['Communications']);
  });
});

describe('filterAdminLinks – child minRole inheritance', () => {
  it('inherits the parent minRole when a child has none', () => {
    const customLinks: AdminLink[] = [
      {
        title: 'Parent (manager)',
        ref: '',
        minRole: 'manager',
        children: [
          // child has no minRole → should inherit 'manager'
          { title: 'Inherited child', ref: '/x' },
        ],
      },
    ];
    expect(filterAdminLinks('caster', customLinks).map((l) => l.title)).toEqual(
      []
    );
    expect(
      filterAdminLinks('manager', customLinks).map((l) => l.title)
    ).toEqual(['Parent (manager)']);
  });

  it('keeps a parent when self-ref is accessible, even if children are gone', () => {
    const customLinks: AdminLink[] = [
      {
        title: 'Self only',
        ref: '/self',
        minRole: 'manager',
        children: [{ title: 'Hidden', ref: '/hidden', minRole: 'admin' }],
      },
    ];
    const result = filterAdminLinks('manager', customLinks);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Self only');
    expect(result[0].children).toEqual([]);
  });

  it('drops a parent with empty ref AND no accessible children', () => {
    const customLinks: AdminLink[] = [
      {
        title: 'Empty container',
        ref: '',
        minRole: 'admin',
        children: [{ title: 'Hidden', ref: '/hidden', minRole: 'admin' }],
      },
    ];
    expect(filterAdminLinks('manager', customLinks)).toEqual([]);
  });

  it('default minRole "admin" applies when a top-level item has no minRole', () => {
    const customLinks: AdminLink[] = [{ title: 'No role', ref: '/x' }];
    expect(filterAdminLinks('manager', customLinks)).toEqual([]);
    expect(filterAdminLinks('admin', customLinks)).toHaveLength(1);
  });
});

describe('filterAdminLinks – role hierarchy contract', () => {
  const roles: StaffRole[] = ['owner', 'admin', 'manager', 'caster'];

  it('produces a non-decreasing top-level count from caster up to owner', () => {
    const counts = roles.map((r) => filterAdminLinks(r).length);
    // counts is in [owner, admin, manager, caster] order
    // higher rank should always have >= entries than lower rank
    expect(counts[0]).toBeGreaterThanOrEqual(counts[1]);
    expect(counts[1]).toBeGreaterThanOrEqual(counts[2]);
    expect(counts[2]).toBeGreaterThanOrEqual(counts[3]);
  });

  it('every role gets at least the Dashboard link', () => {
    for (const role of roles) {
      expect(findByTitle(filterAdminLinks(role), 'Dashboard')).toBeDefined();
    }
  });
});
