// @vitest-environment happy-dom
//
// Women's Library, lot 15 — sous la scène, ce que fait la joueuse d'un meuble
// et le bouton pour se relever ou arrêter (features/player/library/ui/room/
// PostureBar.tsx) :
//   * debout : la région `status` existe (un lecteur d'écran annoncera le
//     prochain changement) mais ne dit rien, et aucun bouton ;
//   * assise, allongée : « Tu es assise. » / « Tu es allongée. » et « Se
//     lever » ; en train de se servir d'un meuble : sa phrase et « Arrêter » ;
//   * le bouton est un vrai bouton (clavier) qui appelle `onStandUp`.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PostureBar from '../../features/player/library/ui/room/PostureBar';

afterEach(cleanup);

describe('PostureBar', () => {
  it('debout : une région `status` vide, aucun bouton', () => {
    render(<PostureBar posture={null} onStandUp={() => undefined} />);
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('assise : « Tu es assise. » et « Se lever », qui la relève', () => {
    const onStandUp = vi.fn();
    render(
      <PostureBar
        posture={{ kind: 'seat', itemId: 'sofa', spot: 1, pose: 'sit_low' }}
        onStandUp={onStandUp}
      />
    );
    expect(screen.getByRole('status').textContent).toBe('Tu es assise.');
    fireEvent.click(screen.getByRole('button', { name: 'Se lever' }));
    expect(onStandUp).toHaveBeenCalledTimes(1);
  });

  it('allongée, puis en train de lire : la phrase et le bouton suivent', () => {
    const { rerender } = render(
      <PostureBar
        posture={{ kind: 'seat', itemId: 'bed', spot: 0, pose: 'lie' }}
        onStandUp={() => undefined}
      />
    );
    expect(screen.getByRole('status').textContent).toBe('Tu es allongée.');
    rerender(
      <PostureBar
        posture={{ kind: 'use', itemId: 'shelf', activity: 'read' }}
        onStandUp={() => undefined}
      />
    );
    expect(screen.getByRole('status').textContent).toBe('Tu lis.');
    expect(screen.getByRole('button', { name: 'Arrêter' })).toBeTruthy();
    expect(
      screen.getByTestId('library-posture').getAttribute('data-posture')
    ).toBe('read');
  });
});
