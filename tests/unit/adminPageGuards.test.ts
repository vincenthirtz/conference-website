// Chaque page admin déclare une garde — lot A2 (docs/PLAN-espace-admin.md).
//
// Le lot introduit une SECONDE forme de garde (`withStaffPage({ permission })`)
// à côté de la forme historique (`withStaffPage('admin')`). Le risque n'est
// alors plus « quelle garde ? » mais « et si une page n'en avait aucune ? » —
// une page admin sans `getServerSideProps` gardé est publique, et rien dans le
// code ne le crie.
//
// Ce test lit l'arbre `pages/admin` et exige que chaque écran déclare quelque
// chose : une garde, ou un shim de redirection (ces derniers n'affichent rien).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ADMIN_DIR = path.join(process.cwd(), 'pages', 'admin');

/** Pages volontairement publiques : la porte d'entrée et ses annexes. */
const PUBLIC_ADMIN_PAGES = new Set([
  'login.tsx',
  'logout.tsx',
  'forgot-password.tsx',
  'reset-password.tsx',
]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

describe('gardes des pages admin', () => {
  const files = walk(ADMIN_DIR);

  it('trouve bien l’arbre des pages admin', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('aucune page admin sans garde ni redirection', () => {
    const unguarded: string[] = [];

    for (const file of files) {
      const rel = path.relative(ADMIN_DIR, file);
      if (PUBLIC_ADMIN_PAGES.has(rel)) continue;

      const src = fs.readFileSync(file, 'utf8');
      const guarded =
        // `withStaffPage(` ou `withStaffPage<Props>(` — la forme générique est
        // la plus courante, l'oublier faisait passer le test pour un détecteur
        // de gardes alors qu'il détectait une syntaxe.
        /withStaffPage\s*[<(]/.test(src) ||
        src.includes('requireStaffRoleFromRequest') ||
        src.includes('requireStaffPermissionFromRequest') ||
        // Shim de redirection : n'affiche rien, la cible est gardée. Le
        // redirect est souvent produit par un helper (`communicationsRedirect`,
        // `associationRedirect`, `moderationRedirect`…).
        /redirect:\s*\{/.test(src) ||
        /Redirect\(/.test(src);

      if (!guarded) unguarded.push(rel);
    }

    expect(
      unguarded,
      `Pages admin sans garde :\n  ${unguarded.join('\n  ')}`
    ).toEqual([]);
  });
});
