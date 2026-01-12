import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  getStaffContextFromRequest,
  hasAtLeastRole,
  logStaffAction,
} from '@/utils/staff';

type UpdatePayload = {
  status?: 'new' | 'read' | 'contacted' | 'negotiating' | 'accepted' | 'declined' | 'archived';
  adminNotes?: string;
};

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

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID demande requis.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('partnership_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Demande introuvable.' });
    }

    // Mark as read if new
    if (data.status === 'new') {
      await admin
        .from('partnership_requests')
        .update({ status: 'read', read_at: new Date().toISOString() })
        .eq('id', id);
      data.status = 'read';
      data.read_at = new Date().toISOString();
    }

    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const body = req.body as UpdatePayload;
    const updates: Record<string, unknown> = {};

    if (body.status !== undefined) {
      const validStatuses = ['new', 'read', 'contacted', 'negotiating', 'accepted', 'declined', 'archived'];
      if (!validStatuses.includes(body.status)) {
        return res.status(400).json({ error: 'Statut invalide.' });
      }
      updates.status = body.status;

      // Set timestamp for status changes
      if (body.status === 'read' && !updates.read_at) {
        updates.read_at = new Date().toISOString();
      }
      if (body.status === 'contacted') {
        updates.contacted_at = new Date().toISOString();
      }
    }

    if (body.adminNotes !== undefined) {
      updates.admin_notes = body.adminNotes || null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucune modification fournie.' });
    }

    const { data, error } = await admin
      .from('partnership_requests')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admin/partnership-requests] update error', error);
      return res
        .status(500)
        .json({ error: 'Impossible de mettre à jour la demande.', detail: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Demande introuvable.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'settings_update' as any,
        entity_type: 'partnership_request',
        entity_id: id,
        payload: { updates },
      });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { data: existing } = await admin
      .from('partnership_requests')
      .select('id, company_name')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Demande introuvable.' });
    }

    const { error } = await admin.from('partnership_requests').delete().eq('id', id);

    if (error) {
      console.error('[admin/partnership-requests] delete error', error);
      return res
        .status(500)
        .json({ error: 'Impossible de supprimer la demande.', detail: error.message });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'settings_update' as any,
        entity_type: 'partnership_request',
        entity_id: id,
        payload: { companyName: existing.company_name, deleted: true },
      });
    }

    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET,PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
