import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { verifyCaptcha } from '@/utils/captcha';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';

import { logger } from '../../../utils/logger';
type Comment = {
  id: string;
  news_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
};

type ListResponse = { items: Comment[] } | { error: string };

type CreateResponse = { comment: Comment } | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListResponse | CreateResponse>
) {
  if (req.method === 'GET') {
    return listComments(req, res);
  }
  if (req.method === 'POST') {
    return createComment(req, res);
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function listComments(
  req: NextApiRequest,
  res: NextApiResponse<ListResponse>
) {
  const newsId = (req.query.newsId || '').toString().trim();
  const limit = Math.min(
    100,
    Math.max(1, parseInt((req.query.limit || '50').toString(), 10) || 50)
  );

  if (!newsId) {
    return res.status(400).json({ error: 'newsId is required' });
  }

  const client = supabaseAdmin || getServerClient(req, res);
  if (!client) {
    return res.status(500).json({ error: 'Supabase client unavailable' });
  }

  const tenantId = resolveTenantIdForPublicRequest(req);

  const { data, error } = await client
    .from('news_comments')
    .select('id, news_id, author_name, content, created_at')
    .eq('news_id', newsId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('[/api/news/comments] list error:', error);
    return res.status(500).json({ error: 'Failed to fetch comments' });
  }

  res.setHeader(
    'Cache-Control',
    'public, s-maxage=60, stale-while-revalidate=30'
  );
  return res.status(200).json({ items: data || [] });
}

async function createComment(
  req: NextApiRequest,
  res: NextApiResponse<CreateResponse>
) {
  const client = supabaseAdmin || getServerClient(req, res);
  if (!client) {
    return res.status(500).json({ error: 'Service unavailable.' });
  }

  // Rate limiting: 10 comments per 10 minutes
  if (
    applyRateLimit(req, res, { max: 10, windowMs: 10 * 60 * 1000 }, 'comments')
  )
    return;

  const { newsId, content, authorName, honeypot, captchaToken, captchaAnswer } =
    req.body || {};
  const trimmedContent = (content || '').toString().trim();
  const trimmedNewsId = (newsId || '').toString().trim();
  const trimmedAuthor = authorName ? authorName.toString().trim() : null;

  // Simple anti-bot: reject if honeypot filled
  if (honeypot && `${honeypot}`.trim().length > 0) {
    return res.status(400).json({ error: 'Bot detected' });
  }

  // Verify CAPTCHA challenge-response
  const captchaResult = verifyCaptcha(
    (captchaToken || '').toString(),
    (captchaAnswer || '').toString()
  );
  if (!captchaResult.valid) {
    return res
      .status(400)
      .json({ error: captchaResult.error || 'Invalid captcha' });
  }

  if (!trimmedNewsId) {
    return res.status(400).json({ error: 'newsId is required' });
  }
  if (!trimmedContent || trimmedContent.length < 3) {
    return res
      .status(400)
      .json({ error: 'content must contain at least 3 characters' });
  }

  if (trimmedContent.length > 2000) {
    return res
      .status(400)
      .json({ error: 'content must be at most 2000 characters' });
  }

  if (trimmedAuthor && trimmedAuthor.length > 50) {
    return res
      .status(400)
      .json({ error: 'author name must be at most 50 characters' });
  }

  const tenantId = resolveTenantIdForPublicRequest(req);

  // Vérifie que l'article ciblé existe ET appartient au tenant résolu ET est
  // publié. Sans ce check, un POST pouvait attacher un commentaire à un
  // news_id arbitraire (autre tenant, brouillon, ou inexistant) → rows
  // orphelines / cross-tenant. On lit avec le client service-role (supabaseAdmin
  // si dispo) pour ne pas dépendre des RLS publiques.
  const { data: newsRow, error: newsErr } = await client
    .from('news')
    .select('id, status')
    .eq('id', trimmedNewsId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (newsErr) {
    logger.error('[/api/news/comments] news lookup error:', newsErr);
    return res.status(500).json({ error: 'Failed to create comment' });
  }
  if (!newsRow) {
    return res.status(404).json({ error: 'Article introuvable' });
  }
  if ((newsRow as { status?: string }).status !== 'published') {
    return res
      .status(403)
      .json({ error: 'Les commentaires sont fermés sur cet article.' });
  }

  const { data, error } = await client
    .from('news_comments')
    .insert({
      news_id: trimmedNewsId,
      content: trimmedContent,
      author_name: trimmedAuthor,
      tenant_id: tenantId,
    })
    .select('id, news_id, author_name, content, created_at')
    .maybeSingle();

  if (error || !data) {
    logger.error('[/api/news/comments] create error:', error);
    return res.status(500).json({ error: 'Failed to create comment' });
  }

  return res.status(201).json({ comment: data });
}
