// tests/unit/rubanTokensFallback.test.ts
//
// « Le Ruban », lot P7 (docs/PLAN-industrialisation-joueur.md) — gardes de
// source sur les jetons et les feuilles de surface :
//   1. aucun `var(--x)` sans repli dans le kit (features/ruban) ni dans les
//      feuilles Ruban : un jeton non défini invalide TOUTE la déclaration
//      (cas vécu : boutons et héros sans fond) ;
//   2. chaque repli d'un jeton commun vaut le jeton lui-même : hors surface,
//      le rendu est celui de la planche, pas une approximation ;
//   3. une palette unique : le pont Tailwind de la joueuse est celui de
//      l'admin, déclaration pour déclaration ;
//   4. le site public ne bouge pas : chaque règle des feuilles Ruban est
//      portée par une surface ;
//   5. contraste AA (≥ 4,5:1, texte 11–12 px) des puces d'état du kit sur
//      chaque surface d'encre.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const SHEETS = [
  'styles/ruban-tokens.css',
  'styles/admin-ruban.css',
  'styles/player-ruban.css',
];
const KIT = 'features/ruban';

function kitFiles(): string[] {
  return fs
    .readdirSync(path.join(ROOT, KIT))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => `${KIT}/${f}`);
}

/** Jetons communs : nom → valeur (espaces normalisés). */
function tokens(): Map<string, string> {
  const css = stripComments(read('styles/ruban-tokens.css'));
  const body = css.slice(css.indexOf('{') + 1, css.lastIndexOf('}'));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    out.set(m[1], m[2].replace(/\s+/g, ' ').trim());
  return out;
}

/** Contenu d'un `var(` … `)` équilibré, à partir de l'index de `var(`. */
function varCall(src: string, start: number): string {
  let depth = 0;
  for (let i = start + 3; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(start + 4, i);
  }
  return src.slice(start + 4);
}

describe('Le Ruban : jetons et feuilles de surface (P7)', () => {
  it('tout var(--x) du kit et des feuilles Ruban a un repli', () => {
    const offenders: string[] = [];
    for (const rel of [...SHEETS, ...kitFiles()]) {
      const src = rel.endsWith('.css') ? stripComments(read(rel)) : read(rel);
      for (const m of src.matchAll(/var\(\s*--[\w-]+\s*\)/g))
        offenders.push(`${rel} : ${m[0]}`);
    }
    expect(
      offenders,
      'Un jeton non défini casse toute la déclaration : écris var(--x, <valeur du jeton>).'
    ).toEqual([]);
  });

  it('le repli d’un jeton simple vaut sa valeur dans ruban-tokens.css', () => {
    const t = tokens();
    const wrong: string[] = [];
    for (const rel of SHEETS.slice(1)) {
      const src = stripComments(read(rel));
      for (const m of src.matchAll(/var\(/g)) {
        const inner = varCall(src, m.index ?? 0);
        const comma = inner.indexOf(',');
        const name = inner.slice(0, comma).trim();
        const fallback = inner
          .slice(comma + 1)
          .replace(/\s+/g, ' ')
          .trim();
        const value = t.get(name);
        // Jetons simples (#hex, px) : l'égalité est stricte. Les composés
        // (filets en rgba, polices) ont un repli littéral équivalent.
        if (value && /^(#[0-9a-f]+|\d+px)$/i.test(value) && fallback !== value)
          wrong.push(`${rel} : ${name} → ${fallback} (jeton : ${value})`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('palette unique : le pont Tailwind joueuse = celui de l’admin', () => {
    const pont = (rel: string) =>
      [
        ...stripComments(read(rel)).matchAll(
          /(--(?:color|radius)-[\w-]+)\s*:\s*([^;]+);/g
        ),
      ].map((m) => `${m[1]}: ${m[2].replace(/\s+/g, ' ').trim()}`);
    const admin = pont('styles/admin-ruban.css');
    expect(admin.length).toBeGreaterThan(150);
    expect(pont('styles/player-ruban.css')).toEqual(admin);
  });

  it('pas de jaune de marque dans le pont : les rampes détournées vont à l’orchidée', () => {
    const css = stripComments(read('styles/player-ruban.css'));
    for (const ramp of ['pink', 'rose', 'fuchsia', 'orange'])
      expect(css, ramp).toMatch(new RegExp(`--color-${ramp}-500: var\\(--or,`));
  });

  it('le site public ne bouge pas : chaque règle est portée par une surface', () => {
    const unscoped: string[] = [];
    for (const [rel, surfaces] of [
      ['styles/ruban-tokens.css', ['admin', 'player']],
      ['styles/admin-ruban.css', ['admin']],
      ['styles/player-ruban.css', ['player']],
    ] as const) {
      const css = stripComments(read(rel))
        // Déclarations de propriétés : on ne garde que les sélecteurs.
        .replace(/\{[^{}]*\}/g, '{}')
        .replace(/@(?:layer|media)[^{]*\{/g, '');
      for (const block of css.split('{}')) {
        const selector = block.replace(/[{}]/g, '').trim();
        if (!selector) continue;
        for (const part of selector.split(/,(?![^(]*\))/)) {
          const ok = surfaces.some((s) =>
            part.includes(`[data-surface="${s}"]`)
          );
          if (!ok) unscoped.push(`${rel} : ${part.trim()}`);
        }
      }
    }
    expect(unscoped).toEqual([]);
  });

  it('jetons communs : portés par les deux surfaces', () => {
    const css = stripComments(read('styles/ruban-tokens.css'));
    expect(css).toContain(':root:has([data-surface="admin"])');
    expect(css).toContain(':root:has([data-surface="player"])');
  });

  it('variante `ruban:` des primitives : admin OU joueuse, jamais le public', () => {
    const css = read('styles/globals.css').replace(/\s+/g, ' ');
    expect(css).toContain(
      '@custom-variant ruban ( :root:has([data-surface="admin"], [data-surface="player"]) & );'
    );
  });
});

// ── Contraste AA des puces d'état ────────────────────────────────────────────

type Rgb = [number, number, number];

function hex(h: string): Rgb {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as Rgb;
}
function luminance([r, g, b]: Rgb): number {
  const c = [r, g, b].map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as Rgb;
}

/** Tons de features/ruban/Chip.tsx : couleur de texte et fond translucide. */
function chipTones(): Record<string, { text: Rgb; bg?: [Rgb, number] }> {
  const src = read('features/ruban/Chip.tsx');
  const table = src.slice(src.indexOf('const TONE'), src.indexOf('};'));
  const out: Record<string, { text: Rgb; bg?: [Rgb, number] }> = {};
  for (const m of table.matchAll(/(\w+):\s*'([^']+)'/g)) {
    const text = /text-\[(?:var\(--[\w-]+,)?(#[0-9a-f]{6})/i.exec(m[2]);
    const bg = /bg-\[rgba\((\d+),(\d+),(\d+),(\.\d+|[01](?:\.\d+)?)\)\]/.exec(
      m[2]
    );
    if (!text) continue;
    out[m[1]] = {
      text: hex(text[1]),
      bg: bg ? [[+bg[1], +bg[2], +bg[3]], Number.parseFloat(bg[4])] : undefined,
    };
  }
  return out;
}

describe('Le Ruban : contraste AA des puces d’état (Chip)', () => {
  const t = tokens();
  const surfaces = ['--canvas', '--s1', '--s2', '--s3'].map(
    (k) => [k, hex(t.get(k) as string)] as const
  );
  const tones = chipTones();

  it('les six tons sont lus', () => {
    expect(Object.keys(tones).sort()).toEqual(
      ['brand', 'err', 'live', 'neutral', 'ok', 'warn'].sort()
    );
  });

  for (const [surface, base] of surfaces)
    it(`≥ 4,5:1 sur ${surface}`, () => {
      const low: string[] = [];
      for (const [tone, { text, bg }] of Object.entries(tones)) {
        const back = bg ? over(bg[0], bg[1], base) : base;
        const r = ratio(text, back);
        if (r < 4.5) low.push(`${tone} : ${r.toFixed(2)}:1`);
      }
      expect(low).toEqual([]);
    });
});
