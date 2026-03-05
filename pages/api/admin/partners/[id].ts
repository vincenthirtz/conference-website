import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { getStaffContextFromRequest, hasAtLeastRole } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

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
    return res.status(400).json({ error: 'ID partenaire requis.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('partners')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Partenaire introuvable.' });
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
          .json({ error: 'Catégorie invalide. Valeurs acceptées: super, major, cultural.' });
      }
      updates.category = body.category;
    }
    if (body.logoUrl !== undefined) updates.logo_url = body.logoUrl || null;
    if (body.websiteUrl !== undefined) updates.website_url = body.websiteUrl || null;
    if (body.note !== undefined) updates.note = body.note || null;
    if (body.displayOrder !== undefined) updates.display_order = body.displayOrder;
    if (body.isActive !== undefined) updates.is_active = body.isActive;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucune modification fournie.' });
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
        .json({ error: 'Impossible de mettre à jour le partenaire.', detail: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Partenaire introuvable.' });
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
      return res.status(404).json({ error: 'Partenaire introuvable.' });
    }

    const { error } = await admin.from('partners').delete().eq('id', id);

    if (error) {
      console.error('[admin/partners] delete error', error);
      return res
        .status(500)
        .json({ error: 'Impossible de supprimer le partenaire.', detail: error.message });
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
