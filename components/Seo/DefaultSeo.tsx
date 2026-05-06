import Head from 'next/head';
import { useRouter } from 'next/router';

export type SeoProps = {
  title?: string;
  description?: string;
  image?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
  noindex?: boolean;
};

const SITE_NAME = "OW Women's Cup";
const DEFAULT_TITLE = `${SITE_NAME} – Tournoi Overwatch féminin & esport 100% féminin`;
const DEFAULT_DESCRIPTION =
  "Tournoi Overwatch et communauté 100% féminine : staff inclusif, matchs commentés et actions pour rendre l'esport plus accessible.";
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || '';
const CANONICAL_URL = BASE_URL || 'https://owwomenscup.fr';
const DEFAULT_IMAGE = '/img/logos/2025-logo.png';

// JSON-LD Organization Schema
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: CANONICAL_URL,
  logo: `${CANONICAL_URL}/img/logos/2025-logo.png`,
  description: DEFAULT_DESCRIPTION,
  foundingDate: '2025',
  foundingLocation: {
    '@type': 'Place',
    address: { '@type': 'PostalAddress', addressCountry: 'FR' },
  },
  address: { '@type': 'PostalAddress', addressCountry: 'FR' },
  areaServed: { '@type': 'Country', name: 'France' },
  knowsAbout: [
    'Overwatch',
    'Esport féminin',
    'Tournoi esport',
    'Inclusion dans le jeu vidéo',
  ],
  sameAs: [
    'https://twitter.com/OWWomensCup',
    'https://discord.gg/gERSsjC3Vd',
    'https://www.twitch.tv/owwomenscup',
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'owwomenscup@gmail.com',
    contactType: 'customer service',
    availableLanguage: 'French',
  },
};

// JSON-LD WebSite Schema with SearchAction
const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: CANONICAL_URL,
  description: DEFAULT_DESCRIPTION,
  inLanguage: 'fr-FR',
  publisher: {
    '@type': 'Organization',
    name: SITE_NAME,
  },
};

function toAbsoluteUrl(path: string) {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  if (!BASE_URL) return path;
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export default function DefaultSeo({
  title,
  description,
  image,
  type = 'website',
  publishedTime,
  modifiedTime,
  noindex,
}: SeoProps) {
  const { asPath } = useRouter();
  const pathname = asPath?.split('?')[0] || '/';
  const isHomePage = pathname === '/';

  const metaTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
  const metaDescription = description || DEFAULT_DESCRIPTION;
  const canonical = BASE_URL ? `${BASE_URL}${pathname}` : undefined;
  const hasExplicitImage = Boolean(image);
  const ogImage = toAbsoluteUrl(image || DEFAULT_IMAGE);

  // BreadcrumbList JSON-LD (all pages except homepage)
  const breadcrumbSchema =
    !isHomePage && BASE_URL
      ? {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Accueil',
              item: BASE_URL,
            },
            ...pathname
              .split('/')
              .filter(Boolean)
              .map((segment, i, arr) => ({
                '@type': 'ListItem' as const,
                position: i + 2,
                name:
                  i === arr.length - 1 && title
                    ? title
                    : decodeURIComponent(segment)
                        .replace(/-/g, ' ')
                        .replace(/^\w/, (c) => c.toUpperCase()),
                item: `${BASE_URL}/${arr.slice(0, i + 1).join('/')}`,
              })),
          ],
        }
      : null;

  return (
    <Head>
      <title>{metaTitle}</title>
      <meta name="description" content={metaDescription} />
      {canonical && <link rel="canonical" href={canonical} />}
      {canonical && (
        <link rel="alternate" hrefLang="fr-FR" href={canonical} />
      )}
      {canonical && (
        <link rel="alternate" hrefLang="x-default" href={canonical} />
      )}

      {/* Robots directive */}
      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:locale" content="fr_FR" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={metaTitle} />
      <meta property="og:description" content={metaDescription} />
      {canonical && <meta property="og:url" content={canonical} />}
      {ogImage && <meta property="og:image" content={ogImage} />}
      {ogImage && <meta property="og:image:alt" content={title || SITE_NAME} />}
      {hasExplicitImage && (
        <>
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
        </>
      )}

      {/* Article specific Open Graph */}
      {type === 'article' && publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}
      {type === 'article' && modifiedTime && (
        <meta property="article:modified_time" content={modifiedTime} />
      )}
      {type === 'article' && (
        <meta property="article:author" content={SITE_NAME} />
      )}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@OWWomensCup" />
      <meta name="twitter:creator" content="@OWWomensCup" />
      <meta name="twitter:title" content={metaTitle} />
      <meta name="twitter:description" content={metaDescription} />
      {ogImage && <meta name="twitter:image" content={ogImage} />}
      {ogImage && (
        <meta name="twitter:image:alt" content={title || SITE_NAME} />
      )}

      {/* Theme and favicon */}
      <meta name="theme-color" content="#0E0A1F" />
      <meta name="msapplication-TileColor" content="#0E0A1F" />
      <link rel="icon" href="/favicon.ico" />
      <link rel="manifest" href="/site.webmanifest" />

      {/* JSON-LD Structured Data - only on homepage to avoid duplication */}
      {isHomePage && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema),
          }}
        />
      )}
      {isHomePage && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteSchema),
          }}
        />
      )}
      {breadcrumbSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(breadcrumbSchema),
          }}
        />
      )}
    </Head>
  );
}
