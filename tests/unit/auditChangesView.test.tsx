// @vitest-environment happy-dom
//
// AuditChangesView (lot L8) — « nom : A → B » au lieu du JSON brut.

import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import AuditChangesView from '../../components/admin/AuditChanges';

afterEach(cleanup);

describe('AuditChangesView', () => {
  it('rend les changements champ par champ, vide et booléens lisibles', () => {
    render(
      <AuditChangesView
        payload={{
          changes: {
            label: { from: 'Old', to: 'New' },
            badge: { from: null, to: 'Cast' },
            is_active: { from: true, to: false },
          },
        }}
      />
    );
    const section = screen.getByRole('region', { name: 'Modifications' });
    expect(section.textContent).toContain('labelOld → New');
    expect(section.textContent).toContain('badge(vide) → Cast');
    expect(section.textContent).toContain('is_activeoui → non');
    // Rien d'autre dans le payload : pas de « Détails bruts ».
    expect(screen.queryByText('Détails bruts')).toBeNull();
  });

  it('montre la photo d’une suppression, et replie le reste du payload', () => {
    render(
      <AuditChangesView
        payload={{ before: { channel: 'foo' }, source: 'web' }}
      />
    );
    expect(
      screen.getByRole('region', { name: 'Supprimé — il contenait' })
        .textContent
    ).toContain('channelfoo');
    const raw = screen.getByText('Détails bruts').closest('details');
    expect(raw?.open).toBe(false);
    expect(raw?.textContent).toContain('"source": "web"');
  });

  it('retombe sur le JSON brut, déplié, pour un payload historique', () => {
    render(<AuditChangesView payload={{ fields: ['label'] }} />);
    const raw = screen.getByText('Détails bruts').closest('details');
    expect(raw?.open).toBe(true);
    expect(raw?.textContent).toContain('"fields"');
  });
});
