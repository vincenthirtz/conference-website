import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, StaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import {
  parsePagination,
  sanitizeSearch,
  escapePostgrestValue,
} from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';

import { logger } from '../../../../utils/logger';
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
  paymentMethod?:
    | 'cash'
    | 'check'
    | 'transfer'
    | 'card'
    | 'helloasso'
    | 'other';
  paymentReference?: string;
  isActive?: boolean;
  role?:
    | 'member'
    | 'volunteer'
    | 'board'
    | 'president'
    | 'treasurer'
    | 'secretary';
  notes?: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: StaffContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-adherents')
  )
    return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  // GET - Liste des adhérents
  if (req.method === 'GET') {
    const { paymentStatus, year, role, active, orderBy, orderDir } = req.query;

    const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
      limit: 50,
    });
    const search = sanitizeSearch(req.query.search);

    const wantTotal =
      req.query.includeTotal === '1' || req.query.includeTotal === 'true';

    // Allowlist des colonnes triables (défaut: last_name asc, first_name asc).
    const SORTABLE = new Set([
      'last_name',
      'first_name',
      'member_number',
      'join_date',
      'current_year',
      'payment_status',
      'payment_amount',
      'payment_date',
      'role',
      'created_at',
    ]);
    const sortCol =
      typeof orderBy === 'string' && SORTABLE.has(orderBy) ? orderBy : null;
    const ascending = orderDir === 'desc' ? false : true;

    const SELECT_COLS =
      'id, member_number, first_name, last_name, email, phone, join_date, current_year, payment_status, payment_amount, payment_date, payment_method, is_active, role, created_at';

    let query = admin
      .from('adherents')
      .select(SELECT_COLS, { count: wantTotal ? 'exact' : undefined });

    // Filtre par recherche (nom, prénom, email, n° adhérent)
    if (search) {
      const s = `%${escapePostgrestValue(search)}%`;
      query = query.or(
        `last_name.ilike.${s},first_name.ilike.${s},email.ilike.${s},member_number.ilike.${s}`
      );
    }

    // Filtre par statut de paiement
    if (paymentStatus && typeof paymentStatus === 'string') {
      query = query.eq('payment_status', paymentStatus);
    }

    // Filtre par année
    if (year && typeof year === 'string') {
      const parsedYear = parseInt(year, 10);
      if (!Number.isNaN(parsedYear)) {
        query = query.eq('current_year', parsedYear);
      }
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

    // Tri serveur
    if (sortCol) {
      query = query.order(sortCol, { ascending });
    } else {
      query = query
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true });
    }

    // Pagination par offset
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error('[admin/adherents] list error', error);
      return res.status(500).json({ error: 'Failed to load members.' });
    }

    // Stats : 5 count head queries légères en parallèle (pas de full-scan JS).
    const currentYear = new Date().getFullYear();
    const [totalRes, currentYearRes, paidRes, pendingRes, overdueRes] =
      await Promise.all([
        admin
          .from('adherents')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
        admin
          .from('adherents')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('current_year', currentYear),
        admin
          .from('adherents')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('payment_status', 'paid'),
        admin
          .from('adherents')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('payment_status', 'pending'),
        admin
          .from('adherents')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('payment_status', 'overdue'),
      ]);

    const statsData = {
      total: totalRes.count ?? 0,
      currentYear: currentYearRes.count ?? 0,
      paid: paidRes.count ?? 0,
      pending: pendingRes.count ?? 0,
      overdue: overdueRes.count ?? 0,
    };

    return res.status(200).json({
      items: data ?? [],
      stats: statsData,
      total: typeof count === 'number' ? count : null,
    });
  }

  // POST - Créer un adhérent
  if (req.method === 'POST') {
    const body = req.body as AdherentPayload;

    if (
      !body?.firstName?.trim() ||
      !body?.lastName?.trim() ||
      !body?.email?.trim()
    ) {
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
      logger.error('[admin/adherents] create error', error);
      return res.status(500).json({ error: 'Failed to create the member.' });
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

export default withStaffRoute(handler, {
  permission: 'manage_communications',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  scope: 'platform',
});
