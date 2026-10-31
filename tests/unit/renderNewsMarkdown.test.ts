// Le corps d'une actualité est rendu en HTML dans getStaticProps, plus dans le
// navigateur. Ce qui se teste ici, c'est que ce déplacement ne change NI le rendu
// (composants maison, classes, liens externes) NI la sécurité : sans rehype-raw, le
// HTML brut du contenu reste inerte — la page passe le résultat à
// `dangerouslySetInnerHTML`, c'est donc ici que ça se garantit.
//
// Et qu'aucun code du site n'appelle ce qu'OpenNext retire de React sur le Worker :
// `renderToStaticMarkup` existait en test et au build, et chaque article répondait 500
// en production.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { renderNewsMarkdown } from '@/utils/news/renderNewsMarkdown';

describe('renderNewsMarkdown — rendu', () => {
  it('rend le Markdown avec les classes de la page', async () => {
    expect(await renderNewsMarkdown('Du **gras** ici')).toBe(
      '<p class="my-5">Du <strong>gras</strong> ici</p>'
    );
  });

  it('décale les titres (le h1 de la page reste le titre de l’article)', async () => {
    expect(await renderNewsMarkdown('# Titre')).toBe(
      '<h2 class="mt-8 text-2xl font-bold text-white">Titre</h2>'
    );
    expect(await renderNewsMarkdown('## Sous-titre')).toContain(
      '<h3 class="mt-8 text-xl font-bold text-white">'
    );
  });

  it('ouvre les liens dans un nouvel onglet, sans opener', async () => {
    const html = await renderNewsMarkdown('[le site](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('break-all');
  });

  it('auto-lie les URLs nues (remark-gfm)', async () => {
    expect(await renderNewsMarkdown('Voir https://owwomenscup.fr')).toContain(
      'href="https://owwomenscup.fr"'
    );
  });

  it('enveloppe les tableaux dans une boîte qui défile', async () => {
    const html = await renderNewsMarkdown('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(html).toMatch(/^<div class="overflow-x-auto"><table /);
    expect(html).toContain(
      '<td class="border-b border-white/10 px-3 py-2">1</td>'
    );
  });

  it('renvoie une chaîne vide sans contenu', async () => {
    expect(await renderNewsMarkdown('')).toBe('');
    expect(await renderNewsMarkdown(null)).toBe('');
  });

  it('ne laisse aucun séparateur de React entre deux textes', async () => {
    const html = await renderNewsMarkdown(
      'Un *mot* puis `du code` & **encore** un [lien](https://example.com) fin'
    );
    expect(html).not.toContain('<!--');
    expect(html).toContain('&amp;');
  });
});

describe('renderNewsMarkdown — sécurité (pas de rehype-raw)', () => {
  it('ne laisse passer aucune balise HTML brute', async () => {
    const html = await renderNewsMarkdown(
      'Avant\n\n<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">'
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain('Avant');
  });

  it('neutralise les liens javascript:', async () => {
    const html = await renderNewsMarkdown('[clic](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('un commentaire écrit dans l’article reste inerte', async () => {
    const html = await renderNewsMarkdown('Avant <!-- caché --> après');
    expect(html).not.toContain('<!--');
    expect(html).toContain('Avant');
  });
});

describe('ce qu’OpenNext retire de React sur le Worker', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sources(path);
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
  }

  it('aucun code servi n’appelle renderToStaticMarkup ni renderToString', () => {
    const offenders = [
      'pages',
      'components',
      'features',
      'hooks',
      'lib',
      'utils',
    ]
      .flatMap(sources)
      .filter((file) =>
        /import\s*\{[^}]*\b(renderToStaticMarkup|renderToString)\b[^}]*\}\s*from\s*['"]react-dom\/server/.test(
          readFileSync(file, 'utf8')
        )
      );
    expect(offenders).toEqual([]);
  });
});
