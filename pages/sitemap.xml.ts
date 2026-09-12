import type { GetServerSideProps } from 'next';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';

import { logger } from '../utils/logger';
const publicRoutes = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  // Édition PASSÉE et figée (données dans config/results.json) : elle ne change
  // plus, et la mettre au même rang que les pages vivantes envoyait les robots
  // — et les visiteuses — vers une compétition terminée.
  { path: '/tournoi', priority: '0.3', changefreq: 'yearly' },
  { path: '/tournaments', priority: '0.9', changefreq: 'weekly' },
  { path: '/jeux', priority: '0.8', changefreq: 'monthly' },
  { path: '/inscription-2026', priority: '0.9', changefreq: 'weekly' },
  // Page d'entrée du parcours « je joue seule » — cible SEO « trouver une
  // équipe Overwatch féminine ». Priorité haute : c'est une porte d'entrée.
  { path: '/rejoindre', priority: '0.9', changefreq: 'daily' },
  // Le miroir de la précédente — « recruter une joueuse Overwatch ». Même
  // priorité : les deux faces de l'appariement valent autant l'une que l'autre.
  { path: '/recrutement', priority: '0.9', changefreq: 'daily' },
  { path: '/espace-capitaine', priority: '0.7', changefreq: 'monthly' },
  { path: '/guide/gerer-mon-equipe', priority: '0.8', changefreq: 'monthly' },
  { path: '/actualites', priority: '0.8', changefreq: 'daily' },
  { path: '/news', priority: '0.8', changefreq: 'daily' },
  { path: '/timeline-2026', priority: '0.8', changefreq: 'weekly' },
  { path: '/scrim', priority: '0.7', changefreq: 'weekly' },
  { path: '/scrims', priority: '0.7', changefreq: 'weekly' },
  { path: '/lore', priority: '0.7', changefreq: 'monthly' },
  { path: '/association', priority: '0.7', changefreq: 'monthly' },
  { path: '/about', priority: '0.6', changefreq: 'monthly' },
  { path: '/partenaires', priority: '0.7', changefreq: 'monthly' },
  { path: '/partenaires/demande', priority: '0.5', changefreq: 'monthly' },
  { path: '/hero-picker', priority: '0.6', changefreq: 'monthly' },
  { path: '/ambassadors', priority: '0.7', changefreq: 'daily' },
  { path: '/contact', priority: '0.6', changefreq: 'monthly' },
  { path: '/support', priority: '0.5', changefreq: 'monthly' },
  { path: '/don', priority: '0.6', changefreq: 'monthly' },
  { path: '/app', priority: '0.7', changefreq: 'monthly' },
  { path: '/register', priority: '0.8', changefreq: 'weekly' },
  { path: '/rules', priority: '0.5', changefreq: 'monthly' },
  // `/developpeurs` redirige (308) vers `/organisateurs` : une URL redirigée
  // n'a rien à faire dans un sitemap.
  { path: '/organisateurs', priority: '0.6', changefreq: 'monthly' },
  { path: '/leaderboard', priority: '0.7', changefreq: 'daily' },
  { path: '/palmares', priority: '0.7', changefreq: 'weekly' },
  { path: '/leagues', priority: '0.7', changefreq: 'weekly' },
  { path: '/mentions-legales', priority: '0.3', changefreq: 'yearly' },
  { path: '/cgv', priority: '0.3', changefreq: 'yearly' },
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

type ScrimItem = {
  id: string;
  slug?: string | null;
  updated_at?: string | null;
  scheduled_date?: string | null;
};

type LeagueItem = {
  slug: string;
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
  matches: MatchItem[],
  scrims: ScrimItem[],
  leagues: LeagueItem[]
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

  // Pages de scrim publiques — même identifiant que les liens du site.
  const scrimUrls = scrims
    .map((scrim) => {
      const loc = escapeXml(
        `${baseUrl}/scrim/${encodeURIComponent(scrim.slug || scrim.id)}`
      );
      const lastmod = scrim.updated_at || scrim.scheduled_date || today;
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${new Date(lastmod).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.4</priority>
  </url>`;
    })
    .join('\n');

  // Dynamic league pages
  const leagueUrls = leagues
    .map((league) => {
      const loc = escapeXml(`${baseUrl}/leagues/${league.slug}`);
      const lastmod = league.updated_at || today;
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${new Date(lastmod).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
    })
    .join('\n');

  // PAS de profils de joueuses ici — décision produit du 2026-07-13
  // (create_player_discovery_profiles.sql) : aucune page PUBLIQUE ni INDEXÉE de
  // personne. Le sitemap poussait pourtant vers l'index toutes les joueuses
  // ayant un match classé, sans qu'aucune ne l'ait demandé. Les ÉQUIPES restent
  // publiques et indexées : ce sont des entités, pas des personnes.
  //
  // Les fiches restent accessibles par lien (partage, leaderboard) ; elles sont
  // simplement en `noindex` tant que la joueuse n'a pas activé sa découverte
  // (cf. getStaticProps de pages/player/[userId].tsx).

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${newsUrls}
${tournamentUrls}
${teamUrls}
${matchUrls}
${scrimUrls}
${leagueUrls}
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

  // Équipes qui ont une fiche : un slug, et actives — la fiche rend 404 sur
  // une équipe inactive (pages/team/[slug]/index.tsx), et une équipe
  // supprimée (soft-delete) n'a rien à faire dans l'index.
  let teams: TeamItem[] = [];
  try {
    const { data } = await client
      .from('teams')
      .select('slug, updated_at')
      .eq('tenant_id', tenantId)
      .not('slug', 'is', null)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(500);

    teams = (data || [])
      .filter((t) => Boolean(t.slug))
      .map((t) => ({ slug: t.slug as string, updated_at: t.updated_at }));
  } catch (err) {
    logger.error('[sitemap] Error fetching teams:', err);
  }

  // Matchs terminés (seuls à avoir une valeur d'archive stable), et seulement
  // ceux d'un tournoi PUBLIC : la page match rend 404 sinon. La jointure
  // `!inner` écarte aussi les matchs de scrim (tournament_id NULL), dont la
  // page redirige vers celle du scrim — listée plus bas.
  let matches: MatchItem[] = [];
  try {
    const { data } = await client
      .from('matches')
      .select('id, completed_at, updated_at, tournaments!inner(visibility)')
      .eq('tenant_id', tenantId)
      .eq('status', 'finished')
      .eq('tournaments.visibility', 'public')
      .order('completed_at', { ascending: false })
      .limit(500);

    matches = (data || []).map((m) => ({
      id: m.id as string,
      completed_at: m.completed_at as string | null,
      updated_at: m.updated_at as string | null,
    }));
  } catch (err) {
    logger.error('[sitemap] Error fetching matches:', err);
  }

  // Scrims publics, mêmes filtres que pages/scrim/[id].tsx.
  let scrims: ScrimItem[] = [];
  try {
    const { data } = await client
      .from('scrims')
      .select('id, slug, updated_at, scheduled_date')
      .eq('tenant_id', tenantId)
      .eq('is_public', true)
      .neq('status', 'draft')
      .is('deleted_at', null)
      .order('scheduled_date', { ascending: false })
      .limit(500);

    scrims = (data || []) as ScrimItem[];
  } catch (err) {
    logger.error('[sitemap] Error fetching scrims:', err);
  }

  // Fetch public, non-draft leagues
  let leagues: LeagueItem[] = [];
  try {
    const { data } = await client
      .from('leagues')
      .select('slug, updated_at')
      .eq('tenant_id', tenantId)
      .eq('is_public', true)
      .neq('status', 'draft')
      .order('updated_at', { ascending: false })
      .limit(500);

    leagues = (data || [])
      .filter((l) => Boolean(l.slug))
      .map((l) => ({ slug: l.slug as string, updated_at: l.updated_at }));
  } catch (err) {
    logger.error('[sitemap] Error fetching leagues:', err);
  }

  // (Plus de lecture de player_ratings : les profils de joueuses ne sont plus
  // listés — voir le commentaire dans generateSiteMap.)

  const sitemap = generateSiteMap(
    baseUrl,
    newsItems,
    tournaments,
    teams,
    matches,
    scrims,
    leagues
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
