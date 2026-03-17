import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';

type Comment = {
  id: string;
  news_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
};

type ListResponse =
  | { items: Comment[] }
  | { error: string };

type CreateResponse =
  | { comment: Comment }
  | { error: string };

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

  const { data, error } = await client
    .from('news_comments')
    .select('id, news_id, author_name, content, created_at')
    .eq('news_id', newsId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[/api/news/comments] list error:', error);
    return res
      .status(500)
      .json({ error: 'Failed to fetch comments' });
  }

  return res.status(200).json({ items: data || [] });
}

async function createComment(
  req: NextApiRequest,
  res: NextApiResponse<CreateResponse>
) {
  const client = supabaseAdmin || getServerClient(req, res);
  if (!client) {
    return res
      .status(500)
      .json({ error: 'Service unavailable.' });
  }

  // Rate limiting: 10 comments per 10 minutes
  if (applyRateLimit(req, res, { max: 10, windowMs: 10 * 60 * 1000 }, 'comments')) return;

  const { newsId, content, authorName, honeypot, captcha } = req.body || {};
  const trimmedContent = (content || '').toString().trim();
  const trimmedNewsId = (newsId || '').toString().trim();
  const trimmedAuthor = authorName ? authorName.toString().trim() : null;
  const captchaValue = (captcha || '').toString().trim().toLowerCase();

  // Simple anti-bot: reject if honeypot filled
  if (honeypot && `${honeypot}`.trim().length > 0) {
    return res.status(400).json({ error: 'Bot detected' });
  }

  // Captcha simple sans token
  if (captchaValue !== 'owc') {
    return res.status(400).json({ error: 'Invalid captcha' });
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
    return res.status(400).json({ error: 'content must be at most 2000 characters' });
  }

  if (trimmedAuthor && trimmedAuthor.length > 50) {
    return res.status(400).json({ error: 'author name must be at most 50 characters' });
  }

  const { data, error } = await client
    .from('news_comments')
    .insert({
      news_id: trimmedNewsId,
      content: trimmedContent,
      author_name: trimmedAuthor,
    })
    .select('id, news_id, author_name, content, created_at')
    .maybeSingle();

  if (error || !data) {
    console.error('[/api/news/comments] create error:', error);
    return res
      .status(500)
      .json({ error: 'Failed to create comment' });
  }

  return res.status(201).json({ comment: data });
}
