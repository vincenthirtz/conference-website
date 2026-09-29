// @vitest-environment happy-dom
//
// useHydrateOnce (lot L10) — une fiche `[id]` ne copie la réponse du serveur
// dans son formulaire qu'UNE fois : une donnée qui change ensuite (relecture,
// `setQueryData` après enregistrement) n'écrase pas la saisie en cours.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useHydrateOnce } from '../../features/admin/_shared/useHydrateOnce';

afterEach(cleanup);

type Props = { id: string | null; data: { name: string } | undefined };

describe('useHydrateOnce', () => {
  it('attend la donnée, hydrate une fois, ignore les données suivantes', () => {
    const hydrate = vi.fn();
    const { result, rerender } = renderHook(
      ({ id, data }: Props) => useHydrateOnce(id, data, hydrate),
      { initialProps: { id: 'a', data: undefined } as Props }
    );
    expect(result.current).toBe(false);
    expect(hydrate).not.toHaveBeenCalled();

    rerender({ id: 'a', data: { name: 'Un' } });
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(hydrate).toHaveBeenLastCalledWith({ name: 'Un' });
    expect(result.current).toBe(true);

    rerender({ id: 'a', data: { name: 'Deux' } });
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(true);
  });

  it('réhydrate pour une autre fiche, jamais sans identifiant', () => {
    const hydrate = vi.fn();
    const { result, rerender } = renderHook(
      ({ id, data }: Props) => useHydrateOnce(id, data, hydrate),
      { initialProps: { id: null, data: { name: 'x' } } as Props }
    );
    expect(result.current).toBe(false);
    expect(hydrate).not.toHaveBeenCalled();

    rerender({ id: 'a', data: { name: 'A' } });
    rerender({ id: 'b', data: { name: 'B' } });
    expect(hydrate).toHaveBeenCalledTimes(2);
    expect(hydrate).toHaveBeenLastCalledWith({ name: 'B' });
    expect(result.current).toBe(true);
  });
});
