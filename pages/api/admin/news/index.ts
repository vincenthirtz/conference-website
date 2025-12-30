import type { NextApiRequest, NextApiResponse } from 'next';
import slugify from 'slugify';
import { supabaseAdmin } from '@/utils/supabase';
import {
  getStaffContextFromRequest,
  hasAtLeastRole,
} from '@/utils/staff';

type NewsPayload = {
  title?: string;
  slug?: string;
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Service Supabase indisponible (service role manquant).' });
  }
  const admin = supabaseAdmin!;

  const ctx = await getStaffContextFromRequest(req, res);
  if (!hasAtLeastRole(ctx.role, 'admin')) {
    return res.status(403).json({ error: 'Accès réservé aux admins.' });
  }

  if (req.method === 'GET') {
    const { limit = '50', status } = req.query;
    const limitNum = Math.max(1, Math.min(200, Number(limit) || 50));

    let query = admin
      .from('news')
      .select('*')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limitNum);

    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admin/news] list error', error);
      return res
        .status(500)
        .json({ error: 'Impossible de charger les news.' });
    }

    return res.status(200).json({ items: data ?? [] });
  }

  if (req.method === 'POST') {
    const body = req.body as NewsPayload;
    if (!body?.title || !body.content) {
      return res
        .status(400)
        .json({ error: 'Titre et contenu sont obligatoires.' });
    }

    const slug = normalizeSlug(body.title, body.slug);
    const publishedAt =
      body.status === 'published' && body.publishedAt
        ? new Date(body.publishedAt).toISOString()
        : null;

    const insertPayload = {
      title: body.title,
      slug,
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
        .json({ error: 'Impossible de créer la news.', detail: error.message });
    }

    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
