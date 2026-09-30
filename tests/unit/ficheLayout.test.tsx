// @vitest-environment happy-dom
//
// FicheLayout ne réserve la colonne de droite (330 px à partir de `xl`) que
// s'il y a un aside. Posée sans condition, elle ramenait la colonne
// principale de /player/manage-team à ~370 px à 1280 px, et le roster
// écrasait nom et BattleTag à une largeur nulle (e2e manage-team).

import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FicheLayout } from '../../features/ruban/Fiche';

afterEach(cleanup);

describe('FicheLayout', () => {
  it('une seule colonne sans aside', () => {
    const { container } = render(<FicheLayout main={<p>principal</p>} />);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).not.toMatch(/330px/);
    expect(container.querySelector('aside')).toBeNull();
  });

  it('deux colonnes avec aside', () => {
    const { container } = render(
      <FicheLayout main={<p>principal</p>} aside={<p>meta</p>} />
    );
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toMatch(/xl:grid-cols-\[minmax\(0,1fr\)_330px\]/);
    expect(container.querySelector('aside')).not.toBeNull();
  });
});
