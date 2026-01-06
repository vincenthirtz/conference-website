import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  'https://example.com';

function xmlEscape(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = supabaseAdmin ?? getServerClient(req, res);

  const nowISO = new Date().toISOString();
  const { data, error } = await admin
    .from('news')
    .select('id, title, slug, tag, excerpt, content, published_at')
    .eq('status', 'published')
    .or(`published_at.lte.${nowISO},published_at.is.null`)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) {
    console.error('[news/rss] error', error);
    return res
      .status(500)
      .json({ error: 'Impossible de générer le flux RSS.' });
  }

  const items = data ?? [];
  const rssItems = items
    .map((item) => {
      const link = `${SITE_URL}/news/${item.slug}`;
      const pubDate = item.published_at
        ? new Date(item.published_at).toUTCString()
        : new Date().toUTCString();
      const description = xmlEscape(item.excerpt || item.content || '');
      const tagValue = xmlEscape(item.tag || 'general');
      return `
  <item>
    <title>${xmlEscape(item.title)}</title>
    <link>${link}</link>
    <guid>${item.id}</guid>
    <pubDate>${pubDate}</pubDate>
    <description>${description}</description>
    <category>${tagValue}</category>
  </item>`;
    })
    .join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>OW Women's Cup – Actualités</title>
  <link>${SITE_URL}</link>
  <description>Dernières actualités OW Women's Cup</description>
  ${rssItems}
</channel>
</rss>`;

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
  res.status(200).send(rss);
}
