// Runtime guard for fr/en locale parity.
//
// There is a compile-time parity check in `lib/i18n/locales/parity.ts`, but
// pushes to the `work` branch skip CI — so a `next build` typecheck never runs
// and a drifting locale would ship silently. This test re-asserts parity at
// unit-test time (which we DO run before commit), and names the offending
// key(s) on failure so the fix is obvious.
//
// Zero new deps: deep-flatten is a tiny local helper.

import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

import en from '@/lib/i18n/locales/en.json';
import { frDict as fr } from '@/lib/i18n/locales/fr';
import adminEn from '@/lib/i18n/locales/admin-en.json';
import { frDict as adminFr } from '@/lib/i18n/locales/admin-fr';

type Json = Record<string, unknown>;

/**
 * Flatten a nested locale object into a sorted list of dotted leaf keys.
 * Only leaves (non-object values) become keys; arrays are treated as leaves so
 * an array-vs-object shape mismatch surfaces as a missing/extra key rather than
 * being silently traversed.
 */
function flattenKeys(obj: Json, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...flattenKeys(value as Json, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

// Public locales (`useT`) and admin locales (`useAdminT`) are separate
// dictionaries — each pair must be internally consistent. Same assertions run
// over both.
const PAIRS: { label: string; fr: Json; en: Json }[] = [
  { label: 'public (fr ↔ en)', fr: fr as Json, en: en as Json },
  {
    label: 'admin (admin-fr ↔ admin-en)',
    fr: adminFr as Json,
    en: adminEn as Json,
  },
];

describe.each(PAIRS)(
  'i18n locale parity — $label',
  ({ fr: frJson, en: enJson }) => {
    const enKeys = new Set(flattenKeys(enJson));
    const frKeys = new Set(flattenKeys(frJson));

    it('fr has no keys missing from en', () => {
      const missingFromEn = [...frKeys].filter((k) => !enKeys.has(k)).sort();
      expect(
        missingFromEn,
        `Keys present in fr but missing from en:\n  ${missingFromEn.join('\n  ')}`
      ).toEqual([]);
    });

    it('en has no keys missing from fr', () => {
      const missingFromFr = [...enKeys].filter((k) => !frKeys.has(k)).sort();
      expect(
        missingFromFr,
        `Keys present in en but missing from fr:\n  ${missingFromFr.join('\n  ')}`
      ).toEqual([]);
    });

    it('key counts match', () => {
      expect(
        frKeys.size,
        `Key count mismatch: fr has ${frKeys.size}, en has ${enKeys.size}`
      ).toBe(enKeys.size);
    });
  }
);

// Le français est éclaté en un fichier par namespace (cf. `lib/i18n/ns.ts`).
// Les barrels `locales/{fr,admin-fr}/index.ts` recomposent le dictionnaire
// complet et sont le SEUL point d'entrée des contrôles de parité ci-dessus —
// un namespace absent du barrel échapperait donc silencieusement à ces
// contrôles. On vérifie ici que le barrel liste bien tous les fichiers.
describe.each([
  { label: 'public', dir: 'fr', dict: fr as Json },
  { label: 'admin', dir: 'admin-fr', dict: adminFr as Json },
])('i18n namespace barrel — $label', ({ dir, dict }) => {
  it('lists every namespace file', () => {
    const dirPath = path.join(process.cwd(), 'lib/i18n/locales', dir);
    const onDisk = fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
      .map((f) => f.replace(/\.ts$/, ''))
      .sort();
    const inBarrel = Object.keys(dict).sort();
    const missing = onDisk.filter((n) => !inBarrel.includes(n));
    expect(
      missing,
      `Namespaces présents sur disque mais absents de locales/${dir}/index.ts :\n  ${missing.join('\n  ')}`
    ).toEqual([]);
    expect(inBarrel).toEqual(onDisk);
  });
});
