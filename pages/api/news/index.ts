import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({
      error: 'Service Supabase indisponible (service role manquant).',
    });
  }
  const admin = supabaseAdmin!;

  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));

  const nowISO = new Date().toISOString();

  const { data, error } = await admin
    .from('news')
    .select(
      'id, title, slug, excerpt, content, image_url, published_at, created_at, updated_at'
    )
    .eq('status', 'published')
    .or(`published_at.lte.${nowISO},published_at.is.null`)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error('[news] public list error', error);
    return res
      .status(500)
      .json({ error: 'Impossible de charger les actualités.' });
  }

  console.log('data ', data);

  const items =
    data?.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      content: row.content,
      imageUrl: row.image_url,
      createdAt: row.created_at,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
    })) ?? [];

  return res.status(200).json({ items });
}
