// tests/unit/rebrandContrast.test.ts
//
// Garde-fou contraste du rebrand (plan §6). Lit les hex RÉELS de la palette
// dans styles/globals.css et vérifie les invariants de lisibilité WCAG :
//   - l'app est dark-themed → tout token de marque utilisable en TEXTE doit
//     passer AA (≥ 4.5:1) sur la surface la plus sombre (--bg-deep) ;
//   - `--color-violet-deep` est le token « texte sur fond clair » → AA sur blanc ;
//   - le jaune reste un accent : il NE doit PAS être lisible comme texte sur
//     blanc (< 3:1) — si un futur hex le rendait lisible sur clair, ce test
//     casse volontairement pour forcer une revue (le jaune = accent/dark only).
//
// Ce test échoue si quelqu'un remplace les hex estimés par les valeurs exactes
// du SVG et casse un de ces invariants — c'est le but.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const css = readFileSync(
  join(process.cwd(), 'styles/globals.css'),
  'utf8'
);

/** Extrait la valeur hex d'un token `--name: #xxxxxx;` du :root. */
function token(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} introuvable dans globals.css`);
  return m[1].toLowerCase();
}

function luminance(hex: string): number {
  const ch = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function ratio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

const BG_DEEP = token('bg-deep'); // surface la plus sombre
const WHITE = '#ffffff';

// Tokens de marque susceptibles d'être utilisés comme TEXTE sur fond sombre.
const TEXT_ON_DARK = [
  'color-violet',
  'color-violet-light',
  'color-green',
  'color-green-light',
  'color-green-deep',
  'color-yellow',
  'color-yellow-light',
  'color-yellow-deep',
  'status-success',
  'status-warning',
  'status-error',
];

describe('rebrand — garde-fou contraste WCAG', () => {
  it.each(TEXT_ON_DARK)(
    '%s passe AA (≥4.5) comme texte sur --bg-deep',
    (name) => {
      const r = ratio(token(name), BG_DEEP);
      expect(r, `${name} sur ${BG_DEEP} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  );

  it('--color-violet-deep est lisible comme texte sur blanc (AA)', () => {
    const r = ratio(token('color-violet-deep'), WHITE);
    expect(r, `violet-deep sur blanc = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  });

  it('le jaune reste un accent : NON lisible comme texte sur blanc (<3:1)', () => {
    const r = ratio(token('color-yellow'), WHITE);
    expect(r, `yellow sur blanc = ${r.toFixed(2)} — si ≥3, revoir l'usage`).toBeLessThan(3);
  });
});
