import Head from 'next/head';
import { useRouter } from 'next/router';

export type SeoProps = {
  title?: string;
  description?: string;
  image?: string;
};

const SITE_NAME = "OW Women's Cup";
const DEFAULT_TITLE = `${SITE_NAME} – Tournoi Overwatch 100% féminin`;
const DEFAULT_DESCRIPTION =
  "Tournoi Overwatch et communauté 100% féminine : staff inclusif, matchs commentés et actions pour rendre l'esport plus accessible.";
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || '';
const DEFAULT_IMAGE = '/img/logos/2025-logo.png';

function toAbsoluteUrl(path: string) {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  if (!BASE_URL) return path;
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export default function DefaultSeo({ title, description, image }: SeoProps) {
  const { asPath } = useRouter();
  const pathname = asPath?.split('?')[0] || '/';

  const metaTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
  const metaDescription = description || DEFAULT_DESCRIPTION;
  const canonical = BASE_URL ? `${BASE_URL}${pathname}` : undefined;
  const ogImage = toAbsoluteUrl(image || DEFAULT_IMAGE);

  return (
    <Head>
      <title>{metaTitle}</title>
      <meta name="description" content={metaDescription} />
      {canonical && <link rel="canonical" href={canonical} />}

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={metaTitle} />
      <meta property="og:description" content={metaDescription} />
      {canonical && <meta property="og:url" content={canonical} />}
      {ogImage && <meta property="og:image" content={ogImage} />}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={metaTitle} />
      <meta name="twitter:description" content={metaDescription} />
      {ogImage && <meta name="twitter:image" content={ogImage} />}

      <meta name="theme-color" content="#0E0A1F" />
      <link rel="icon" href="/favicon.ico" />
    </Head>
  );
}
