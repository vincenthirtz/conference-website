// utils/news/newsArticleSeo.ts
//
// SEO par-article de `pages/news/[slug].tsx`, renvoyé par getStaticProps dans
// `props.seo` et émis par DefaultSeo (cf. pages/_app.tsx).
//
// La page posait son propre <Head> (og:*, canonical, JSON-LD) EN PLUS de
// DefaultSeo : next/head ne dédoublonne pas les balises `property`, le HTML
// portait donc deux og:type, deux og:image, deux og:title et deux canonical.
// Même mécanisme que pages/match/[id].tsx et pages/player/[userId].tsx.
//
// Serveur seulement (appelé depuis getStaticProps) : le dictionnaire anglais
// importé ici ne part pas dans le bundle de la page.

import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { format } from '@/lib/i18n/useT';
import nsNewsDetail from '@/lib/i18n/locales/fr/newsDetail';
import enNewsDetail from '@/lib/i18n/locales/en/newsDetail';

const SITE_NAME = "OW Women's Cup";
const CANONICAL_URL = 'https://owwomenscup.fr';
const DEFAULT_IMAGE = '/img/og-cover.png';

export type NewsArticleSeoInput = {
  title: string;
  slug: string | null;
  excerpt: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || CANONICAL_URL;
}

function toAbsoluteUrl(base: string, path: string): string {
  if (path.startsWith('http')) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildNewsArticleSeo(article: NewsArticleSeoInput): SeoProps {
  const base = baseUrl();
  const fr = nsNewsDetail.fr;
  const en = enNewsDetail;

  // DefaultSeo ajoute lui-même « | OW Women's Cup » : le titre reste nu.
  const title = article.title || fr.newsLabel;
  const descriptionFr =
    article.excerpt ||
    format(fr.seoDescriptionFallback, { site: SITE_NAME, title });
  const description = article.excerpt
    ? article.excerpt
    : {
        fr: descriptionFr,
        en: format(en.seoDescriptionFallback, { site: SITE_NAME, title }),
      };

  const image = toAbsoluteUrl(base, article.imageUrl || DEFAULT_IMAGE);
  const publishedTime = article.publishedAt || article.createdAt || undefined;
  const modifiedTime = article.updatedAt || undefined;
  const canonical = article.slug ? `${base}/news/${article.slug}` : undefined;

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title,
    // Version française : c'est celle que voient les moteurs (cf. DefaultSeo).
    description: descriptionFr,
    image,
    ...(publishedTime ? { datePublished: publishedTime } : {}),
    ...(modifiedTime || publishedTime
      ? { dateModified: modifiedTime || publishedTime }
      : {}),
    author: { '@type': 'Organization', name: SITE_NAME, url: base },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: `${base}/img/logos/2026-logo.png` },
    },
    ...(canonical ? { mainEntityOfPage: canonical } : {}),
    inLanguage: 'fr-FR',
  };

  return {
    title,
    description,
    image,
    type: 'article',
    ...(publishedTime ? { publishedTime } : {}),
    ...(modifiedTime ? { modifiedTime } : {}),
    jsonLd,
  };
}
