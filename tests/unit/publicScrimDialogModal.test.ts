// Modale publique « proposer un scrim » : elle passe par la coque `ui/Modal`
// (piège de focus, Échap, clic fond, blocage du défilement) au lieu d'un div
// `role="dialog"` fait main, sans rien perdre de son étiquetage.
//
// Pas de jsdom/testing-library dans ce repo (politique zéro dépendance) : on
// rend côté serveur via react-dom/server. Le comportement clavier (piège,
// Échap) vit dans `ui/Modal` + `useFocusTrap`, partagés avec l'admin.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import PublicScrimDialog from '@/components/Team/PublicScrimDialog';

function render(open: boolean): string {
  return renderToString(
    createElement(PublicScrimDialog, {
      teamId: 'team-1',
      teamName: 'Chocomates',
      open,
      onClose: () => {},
    })
  );
}

describe('PublicScrimDialog — coque de modale', () => {
  it('ne rend rien fermée', () => {
    expect(render(false)).toBe('');
  });

  it('est un dialogue modal nommé par son titre', () => {
    const html = render(true);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="public-scrim-title"');
    expect(html).toMatch(
      /<h2[^>]*id="public-scrim-title"[^>]*>[^<]*Chocomates/
    );
  });

  it('garde sa propre fermeture, sans le bouton par défaut de la coque', () => {
    const html = render(true);
    // Un seul « × » : celui de l'en-tête de la modale publique.
    expect(html.match(/d="M6 18L18 6M6 6l12 12"/g) ?? []).toHaveLength(1);
  });

  it('garde l’apparence du panneau', () => {
    const html = render(true);
    expect(html).toContain('bg-neutral-950');
    expect(html).toContain('max-w-lg');
    expect(html).toContain('bg-black/70');
    expect(html).not.toContain('bg-neutral-800');
  });
});
