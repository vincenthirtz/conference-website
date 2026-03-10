import type { NextApiRequest, NextApiResponse } from 'next';
import { load } from 'cheerio';
import { supabaseAdmin } from '@/utils/supabase';

const PATCH_NOTES_URL =
  'https://overwatch.blizzard.com/fr-fr/news/patch-notes/';

export type PatchNoteItem = {
  id: string;
  title: string;
  date: string;
  link: string;
  summary: string;
  heroes: { name: string; icon: string; summary: string; category: string }[];
};

export type PatchNotesResponse = {
  items: PatchNoteItem[];
};

// Mapping des mois français vers numéros
const FRENCH_MONTHS: Record<string, string> = {
  janvier: '01',
  février: '02',
  mars: '03',
  avril: '04',
  mai: '05',
  juin: '06',
  juillet: '07',
  août: '08',
  septembre: '09',
  octobre: '10',
  novembre: '11',
  décembre: '12',
};

/**
 * Parse une date française (ex: "8 janvier 2026") vers format ISO (2026-01-08)
 */
function parseFrenchDate(dateStr: string): string | null {
  if (!dateStr) return null;

  // Format attendu: "8 janvier 2026"
  const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
  if (!match) return null;

  const [, day, monthName, year] = match;
  const month = FRENCH_MONTHS[monthName.toLowerCase()];
  if (!month) return null;

  return `${year}-${month}-${day.padStart(2, '0')}`;
}

/**
 * Scrape les patch notes depuis le site Blizzard
 */
async function scrapePatchNotes(): Promise<PatchNoteItem[]> {
  const response = await fetch(PATCH_NOTES_URL, {
    headers: {
      'User-Agent': 'OW-WC Patch Notes fetcher',
      'Accept-Language': 'fr-FR,fr;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch patch notes: ${response.status} ${response.statusText}`
    );
  }

  const html = await response.text();
  const $ = load(html);
  const items: PatchNoteItem[] = [];

  $('.PatchNotes-patch').each((_, element) => {
    const anchor = $(element).find('.anchor').attr('id');
    const title = $(element)
      .find('.PatchNotes-patchTitle')
      .first()
      .text()
      .trim();
    const date = $(element).find('.PatchNotes-date').first().text().trim();
    const description = $(element)
      .find('.PatchNotes-sectionDescription')
      .first()
      .text()
      .trim()
      .replace(/\s+/g, ' ');

    const heroes = $(element)
      .find('.PatchNotesHeroUpdate-header')
      .map((__, hero) => {
        const name = $(hero).find('h5').text().trim();
        const icon = $(hero).find('img').attr('src') || '';
        if (!name) return null;

        const section = $(hero).closest('.PatchNotes-section');
        const category =
          section.find('.PatchNotes-sectionTitle').first().text().trim() ||
          'Autres mises à jour';

        const heroBodyText = $(hero)
          .closest('.PatchNotesHeroUpdate')
          .find('.PatchNotesHeroUpdate-body')
          .text()
          .trim()
          .replace(/\s+/g, ' ');
        const summary =
          heroBodyText.length > 0
            ? `${heroBodyText.slice(0, 260)}${
                heroBodyText.length > 260 ? '…' : ''
              }`
            : 'Voir les changements détaillés dans la note.';
        return { name, icon, summary, category };
      })
      .get()
      .filter(Boolean) as {
      name: string;
      icon: string;
      summary: string;
      category: string;
    }[];

    const summaryFromDescription = description
      ? `Principales mises à jour : ${description.slice(0, 220)}${
          description.length > 220 ? '…' : ''
        }`
      : 'Mises à jour variées sur les modes et équilibrages.';

    if (!anchor || !title) {
      return;
    }

    items.push({
      id: anchor,
      title,
      date,
      link: `${PATCH_NOTES_URL}#${anchor}`,
      summary: summaryFromDescription,
      heroes,
    });
  });

  return items;
}

/**
 * Sauvegarde les patch notes en base de données (upsert)
 */
async function savePatchNotesToDb(items: PatchNoteItem[]): Promise<void> {
  if (items.length === 0 || !supabaseAdmin) return;

  const records = items.map((item) => ({
    id: item.id,
    title: item.title,
    date: item.date,
    date_parsed: parseFrenchDate(item.date),
    link: item.link,
    summary: item.summary,
    heroes: item.heroes,
  }));

  const { error } = await supabaseAdmin
    .from('patch_notes')
    .upsert(records, { onConflict: 'id' });

  if (error) {
    console.error('[/api/patch-notes] failed to save to DB:', error);
  }
}

/**
 * Récupère les 4 derniers patch notes depuis la base de données
 */
async function getPatchNotesFromDb(): Promise<PatchNoteItem[]> {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from('patch_notes')
    .select('id, title, date, link, summary, heroes')
    .order('date_parsed', { ascending: false, nullsFirst: false })
    .limit(4);

  if (error) {
    console.error('[/api/patch-notes] failed to fetch from DB:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    date: row.date,
    link: row.link,
    summary: row.summary || '',
    heroes: (row.heroes as PatchNoteItem['heroes']) || [],
  }));
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PatchNotesResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Scraper les nouveaux patch notes depuis Blizzard
    let scrapedItems: PatchNoteItem[] = [];
    try {
      scrapedItems = await scrapePatchNotes();
      // Sauvegarder les nouveaux patch notes en BDD (en arrière-plan)
      if (scrapedItems.length > 0) {
        savePatchNotesToDb(scrapedItems).catch((err) => {
          console.error('[/api/patch-notes] background save error:', err);
        });
      }
    } catch (scrapeError) {
      console.error('[/api/patch-notes] scrape failed:', scrapeError);
      // Continue - on va essayer de récupérer depuis la BDD
    }

    // 2. Récupérer les 4 derniers depuis la BDD (inclut l'historique)
    const dbItems = await getPatchNotesFromDb();

    // 3. Si on a des données en BDD, les utiliser
    // Sinon, utiliser les données scrapées
    const items = dbItems.length > 0 ? dbItems : scrapedItems.slice(0, 4);

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');

    return res.status(200).json({
      items: items.slice(0, 4),
    });
  } catch (error) {
    console.error('[/api/patch-notes] failed to load patch notes', error);
    return res.status(500).json({
      error:
        "Failed to load Overwatch 2 patch notes.",
    });
  }
}
