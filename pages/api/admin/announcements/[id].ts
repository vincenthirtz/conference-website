import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { isValidUUID, sanitizeUrl } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';

import { logger } from '../../../../utils/logger';
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

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-announcements-id'
    )
  )
    return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin!;

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Missing or invalid ID.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('announcements')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      logger.error('[admin/announcements] get error', error);
      return res.status(404).json({ error: 'Announcement not found.' });
    }
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const body = req.body as AnnouncementPayload;
    const updatePayload: Record<string, any> = {};

    if (typeof body.title === 'string') updatePayload.title = body.title.trim();
    if (typeof body.message === 'string')
      updatePayload.message = body.message.trim();
    if ('ctaLabel' in body)
      updatePayload.cta_label = body.ctaLabel?.trim() || null;
    if ('ctaUrl' in body) updatePayload.cta_url = sanitizeUrl(body.ctaUrl);
    if ('isActive' in body) updatePayload.is_active = !!body.isActive;
    if ('priority' in body)
      updatePayload.priority = Number.isFinite(body.priority)
        ? Number(body.priority)
        : 0;
    if ('startsAt' in body) updatePayload.starts_at = toISO(body.startsAt);
    if ('endsAt' in body) updatePayload.ends_at = toISO(body.endsAt);

    const { data, error } = await admin
      .from('announcements')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('[admin/announcements] update error', error);
      return res
        .status(500)
        .json({ error: 'Failed to update the announcement.' });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { error } = await admin.from('announcements').delete().eq('id', id);

    if (error) {
      logger.error('[admin/announcements] delete error', error);
      return res
        .status(500)
        .json({ error: 'Failed to delete the announcement.' });
    }

    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET,PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
