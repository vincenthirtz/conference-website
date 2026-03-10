import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, StaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

type SiteSetting = {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
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

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('site_settings')
      .select('*')
      .order('key');

    if (error) {
      console.error('[admin/site-settings] list error', error);
      return res
        .status(500)
        .json({ error: 'Failed to load settings.' });
    }

    return res.status(200).json({ items: data ?? [] });
  }

  if (req.method === 'POST') {
    const { key, value, description } = req.body;

    if (!key?.trim() || value === undefined) {
      return res.status(400).json({ error: 'Key and value required.' });
    }

    const { data, error } = await admin
      .from('site_settings')
      .upsert(
        {
          key: key.trim(),
          value: value,
          description: description?.trim() || null,
          updated_by: ctx.staff?.id,
        },
        { onConflict: 'key' }
      )
      .select()
      .single();

    if (error) {
      console.error('[admin/site-settings] upsert error', error);
      return res
        .status(500)
        .json({ error: 'Failed to save the setting.' });
    }

    await logStaffAction({
      staff_id: ctx.staff!.id,
      action: 'other',
      entity_type: 'site_settings',
      entity_id: key.trim(),
      payload: { value },
    });

    return res.status(200).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
