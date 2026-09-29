// @vitest-environment happy-dom
//
// DangerZone (archétype Fiche) : une action sensible ne part qu'après avoir
// RETAPÉ le nom de l'entité — pas sur un clic de confirmation réflexe.

import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import DangerZone from '../../features/ruban/DangerZone';

afterEach(cleanup);

const labels = {
  title: 'Zone sensible',
  intro: 'Actions engageantes.',
  typeToConfirm: 'Tapez « {name} » pour confirmer',
  cancel: 'Annuler',
};

describe('DangerZone', () => {
  it('le bouton final reste inactif tant que le nom n’est pas retapé à l’identique', async () => {
    const onConfirm = vi.fn();
    render(
      <DangerZone
        confirmName="crocheh"
        labels={labels}
        actions={[
          {
            id: 'del',
            title: 'Retirer',
            description: 'd',
            actionLabel: 'Exécuter',
            onConfirm,
          },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }));
    const input = screen.getByLabelText('Tapez « crocheh » pour confirmer');
    const confirm = () =>
      screen.getAllByRole('button', { name: 'Exécuter' }).at(-1)!;

    fireEvent.change(input, { target: { value: 'croche' } });
    expect(confirm().hasAttribute('disabled')).toBe(true);

    fireEvent.change(input, { target: { value: 'crocheh' } });
    expect(confirm().hasAttribute('disabled')).toBe(false);
    await act(async () => {
      fireEvent.click(confirm());
    });
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('Annuler referme sans rien exécuter', () => {
    const onConfirm = vi.fn();
    render(
      <DangerZone
        confirmName="x"
        labels={labels}
        actions={[
          {
            id: 'del',
            title: 'Retirer',
            description: 'd',
            actionLabel: 'Exécuter',
            onConfirm,
          },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByLabelText('Tapez « x » pour confirmer')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
