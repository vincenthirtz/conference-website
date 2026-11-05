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
import { useTenantBranding } from '@/lib/branding/TenantBrandingProvider';

export type RelatedItem = {
  id: string;
  slug: string;
  title: string;
  tag: string | null;
  imageUrl: string | null;
  /** `imageUrl` est un logo (équipe ou tournoi) → cadrage `contain`. */
  imageFitContain?: boolean;
  publishedAt: string | null;
};

/** Logo du site, vignette d'un article sans visuel (comme les cartes de l'accueil). */
const DEFAULT_NEWS_LOGO = '/img/logos/2026-logo.png';

export default function RelatedNews({
  items,
  title,
  locale,
}: {
  items: RelatedItem[];
  title: string;
  locale: string;
}): JSX.Element | null {
  const branding = useTenantBranding();
  if (items.length === 0) return null;
  const fallbackLogo = branding?.logoUrl ?? DEFAULT_NEWS_LOGO;

  return (
    <section className="mt-12 border-t border-white/10 pt-8">
      <h2 className="text-xs uppercase tracking-[0.16em] text-gray-500">
        {title}
      </h2>

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              prefetch={false}
              href={`/news/${item.slug}`}
              className="card-brand group flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition-colors hover:border-[var(--color-violet)]/40"
            >
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-white/5">
                {item.imageUrl ? (
                  // Un logo d'équipe n'est pas une bannière : le recadrer en
                  // `cover` le décapite. On le pose entier sur le dégradé.
                  <Image
                    src={item.imageUrl}
                    alt=""
                    fill
                    sizes="(max-width:640px) 100vw, 240px"
                    className={`transition-transform duration-300 group-hover:scale-[1.03] ${
                      item.imageFitContain
                        ? 'bg-gradient-to-br from-[var(--color-violet)]/30 to-[var(--color-green)]/20 object-contain p-4'
                        : 'object-cover'
                    }`}
                  />
                ) : (
                  // Sans visuel (les actus relayées depuis Discord n'en ont
                  // pas) : le logo du site, entier, plutôt qu'un fond vide.
                  // Celui de l'espace en marque blanche s'il en a un.
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-violet)]/30 to-[var(--color-green)]/20">
                    <Image
                      src={fallbackLogo}
                      alt=""
                      fill
                      sizes="(max-width:640px) 100vw, 240px"
                      className="object-contain p-6 opacity-90 transition-transform duration-300 group-hover:scale-[1.03]"
                      unoptimized={fallbackLogo !== DEFAULT_NEWS_LOGO}
                    />
                  </div>
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
