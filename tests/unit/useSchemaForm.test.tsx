// @vitest-environment happy-dom
//
// useSchemaForm + FormFieldset (lot P6) — le moteur commun admin/joueuse :
// erreurs serveur au format `flatten()` (listes), message non rattaché passé
// par `describeError`, `revert`, réponse serveur réaffichée par `reset`
// pendant l'envoi, garde de navigation armée seulement si demandée.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useRef } from 'react';
import * as z from 'zod';
import { useSchemaForm } from '../../hooks/forms/useSchemaForm';
import FormField, {
  FormError,
  FormFieldset,
} from '../../features/ruban/FormField';
import { ApiHttpError } from '../../utils/http/authedRequest';

afterEach(cleanup);

const Schema = z.object({ name: z.string(), tags: z.array(z.string()) }).pipe(
  z.object({
    name: z.string().trim().min(1, 'Nom requis.'),
    tags: z.array(z.string()).max(2, 'Deux au plus.'),
  })
);

function Harness({
  onSubmit,
  describeError,
  guard,
}: {
  onSubmit: (p: unknown, form: { reset: (v: never) => void }) => unknown;
  describeError?: (err: unknown, fallback: string) => string;
  guard?: string;
}) {
  const resetRef = useRef<(v: never) => void>(() => {});
  const form = useSchemaForm({
    schema: Schema,
    initialValues: { name: 'Ana', tags: [] as string[] },
    onSubmit: (p): unknown =>
      onSubmit(p, { reset: (v: never) => resetRef.current(v) }),
    describeError,
    unsavedChangesMessage: guard,
  });
  resetRef.current = form.reset as (v: never) => void;
  return (
    <form onSubmit={form.handleSubmit}>
      <FormError message={form.formError} />
      <FormField form={form} name="name" label="Nom" required>
        {(p) => <input {...p} />}
      </FormField>
      <FormFieldset form={form} name="tags" legend="Étiquettes" hint="aide">
        <button
          type="button"
          onClick={() => form.setValue('tags', [...form.values.tags, 'x'])}
        >
          Ajouter
        </button>
      </FormFieldset>
      <output data-testid="dirty">{String(form.isDirty)}</output>
      <button type="button" onClick={form.revert}>
        Annuler
      </button>
      <button type="submit">Enregistrer</button>
    </form>
  );
}

const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

describe('useSchemaForm', () => {
  it('erreur client sur un champ composé : message sous le groupe, focus sur le fieldset', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    for (let i = 0; i < 3; i++) await click('Ajouter');
    await click('Enregistrer');
    expect(onSubmit).not.toHaveBeenCalled();
    const group = screen.getByRole('group', { name: 'Étiquettes' });
    expect(document.activeElement).toBe(group);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Deux au plus.');
    expect(group.getAttribute('aria-describedby')).toContain(alert.id);
  });

  it('erreurs serveur au format flatten() (listes) : premier message, champ connu seulement', async () => {
    render(
      <Harness
        onSubmit={() => {
          throw new ApiHttpError('Validation échouée.', 400, {
            error: 'Validation échouée.',
            code: 'INVALID_BODY',
            fields: { name: ['Déjà pris.', 'autre'], inconnu: ['x'] },
          });
        }}
      />
    );
    await click('Enregistrer');
    const input = screen.getByLabelText(/Nom/);
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('alert').textContent).toBe('Déjà pris.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('erreur non rattachée : passe par describeError', async () => {
    render(
      <Harness
        onSubmit={() => {
          throw new ApiHttpError('Too many', 429, {
            error: 'Too many',
            code: 'rate_limited',
          });
        }}
        describeError={(err, fallback) =>
          err instanceof ApiHttpError && err.code === 'rate_limited'
            ? 'Trop de tentatives.'
            : fallback
        }
      />
    );
    await click('Enregistrer');
    expect(screen.getByRole('alert').textContent).toBe('Trop de tentatives.');
  });

  it('revert revient aux valeurs de départ ; reset pendant l’envoi garde la réponse serveur', async () => {
    render(
      <Harness
        onSubmit={(_p, form) =>
          // Le serveur « normalise » : sa réponse diffère de l'envoi.
          form.reset({ name: 'Ana', tags: ['serveur'] } as never)
        }
      />
    );
    await click('Ajouter');
    expect(screen.getByTestId('dirty').textContent).toBe('true');
    await click('Annuler');
    expect(screen.getByTestId('dirty').textContent).toBe('false');
    await click('Ajouter');
    await click('Enregistrer');
    // Référence = réponse serveur (['serveur']), valeurs = idem → pas modifié.
    expect(screen.getByTestId('dirty').textContent).toBe('false');
  });

  it('garde de navigation : armée seulement avec un message et si modifié', async () => {
    const { unmount } = render(<Harness onSubmit={vi.fn()} />);
    await click('Ajouter');
    const e1 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e1);
    expect(e1.defaultPrevented).toBe(false);
    unmount();

    render(<Harness onSubmit={vi.fn()} guard="Quitter ?" />);
    const e2 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(false);
    await click('Ajouter');
    const e3 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e3);
    expect(e3.defaultPrevented).toBe(true);
  });
});
