// Aucun lien admin n'est plus ouvert que la page qu'il ouvre — lot L14
// (docs/PLAN-industrialisation-admin.md).
//
// Trois surfaces mènent à des pages admin, chacune avec sa règle d'accès :
//   * le menu `ADMIN_NAV` (un nœud sans `minRole` hérite de son parent) ;
//   * les onglets de la Diffusion `DIFFUSION_TABS` ;
//   * les raccourcis de la palette ⌘K `PALETTE_ACTIONS`.
//
// La page, elle, se garde côté serveur (`withStaffPage(…)`,
// `requireStaff…FromRequest(…)`). Si un lien admet un rôle que la page refuse,
// ce rôle voit une entrée qui mène à un 403 : le « menu mort » que le lot A2
// voulait interdire, et que rien ne vérifiait.
//
// Le sens inverse (lien PLUS FERMÉ que la page) est parfois voulu — un hub
// ouvert au rôle le plus large de ses onglets — mais il doit être DIT : il
// figure dans NARROWER_ON_PURPOSE, avec sa raison, et le test échoue si
// l'écart disparaît (liste périmée).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ADMIN_NAV,
  type AdminNavNode,
} from '../../components/admin/navigation/adminNav';
import { DIFFUSION_TABS } from '../../components/admin/broadcast/DiffusionTabsNav';
import { PALETTE_ACTIONS } from '../../components/admin/commandPaletteActions';
import {
  diffusionTabAccess,
  rolesAdmitted,
  type AccessRule,
} from '../../utils/admin/adminAccess';
import { isStaffPermission } from '../../utils/staffPermissions';
import type { StaffRole } from '../../utils/staffRoles';

const ROOT = path.resolve(__dirname, '../..');

type Link = { surface: string; id: string; href: string; rule: AccessRule };

function navLinks(): Link[] {
  const out: Link[] = [];
  const visit = (nodes: AdminNavNode[], inherited: StaffRole) => {
    for (const n of nodes) {
      const minRole = n.minRole ?? inherited;
      if (n.href) {
        out.push({
          surface: 'menu',
          id: n.id,
          href: n.href,
          rule: n.permission ? { permission: n.permission } : { minRole },
        });
      }
      if (n.children) visit(n.children, minRole);
    }
  };
  visit(ADMIN_NAV, 'admin');
  return out;
}

const LINKS: Link[] = [
  ...navLinks(),
  ...DIFFUSION_TABS.map((t) => ({
    surface: 'onglets Diffusion',
    id: t.id,
    href: t.href,
    rule: diffusionTabAccess(t),
  })),
  ...PALETTE_ACTIONS.map((a) => ({
    surface: 'palette',
    id: a.id,
    href: a.href,
    rule: a.access,
  })),
];

function pageFile(href: string): string | null {
  const route = href.split(/[?#]/)[0].replace(/\/$/, '');
  for (const f of [`pages${route}.tsx`, `pages${route}/index.tsx`]) {
    if (fs.existsSync(path.join(ROOT, f))) return f;
  }
  return null;
}

/** La garde serveur de la page, lue dans sa source. */
function pageGuard(src: string): AccessRule | null {
  const page = /withStaffPage(?:<[^>]*>)?\(\s*('([a-z]+)'|\{[^}]*\})?/.exec(
    src
  );
  if (page) {
    if (page[2]) return { minRole: page[2] as StaffRole };
    const obj = page[1] ?? '';
    const perm = /permission:\s*'([a-z_]+)'/.exec(obj)?.[1];
    if (perm && isStaffPermission(perm)) return { permission: perm };
    const role = /role:\s*'([a-z]+)'/.exec(obj)?.[1];
    // `withStaffPage()` sans argument = 'admin' (défaut de la garde).
    return { minRole: (role ?? 'admin') as StaffRole };
  }
  const perm = /requireStaffPermissionFromRequest\([^)]*?'([a-z_]+)'/.exec(
    src
  )?.[1];
  if (perm && isStaffPermission(perm)) return { permission: perm };
  const role = /requireStaffRoleFromRequest\([^)]*?'([a-z]+)'/.exec(src)?.[1];
  if (role) return { minRole: role as StaffRole };
  return null;
}

/** Liens hors de l'admin (portail développeur…) : pas une page gardée. */
const isAdminRoute = (href: string) => href.startsWith('/admin');

/**
 * Liens volontairement PLUS FERMÉS que leur page. Clé : `surface:id`.
 */
const NARROWER_ON_PURPOSE: Record<string, string> = {
  'menu:moderation':
    'Hub ouvert au caster pour le seul onglet Litiges (joignable par lien direct) ; au menu, Modération reste une entrée admin.',
  'menu:moderation-support-card':
    'Carte vers l’onglet Support, réservé à l’admin dans un hub ouvert au caster.',
  'palette:action-support':
    'Même onglet Support : admin, dans un hub ouvert au caster.',
  'menu:dashboard':
    'Le tableau de bord admet bénévoles et arbitres (contenu filtré), mais le menu ne leur montre que leur porte (Check-in). À TRANCHER : leur montrer « Dashboard » ?',
};

const key = (l: Link) =>
  `${l.surface === 'onglets Diffusion' ? 'diffusion' : l.surface}:${l.id}`;

describe('liens admin ↔ gardes des pages', () => {
  it('recense les trois surfaces', () => {
    expect(LINKS.filter((l) => l.surface === 'menu').length).toBeGreaterThan(
      30
    );
    expect(LINKS.some((l) => l.surface === 'onglets Diffusion')).toBe(true);
    expect(LINKS.some((l) => l.surface === 'palette')).toBe(true);
  });

  it('chaque lien admin mène à une page qui existe et dont la garde se lit', () => {
    const broken: string[] = [];
    for (const l of LINKS.filter((x) => isAdminRoute(x.href))) {
      const file = pageFile(l.href);
      if (!file) {
        broken.push(`${l.surface} « ${l.id} » → ${l.href} : aucune page`);
        continue;
      }
      if (!pageGuard(fs.readFileSync(path.join(ROOT, file), 'utf8'))) {
        broken.push(`${l.surface} « ${l.id} » → ${file} : garde illisible`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('aucun lien n’admet un rôle que sa page refuse (pas de menu mort)', () => {
    const wider: string[] = [];
    for (const l of LINKS.filter((x) => isAdminRoute(x.href))) {
      const file = pageFile(l.href);
      const guard = file
        ? pageGuard(fs.readFileSync(path.join(ROOT, file), 'utf8'))
        : null;
      if (!guard) continue;
      const page = new Set(rolesAdmitted(guard));
      const extra = rolesAdmitted(l.rule).filter((r) => !page.has(r));
      if (extra.length) {
        wider.push(
          `${l.surface} « ${l.id} » (${l.href}) montré à ${extra.join(', ')}, que la page refuse`
        );
      }
    }
    expect(wider).toEqual([]);
  });

  it('les liens plus fermés que leur page sont tous déclarés, et la liste n’est pas périmée', () => {
    const narrower: string[] = [];
    for (const l of LINKS.filter((x) => isAdminRoute(x.href))) {
      const file = pageFile(l.href);
      const guard = file
        ? pageGuard(fs.readFileSync(path.join(ROOT, file), 'utf8'))
        : null;
      if (!guard) continue;
      const link = new Set(rolesAdmitted(l.rule));
      if (rolesAdmitted(guard).some((r) => !link.has(r))) narrower.push(key(l));
    }
    expect(
      narrower.filter((k) => !NARROWER_ON_PURPOSE[k]),
      'lien plus fermé que sa page sans raison déclarée'
    ).toEqual([]);
    expect(
      Object.keys(NARROWER_ON_PURPOSE).filter((k) => !narrower.includes(k)),
      'entrée périmée de NARROWER_ON_PURPOSE : retirer'
    ).toEqual([]);
  });
});
