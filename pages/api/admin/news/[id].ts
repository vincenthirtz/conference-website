import type { NextApiRequest, NextApiResponse } from 'next';
import slugify from 'slugify';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';

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

function normalizeSlug(title?: string, slug?: string) {
  const base = slug?.trim().length ? slug : title || '';
  return slugify(base, { lower: true, strict: true });
}

function normalizeTag(tag?: string) {
  const cleaned = (tag || '').trim();
  if (!cleaned) return 'general';
  return slugify(cleaned, { lower: true, strict: true });
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-news-id')) return;
  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Missing or invalid ID.' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin!;

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('news')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[admin/news/id] fetch error', error);
      return res
        .status(500)
        .json({ error: 'Failed to load the article.' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Article not found.' });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    const body = req.body as NewsPayload;
    if (!body?.title || !body.content) {
      return res
        .status(400)
        .json({ error: 'Title and content are required.' });
    }

    const { data: existing, error: existingErr } = await admin
      .from('news')
      .select('published_at, status, tag')
      .eq('id', id)
      .maybeSingle();

    if (existingErr) {
      console.error('[admin/news/id] fetch existing error', existingErr);
      return res
        .status(500)
        .json({ error: 'Failed to load the existing article.' });
    }

    const tagValue = normalizeTag(body.tag ?? existing?.tag ?? '');
    const slug = normalizeSlug(body.title, body.slug);
    let publishedAt: string | null = null;
    if (body.status === 'published') {
      if (body.publishedAt) {
        publishedAt = new Date(body.publishedAt).toISOString();
      } else if (existing?.published_at) {
        publishedAt = existing.published_at;
      } else {
        publishedAt = new Date().toISOString();
      }
    } else {
      publishedAt = existing?.published_at ?? null;
    }

    const payload = {
      title: body.title,
      slug,
      tag: tagValue,
      excerpt: body.excerpt ?? null,
      content: body.content,
      image_url: body.imageUrl ?? null,
      status: body.status ?? 'draft',
      published_at: publishedAt,
    };

    const { data, error } = await admin
      .from('news')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admin/news/id] update error', error);
      return res
        .status(500)
        .json({ error: 'Failed to update the article.' });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { error } = await admin.from('news').delete().eq('id', id);

    if (error) {
      console.error('[admin/news/id] delete error', error);
      return res
        .status(500)
        .json({ error: 'Failed to delete the article.' });
    }

    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET,PUT,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
