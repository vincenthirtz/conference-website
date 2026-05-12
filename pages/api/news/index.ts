import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import slugify from 'slugify';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { parsePagination } from '@/utils/apiHelpers';
import { emitBotEvent } from '@/utils/botEvents';

import { logger } from '../../../utils/logger';

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

const normalizeTag = (value?: string | null) => {
  const cleaned = (value || '').toString().trim();
  if (!cleaned) return '';
  return slugify(cleaned, { lower: true, strict: true });
};

function normalizeSlug(title: string, slug?: string) {
  const base = slug?.trim().length ? slug : title;
  return slugify(base, { lower: true, strict: true });
}

function verifyApiKey(req: NextApiRequest): boolean {
  const expected = process.env.BOT_API_KEY;
  if (!expected) return false;

  const provided = req.headers['x-api-key'];
  if (typeof provided !== 'string' || provided.length === 0) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') return handlePost(req, res);

  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'news')) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET,POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = supabaseAdmin ?? getServerClient(req, res);

  const { limit, offset } = parsePagination(req, { limit: 10, maxLimit: 100 });
  const tagFilter = normalizeTag(req.query.tag?.toString());

  const nowISO = new Date().toISOString();

  let query = admin
    .from('news')
    .select(
      'id, title, slug, tag, excerpt, content, image_url, published_at, created_at, updated_at, news_comments(count)'
    )
    .eq('status', 'published')
    .or(`published_at.lte.${nowISO},published_at.is.null`)
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (tagFilter) {
    query = query.eq('tag', tagFilter);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[news] public list error', error);
    return res.status(500).json({ error: 'Failed to load news.' });
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

  res.setHeader(
    'Cache-Control',
    'public, s-maxage=300, stale-while-revalidate=120'
  );
  return res.status(200).json({ items });
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  if (applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'news-ingest'))
    return;

  if (!process.env.BOT_API_KEY) {
    logger.error('[news] ingest endpoint called but BOT_API_KEY is unset');
    return res.status(500).json({ error: 'Ingest endpoint not configured.' });
  }

  if (!verifyApiKey(req)) {
    return res.status(401).json({ error: 'Invalid or missing API key.' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const body = (req.body ?? {}) as NewsPayload;
  if (!body.title || !body.content) {
    return res.status(400).json({ error: 'Title and content are required.' });
  }

  const slug = normalizeSlug(body.title, body.slug);
  const status = body.status === 'published' ? 'published' : 'draft';
  const publishedAt =
    status === 'published'
      ? body.publishedAt
        ? new Date(body.publishedAt).toISOString()
        : new Date().toISOString()
      : null;

  const { data, error } = await supabaseAdmin
    .from('news')
    .insert({
      title: body.title,
      slug,
      tag: normalizeTag(body.tag) || 'general',
      excerpt: body.excerpt ?? null,
      content: body.content,
      image_url: body.imageUrl ?? null,
      status,
      published_at: publishedAt,
      author_id: null,
    })
    .select()
    .single();

  if (error) {
    logger.error('[news] ingest create error', error);
    return res.status(500).json({ error: 'Failed to create the article.' });
  }

  if (status === 'published') {
    const paths = ['/', '/actualites', `/news/${data.slug}`];
    await Promise.all(
      paths.map((path) =>
        res.revalidate(path).catch((err) => {
          logger.error(`[news] revalidate ${path} failed`, err);
        })
      )
    );

    void emitBotEvent('news.published', {
      newsId: data.id,
      slug: data.slug,
      title: data.title,
      tag: data.tag,
      excerpt: data.excerpt,
      imageUrl: data.image_url,
      publishedAt: data.published_at,
    }).catch((e) => logger.error('[botEvents] news.published emit error', e));
  }

  return res.status(201).json(data);
}
