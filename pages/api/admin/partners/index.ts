import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, StaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { sanitizeUrl } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';

type PartnerPayload = {
  name?: string;
  description?: string;
  category?: 'super' | 'major' | 'cultural';
  logoUrl?: string;
  websiteUrl?: string;
  note?: string;
  displayOrder?: number;
  isActive?: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: StaffContext
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-partners'))
    return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin!;

  if (req.method === 'GET') {
    const { limit = '50', category, active } = req.query;
    const limitNum = Math.max(1, Math.min(200, Number(limit) || 50));

    let query = admin
      .from('partners')
      .select('*')
      .order('category', { ascending: true })
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(limitNum);

    if (category && typeof category === 'string') {
      query = query.eq('category', category);
    }
    if (active === 'true') {
      query = query.eq('is_active', true);
    } else if (active === 'false') {
      query = query.eq('is_active', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admin/partners] list error', error);
      return res.status(500).json({ error: 'Failed to load partners.' });
    }

    return res.status(200).json({ items: data ?? [] });
  }

  if (req.method === 'POST') {
    const body = req.body as PartnerPayload;
    if (!body?.name || !body.description || !body.category) {
      return res
        .status(400)
        .json({ error: 'Name, description and category are required.' });
    }

    const validCategories = ['super', 'major', 'cultural'];
    if (!validCategories.includes(body.category)) {
      return res.status(400).json({
        error: 'Invalid category. Allowed values: super, major, cultural.',
      });
    }

    const insertPayload = {
      name: body.name,
      description: body.description,
      category: body.category,
      logo_url: sanitizeUrl(body.logoUrl),
      website_url: sanitizeUrl(body.websiteUrl),
      note: body.note ?? null,
      display_order: body.displayOrder ?? 0,
      is_active: body.isActive ?? true,
    };

    const { data, error } = await admin
      .from('partners')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('[admin/partners] create error', error);
      return res.status(500).json({ error: 'Failed to create the partner.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'settings_update' as any,
        entity_type: 'partner',
        entity_id: data.id,
        payload: {
          name: data.name,
          category: data.category,
        },
      });
    }

    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
