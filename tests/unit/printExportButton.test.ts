// Le bouton « Exporter en PDF ».
//
// L'export EST un window.print() : ce qui mérite d'être tenu, c'est que le
// bouton s'efface de la feuille qu'il produit (sans quoi il figure sur le PDF,
// grisé, en travers du tableau) et qu'il annonce ce qui va s'ouvrir — la boîte
// d'impression du navigateur, pas un téléchargement direct.
//
// Rendu SSR via react-dom/server (pas de jsdom dans ce repo).

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import PrintExportButton from '@/components/PrintExportButton';

function render(props: Record<string, unknown> = {}): string {
  return renderToString(createElement(PrintExportButton, props));
}

describe('PrintExportButton', () => {
  it('s’efface de la feuille qu’il produit', () => {
    expect(render()).toContain('print:hidden');
  });

  it('annonce que la boîte d’impression va s’ouvrir', () => {
    const html = render();
    expect(html).toContain('Exporter en PDF');
    // Sans cette précision, on clique, on voit une fenêtre d'imprimante et on
    // referme sans comprendre que « Enregistrer au format PDF » est dedans.
    expect(html).toMatch(/PDF/);
    expect(html).toContain('title=');
  });

  it('est un bouton, pas un lien : rien à ouvrir dans un onglet', () => {
    const html = render();
    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
    expect(html).not.toContain('<a ');
  });

  it('suit la charte de l’écran qui l’accueille', () => {
    // Deux habillages, un seul comportement : l'admin est neutre, le public
    // porte les couleurs de marque.
    expect(render({ variant: 'admin' })).toContain('bg-neutral-800');
    expect(render({ variant: 'public' })).toContain('--color-green');
  });

  it('accepte un habillage complémentaire sans perdre le sien', () => {
    const html = render({ className: 'ml-auto' });
    expect(html).toContain('ml-auto');
    expect(html).toContain('print:hidden');
  });
});
