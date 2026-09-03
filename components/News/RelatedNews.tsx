// components/News/RelatedNews.tsx
//
// « À lire aussi » : trois autres articles, sous celui qu'on vient de finir.
//
// POURQUOI. La page d'article était un cul-de-sac : une fois le texte lu,
// la seule suite proposée était le formulaire de commentaire. Quelqu'un qui
// arrive d'un partage sur les réseaux — le cas le plus fréquent pour une
// annonce — repartait sans jamais voir qu'il y a d'autres actualités.
//
// Les articles sont choisis côté serveur (cf. getStaticProps de
// `pages/news/[slug]`), les plus récents d'abord, en excluant celui qu'on lit.

import Link from 'next/link';
import Image from 'next/image';
import type { JSX } from 'react';

export type RelatedItem = {
  id: string;
  slug: string;
  title: string;
  tag: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
};

export default function RelatedNews({
  items,
  title,
  locale,
  basePath = '',
}: {
  items: RelatedItem[];
  title: string;
  locale: string;
  /**
   * Préfixe d'espace (`/mon-espace`). Sans lui, « À lire aussi » ferait sortir
   * le visiteur de son espace vers l'article homonyme de la plateforme.
   */
  basePath?: string;
}): JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <section className="mt-12 border-t border-white/10 pt-8">
      <h2 className="text-xs uppercase tracking-[0.16em] text-gray-500">
        {title}
      </h2>

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`${basePath}/news/${item.slug}`}
              className="card-brand group flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition-colors hover:border-[var(--color-violet)]/40"
            >
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-white/5">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt=""
                    fill
                    sizes="(max-width:640px) 100vw, 240px"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="tl-mesh absolute inset-0 opacity-40" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-3">
                {item.publishedAt ? (
                  <time
                    dateTime={item.publishedAt}
                    className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-green)]/80"
                  >
                    {new Date(item.publishedAt).toLocaleDateString(locale)}
                  </time>
                ) : null}
                <span className="line-clamp-3 text-sm font-semibold leading-snug text-gray-100 group-hover:text-white">
                  {item.title}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
