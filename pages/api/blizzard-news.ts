import type { NextApiRequest, NextApiResponse } from 'next';
import { load } from 'cheerio';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';

const NEWS_URL = 'https://overwatch.blizzard.com/fr-fr/news/';

export type BlizzardNewsItem = {
  id: string;
  title: string;
  date: string;
  link: string;
  image_url: string | null;
  category: string | null;
  summary: string;
};

export type BlizzardNewsResponse = {
  items: BlizzardNewsItem[];
};

// Mapping des mois français vers numéros
const FRENCH_MONTHS: Record<string, string> = {
  janvier: '01',
  février: '02',
  fevrier: '02',
  mars: '03',
  avril: '04',
  mai: '05',
  juin: '06',
  juillet: '07',
  août: '08',
  aout: '08',
  septembre: '09',
  octobre: '10',
  novembre: '11',
  décembre: '12',
  decembre: '12',
};

/**
 * Parse une date française (ex: "8 janvier 2026") vers format ISO (2026-01-08)
 */
function parseFrenchDate(dateStr: string): string | null {
  if (!dateStr) return null;

  // Format attendu: "8 janvier 2026" ou "5 décembre 2025"
  const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
  if (!match) return null;

  const [, day, monthName, year] = match;
  const month = FRENCH_MONTHS[monthName.toLowerCase()];
  if (!month) return null;

  return `${year}-${month}-${day.padStart(2, '0')}`;
}

/**
 * Scrape les news générales depuis le site Blizzard
 */
async function scrapeBlizzardNews(): Promise<BlizzardNewsItem[]> {
  const response = await fetch(NEWS_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch news: ${response.status} ${response.statusText}`
    );
  }

  const html = await response.text();
  const $ = load(html);
  const items: BlizzardNewsItem[] = [];

  // Sélecteur pour les cartes de news Blizzard
  // Structure typique: NewsCard avec image, titre, date, catégorie
  $('.Card, .NewsCard, [class*="Card"]').each((_, element) => {
    const $el = $(element);

    // Essayer différents sélecteurs pour le lien
    const linkEl =
      $el.find('a[href*="/news/"]').first() ||
      $el.find('a').first() ||
      $el.closest('a');
    const href = linkEl.attr('href') || $el.find('a').attr('href');

    if (!href || !href.includes('/news/')) return;

    // Extraire l'ID depuis l'URL (ex: /news/24252008/...)
    const idMatch = href.match(/\/news\/(\d+)/);
    if (!idMatch) return;
    const id = idMatch[1];

    // Titre
    const title =
      $el.find('h3, h4, [class*="title"], [class*="Title"]').first().text().trim() ||
      $el.find('a').text().trim();

    if (!title || title.length < 5) return;

    // Date
    const date =
      $el.find('[class*="date"], [class*="Date"], time').first().text().trim() ||
      $el.find('span').filter((_, el) => {
        const text = $(el).text();
        return /\d{1,2}\s+\w+\s+\d{4}/.test(text);
      }).first().text().trim();

    // Image
    const imageUrl =
      $el.find('img').attr('src') ||
      $el.find('[style*="background"]').css('background-image')?.replace(/url\(['"]?|['"]?\)/g, '') ||
      null;

    // Catégorie
    const category =
      $el.find('[class*="category"], [class*="tag"], [class*="Category"]').first().text().trim() ||
      null;

    // Résumé/description
    const summary =
      $el.find('p, [class*="description"], [class*="excerpt"]').first().text().trim() ||
      '';

    // Construire le lien complet
    const fullLink = href.startsWith('http')
      ? href
      : `https://overwatch.blizzard.com${href}`;

    items.push({
      id,
      title,
      date,
      link: fullLink,
      image_url: imageUrl,
      category,
      summary: summary.slice(0, 300),
    });
  });

  // Si aucun résultat avec les sélecteurs génériques, essayer une approche alternative
  if (items.length === 0) {
    // Chercher tous les liens vers /news/
    $('a[href*="/news/"]').each((_, element) => {
      const $el = $(element);
      const href = $el.attr('href');

      if (!href) return;

      // Ignorer les liens de pagination ou navigation
      if (href === '/fr-fr/news/' || href === '/news/') return;

      const idMatch = href.match(/\/news\/(\d+)/);
      if (!idMatch) return;
      const id = idMatch[1];

      // Éviter les doublons
      if (items.find((item) => item.id === id)) return;

      // Remonter pour trouver le conteneur parent
      const $container = $el.closest('[class*="Card"], article, li, div').first();

      const title = $el.text().trim() || $container.find('h3, h4').text().trim();
      if (!title || title.length < 5) return;

      const fullLink = href.startsWith('http')
        ? href
        : `https://overwatch.blizzard.com${href}`;

      items.push({
        id,
        title,
        date: '',
        link: fullLink,
        image_url: null,
        category: null,
        summary: '',
      });
    });
  }

  return items;
}

/**
 * Sauvegarde les news en base de données (upsert)
 */
async function saveNewsToDb(items: BlizzardNewsItem[]): Promise<void> {
  if (items.length === 0 || !supabaseAdmin) return;

  const records = items.map((item) => ({
    id: item.id,
    title: item.title,
    date: item.date,
    date_parsed: parseFrenchDate(item.date),
    link: item.link,
    image_url: item.image_url,
    category: item.category,
    summary: item.summary,
  }));

  const { error } = await supabaseAdmin
    .from('blizzard_news')
    .upsert(records, { onConflict: 'id' });

  if (error) {
    console.error('[/api/blizzard-news] failed to save to DB:', error);
  }
}

/**
 * Récupère les news depuis la base de données
 */
async function getNewsFromDb(limit = 8): Promise<BlizzardNewsItem[]> {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from('blizzard_news')
    .select('id, title, date, link, image_url, category, summary')
    .order('date_parsed', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error('[/api/blizzard-news] failed to fetch from DB:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    date: row.date,
    link: row.link,
    image_url: row.image_url,
    category: row.category,
    summary: row.summary || '',
  }));
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BlizzardNewsResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting: 20 requests per minute (scraping is expensive)
  if (applyRateLimit(req, res, { max: 20, windowMs: 60 * 1000 }, 'blizzard-news')) return;

  const limit = Math.min(parseInt(req.query.limit as string) || 8, 20);

  try {
    // 1. Scraper les news depuis Blizzard
    let scrapedItems: BlizzardNewsItem[] = [];
    try {
      scrapedItems = await scrapeBlizzardNews();
      // Sauvegarder en BDD (en arrière-plan)
      if (scrapedItems.length > 0) {
        saveNewsToDb(scrapedItems).catch((err) => {
          console.error('[/api/blizzard-news] background save error:', err);
        });
      }
    } catch (scrapeError) {
      console.error('[/api/blizzard-news] scrape failed:', scrapeError);
    }

    // 2. Récupérer depuis la BDD
    const dbItems = await getNewsFromDb(limit);

    // 3. Utiliser les données BDD si disponibles, sinon les scrapées
    const items = dbItems.length > 0 ? dbItems : scrapedItems.slice(0, limit);

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');

    return res.status(200).json({
      items: items.slice(0, limit),
    });
  } catch (error) {
    console.error('[/api/blizzard-news] error:', error);
    return res.status(500).json({
      error: "Failed to load Overwatch news.",
    });
  }
}
