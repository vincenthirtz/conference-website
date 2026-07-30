// Garde anti-régression : virgule interdite entre les pistes d'une grille
// Tailwind à valeur arbitraire.
//
// Pourquoi ce garde existe : `grid-cols-[2fr,1fr]` COMPILE sans erreur mais
// produit `grid-template-columns: 2fr,1fr`, qui est un CSS invalide (la spec
// veut des pistes séparées par des ESPACES). Le navigateur ignore alors la
// déclaration : la grille reste en une seule colonne, silencieusement. Aucun
// lint ne le voit, aucun test de rendu non-visuel ne le voit.
//
// C'est arrivé sur 14 fichiers du repo (dont le cockpit caster, où la liste des
// scènes prenait toute la largeur et l'éditeur passait dessous). Vérifié sur le
// compilateur du projet (Tailwind v4) : la virgule est émise telle quelle, là où
// `grid-cols-[2fr_1fr]` donne bien `grid-template-columns: 2fr 1fr`.
//
// La bonne syntaxe utilise l'underscore comme séparateur d'espace :
//   grid-cols-[2fr_1fr]              ✅
//   grid-cols-[280px_minmax(0,1fr)]  ✅  (virgule DANS une fonction = OK)
//   grid-cols-[2fr,1fr]              ❌

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const SCAN_DIRS = ['pages', 'components'];
const EXTENSIONS = ['.tsx', '.ts'];

/** Utilitaires dont la valeur arbitraire est une liste de pistes de grille. */
const GRID_UTILITY_RE = /\b(?:grid-cols|grid-rows)-\[([^\]]*)\]/g;

/**
 * Retire le contenu des parenthèses : une virgule y est légitime
 * (`minmax(0,1fr)`, `repeat(2,1fr)`). Ce qui reste ne doit plus en contenir.
 */
function stripFunctionArgs(value: string): string {
  let out = '';
  let depth = 0;
  for (const ch of value) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out;
}

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  let entries: string[] = [];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const rel = path.join(dir, entry);
    const full = path.join(ROOT, rel);
    if (statSync(full).isDirectory()) {
      files.push(...walk(rel));
    } else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      files.push(rel);
    }
  }
  return files;
}

type Offender = { file: string; snippet: string };

function findOffenders(rel: string): Offender[] {
  const src = readFileSync(path.join(ROOT, rel), 'utf8');
  const found: Offender[] = [];
  for (const match of src.matchAll(GRID_UTILITY_RE)) {
    if (stripFunctionArgs(match[1]).includes(',')) {
      found.push({ file: rel, snippet: match[0] });
    }
  }
  return found;
}

describe('Tailwind arbitrary grid values use `_`, never `,`', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(d));

  it('scans a non-trivial number of source files', () => {
    // Garde-fou : un walk cassé ne doit pas faire passer la suite en silence.
    expect(files.length).toBeGreaterThan(50);
  });

  it('has no comma-separated grid tracks (invalid CSS, silently ignored)', () => {
    const offenders = files.flatMap(findOffenders);
    const report = offenders.map((o) => `  ${o.file}: ${o.snippet}`).join('\n');
    expect(
      offenders.length,
      offenders.length === 0
        ? ''
        : `Pistes de grille séparées par une virgule — remplacer par « _ » :\n${report}\n` +
            `(ex. grid-cols-[2fr,1fr] → grid-cols-[2fr_1fr] ; une virgule reste ` +
            `permise DANS une fonction comme minmax(0,1fr).)`
    ).toBe(0);
  });
});

describe('stripFunctionArgs', () => {
  it('ignore les virgules internes aux fonctions CSS', () => {
    expect(stripFunctionArgs('280px_minmax(0,1fr)')).toBe('280px_minmax');
    expect(stripFunctionArgs('repeat(2,minmax(0,1fr))')).toBe('repeat');
  });

  it('conserve les virgules de séparation de pistes', () => {
    expect(stripFunctionArgs('2fr,1fr')).toBe('2fr,1fr');
    expect(stripFunctionArgs('auto,1fr,minmax(0,2fr)')).toBe('auto,1fr,minmax');
  });

  it('tolère des parenthèses déséquilibrées sans boucler', () => {
    expect(stripFunctionArgs('a)b,c')).toBe('ab,c');
  });
});
