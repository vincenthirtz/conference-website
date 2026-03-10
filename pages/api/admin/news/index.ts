import type { NextApiRequest, NextApiResponse } from 'next';
import slugify from 'slugify';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type StaffContext } from '@/utils/staff';

type NewsPayload = {
  title?: string;
  slug?: string;
  tag?: string;
  excerpt?: string;
  content?: string;
  imageUrl?: string;
  status?: 'draft' | 'published';
  publishedAt?: string | null;
};

function normalizeSlug(title: string, slug?: string) {
  const base = slug?.trim().length ? slug : title;
  return slugify(base, { lower: true, strict: true });
}

function normalizeTag(tag?: string) {
  const cleaned = (tag || '').trim();
  if (!cleaned) return 'general';
  return slugify(cleaned, { lower: true, strict: true });
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: StaffContext
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin!;

  if (req.method === 'GET') {
    const { limit = '50', status, tag } = req.query;
    const limitNum = Math.max(1, Math.min(200, Number(limit) || 50));

    let query = admin
      .from('news')
      .select('*')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limitNum);

    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }
    if (tag && typeof tag === 'string') {
      query = query.eq('tag', normalizeTag(tag));
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admin/news] list error', error);
      return res
        .status(500)
        .json({ error: 'Failed to load articles.' });
    }

    return res.status(200).json({ items: data ?? [] });
  }

  if (req.method === 'POST') {
    const body = req.body as NewsPayload;
    if (!body?.title || !body.content) {
      return res
        .status(400)
        .json({ error: 'Title and content are required.' });
    }

    const slug = normalizeSlug(body.title, body.slug);
    const publishedAt =
      body.status === 'published'
        ? body.publishedAt
          ? new Date(body.publishedAt).toISOString()
          : new Date().toISOString()
        : null;

    const insertPayload = {
      title: body.title,
      slug,
      tag: normalizeTag(body.tag),
      excerpt: body.excerpt ?? null,
      content: body.content,
      image_url: body.imageUrl ?? null,
      status: body.status ?? 'draft',
      published_at: publishedAt,
      author_id: ctx.staff?.id ?? null,
    };

    const { data, error } = await admin
      .from('news')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('[admin/news] create error', error);
      return res
        .status(500)
        .json({ error: 'Failed to create the article.', detail: error.message });
    }

    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
