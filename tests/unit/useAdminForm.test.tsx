// @vitest-environment happy-dom
//
// useAdminForm + FormField (lot L11) — rendus pour de vrai : labels reliés,
// erreurs par champ côté client ET serveur, focus, état « modifié ».

import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useAdminForm } from '../../hooks/admin/useAdminForm';
import FormField, { FormError } from '../../components/admin/form/FormField';
import { AdminHttpError } from '../../utils/admin/adminHttp';
import {
  EMPTY_TWITCH_CHANNEL_FORM,
  TwitchChannelForm,
  type TwitchChannelFormValues,
} from '../../features/admin/diffusion/schemas';

function Harness({
  onSubmit,
  initial = EMPTY_TWITCH_CHANNEL_FORM,
}: {
  onSubmit: (p: unknown) => Promise<unknown> | unknown;
  initial?: TwitchChannelFormValues;
}) {
  const form = useAdminForm({
    schema: TwitchChannelForm,
    initialValues: initial,
    onSubmit,
  });
  return (
    <form onSubmit={form.handleSubmit}>
      <FormError message={form.formError} />
      <FormField form={form} name="channel" label="Chaîne" required hint="aide">
        {(p) => <input {...p} />}
      </FormField>
      <FormField form={form} name="label" label="Nom affiché" required>
        {(p) => <input {...p} />}
      </FormField>
      <FormField form={form} name="sortOrder" label="Ordre">
        {(p) => <input {...p} />}
      </FormField>
      <input
        type="checkbox"
        aria-label="Active"
        {...form.checkbox('isActive')}
      />
      <output data-testid="dirty">{String(form.isDirty)}</output>
      <button type="submit">Enregistrer</button>
    </form>
  );
}

const submit = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  });
};
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: false }), {
    target: { value },
  });

// Sans les globals de vitest, testing-library ne nettoie pas le DOM seul.
afterEach(cleanup);

describe('useAdminForm + FormField', () => {
  it('relie chaque label à son champ, et l’aide par aria-describedby', () => {
    render(<Harness onSubmit={vi.fn()} />);
    const channel = screen.getByLabelText('Chaîne', { exact: false });
    expect(channel.tagName).toBe('INPUT');
    expect(channel.getAttribute('aria-required')).toBe('true');
    expect(channel.hasAttribute('required')).toBe(false);
    const hintId = channel.getAttribute('aria-describedby');
    expect(document.getElementById(hintId!)?.textContent).toBe('aide');
  });

  it('refuse un envoi invalide : erreurs par champ, focus sur la première, onSubmit non appelé', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await submit();
    expect(onSubmit).not.toHaveBeenCalled();
    const channel = screen.getByLabelText('Chaîne', { exact: false });
    expect(channel.getAttribute('aria-invalid')).toBe('true');
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts).toContain('La chaîne est obligatoire.');
    expect(alerts).toContain('Le nom affiché est obligatoire.');
    expect(document.activeElement).toBe(channel);
  });

  it('corriger un champ efface son erreur, pas celle des autres', async () => {
    render(<Harness onSubmit={vi.fn()} />);
    await submit();
    type('Chaîne', 'crocheh');
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts).not.toContain('La chaîne est obligatoire.');
    expect(alerts).toContain('Le nom affiché est obligatoire.');
  });

  it('envoie le corps TRANSFORMÉ par le schéma (trim, minuscules, nombre, null)', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    type('Chaîne', '  CrocheH ');
    type('Nom affiché', ' Crocheh ');
    type('Ordre', '4');
    await submit();
    expect(onSubmit).toHaveBeenCalledWith({
      channel: 'crocheh',
      label: 'Crocheh',
      badge: null,
      description: null,
      backgroundUrl: null,
      isActive: true,
      sortOrder: 4,
    });
  });

  it('place une erreur SERVEUR sous le champ qu’elle nomme', async () => {
    const onSubmit = vi.fn(async () => {
      throw new AdminHttpError('Cette chaîne existe déjà.', 400, {
        error: 'Cette chaîne existe déjà.',
        code: 'validation',
        fields: { channel: 'Cette chaîne existe déjà.' },
      });
    });
    render(<Harness onSubmit={onSubmit} />);
    type('Chaîne', 'dup');
    type('Nom affiché', 'Dup');
    await submit();
    const channel = screen.getByLabelText('Chaîne', { exact: false });
    expect(channel.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe(
      'Cette chaîne existe déjà.'
    );
    expect(document.activeElement).toBe(channel);
  });

  it('affiche une erreur serveur sans champ en tête, avec la référence de requête', async () => {
    const onSubmit = vi.fn(async () => {
      throw new AdminHttpError('Erreur serveur', 500, {
        error: 'Erreur serveur',
        code: 'internal',
        requestId: '1234abcd-ffff',
      });
    });
    render(<Harness onSubmit={onSubmit} />);
    type('Chaîne', 'ok');
    type('Nom affiché', 'Ok');
    await submit();
    expect(screen.getByRole('alert').textContent).toBe(
      'Erreur serveur (réf. 1234abcd)'
    );
  });

  it('isDirty compare aux valeurs de départ, et repart de zéro après enregistrement', async () => {
    render(
      <Harness
        onSubmit={vi.fn()}
        initial={{ ...EMPTY_TWITCH_CHANNEL_FORM, channel: 'a', label: 'A' }}
      />
    );
    const dirty = () => screen.getByTestId('dirty').textContent;
    expect(dirty()).toBe('false');
    type('Chaîne', 'b');
    expect(dirty()).toBe('true');
    type('Chaîne', 'a');
    expect(dirty()).toBe('false');
    fireEvent.click(screen.getByLabelText('Active'));
    expect(dirty()).toBe('true');
    await submit();
    expect(dirty()).toBe('false');
  });
});
