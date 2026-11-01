// Tout appel à Supabase Auth passe par une porte : utils/identityBrowser.ts dans le navigateur,
// utils/identity.ts (copie de l'API) sur le serveur. Le jour de Better Auth, deux modules à
// reprendre et non 130 appels (docs/AUTH-BETTER-AUTH.md, lot 1).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const { getSession, signOut, enroll } = vi.hoisted(() => ({
  getSession: vi.fn(async function (this: unknown) {
    return { data: { session: null }, error: null, self: this };
  }),
  signOut: vi.fn(async () => ({ error: null })),
  enroll: vi.fn(async () => ({ data: null, error: null })),
}));

vi.mock('@/utils/supabaseBrowser', () => {
  const auth = { getSession, signOut, mfa: { enroll } };
  return { supabaseClient: { auth } };
});

import { supabaseClient } from '@/utils/supabaseBrowser';
import { identityBrowser } from '@/utils/identityBrowser';

const ROOTS = ['pages', 'features', 'utils', 'lib', 'hooks', 'components'];
/** Les portes, et la fabrique des clients. */
const ALLOWED = new Set([
  'utils/identity.ts',
  'utils/identityBrowser.ts',
  'utils/supabase.ts',
  'utils/supabaseBrowser.ts',
]);
const AUTH_CALL = /\.auth\s*\??\.\s*[a-zA-Z]/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

describe('les portes vers Supabase Auth', () => {
  it('aucun appel à `.auth.` hors des portes', () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap(walk)) {
      if (ALLOWED.has(file.replace(/\\/g, '/'))) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*)/.test(line)) return;
          if (AUTH_CALL.test(line)) offenders.push(`${file}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('rend ce que rend Supabase, avec le bon `this` : le client garde son état', async () => {
    const res = (await identityBrowser.getSession()) as unknown as {
      self: unknown;
    };
    expect(res.self).toBe(supabaseClient.auth);
  });

  it('transmet tous les arguments, double authentification comprise', async () => {
    await identityBrowser.signOut({ scope: 'local' });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    await identityBrowser.mfa.enroll({ factorType: 'totp' });
    expect(enroll).toHaveBeenCalledWith({ factorType: 'totp' });
  });
});
