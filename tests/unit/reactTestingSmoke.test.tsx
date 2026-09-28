// @vitest-environment happy-dom
//
// Garde de l'outillage : un hook et un composant se testent (DOM happy-dom +
// @testing-library/react). Si ce fichier casse, c'est l'environnement de test
// React qui est cassé, pas un écran.

import { afterEach, describe, it, expect } from 'vitest';
import { useState } from 'react';
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from '@testing-library/react';

function Counter() {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN((v) => v + 1)}>
      clics : {n}
    </button>
  );
}

// Sans les globals de vitest, testing-library ne nettoie pas le DOM seul.
afterEach(cleanup);

describe('outillage de test React', () => {
  it('rend un composant et réagit à un clic', () => {
    render(<Counter />);
    const btn = screen.getByRole('button');
    act(() => btn.click());
    expect(btn.textContent).toBe('clics : 1');
  });

  it('teste un hook sans composant hôte', () => {
    const { result } = renderHook(() => useState('a'));
    act(() => result.current[1]('b'));
    expect(result.current[0]).toBe('b');
  });
});
