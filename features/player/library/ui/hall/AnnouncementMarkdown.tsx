// features/player/library/ui/hall/AnnouncementMarkdown.tsx — le corps d'une
// annonce du panneau du hall (lot 7 de docs/PLAN-womens-library.md), du
// Markdown vers React, CÔTÉ NAVIGATEUR.
//
// LE MÊME RENDU QUE LES ACTUALITÉS (`utils/news/renderNewsMarkdown.tsx`) :
// `react-markdown` + `remark-gfm`, PAS de `rehype-raw` — le HTML brut d'une
// annonce reste du texte inerte. Ces annonces arrivent de Discord
// (`news-forwarder.js`), c'est-à-dire de quiconque écrit dans le salon : ce
// n'est pas une source à qui l'on donne le droit d'injecter des balises.
// React échappe le texte et neutralise les URLs dangereuses (`javascript:`).
// Les liens s'ouvrent dans un nouvel onglet : la Library reste ouverte.
//
// Chargé à la demande (`next/dynamic`, `AnnouncementArticle`) : ces deux
// paquets ne partent chez la joueuse qu'à l'ouverture d'une annonce. On ne
// réutilise pas `renderNewsMarkdown` : il tire `react-dom/server`.

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const COMPONENTS: Components = {
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-[var(--or-300,#dea3f6)] underline underline-offset-4 hover:text-[var(--or-200,#eec4ff)]"
    >
      {children}
    </a>
  ),
  // Le titre de l'annonce est un h2 du panneau : ses titres descendent d'un cran.
  h1: ({ children }) => <h3 className="mt-6 text-lg font-bold">{children}</h3>,
  h2: ({ children }) => (
    <h4 className="mt-6 text-base font-bold">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="mt-4 text-base font-semibold">{children}</h5>
  ),
  p: ({ children }) => <p className="my-3">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-6">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-6">{children}</ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-[var(--or,#b467d1)] pl-4 italic text-[var(--t2,#c7bfca)]">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-sm">
      {children}
    </code>
  ),
  hr: () => <hr className="my-4 border-white/15" />,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
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
  // Une image d'annonce reste un lien : pas de requête vers un hôte tiers
  // à l'ouverture du panneau.
  img: ({ alt, src }) =>
    typeof src === 'string' ? (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--or-300,#dea3f6)] underline underline-offset-4"
      >
        {alt || src}
      </a>
    ) : null,
};

export default function AnnouncementMarkdown({ content }: { content: string }) {
  return (
    <div
      className="text-sm leading-relaxed text-[var(--t1,#f4edf7)]"
      data-announcement-body=""
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
