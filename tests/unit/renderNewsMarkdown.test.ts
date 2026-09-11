// Le corps d'une actualité est rendu en HTML au build (getStaticProps), plus
// dans le navigateur. Ce qui se teste ici, c'est que ce déplacement ne change
// NI le rendu (composants maison, classes, liens externes) NI la sécurité :
// sans rehype-raw, le HTML brut du contenu reste inerte — la page passe le
// résultat à `dangerouslySetInnerHTML`, c'est donc ici que ça se garantit.

import { describe, it, expect } from 'vitest';

import { renderNewsMarkdown } from '@/utils/news/renderNewsMarkdown';

describe('renderNewsMarkdown — rendu', () => {
  it('rend le Markdown avec les classes de la page', () => {
    expect(renderNewsMarkdown('Du **gras** ici')).toBe(
      '<p class="my-5">Du <strong>gras</strong> ici</p>'
    );
  });

  it('décale les titres (le h1 de la page reste le titre de l’article)', () => {
    expect(renderNewsMarkdown('# Titre')).toBe(
      '<h2 class="mt-8 text-2xl font-bold text-white">Titre</h2>'
    );
    expect(renderNewsMarkdown('## Sous-titre')).toContain(
      '<h3 class="mt-8 text-xl font-bold text-white">'
    );
  });

  it('ouvre les liens dans un nouvel onglet, sans opener', () => {
    const html = renderNewsMarkdown('[le site](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('break-all');
  });

  it('auto-lie les URLs nues (remark-gfm)', () => {
    expect(renderNewsMarkdown('Voir https://owwomenscup.fr')).toContain(
      'href="https://owwomenscup.fr"'
    );
  });

  it('enveloppe les tableaux dans une boîte qui défile', () => {
    const html = renderNewsMarkdown('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(html).toMatch(/^<div class="overflow-x-auto"><table /);
    expect(html).toContain(
      '<td class="border-b border-white/10 px-3 py-2">1</td>'
    );
  });

  it('renvoie une chaîne vide sans contenu', () => {
    expect(renderNewsMarkdown('')).toBe('');
    expect(renderNewsMarkdown(null)).toBe('');
  });
});

describe('renderNewsMarkdown — sécurité (pas de rehype-raw)', () => {
  it('ne laisse passer aucune balise HTML brute', () => {
    const html = renderNewsMarkdown(
      'Avant\n\n<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">'
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain('Avant');
  });

  it('neutralise les liens javascript:', () => {
    const html = renderNewsMarkdown('[clic](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });
});
