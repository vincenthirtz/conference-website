import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, StaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { sanitizeSearch } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';

type AdherentPayload = {
  firstName: string;
  lastName: string;
  email: string;
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
  paymentMethod?: 'cash' | 'check' | 'transfer' | 'card' | 'helloasso' | 'other';
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
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-adherents')) return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  // GET - Liste des adhérents
  if (req.method === 'GET') {
    const {
      limit = '100',
      paymentStatus,
      year,
      role,
      active,
    } = req.query;
    const limitNum = Math.max(1, Math.min(500, Number(limit) || 100));
    const search = sanitizeSearch(req.query.search);

    let query = admin
      .from('adherents')
      .select('*')
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })
      .limit(limitNum);

    // Filtre par recherche (nom, prénom, email)
    if (search) {
      const searchTerm = `%${search}%`;
      query = query.or(
        `last_name.ilike.${searchTerm},first_name.ilike.${searchTerm},email.ilike.${searchTerm},member_number.ilike.${searchTerm}`
      );
    }

    // Filtre par statut de paiement
    if (paymentStatus && typeof paymentStatus === 'string') {
      query = query.eq('payment_status', paymentStatus);
    }

    // Filtre par année
    if (year && typeof year === 'string') {
      query = query.eq('current_year', parseInt(year, 10));
    }

    // Filtre par rôle
    if (role && typeof role === 'string') {
      query = query.eq('role', role);
    }

    // Filtre par actif/inactif
    if (active === 'true') {
      query = query.eq('is_active', true);
    } else if (active === 'false') {
      query = query.eq('is_active', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admin/adherents] list error', error);
      return res
        .status(500)
        .json({ error: 'Failed to load members.' });
    }

    // Récupérer les stats
    const currentYear = new Date().getFullYear();
    const { data: stats } = await admin
      .from('adherents')
      .select('payment_status, current_year')
      .eq('is_active', true);

    const statsData = {
      total: stats?.length || 0,
      currentYear: stats?.filter((a) => a.current_year === currentYear).length || 0,
      paid: stats?.filter((a) => a.payment_status === 'paid').length || 0,
      pending: stats?.filter((a) => a.payment_status === 'pending').length || 0,
      overdue: stats?.filter((a) => a.payment_status === 'overdue').length || 0,
    };

    return res.status(200).json({ items: data ?? [], stats: statsData });
  }

  // POST - Créer un adhérent
  if (req.method === 'POST') {
    const body = req.body as AdherentPayload;

    if (!body?.firstName?.trim() || !body?.lastName?.trim() || !body?.email?.trim()) {
      return res
        .status(400)
        .json({ error: 'First name, last name and email are required.' });
    }

    // Vérifier que l'email n'existe pas déjà
    const { data: existing } = await admin
      .from('adherents')
      .select('id')
      .eq('email', body.email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return res
        .status(400)
        .json({ error: 'A member with this email already exists.' });
    }

    const insertPayload = {
      first_name: body.firstName.trim(),
      last_name: body.lastName.trim(),
      email: body.email.toLowerCase().trim(),
      phone: body.phone?.trim() || null,
      birth_date: body.birthDate || null,
      address: body.address?.trim() || null,
      city: body.city?.trim() || null,
      postal_code: body.postalCode?.trim() || null,
      country: body.country?.trim() || 'France',
      join_date: body.joinDate || new Date().toISOString().split('T')[0],
      current_year: body.currentYear || new Date().getFullYear(),
      payment_status: body.paymentStatus || 'pending',
      payment_amount: body.paymentAmount || 0,
      payment_date: body.paymentDate || null,
      payment_method: body.paymentMethod || null,
      payment_reference: body.paymentReference?.trim() || null,
      is_active: body.isActive ?? true,
      role: body.role || 'member',
      notes: body.notes?.trim() || null,
      created_by: ctx.staff?.id || null,
    };

    const { data, error } = await admin
      .from('adherents')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('[admin/adherents] create error', error);
      return res
        .status(500)
        .json({ error: 'Failed to create the member.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'adherent',
        entity_id: data.id,
        payload: {
          name: `${data.first_name} ${data.last_name}`,
          email: data.email,
          action: 'create',
        },
      });
    }

    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
