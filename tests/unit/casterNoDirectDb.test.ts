// Le navigateur n'interroge plus la base avec le jeton de la personne : le cockpit et ses
// sources OBS passent par l'API (docs/AUTH-BETTER-AUTH.md, lot 2). Better Auth ne sera pas
// reconnu par PostgREST, et D1 n'a pas de règles d'accès : un nouvel appel casserait là.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['components', 'hooks', 'pages', 'features', 'utils'];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('le navigateur et la base', () => {
  it('jamais de supabaseClient.from()', () => {
    const offenders = ROOTS.flatMap(walk).filter((file) =>
      /supabaseClient\s*\.from\(/.test(readFileSync(file, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});
