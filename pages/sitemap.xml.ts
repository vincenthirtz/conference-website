import type { GetServerSideProps } from 'next';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';

import { logger } from '../utils/logger';
const publicRoutes = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/tournoi', priority: '0.9', changefreq: 'weekly' },
  { path: '/tournaments', priority: '0.9', changefreq: 'weekly' },
  { path: '/jeux', priority: '0.8', changefreq: 'monthly' },
  { path: '/inscription-2026', priority: '0.9', changefreq: 'weekly' },
  { path: '/espace-capitaine', priority: '0.7', changefreq: 'monthly' },
  { path: '/guide/gerer-mon-equipe', priority: '0.8', changefreq: 'monthly' },
  { path: '/actualites', priority: '0.8', changefreq: 'daily' },
  { path: '/news', priority: '0.8', changefreq: 'daily' },
  { path: '/timeline-2026', priority: '0.8', changefreq: 'weekly' },
  { path: '/scrim', priority: '0.7', changefreq: 'weekly' },
  { path: '/lore', priority: '0.7', changefreq: 'monthly' },
  { path: '/association', priority: '0.7', changefreq: 'monthly' },
  { path: '/about', priority: '0.6', changefreq: 'monthly' },
  { path: '/partenaires', priority: '0.7', changefreq: 'monthly' },
  { path: '/partenaires/demande', priority: '0.5', changefreq: 'monthly' },
  { path: '/hero-picker', priority: '0.6', changefreq: 'monthly' },
  { path: '/live', priority: '0.7', changefreq: 'daily' },
  { path: '/contact', priority: '0.6', changefreq: 'monthly' },
  { path: '/support', priority: '0.5', changefreq: 'monthly' },
  { path: '/don', priority: '0.6', changefreq: 'monthly' },
  { path: '/app', priority: '0.7', changefreq: 'monthly' },
  { path: '/register', priority: '0.8', changefreq: 'weekly' },
  { path: '/rules', priority: '0.5', changefreq: 'monthly' },
  { path: '/builds', priority: '0.3', changefreq: 'weekly' },
  { path: '/mentions-legales', priority: '0.3', changefreq: 'yearly' },
  { path: '/plan-du-site', priority: '0.3', changefreq: 'monthly' },
];

type NewsItem = {
  slug: string;
  updated_at?: string | null;
  published_at?: string | null;
};

type TournamentItem = {
  id: string;
  slug?: string | null;
  updated_at?: string | null;
};

type TeamItem = {
  slug: string;
  updated_at?: string | null;
};

type MatchItem = {
  id: string;
  completed_at?: string | null;
  updated_at?: string | null;
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

function generateSiteMap(
  baseUrl: string,
  newsItems: NewsItem[],
  tournaments: TournamentItem[],
  teams: TeamItem[],
  matches: MatchItem[]
) {
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

  // Dynamic tournament pages (main + sub-pages)
  const tournamentSubPages = ['', '/bracket', '/matches', '/maps', '/stats'];
  const tournamentUrls = tournaments
    .flatMap((t) => {
      const identifier = t.slug || t.id;
      const lastmod = t.updated_at || today;
      return tournamentSubPages.map((sub, i) => {
        const loc = escapeXml(`${baseUrl}/tournament/${identifier}${sub}`);
        const priority = i === 0 ? '0.8' : '0.6';
        return `  <url>
    <loc>${loc}</loc>
    <lastmod>${new Date(lastmod).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
      });
    })
    .join('\n');

  // Dynamic team pages
  const teamUrls = teams
    .map((team) => {
      const loc = escapeXml(`${baseUrl}/team/${team.slug}`);
      const lastmod = team.updated_at || today;
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${new Date(lastmod).toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`;
    })
    .join('\n');

  // Dynamic match pages (completed matches only)
  const matchUrls = matches
    .map((match) => {
      const loc = escapeXml(`${baseUrl}/match/${match.id}`);
      const lastmod = match.updated_at || match.completed_at || today;
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${new Date(lastmod).toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${newsUrls}
${tournamentUrls}
${teamUrls}
${matchUrls}
</urlset>`;
}

export const getServerSideProps: GetServerSideProps = async ({ res, req }) => {
  const baseUrl = getBaseUrl(req);
  const tenantId = resolveTenantIdForPublicRequest(req);

  const client = supabaseAdmin ?? getServerClient(req, res);

  // Fetch published news for dynamic URLs
  let newsItems: NewsItem[] = [];
  try {
    const { data } = await client
      .from('news')
      .select('slug, updated_at, published_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(100);

    newsItems = (data || []).filter((n) => n.slug);
  } catch (err) {
    logger.error('[sitemap] Error fetching news:', err);
  }

  // Fetch public tournaments
  let tournaments: TournamentItem[] = [];
  try {
    const { data } = await client
      .from('tournaments')
      .select('id, slug, updated_at')
      .eq('tenant_id', tenantId)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(50);

    tournaments = (data || []) as TournamentItem[];
  } catch (err) {
    logger.error('[sitemap] Error fetching tournaments:', err);
  }

  // Fetch teams with a public slug
  let teams: TeamItem[] = [];
  try {
    const { data } = await client
      .from('teams')
      .select('slug, updated_at')
      .eq('tenant_id', tenantId)
      .not('slug', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(500);

    teams = (data || [])
      .filter((t) => Boolean(t.slug))
      .map((t) => ({ slug: t.slug as string, updated_at: t.updated_at }));
  } catch (err) {
    logger.error('[sitemap] Error fetching teams:', err);
  }

  // Fetch finished matches (the only ones with stable archive value)
  let matches: MatchItem[] = [];
  try {
    const { data } = await client
      .from('matches')
      .select('id, completed_at, updated_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'finished')
      .order('completed_at', { ascending: false })
      .limit(500);

    matches = (data || []) as MatchItem[];
  } catch (err) {
    logger.error('[sitemap] Error fetching matches:', err);
  }

  const sitemap = generateSiteMap(
    baseUrl,
    newsItems,
    tournaments,
    teams,
    matches
  );

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
