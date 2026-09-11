// Accessibilité des composants partagés du site public : région des toasts,
// sous-menu de la nav, bouton « retour en haut », titres de pages.
//
// Pas de jsdom/testing-library dans ce repo (politique zéro dépendance) : on
// rend côté serveur via react-dom/server quand c'est possible, et on lit la
// source quand le composant dépend du routeur ou du défilement.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ToastProvider } from '@/components/Toast/ToastContext';
import ToastContainer from '@/components/Toast/ToastContainer';

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('ToastContainer — région vivante', () => {
  it('existe avant le premier toast', () => {
    // Un lecteur d'écran n'annonce que les changements d'une région déjà
    // présente : montée avec son premier toast, elle le taisait.
    const html = renderToString(
      createElement(ToastProvider, null, createElement(ToastContainer))
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it('réserve role="alert" à la variante erreur', () => {
    const src = source('components/Toast/ToastContainer.tsx');
    expect(src).toContain(
      "role={toast.variant === 'error' ? 'alert' : undefined}"
    );
    // Plus d'attribut role="alert" inconditionnel sur chaque toast.
    expect(src).not.toMatch(/^\s*role="alert"\s*$/m);
  });
});

describe('PublicNav — sous-menu fermé', () => {
  it('est retiré de l’ordre de tabulation (visibility:hidden)', () => {
    const src = source('components/Navbar/PublicNav.tsx');
    expect(src).toContain(
      "'invisible pointer-events-none -translate-y-1 opacity-0'"
    );
    expect(src).toContain(
      "'visible pointer-events-auto translate-y-0 opacity-100'"
    );
  });
});

describe('BackToTopButton', () => {
  it('n’a plus de libellé codé en dur', () => {
    const src = source('components/Buttons/BackToTopButton.tsx');
    expect(src).not.toContain('aria-label="Back to top"');
    expect(src).not.toMatch(/>\s*Aller en haut\s*</);
    expect(src).toContain('{t.backToTop}');
    // Logo décoratif : son alt ne s'ajoute plus au nom du bouton.
    expect(src).toContain('alt=""');
  });
});

describe('Titres de page', () => {
  it('hero-picker : titre principal en h1, cartes en boutons pressables', () => {
    const src = source('pages/hero-picker.tsx');
    expect(src).toMatch(/<Heading\s+level="h1"/);
    expect(src).toMatch(/<button\s+type="button"\s+key=\{hero\.name\}/);
    expect(src).toContain('aria-pressed=');
  });

  it('lore : titre principal en h1, cartes en h2', () => {
    const src = source('pages/lore.tsx');
    expect(src).toMatch(/<Heading\s+level="h1"/);
    expect(src).not.toMatch(/<h3[\s>]/);
  });
});
