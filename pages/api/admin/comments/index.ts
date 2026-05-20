// Admin CRUD pour les commentaires de news

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logger } from '../../../../utils/logger';
import {
  parsePagination,
  sanitizeSearch,
  escapePostgrestValue,
} from '@/utils/apiHelpers';

type CommentRow = {
  id: string;
  news_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
  news?: { id: string; title: string | null; slug: string | null } | null;
};

type ListResponse =
  | { comments: CommentRow[]; total: number | null }
  | { error: string };

type MutateResponse =
  | { comment?: CommentRow }
  | { deleted?: boolean }
  | { error: string };

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListResponse | MutateResponse>,
  ctx: AuthenticatedStaffContext
) {
  switch (req.method) {
    case 'GET':
      return listComments(req, res, ctx);
    case 'PATCH':
      return updateComment(req, res, ctx);
    case 'DELETE':
      return deleteComment(req, res, ctx);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function listComments(
  req: NextApiRequest,
  res: NextApiResponse<ListResponse>,
  ctx: AuthenticatedStaffContext
) {
  const { limit, offset } = parsePagination(req, { limit: 50, maxLimit: 200 });
  const search = sanitizeSearch(req.query.search);
  const newsId = (req.query.newsId || '').toString().trim();

  let query = supabaseAdmin
    .from('news_comments')
    .select(
      `
        id,
        news_id,
        author_name,
        content,
        created_at,
        news:news(id, title, slug)
      `,
      { count: 'exact' }
    )
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    const safe = escapePostgrestValue(search);
    const pattern = `%${safe}%`;
    query = query.or(`content.ilike.${pattern},author_name.ilike.${pattern}`);
  }
  if (newsId) {
    query = query.eq('news_id', newsId);
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error('admin comments GET error:', error);
    return res.status(500).json({ error: 'Failed to fetch comments' });
  }

  return res.status(200).json({
    comments: (data || []) as unknown as CommentRow[],
    total: typeof count === 'number' ? count : null,
  });
}

async function updateComment(
  req: NextApiRequest,
  res: NextApiResponse<MutateResponse>,
  ctx: AuthenticatedStaffContext
) {
  const { id, content, author_name } = req.body || {};
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'id is required' });
  }
  if (content && `${content}`.trim().length < 3) {
    return res
      .status(400)
      .json({ error: 'content must contain at least 3 characters' });
  }

  const payload: any = {};
  if (typeof content === 'string') payload.content = content.trim();
  if (typeof author_name === 'string') payload.author_name = author_name.trim();

  const { data, error } = await supabaseAdmin
    .from('news_comments')
    .update(payload)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select(
      `
        id,
        news_id,
        author_name,
        content,
        created_at,
        news:news(id, title, slug)
      `
    )
    .maybeSingle();

  if (error) {
    logger.error('admin comments PATCH error:', error);
    return res.status(500).json({ error: 'Failed to update comment' });
  }

  return res.status(200).json({ comment: data as unknown as CommentRow });
}

async function deleteComment(
  req: NextApiRequest,
  res: NextApiResponse<MutateResponse>,
  ctx: AuthenticatedStaffContext
) {
  const { id } = req.body || {};
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'id is required' });
  }

  const { error } = await supabaseAdmin
    .from('news_comments')
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);

  if (error) {
    logger.error('admin comments DELETE error:', error);
    return res.status(500).json({ error: 'Failed to delete comment' });
  }

  return res.status(200).json({ deleted: true });
}
