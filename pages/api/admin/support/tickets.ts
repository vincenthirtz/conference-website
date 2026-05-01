// pages/api/admin/support/tickets.ts
// Admin: list support tickets with filters.
// GET: ?status=&severity=&category=&tournament_id=&offset=&limit=

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';

import { logger } from '../../../../utils/logger';
const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
const VALID_SEVERITIES = ['low', 'medium', 'high'] as const;
const VALID_CATEGORIES = ['dispute', 'behavior', 'technical', 'other'] as const;

export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }

  const { status, severity, category, tournament_id } = req.query;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  let q = supabaseAdmin
    .from('support_tickets')
    .select(
      'id, tournament_id, reporter_name, reporter_email, is_anonymous, category, severity, subject, message, status, resolved_at, resolution_note, created_at, updated_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (
    typeof status === 'string' &&
    (VALID_STATUSES as readonly string[]).includes(status)
  ) {
    q = q.eq('status', status);
  }
  if (
    typeof severity === 'string' &&
    (VALID_SEVERITIES as readonly string[]).includes(severity)
  ) {
    q = q.eq('severity', severity);
  }
  if (
    typeof category === 'string' &&
    (VALID_CATEGORIES as readonly string[]).includes(category)
  ) {
    q = q.eq('category', category);
  }
  if (typeof tournament_id === 'string' && tournament_id) {
    q = q.eq('tournament_id', tournament_id);
  }

  const { data, error, count } = await q;

  if (error) {
    logger.error('[admin/support/tickets] list error:', error);
    return res.status(500).json({ error: 'Échec du chargement' });
  }

  return res.status(200).json({
    tickets: data || [],
    total: count ?? null,
    limit,
    offset,
  });
}
