import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, StaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import {
  sanitizeUrl,
  parsePagination,
  sanitizeSearch,
  escapePostgrestValue,
} from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';

import { logger } from '../../../../utils/logger';

// Colonnes effectivement rendues par la page admin partenaires.
const PARTNER_COLUMNS =
  'id, name, description, category, logo_url, website_url, note, display_order, is_active, created_at, updated_at';

// Allowlist de tri (clé exposée → colonne DB).
const SORT_COLUMNS: Record<string, string> = {
  category: 'category',
  display_order: 'display_order',
  created_at: 'created_at',
  name: 'name',
};

const VALID_CATEGORIES = ['super', 'major', 'cultural'];
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
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-partners'))
    return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin!;

  if (req.method === 'GET') {
    const { category, active, orderBy, orderDir, includeTotal } = req.query;

    const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
      limit: 50,
      maxLimit: 200,
    });
    const search = sanitizeSearch(req.query.search);

    const wantTotal = includeTotal === '1' || includeTotal === 'true';

    // Tri serveur via allowlist ; par défaut on garde l'ordre historique
    // (category, display_order, created_at) tous ascendants.
    const sortKey =
      typeof orderBy === 'string' && orderBy in SORT_COLUMNS ? orderBy : null;
    const ascending = orderDir === 'desc' ? false : true;

    let query = admin.from('partners').select(PARTNER_COLUMNS, {
      count: wantTotal ? 'exact' : undefined,
    });

    if (category && typeof category === 'string') {
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: 'Invalid category.' });
      }
      query = query.eq('category', category);
    }
    if (active === 'true') {
      query = query.eq('is_active', true);
    } else if (active === 'false') {
      query = query.eq('is_active', false);
    }

    if (search) {
      const safe = escapePostgrestValue(search);
      query = query.ilike('name', `%${safe}%`);
    }

    if (sortKey) {
      query = query.order(SORT_COLUMNS[sortKey], { ascending });
    } else {
      query = query
        .order('category', { ascending: true })
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });
    }

    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error('[admin/partners] list error', error);
      return res.status(500).json({ error: 'Failed to load partners.' });
    }

    // Note: la table `partners` n'a pas de colonne tenant_id (table globale
    // de la conférence) → pas de scoping tenant ici.
    return res.status(200).json({
      items: data ?? [],
      total: typeof count === 'number' ? count : null,
    });
  }

  if (req.method === 'POST') {
    const body = req.body as PartnerPayload;
    if (!body?.name || !body.description || !body.category) {
      return res
        .status(400)
        .json({ error: 'Name, description and category are required.' });
    }

    if (!VALID_CATEGORIES.includes(body.category)) {
      return res.status(400).json({
        error: 'Invalid category. Allowed values: super, major, cultural.',
      });
    }

    const insertPayload = {
      name: body.name,
      description: body.description,
      category: body.category,
      logo_url: sanitizeUrl(body.logoUrl),
      website_url: sanitizeUrl(body.websiteUrl),
      note: body.note ?? null,
      display_order: body.displayOrder ?? 0,
      is_active: body.isActive ?? true,
    };

    const { data, error } = await admin
      .from('partners')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      logger.error('[admin/partners] create error', error);
      return res.status(500).json({ error: 'Failed to create the partner.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'settings_update',
        entity_type: 'partner',
        entity_id: data.id,
        payload: {
          name: data.name,
          category: data.category,
        },
      });
    }

    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
