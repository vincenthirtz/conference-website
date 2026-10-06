// @vitest-environment happy-dom
//
// useDirtyBaseline (lot A2) : « modifications non enregistrées » des fiches
// d'édition — faux tant que la fiche n'est pas hydratée, vrai après une
// saisie, désarmé par `markClean` (hydratation ou enregistrement réussi).

import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDirtyBaseline } from '@/hooks/forms/useDirtyBaseline';

describe('useDirtyBaseline', () => {
  it('reste propre tant que la référence n’est pas posée', () => {
    const { result } = renderHook(({ v }) => useDirtyBaseline(v), {
      initialProps: { v: { name: 'a' } },
    });
    expect(result.current.dirty).toBe(false);
  });

  it('devient sale après une saisie, se désarme après enregistrement', () => {
    const { result, rerender } = renderHook(({ v }) => useDirtyBaseline(v), {
      initialProps: { v: { name: 'a' } },
    });
    act(() => result.current.markClean({ name: 'a' }));
    expect(result.current.dirty).toBe(false);

    rerender({ v: { name: 'ab' } });
    expect(result.current.dirty).toBe(true);

    // Revenir à la valeur d'origine n'est pas une modification.
    rerender({ v: { name: 'a' } });
    expect(result.current.dirty).toBe(false);

    rerender({ v: { name: 'abc' } });
    act(() => result.current.markClean({ name: 'abc' }));
    expect(result.current.dirty).toBe(false);
  });
});
