import type { NextApiRequest, NextApiResponse } from 'next';
import slugify from 'slugify';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { escapePostgrestValue } from '@/utils/apiHelpers';

const normalizeTag = (value?: string | null) => {
  const cleaned = (value || '').toString().trim();
  if (!cleaned) return '';
  return slugify(cleaned, { lower: true, strict: true });
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'news')) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = supabaseAdmin ?? getServerClient(req, res);

  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
  const tagFilter = normalizeTag(req.query.tag?.toString());

  const nowISO = new Date().toISOString();

  let query = admin
    .from('news')
    .select(
      'id, title, slug, tag, excerpt, content, image_url, published_at, created_at, updated_at, news_comments(count)'
    )
    .eq('status', 'published')
    .or(`published_at.lte.${escapePostgrestValue(nowISO)},published_at.is.null`)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (tagFilter) {
    query = query.eq('tag', tagFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[news] public list error', error);
    return res
      .status(500)
      .json({ error: 'Failed to load news.' });
  }

  const items =
    data?.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      tag: row.tag,
      excerpt: row.excerpt,
      content: row.content,
      imageUrl: row.image_url,
      createdAt: row.created_at,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
      commentsCount: row.news_comments?.[0]?.count ?? 0,
    })) ?? [];

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=120');
  return res.status(200).json({ items });
}
