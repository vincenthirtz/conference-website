import Head from 'next/head';
import { useRouter } from 'next/router';
import { useLang, type Lang } from '@/lib/i18n/LanguageProvider';
import { useTenantBranding } from '@/lib/branding/TenantBrandingProvider';

/**
 * Chaîne éventuellement localisée. Une page peut fournir soit un simple
 * `string` (FR historique), soit `{ fr, en }` pour un titre/description
 * sensible à la langue active. `resolveLocalized()` sélectionne la bonne
 * variante ; un `string` nu reste rendu tel quel (rétro-compatible).
 */
export type Localized<T = string> = T | { fr: T; en: T };

export function resolveLocalized<T>(
  value: Localized<T> | undefined,
  lang: Lang
): T | undefined {
  if (value == null) return undefined;
  if (typeof value === 'object' && value !== null && 'fr' in value) {
    return (value as { fr: T; en: T })[lang];
  }
  return value as T;
}

export type SeoProps = {
  title?: Localized;
  description?: Localized;
  image?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
  noindex?: boolean;
  /**
   * JSON-LD structuré par-page (par-entité). Rendu tel quel dans un
   * `<script type="application/ld+json">` par entrée. Vient en complément du
   * BreadcrumbList (déjà émis sur toutes les pages non-home) et des schémas
   * Organization/WebSite (homepage-only). Ex : ProfilePage/Person pour un
   * profil joueuse, SportsEvent/ItemList pour une league.
   */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

const SITE_NAME = "OW Women's Cup";
const DEFAULT_TITLE = `${SITE_NAME} – Tournoi Overwatch féminin & esport 100% féminin`;
const DEFAULT_DESCRIPTION =
  "Tournoi Overwatch et communauté 100% féminine : staff inclusif, matchs commentés et actions pour rendre l'esport plus accessible.";
// URL canonique de repli quand `NEXT_PUBLIC_SITE_URL` n'est pas défini (build
// local, preview…). Sans ce fallback, BASE_URL restait vide et TOUS les
// canonical / og:url / hreflang / BreadcrumbList étaient silencieusement omis.
const CANONICAL_URL = 'https://owwomenscup.fr';
const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || CANONICAL_URL;
// `summary_large_image` (Twitter) / og:image expect a landscape ~1.91:1 image.
// The square logo (2026-logo, 500×500) renders badly when used as the large
// card preview. `fourplayers.jpg` (1280×853) is the widest landscape asset
// shipped under public/img/ and is a much better default share preview. The
// square logo is still used for the JSON-LD Organization `logo` field below.
const DEFAULT_IMAGE = '/img/fourplayers.jpg';
const DEFAULT_IMAGE_WIDTH = '1280';
const DEFAULT_IMAGE_HEIGHT = '853';

// JSON-LD Organization Schema
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: CANONICAL_URL,
  logo: `${CANONICAL_URL}/img/logos/2026-logo.png`,
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

// JSON-LD WebSite Schema (pas de SearchAction : aucune page de recherche
// interne indexable côté site public).
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
  title: rawTitle,
  description: rawDescription,
  image,
  type = 'website',
  publishedTime,
  modifiedTime,
  noindex,
  jsonLd,
}: SeoProps) {
  const { asPath } = useRouter();
  const { lang } = useLang();
  // WHITELABEL — le nom du site devient piloté par le branding du tenant quand
  // il est présent. En son absence (tenant par défaut) on retombe sur la
  // constante `SITE_NAME` : `siteName === SITE_NAME` sert de flag « défaut » et
  // garantit un rendu byte-identique (mêmes objets JSON-LD, mêmes chaînes).
  const branding = useTenantBranding();
  const siteName = branding?.name ?? SITE_NAME;
  const isDefaultBrand = siteName === SITE_NAME;
  const pathname = asPath?.split('?')[0] || '/';
  const isHomePage = pathname === '/';

  // Résolution locale-aware : `{ fr, en }` → variante active ; `string` → tel
  // quel. En SSR et au premier rendu client, `lang === 'fr'` (cf.
  // LanguageProvider) : les crawlers voient donc la version française, qui
  // reste la version canonique indexée. Le passage EN est purement client
  // (mise à jour du titre d'onglet / preview de partage après toggle).
  const title = resolveLocalized(rawTitle, lang);
  const description = resolveLocalized(rawDescription, lang);
  const ogLocale = lang === 'fr' ? 'fr_FR' : 'en_GB';
  const ogLocaleAlternate = lang === 'fr' ? 'en_GB' : 'fr_FR';

  const metaTitle = title
    ? `${title} | ${siteName}`
    : isDefaultBrand
      ? DEFAULT_TITLE
      : `${siteName} – Tournoi Overwatch féminin & esport 100% féminin`;
  const metaDescription = description || DEFAULT_DESCRIPTION;

  // Schémas JSON-LD homepage : objets par défaut inchangés, ou copies avec le
  // nom du tenant substitué (le logo/URL restent ceux de la plateforme).
  const orgSchema = isDefaultBrand
    ? organizationSchema
    : { ...organizationSchema, name: siteName };
  const siteSchema = isDefaultBrand
    ? websiteSchema
    : {
        ...websiteSchema,
        name: siteName,
        publisher: { ...websiteSchema.publisher, name: siteName },
      };
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

  // Per-page JSON-LD (par-entité) — normalisé en tableau pour émettre un
  // <script> par entrée avec une garde de non-nullité.
  const jsonLdEntries: Record<string, unknown>[] = jsonLd
    ? Array.isArray(jsonLd)
      ? jsonLd.filter((e): e is Record<string, unknown> => Boolean(e))
      : [jsonLd]
    : [];

  return (
    <Head>
      <title>{metaTitle}</title>
      <meta name="description" content={metaDescription} />
      {canonical && <link rel="canonical" href={canonical} />}
      {canonical && <link rel="alternate" hrefLang="fr-FR" href={canonical} />}
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
      <meta property="og:locale" content={ogLocale} />
      <meta property="og:locale:alternate" content={ogLocaleAlternate} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:title" content={metaTitle} />
      <meta property="og:description" content={metaDescription} />
      {canonical && <meta property="og:url" content={canonical} />}
      {ogImage && <meta property="og:image" content={ogImage} />}
      {ogImage && <meta property="og:image:alt" content={title || siteName} />}
      {hasExplicitImage ? (
        <>
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
        </>
      ) : (
        <>
          <meta property="og:image:width" content={DEFAULT_IMAGE_WIDTH} />
          <meta property="og:image:height" content={DEFAULT_IMAGE_HEIGHT} />
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
        <meta property="article:author" content={siteName} />
      )}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@OWWomensCup" />
      <meta name="twitter:creator" content="@OWWomensCup" />
      <meta name="twitter:title" content={metaTitle} />
      <meta name="twitter:description" content={metaDescription} />
      {ogImage && <meta name="twitter:image" content={ogImage} />}
      {ogImage && <meta name="twitter:image:alt" content={title || siteName} />}

      {/* Theme and favicon */}
      <meta name="theme-color" content="#0E0A1F" />
      <meta name="msapplication-TileColor" content="#0E0A1F" />
      <link rel="icon" href="/favicon.ico" />
      {/* Manifest link managed in _app.tsx with key-based dedup. */}

      {/* JSON-LD Structured Data - only on homepage to avoid duplication */}
      {isHomePage && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(orgSchema),
          }}
        />
      )}
      {isHomePage && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(siteSchema),
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

      {/* Per-page JSON-LD (par-entité) — un script par entrée. */}
      {jsonLdEntries.map((entry, i) => (
        <script
          key={`jsonld-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
        />
      ))}
    </Head>
  );
}
