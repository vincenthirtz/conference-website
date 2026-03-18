import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, StaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';

type AdherentPayload = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  joinDate?: string;
  currentYear?: number;
  paymentStatus?: 'pending' | 'partial' | 'paid' | 'exempt' | 'overdue';
  paymentAmount?: number;
  paymentDate?: string;
  paymentMethod?: 'cash' | 'check' | 'transfer' | 'card' | 'helloasso' | 'other' | null;
  paymentReference?: string;
  isActive?: boolean;
  role?: 'member' | 'volunteer' | 'board' | 'president' | 'treasurer' | 'secretary';
  notes?: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: StaffContext
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-adherents-id')) return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Member ID required.' });
  }

  // GET - Récupérer un adhérent
  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('adherents')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    // Récupérer l'historique des paiements
    const { data: payments } = await admin
      .from('adherent_payments')
      .select('*')
      .eq('adherent_id', id)
      .order('year', { ascending: false });

    return res.status(200).json({ ...data, payments: payments || [] });
  }

  // PATCH - Mettre à jour un adhérent
  if (req.method === 'PATCH') {
    const body = req.body as AdherentPayload;
    const updates: Record<string, unknown> = {};

    if (body.firstName !== undefined) updates.first_name = body.firstName.trim();
    if (body.lastName !== undefined) updates.last_name = body.lastName.trim();
    if (body.email !== undefined) {
      const newEmail = body.email.toLowerCase().trim();
      // Vérifier que l'email n'existe pas déjà pour un autre adhérent
      const { data: existing } = await admin
        .from('adherents')
        .select('id')
        .eq('email', newEmail)
        .neq('id', id)
        .maybeSingle();

      if (existing) {
        return res
          .status(400)
          .json({ error: 'Another member already uses this email.' });
      }
      updates.email = newEmail;
    }
    if (body.phone !== undefined) updates.phone = body.phone?.trim() || null;
    if (body.birthDate !== undefined) updates.birth_date = body.birthDate || null;
    if (body.address !== undefined) updates.address = body.address?.trim() || null;
    if (body.city !== undefined) updates.city = body.city?.trim() || null;
    if (body.postalCode !== undefined) updates.postal_code = body.postalCode?.trim() || null;
    if (body.country !== undefined) updates.country = body.country?.trim() || 'France';
    if (body.joinDate !== undefined) updates.join_date = body.joinDate;
    if (body.currentYear !== undefined) updates.current_year = body.currentYear;
    if (body.paymentStatus !== undefined) updates.payment_status = body.paymentStatus;
    if (body.paymentAmount !== undefined) updates.payment_amount = body.paymentAmount;
    if (body.paymentDate !== undefined) updates.payment_date = body.paymentDate || null;
    if (body.paymentMethod !== undefined) updates.payment_method = body.paymentMethod || null;
    if (body.paymentReference !== undefined) updates.payment_reference = body.paymentReference?.trim() || null;
    if (body.isActive !== undefined) updates.is_active = body.isActive;
    if (body.role !== undefined) updates.role = body.role;
    if (body.notes !== undefined) updates.notes = body.notes?.trim() || null;

    updates.updated_by = ctx.staff?.id || null;

    if (Object.keys(updates).length === 1) {
      return res.status(400).json({ error: 'No changes provided.' });
    }

    const { data, error } = await admin
      .from('adherents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admin/adherents] update error', error);
      return res
        .status(500)
        .json({ error: 'Failed to update the member.' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'adherent',
        entity_id: id,
        payload: {
          name: `${data.first_name} ${data.last_name}`,
          updates: Object.keys(updates).filter((k) => k !== 'updated_by'),
          action: 'update',
        },
      });
    }

    return res.status(200).json(data);
  }

  // DELETE - Supprimer un adhérent
  if (req.method === 'DELETE') {
    const { data: existing } = await admin
      .from('adherents')
      .select('id, first_name, last_name, email')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    const { error } = await admin.from('adherents').delete().eq('id', id);

    if (error) {
      console.error('[admin/adherents] delete error', error);
      return res
        .status(500)
        .json({ error: 'Failed to delete the member.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'adherent',
        entity_id: id,
        payload: {
          name: `${existing.first_name} ${existing.last_name}`,
          email: existing.email,
          action: 'delete',
        },
      });
    }

    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET,PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
