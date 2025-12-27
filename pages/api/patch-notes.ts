import type { NextApiRequest, NextApiResponse } from 'next';
import { load } from 'cheerio';

const PATCH_NOTES_URL =
  'https://overwatch.blizzard.com/fr-fr/news/patch-notes/';

export type PatchNoteItem = {
  id: string;
  title: string;
  date: string;
  link: string;
  summary: string;
  heroes: { name: string; icon: string; summary: string }[];
};

export type PatchNotesResponse = {
  items: PatchNoteItem[];
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PatchNotesResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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
          return { name, icon, summary };
        })
        .get()
        .filter(Boolean) as { name: string; icon: string; summary: string }[];

      const summaryFromHeroes =
        heroes.length > 0
          ? `Ajustements apportés à : ${heroes
              .map((h) => h.name)
              .join(', ')}.`
          : null;

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
        summary: summaryFromHeroes || summaryFromDescription,
        heroes,
      });
    });

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');

    return res.status(200).json({
      items: items.slice(0, 4),
    });
  } catch (error) {
    console.error('[/api/patch-notes] failed to load patch notes', error);
    return res.status(500).json({
      error: "Impossible de charger les patch notes d'Overwatch 2 pour le moment.",
    });
  }
}
