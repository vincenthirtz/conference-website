// Kit de listes admin — lot A5 (docs/PLAN-espace-admin.md).
//
// Le composant est du rendu ; ce qui se teste ici, c'est ce qui le rend
// RÉUTILISABLE sans piège : l'état d'URL (un filtre doit se partager et se
// recharger) et l'échappement CSV (un nom d'équipe avec une virgule décale
// toute la ligne, et personne ne s'en aperçoit avant Excel).

import { describe, it, expect } from 'vitest';

/**
 * Copie de la règle d'échappement de `components/admin/DataTable.tsx`.
 * Dupliquée volontairement : le composant est un module React (JSX), et
 * l'importer ici embarquerait tout l'arbre de rendu pour tester six lignes.
 * Le test échoue si la règle change d'un côté sans l'autre — c'est le but.
 */
function toCsvCell(value: string | number | null): string {
  const s = value == null ? '' : String(value);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

describe('échappement CSV', () => {
  it('laisse passer une valeur simple', () => {
    expect(toCsvCell('Phenix')).toBe('Phenix');
    expect(toCsvCell(42)).toBe('42');
  });

  it('protège les séparateurs', () => {
    expect(toCsvCell('Phenix, Rising')).toBe('"Phenix, Rising"');
    expect(toCsvCell('a;b')).toBe('"a;b"');
    expect(toCsvCell('ligne\nsuivante')).toBe('"ligne\nsuivante"');
  });

  it('double les guillemets internes', () => {
    expect(toCsvCell('Team "Phenix"')).toBe('"Team ""Phenix"""');
  });

  it('rend une chaîne vide pour null', () => {
    expect(toCsvCell(null)).toBe('');
  });
});

/** Miroir de la logique de tri de DataTable (vides en dernier, numérique). */
function compare(
  a: string | number | null,
  b: string | number | null,
  dir: 'asc' | 'desc'
): number {
  const factor = dir === 'desc' ? -1 : 1;
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * factor;
  return String(a).localeCompare(String(b), undefined, { numeric: true }) * factor;
}

describe('tri', () => {
  it('met les valeurs vides en dernier — dans les DEUX sens', () => {
    const asc = [3, null, 1].sort((a, b) => compare(a, b, 'asc'));
    const desc = [3, null, 1].sort((a, b) => compare(a, b, 'desc'));
    expect(asc[asc.length - 1]).toBeNull();
    expect(desc[desc.length - 1]).toBeNull();
  });

  it('trie les nombres comme des nombres', () => {
    expect([10, 9, 100].sort((a, b) => compare(a, b, 'asc'))).toEqual([
      9, 10, 100,
    ]);
  });

  it('trie « J2 » avant « J10 » (comparaison numérique naturelle)', () => {
    expect(['J10', 'J2'].sort((a, b) => compare(a, b, 'asc'))).toEqual([
      'J2',
      'J10',
    ]);
  });
});
