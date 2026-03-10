import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, StaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

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

  const { key } = req.query;
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Missing key.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('site_settings')
      .select('*')
      .eq('key', key)
      .single();

    if (error) {
      console.error('[admin/site-settings] get error', error);
      return res
        .status(404)
        .json({ error: 'Setting not found.' });
    }
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const { value, description } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'Value required.' });
    }

    const updatePayload: Record<string, any> = {
      value,
      updated_by: ctx.staff?.id,
    };

    if (description !== undefined) {
      updatePayload.description = description?.trim() || null;
    }

    const { data, error } = await admin
      .from('site_settings')
      .update(updatePayload)
      .eq('key', key)
      .select()
      .single();

    if (error) {
      console.error('[admin/site-settings] update error', error);
      return res
        .status(500)
        .json({ error: 'Failed to update the setting.' });
    }

    await logStaffAction({
      staff_id: ctx.staff!.id,
      action: 'other',
      entity_type: 'site_settings',
      entity_id: key,
      payload: { value },
    });

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { error } = await admin
      .from('site_settings')
      .delete()
      .eq('key', key);

    if (error) {
      console.error('[admin/site-settings] delete error', error);
      return res
        .status(500)
        .json({ error: 'Failed to delete the setting.' });
    }

    await logStaffAction({
      staff_id: ctx.staff!.id,
      action: 'other',
      entity_type: 'site_settings',
      entity_id: key,
      payload: { deleted: true },
    });

    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET,PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
