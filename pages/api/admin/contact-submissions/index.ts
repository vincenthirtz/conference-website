import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { getStaffContextFromRequest, hasAtLeastRole } from '@/utils/staff';

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
  if (!hasAtLeastRole(ctx.role, 'manager')) {
    return res.status(403).json({ error: 'Accès réservé aux managers et admins.' });
  }

  if (req.method === 'GET') {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    let query = admin
      .from('contact_submissions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by status
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    // Search by name or email
    if (search?.trim()) {
      const searchTerm = `%${search.trim()}%`;
      query = query.or(`name.ilike.${searchTerm},email.ilike.${searchTerm}`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[admin/contact-submissions] list error', error);
      return res
        .status(500)
        .json({ error: 'Impossible de charger les messages.' });
    }

    return res.status(200).json({
      items: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  }

  res.setHeader('Allow', 'GET');
  return res.status(405).json({ error: 'Method not allowed' });
}
