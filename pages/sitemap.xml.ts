import type { GetServerSideProps } from 'next';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';

const publicRoutes = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/tournoi', priority: '0.9', changefreq: 'weekly' },
  { path: '/timeline-2026', priority: '0.8', changefreq: 'weekly' },
  { path: '/association', priority: '0.7', changefreq: 'monthly' },
  { path: '/partenaires', priority: '0.7', changefreq: 'monthly' },
  { path: '/contact', priority: '0.6', changefreq: 'monthly' },
  { path: '/mentions-legales', priority: '0.3', changefreq: 'yearly' },
  { path: '/don', priority: '0.6', changefreq: 'monthly' },
  { path: '/register', priority: '0.8', changefreq: 'weekly' },
  { path: '/rules', priority: '0.5', changefreq: 'monthly' },
  { path: '/plan-du-site', priority: '0.3', changefreq: 'monthly' },
];

type NewsItem = {
  slug: string;
  updated_at?: string | null;
  published_at?: string | null;
};

function getBaseUrl(req: Parameters<GetServerSideProps>[0]['req']) {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (env) return env;

  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  const protocol = (req.headers['x-forwarded-proto'] as string) || 'https';

  return host ? `${protocol}://${host}` : '';
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateSiteMap(baseUrl: string, newsItems: NewsItem[]) {
  const today = new Date().toISOString();

  // Static pages
  const staticUrls = publicRoutes
    .map(({ path, priority, changefreq }) => {
      const loc = escapeXml(`${baseUrl}${path}`);
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join('\n');

  // Dynamic news pages
  const newsUrls = newsItems
    .map((news) => {
      const loc = escapeXml(`${baseUrl}/news/${news.slug}`);
      const lastmod = news.updated_at || news.published_at || today;
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${new Date(lastmod).toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${newsUrls}
</urlset>`;
}

export const getServerSideProps: GetServerSideProps = async ({ res, req }) => {
  const baseUrl = getBaseUrl(req);

  // Fetch published news for dynamic URLs
  let newsItems: NewsItem[] = [];
  try {
    const client = supabaseAdmin ?? getServerClient(req, res);
    const { data } = await client
      .from('news')
      .select('slug, updated_at, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(100);

    newsItems = (data || []).filter((n) => n.slug);
  } catch (err) {
    console.error('[sitemap] Error fetching news:', err);
  }

  const sitemap = generateSiteMap(baseUrl, newsItems);

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=3600, stale-while-revalidate=600'
  );
  res.write(sitemap);
  res.end();

  return {
    props: {},
  };
};

export default function SiteMap() {
  return null;
}
