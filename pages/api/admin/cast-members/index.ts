import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import {
  isValidUUID,
  sanitizeUrl,
  parsePagination,
  sanitizeSearch,
  escapePostgrestValue,
} from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';

import { logger } from '../../../../utils/logger';
import { revalidateAssociationPages } from '@/utils/revalidateAssociation';

// Colonnes effectivement rendues par la page admin (pas de select('*')).
const CAST_MEMBER_COLUMNS =
  'id, name, title, description, image_url, twitch_url, city, is_active, is_promo, sort_order, auth_user_id, created_at, updated_at';

// Allowlist de tri (clé exposée → colonne DB).
const SORT_COLUMNS: Record<string, string> = {
  sort_order: 'sort_order',
  name: 'name',
  created_at: 'created_at',
  updated_at: 'updated_at',
};
type CastMemberPayload = {
  name?: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  twitchUrl?: string | null;
  city?: string | null;
  isActive?: boolean;
  isPromo?: boolean;
  sortOrder?: number;
  authUserId?: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-cast-members'
    )
  )
    return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin!;

  if (req.method === 'GET') {
    const { limit, offset } = parsePagination(req, {
      limit: 50,
      maxLimit: 200,
    });
    const search = sanitizeSearch(req.query.search);
    const includeInactive = req.query.includeInactive === 'true';
    const includeTotal =
      req.query.includeTotal === '1' || req.query.includeTotal === 'true';

    // Filtre statut explicite : 'active' | 'inactive'. includeInactive=true =>
    // pas de filtre (compat héritée). Sinon statut détermine le filtre.
    const statusParam = Array.isArray(req.query.status)
      ? req.query.status[0]
      : req.query.status;

    // Tri serveur via allowlist ; défaut historique = sort_order ASC.
    const orderByParam = Array.isArray(req.query.orderBy)
      ? req.query.orderBy[0]
      : req.query.orderBy;
    const orderDirParam = Array.isArray(req.query.orderDir)
      ? req.query.orderDir[0]
      : req.query.orderDir;
    const orderColumn = SORT_COLUMNS[orderByParam ?? ''] ?? 'sort_order';
    const ascending =
      orderDirParam === 'desc'
        ? false
        : orderDirParam === 'asc'
          ? true
          : orderColumn === 'sort_order'; // défaut : sort_order ASC, autres DESC

    let query = admin
      .from('cast_members')
      .select(CAST_MEMBER_COLUMNS, {
        count: includeTotal ? 'exact' : undefined,
      })
      .eq('tenant_id', ctx.tenantId)
      // Les fiches internes (auto-provision admin/owner) ne sont pas des
      // casteurs publics : on les masque de l'UI de gestion des casteurs.
      // Les opérations CRUD par id (/[id]) ne sont pas affectées.
      .eq('is_internal', false);

    // Statut : 'active'/'inactive' prime, sinon compat includeInactive.
    if (statusParam === 'active') {
      query = query.eq('is_active', true);
    } else if (statusParam === 'inactive') {
      query = query.eq('is_active', false);
    } else if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    if (search) {
      const s = `%${escapePostgrestValue(search)}%`;
      query = query.or(`name.ilike.${s},title.ilike.${s},city.ilike.${s}`);
    }

    query = query
      .order(orderColumn, { ascending })
      // tri secondaire stable
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error('[admin/cast-members] list error', error);
      return res.status(500).json({ error: 'Failed to load cast members.' });
    }

    return res.status(200).json({
      items: data ?? [],
      total: typeof count === 'number' ? count : null,
    });
  }

  if (req.method === 'POST') {
    const body = req.body as CastMemberPayload;
    if (!body.name) {
      return res.status(400).json({ error: 'Name is required.' });
    }

    // Récupérer le prochain sort_order
    const { data: maxOrder } = await admin
      .from('cast_members')
      .select('sort_order')
      .eq('tenant_id', ctx.tenantId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxOrder?.sort_order ?? 0) + 1;

    let authUserId: string | null = null;
    if ('authUserId' in body && body.authUserId) {
      if (
        typeof body.authUserId !== 'string' ||
        !isValidUUID(body.authUserId)
      ) {
        return res.status(400).json({ error: 'authUserId invalide.' });
      }
      authUserId = body.authUserId;
    }

    const insertPayload = {
      tenant_id: ctx.tenantId,
      name: body.name.trim(),
      title: body.title?.trim() || null,
      description: body.description?.trim() || null,
      image_url: sanitizeUrl(body.imageUrl),
      twitch_url: sanitizeUrl(body.twitchUrl),
      city: body.city?.trim() || null,
      is_active: body.isActive ?? true,
      is_promo: body.isPromo ?? false,
      sort_order: body.sortOrder ?? nextOrder,
      auth_user_id: authUserId,
    };

    const { data, error } = await admin
      .from('cast_members')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      logger.error('[admin/cast-members] create error', error);
      const isCasterRoleError = /role=caster/i.test(error.message || '');
      const isUniqueError = error.code === '23505';
      if (isCasterRoleError) {
        return res.status(400).json({
          error: 'Le compte selectionne doit avoir le role staff "caster".',
        });
      }
      if (isUniqueError) {
        return res.status(409).json({
          error: 'Ce compte caster est deja lie a une autre fiche.',
        });
      }
      return res
        .status(500)
        .json({ error: 'Failed to create the cast member.' });
    }

    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'create_cast_member',
          entity_type: 'cast_member',
          entity_id: data.id,
          tenant_id: ctx.tenantId,
          payload: { name: data.name, isActive: data.is_active },
        });
      } catch (logErr) {
        logger.error('logStaffAction(create_cast_member) error:', logErr);
      }
    }

    await revalidateAssociationPages(res);
    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
