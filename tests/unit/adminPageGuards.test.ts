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

/**
 * Pages gardées par RÔLE et non par permission, volontairement (lot A2).
 * Toute autre page doit déclarer la permission qu'elle exige.
 */
const ROLE_GATED_ON_PURPOSE = new Set([
  // Porte d'entrée : accessible à tout le staff, contenu filtré à l'intérieur.
  'index.tsx',
  // Surfaces de cast, déjà gatées `'caster'` avant le lot — inchangées.
  'caster.tsx',
  'broadcast/live.tsx',
  'regie.tsx',
  'events/[runId]/director.tsx',
  'events/index.tsx',
  // Documentation interne : ouverte à qui a accès au back-office.
  'aide-tournoi.tsx',
  // Hubs à onglets gardés au rôle le PLUS PERMISSIF de leurs onglets, chaque
  // onglet re-vérifiant le sien à l'intérieur. Les enfermer dans une permission
  // unique fermerait un onglet à quelqu'un qui l'avait, ou ouvrirait tout le
  // hub — les deux violent la règle du lot.
  'moderation/index.tsx',
  'communications/index.tsx',
  'demandes/[id].tsx',
  // « Gérer mon équipe » : un membre du staff peut être capitaine, quel que
  // soit son rôle. Le contenu vient de SON équipe, pas d'un droit d'admin.
  'teams/my.tsx',
]);

describe('gardes des pages admin', () => {
  const files = walk(ADMIN_DIR);

  it('trouve bien l’arbre des pages admin', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('chaque page admin déclare une PERMISSION (ou est listée comme gardée par rôle)', () => {
    const roleOnly: string[] = [];

    for (const file of files) {
      const rel = path.relative(ADMIN_DIR, file);
      if (PUBLIC_ADMIN_PAGES.has(rel) || ROLE_GATED_ON_PURPOSE.has(rel)) {
        continue;
      }
      const src = fs.readFileSync(file, 'utf8');
      if (!/withStaffPage\s*[<(]/.test(src)) continue; // shim de redirection
      if (/withStaffPage(?:<[^>]*>)?\(\s*\{\s*permission:/.test(src)) continue;
      roleOnly.push(rel);
    }

    expect(
      roleOnly,
      `Pages encore gardées par rôle :\n  ${roleOnly.join('\n  ')}\n\n` +
        'Migre-les vers `withStaffPage({ permission: … })`, ou justifie-les dans ROLE_GATED_ON_PURPOSE.'
    ).toEqual([]);
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
