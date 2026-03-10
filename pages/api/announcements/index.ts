import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';

type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  cta_label: string | null;
  cta_url: string | null;
  is_active: boolean;
  priority: number | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = supabaseAdmin ?? getServerClient(req, res);
  if (!admin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable.' });
  }

  const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 10));
  const { data, error } = await admin
    .from('announcements')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[announcements] public list error', error);
    return res
      .status(500)
      .json({ error: 'Failed to load announcements.' });
  }

  const items =
    data?.map((row: AnnouncementRow) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      ctaLabel: row.cta_label,
      ctaUrl: row.cta_url,
      priority: row.priority ?? 0,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })) ?? [];

  return res.status(200).json({ items });
}
