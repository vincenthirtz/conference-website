// Collisions de slugs dynamiques dans le routeur de pages.
//
// Next.js REFUSE deux noms de paramètre différents sur le même segment
// dynamique : `pages/api/admin/demandes/[id].ts` et
// `pages/api/admin/demandes/[demandeId]/…` font échouer le build avec
// « You cannot use different slug names for the same dynamic path ».
//
// Ce n'est ni une erreur de type, ni une erreur de lint, ni un test qui casse :
// `npm run verify` passe au vert et c'est le déploiement qui tombe, deux
// minutes plus tard, sur un message qui ne nomme pas le fichier fautif. D'où ce
// garde-fou — quelques millisecondes de lecture de dossiers contre un build
// perdu.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const PAGES = path.join(process.cwd(), 'pages');

/** `[id]` / `[id].ts` / `[...slug]` / `[[...slug]]` → le nom du paramètre. */
function slugNameOf(entryName: string): string | null {
  const base = entryName.replace(/\.(tsx?|jsx?)$/, '');
  const m = base.match(/^\[+(?:\.\.\.)?([^\]]+)\]+$/);
  return m ? m[1] : null;
}

/** Tous les dossiers où cohabitent DEUX noms de slug distincts. */
function findCollisions(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const names = new Set<string>();
  for (const entry of entries) {
    const slug = slugNameOf(entry.name);
    if (slug) names.add(slug);
    if (entry.isDirectory()) findCollisions(path.join(dir, entry.name), acc);
  }

  if (names.size > 1) {
    acc.push(
      `${path.relative(process.cwd(), dir)} → ${[...names]
        .map((n) => `[${n}]`)
        .join(' vs ')}`
    );
  }
  return acc;
}

describe('routeur : noms de slugs dynamiques', () => {
  it('un même segment n’a qu’un seul nom de paramètre', () => {
    const collisions = findCollisions(PAGES);
    expect(
      collisions,
      `Next.js refusera de builder :\n  ${collisions.join(
        '\n  '
      )}\n\nRenomme pour que les segments frères partagent le même nom.`
    ).toEqual([]);
  });
});
