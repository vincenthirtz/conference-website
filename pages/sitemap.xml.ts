import type { GetServerSideProps } from 'next';

const publicRoutes = [
  '/',
  '/tournoi',
  '/timeline-2026',
  '/rediffusions',
  '/association',
  '/don',
  '/register',
  '/rules',
];

function getBaseUrl(req: Parameters<GetServerSideProps>[0]['req']) {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (env) return env;

  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  const protocol = (req.headers['x-forwarded-proto'] as string) || 'https';

  return host ? `${protocol}://${host}` : '';
}

function generateSiteMap(baseUrl: string) {
  const today = new Date().toISOString();

  const urls = publicRoutes
    .map((path) => {
      const loc = `${baseUrl}${path}`;
      const priority = path === '/' ? '1.0' : '0.8';
      return `<url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${priority}</priority></url>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

export const getServerSideProps: GetServerSideProps = async ({ res, req }) => {
  const baseUrl = getBaseUrl(req);
  const sitemap = generateSiteMap(baseUrl);

  res.setHeader('Content-Type', 'application/xml');
  res.write(sitemap);
  res.end();

  return {
    props: {},
  };
};

export default function SiteMap() {
  return null;
}
