// Garde-fou : toute lecture/écriture de `site_settings` est scopée tenant.
// Lot A8 de docs/PLAN-espace-admin.md.
//
// Depuis `scope_site_settings_by_tenant.sql`, la clé primaire est
// `(tenant_id, key)`. Une requête qui oublie le tenant ne rend plus UNE ligne
// mais N — ce que `.maybeSingle()` / `.single()` traduit par une 500 (PGRST116)
// le jour où un second tenant existe, et par un comportement silencieusement
// faux entre-temps.
//
// C'est exactement la famille de bug qu'on a déjà payée deux fois :
// `discordLinksColumnGuard` (une colonne mal nommée, sept call sites, erreur
// avalée) et le bug S5c (`getManagedTeam` appelé sans tenantId). D'où un test
// qui lit la SOURCE plutôt que d'espérer que personne n'oublie.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOTS = ['pages', 'utils', 'components'];

/** Fichiers autorisés à parler à la table sans filtre visible. */
const ALLOWED = new Set([
  // Le helper canonique : c'est LUI qui pose le filtre.
  'utils/siteSettings.ts',
]);

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

describe('site_settings est scopé tenant', () => {
  const files = ROOTS.flatMap((r) => walk(path.join(process.cwd(), r))).map(
    (f) => path.relative(process.cwd(), f)
  );

  it('chaque accès à la table porte un filtre ou une valeur de tenant', () => {
    const offenders: string[] = [];

    for (const file of files) {
      if (ALLOWED.has(file)) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (!src.includes("from('site_settings')")) continue;

      // Chaque accès est suivi, dans les ~15 lignes qui suivent, soit d'un
      // filtre `tenant_id`, soit d'un `tenant_id:` posé dans la ligne écrite.
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (!line.includes("from('site_settings')")) return;
        const window = lines.slice(i, i + 15).join('\n');
        const scoped =
          /\.eq\(\s*['"]tenant_id['"]/.test(window) ||
          /tenant_id:\s/.test(window);
        if (!scoped) offenders.push(`${file}:${i + 1}`);
      });
    }

    expect(
      offenders,
      `Accès à site_settings sans tenant :\n  ${offenders.join('\n  ')}\n\n` +
        'Passe par utils/siteSettings.ts, ou ajoute le filtre.'
    ).toEqual([]);
  });
});
