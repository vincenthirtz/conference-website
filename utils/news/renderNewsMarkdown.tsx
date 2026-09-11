// utils/news/renderNewsMarkdown.tsx
//
// Rendu du corps d'une actualité, du Markdown vers du HTML — CÔTÉ SERVEUR.
//
// Appelé uniquement depuis `getStaticProps` de `pages/news/[slug].tsx`. Next
// retire `getStaticProps` du bundle navigateur, et avec lui les imports qu'il
// est seul à utiliser : `react-markdown` + `remark-gfm` (~41 Ko gzip) ne
// partent donc plus chez le lecteur pour un texte déjà connu à l'ISR. NE PAS
// importer ce module depuis du code rendu côté client, sinon ils reviennent.

import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * L'admin annonçait « Le contenu supporte le format Markdown » depuis toujours,
 * mais la page l'affichait en texte brut : une actualité écrite avec du
 * `**gras**` sortait avec ses étoiles. On rend donc vraiment le Markdown.
 *
 * PAS de `rehype-raw` : le HTML brut dans le contenu reste inerte. Ces
 * actualités arrivent aussi par l'ingestion Discord (`news-forwarder.js`),
 * c'est-à-dire de quiconque écrit dans le salon d'annonces — ce n'est pas une
 * source à qui l'on donne le droit d'injecter des balises. Rendre au build ne
 * change rien à cela : c'est le même rendu React, qui échappe le texte et
 * neutralise les URLs dangereuses (`javascript:`…), simplement exécuté plus
 * tôt. Le HTML obtenu est donc sûr à passer à `dangerouslySetInnerHTML`.
 *
 * Les URLs nues restent cliquables : `remark-gfm` les auto-lie, ce que faisait
 * déjà l'ancien rendu.
 */
const MARKDOWN_COMPONENTS: Components = {
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--color-violet-light)] underline hover:text-[var(--color-violet)] break-all"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <h2 className="mt-8 text-2xl font-bold text-white">{children}</h2>
  ),
  h2: ({ children }) => (
    <h3 className="mt-8 text-xl font-bold text-white">{children}</h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-6 text-lg font-semibold text-white">{children}</h4>
  ),
  p: ({ children }) => <p className="my-5">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-6">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-6">{children}</ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-[var(--color-violet)] pl-4 italic text-gray-300">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-base">
      {children}
    </code>
  ),
  hr: () => <hr className="border-white/15" />,
  // Les tableaux débordent sur mobile : ils défilent dans leur propre boîte,
  // sinon c'est la page entière qui part en travers.
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-base">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-white/20 px-3 py-2 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-white/10 px-3 py-2">{children}</td>
  ),
};

/**
 * Markdown d'une actualité → HTML statique. Chaîne vide si pas de contenu
 * (la page affiche alors son message « pas de contenu »).
 */
export function renderNewsMarkdown(content: string | null | undefined): string {
  if (!content) return '';
  return renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
      {content}
    </ReactMarkdown>
  );
}
