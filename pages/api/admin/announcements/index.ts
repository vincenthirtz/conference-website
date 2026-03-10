import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';

type AnnouncementPayload = {
  title?: string;
  message?: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
  priority?: number;
};

function toISO(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin!;

  if (req.method === 'GET') {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    const includeInactive = req.query.includeInactive === 'true';

    let query = admin
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admin/announcements] list error', error);
      return res
        .status(500)
        .json({ error: 'Failed to load announcements.' });
    }

    return res.status(200).json({ items: data ?? [] });
  }

  if (req.method === 'POST') {
    const body = req.body as AnnouncementPayload;
    if (!body.title || !body.message) {
      return res
        .status(400)
        .json({ error: 'Title and message are required.' });
    }

    const insertPayload = {
      title: body.title.trim(),
      message: body.message.trim(),
      cta_label: body.ctaLabel?.trim() || null,
      cta_url: body.ctaUrl?.trim() || null,
      is_active: body.isActive ?? true,
      priority: Number.isFinite(body.priority)
        ? Number(body.priority)
        : 0,
      starts_at: toISO(body.startsAt),
      ends_at: toISO(body.endsAt),
    };

    const { data, error } = await admin
      .from('announcements')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('[admin/announcements] create error', error);
      return res
        .status(500)
        .json({ error: "Failed to create the announcement.", detail: error.message });
    }

    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
