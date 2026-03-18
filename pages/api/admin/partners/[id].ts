import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, StaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';

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
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin!;

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Partner ID required.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('partners')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Partner not found.' });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const body = req.body as PartnerPayload;
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.category !== undefined) {
      const validCategories = ['super', 'major', 'cultural'];
      if (!validCategories.includes(body.category)) {
        return res
          .status(400)
          .json({ error: 'Invalid category. Allowed values: super, major, cultural.' });
      }
      updates.category = body.category;
    }
    if (body.logoUrl !== undefined) updates.logo_url = body.logoUrl || null;
    if (body.websiteUrl !== undefined) updates.website_url = body.websiteUrl || null;
    if (body.note !== undefined) updates.note = body.note || null;
    if (body.displayOrder !== undefined) updates.display_order = body.displayOrder;
    if (body.isActive !== undefined) updates.is_active = body.isActive;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No changes provided.' });
    }

    const { data, error } = await admin
      .from('partners')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admin/partners] update error', error);
      return res
        .status(500)
        .json({ error: 'Failed to update the partner.' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Partner not found.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'settings_update' as any,
        entity_type: 'partner',
        entity_id: id,
        payload: { updates },
      });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { data: existing } = await admin
      .from('partners')
      .select('id, name')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Partner not found.' });
    }

    const { error } = await admin.from('partners').delete().eq('id', id);

    if (error) {
      console.error('[admin/partners] delete error', error);
      return res
        .status(500)
        .json({ error: 'Failed to delete the partner.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'settings_update' as any,
        entity_type: 'partner',
        entity_id: id,
        payload: { name: existing.name, deleted: true },
      });
    }

    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET,PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
