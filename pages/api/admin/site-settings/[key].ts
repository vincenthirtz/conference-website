import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  getStaffContextFromRequest,
  hasAtLeastRole,
  logStaffAction,
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

  const { key } = req.query;
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Clé manquante.' });
  }

  const ctx = await getStaffContextFromRequest(req, res);
  if (!hasAtLeastRole(ctx.role, 'admin')) {
    return res.status(403).json({ error: 'Accès réservé aux admins.' });
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
        .json({ error: 'Paramètre introuvable.' });
    }
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const { value, description } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'Valeur requise.' });
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
        .json({ error: 'Impossible de mettre à jour le paramètre.' });
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
        .json({ error: 'Impossible de supprimer le paramètre.' });
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
