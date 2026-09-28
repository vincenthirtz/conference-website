// `adminNavTrail` est une DUPLICATION assumée de `ADMIN_NAV`, et ce test est
// la seule raison pour laquelle elle est tolérable.
//
// POURQUOI LA DUPLICATION EXISTE. `AdminBreadcrumbs` dérivait le fil d'Ariane
// de `ADMIN_NAV` — 844 lignes de rôles, permissions, icônes et cartes de
// tableau de bord, dont un fil n'utilise rien. L'arbre se retrouvait recopié
// dans 19 chunks, un par page profonde, ~7 ko gzippés chacun : c'est la dérive
// que le budget de bundle a révélée le 2026-09-27.
//
// CE QUE CE TEST VÉRIFIE, et dans cet ordre :
//   1. la projection est FIDÈLE — on refait la dérivation depuis `ADMIN_NAV` et
//      on compare entrée par entrée ;
//   2. les deux implémentations du fil rendent EXACTEMENT la même chose, sur
//      toutes les routes admin réellement présentes dans `pages/admin`. C'est
//      la vérification qui compte : comparer des données ne dit rien de ce que
//      l'écran affiche, et c'est l'écran qui change.
//
// Une entrée de menu ajoutée, renommée ou déplacée sans régénérer
// `adminNavTrail.ts` fait donc échouer ce test — la duplication ne peut pas
// dériver en silence.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ADMIN_NAV } from '../../components/admin/navigation/adminNav';
import type { AdminNavNode } from '../../components/admin/navigation/adminNavTypes';
import {
  ADMIN_NAV_HREFS,
  ADMIN_NAV_TRAILS,
  type NavCrumb,
} from '../../components/admin/navigation/adminNavTrail';
import {
  adminBreadcrumb,
  adminBreadcrumbFromTrails,
} from '../../utils/admin/adminBreadcrumb';

/**
 * La dérivation de référence. Exportée pour qu'une régénération n'ait pas à la
 * réinventer : en cas de refonte du menu, recopier la sortie de cette fonction
 * dans `adminNavTrail.ts` suffit.
 */
export function buildTrailsFromNav(
  nodes: readonly AdminNavNode[]
): Record<string, NavCrumb[]> {
  const out: Record<string, NavCrumb[]> = {};
  const walk = (list: readonly AdminNavNode[], chain: NavCrumb[]) => {
    for (const n of list) {
      const next = n.topBarLabel
        ? [...chain, { label: n.topBarLabel, href: n.href || null }]
        : chain;
      // PREMIÈRE occurrence gagnante : plusieurs entrées de menu partagent la
      // même URL (`/admin/tournaments` est à la fois « Tournois – liste » et la
      // cible de « Check-in matchs (par tournoi) »), et la marche sur l'arbre
      // s'arrête à la première trouvée. Écraser donnerait un libellé juste mais
      // pas celui qu'affiche l'écran.
      if (n.href && !(n.href in out)) out[n.href] = next;
      if (n.children) walk(n.children, next);
    }
  };
  walk(nodes, []);
  return out;
}

const LABELS = {
  root: 'Administration',
  entities: {
    tournament: 'Tournoi',
    match: 'Match',
    stage: 'Phase',
    team: 'Équipe',
    user: 'Compte',
    tenant: 'Espace',
    scrim: 'Scrim',
    planning: 'Planning',
    league: 'Ligue',
    event: 'Déroulé',
    caster: 'Casteuse',
  },
} as const;

/** Toutes les routes de `pages/admin`, en motif Next (`[id]` conservés). */
function adminRoutes(): string[] {
  const root = path.join(process.cwd(), 'pages', 'admin');
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, `${prefix}/${entry.name}`);
        continue;
      }
      if (!entry.name.endsWith('.tsx')) continue;
      const base = entry.name.replace(/\.tsx$/, '');
      out.push(base === 'index' ? prefix : `${prefix}/${base}`);
    }
  };
  walk(root, '/admin');
  return out;
}

describe('adminNavTrail — fidélité à ADMIN_NAV', () => {
  it('reproduit exactement la dérivation depuis l’arbre', () => {
    expect(ADMIN_NAV_TRAILS).toEqual(buildTrailsFromNav(ADMIN_NAV));
  });

  it('liste les mêmes URL, triées de la plus longue à la plus courte', () => {
    expect([...ADMIN_NAV_HREFS].sort()).toEqual(
      Object.keys(ADMIN_NAV_TRAILS).sort()
    );
    // Le tri N'EST PAS cosmétique : c'est lui qui remplace la comparaison
    // `h.length > best.length` de la marche sur l'arbre. Mal trié, le fil
    // s'accrocherait à un préfixe trop court sans que rien ne plante.
    const lengths = ADMIN_NAV_HREFS.map((h) => h.length);
    expect([...lengths].sort((a, b) => b - a)).toEqual(lengths);
  });
});

describe('adminBreadcrumbFromTrails — équivalence avec la version sur arbre', () => {
  const routes = adminRoutes();

  it('trouve un nombre plausible de routes admin', () => {
    // Garde-fou du garde-fou : si la découverte de routes casse, le test
    // ci-dessous passerait sur une liste vide sans rien vérifier.
    expect(routes.length).toBeGreaterThan(80);
  });

  it('rend le même fil que la version sur arbre, sur toutes les routes', () => {
    const divergences: string[] = [];
    for (const route of routes) {
      // `asPath` : les segments dynamiques remplacés par une valeur, comme
      // dans un navigateur — c'est ce qui exerce la troncature par profondeur.
      const asPath = route.replace(/\[([^\]]+)\]/g, 'x1');
      const fromTree = adminBreadcrumb(route, asPath, ADMIN_NAV, LABELS);
      const fromTrails = adminBreadcrumbFromTrails(
        route,
        asPath,
        ADMIN_NAV_TRAILS,
        ADMIN_NAV_HREFS,
        LABELS
      );
      if (JSON.stringify(fromTree) !== JSON.stringify(fromTrails)) {
        divergences.push(
          `${route}\n    arbre : ${JSON.stringify(fromTree)}\n    fils  : ${JSON.stringify(fromTrails)}`
        );
      }
    }
    expect(
      divergences,
      `${divergences.length} divergence(s):\n  ${divergences.join('\n  ')}`
    ).toEqual([]);
  });
});
