// pages/api/admin/partnership-requests/index.ts
// Admin: liste paginée/filtrée des demandes de partenariat.
//
// - GET : liste paginée des demandes + compteurs par statut (head counts).
//
// Query params :
//   - status?: string            → filtre exact sur le statut
//   - category?: string          → filtre exact sur la catégorie
//   - search?: string            → ilike sur company_name, contact_name, email
//   - orderBy?: "created_at"     → colonne de tri (allowlist, défaut created_at)
//   - orderDir?: "asc" | "desc"  → sens du tri (défaut desc)
//   - limit?: number (default 50)
//   - offset?: number (default 0)
//   - includeTotal?: "1" | "true" → inclut le count total (exact)
//
// Réponse :
// {
//   items: PartnershipRequestRow[],
//   counts: Record<string, number>,   // compteur par statut (head counts bornés)
//   total: number | null
// }
//
// Note tenant : la table `partnership_requests` n'a PAS de colonne tenant_id
// (voir database/migrations/create_partners_tables.sql) — données mono-tenant,
// aucun scope tenant appliqué.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, StaffContext } from '@/utils/staff';
import {
  parsePagination,
  sanitizeSearch,
  escapePostgrestValue,
} from '@/utils/apiHelpers';

import { logger } from '../../../../utils/logger';

// Colonnes de tri autorisées
const ORDER_BY_ALLOWLIST = new Set(['created_at']);

// Colonnes explicitement consommées par la page de liste
const SELECT_COLUMNS =
  'id, company_name, contact_name, email, phone, category, message, budget_range, status, created_at';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  _ctx: StaffContext
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { status, category, orderBy, orderDir, includeTotal } = req.query;

  const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
    limit: 50,
  });
  const search = sanitizeSearch(req.query.search);

  const wantTotal = includeTotal === '1' || includeTotal === 'true';

  const sortColumn =
    typeof orderBy === 'string' && ORDER_BY_ALLOWLIST.has(orderBy)
      ? orderBy
      : 'created_at';
  const ascending = orderDir === 'asc';

  let query = admin
    .from('partnership_requests')
    .select(SELECT_COLUMNS, {
      count: wantTotal ? 'exact' : undefined,
    })
    .order(sortColumn, { ascending })
    .range(offsetNum, offsetNum + limitNum - 1);

  if (status && typeof status === 'string') {
    query = query.eq('status', status);
  }
  if (category && typeof category === 'string') {
    query = query.eq('category', category);
  }
  if (search) {
    const s = `%${escapePostgrestValue(search)}%`;
    query = query.or(
      `company_name.ilike.${s},contact_name.ilike.${s},email.ilike.${s}`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error('[admin/partnership-requests] list error', error);
    return res.status(500).json({ error: 'Failed to load requests.' });
  }

  // Compteurs par statut : une seule lecture de la colonne `status`, agrégée
  // en JS. La table partnership_requests est mono-tenant et de faible volume
  // (demandes entrantes), et `status` est couvert par
  // idx_partnership_requests_status_date → index-only scan. Un seul aller-retour,
  // clés dynamiques (n'importe quel statut présent), plus efficace que N head
  // counts. Les compteurs reflètent l'ensemble des demandes (hors filtres de
  // liste), pour alimenter les badges de l'UI.
  const { data: statusRows } = await admin
    .from('partnership_requests')
    .select('status');

  const counts: Record<string, number> = {};
  for (const row of (statusRows ?? []) as Array<{ status: string | null }>) {
    const key = row.status ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return res.status(200).json({
    items: data ?? [],
    counts,
    total: typeof count === 'number' ? count : null,
  });
}

export default withStaffRoute(handler, {
  permission: 'manage_communications',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  scope: 'platform',
});
