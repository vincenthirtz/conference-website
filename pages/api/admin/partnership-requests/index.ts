import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  getStaffContextFromRequest,
  hasAtLeastRole,
} from '@/utils/staff';

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

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { limit = '50', status, category } = req.query;
  const limitNum = Math.max(1, Math.min(200, Number(limit) || 50));

  let query = admin
    .from('partnership_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limitNum);

  if (status && typeof status === 'string') {
    query = query.eq('status', status);
  }
  if (category && typeof category === 'string') {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[admin/partnership-requests] list error', error);
    return res
      .status(500)
      .json({ error: 'Impossible de charger les demandes.' });
  }

  // Count by status for stats
  const { data: counts } = await admin
    .from('partnership_requests')
    .select('status')
    .then(result => {
      if (!result.data) return { data: null };
      const statusCounts: Record<string, number> = {};
      result.data.forEach((r: { status: string }) => {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      });
      return { data: statusCounts };
    });

  return res.status(200).json({
    items: data ?? [],
    counts: counts ?? {},
  });
}
