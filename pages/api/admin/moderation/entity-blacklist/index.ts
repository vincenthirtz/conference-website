// pages/api/admin/moderation/entity-blacklist/index.ts
//
// Feature Blacklist entités (équipes / structures-assos) — endpoints admin
// staff, miroir des endpoints joueurs (moderation/blacklist).
// Ref: docs/BLACKLIST_DESIGN.md (section « Extension : blacklist entités »).
//
// GET  → liste paginée/filtrée des entrées du tenant courant (recherche sur
//        name, filtres `active` et `entity_type`).
// POST → crée une entrée. `entity_type` ('team' | 'org') et `name` requis.
//        `banned_by` = auth.users id du staff, `tenant_id` = tenant courant.
//        Audit via logStaffAction('entity_blacklist_add').
//
// La table `entity_blacklist` est service-role only (RLS default-deny), donc
// on passe par supabaseAdmin et on scope explicitement par tenant_id.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import {
  parsePagination,
  sanitizeSearch,
  escapePostgrestValue,
} from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { formatZodError } from '@/utils/validation';
import { logger } from '@/utils/logger';

const SELECT_COLS =
  'id, tenant_id, entity_type, name, reason, notes, banned_by, active, created_at, updated_at';

// Body de création. entity_type + name requis (CHECK DB miroir côté app pour
// renvoyer un 400 propre plutôt qu'une erreur Postgres brute).
const createSchema = z.object({
  entity_type: z.enum(['team', 'org']),
  name: z.string().trim().min(1, 'Le nom est requis.').max(190),
  reason: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

/** Normalise une valeur texte optionnelle en `string | null` (vide → null). */
function nullableText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

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
      'admin-entity-blacklist'
    )
  )
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  if (req.method === 'GET') {
    const { limit, offset } = parsePagination(req, { limit: 50 });
    const search = sanitizeSearch(req.query.search);
    const { active, entity_type: entityType } = req.query;

    let query = admin
      .from('entity_blacklist')
      .select(SELECT_COLS, { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike('name', `%${escapePostgrestValue(search)}%`);
    }

    if (active === 'true') {
      query = query.eq('active', true);
    } else if (active === 'false') {
      query = query.eq('active', false);
    }

    if (entityType === 'team' || entityType === 'org') {
      query = query.eq('entity_type', entityType);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('[admin/entity-blacklist] list error', error);
      return res
        .status(500)
        .json({ error: 'Failed to load the entity blacklist.' });
    }

    return res.status(200).json({
      items: data ?? [],
      total: typeof count === 'number' ? count : null,
    });
  }

  if (req.method === 'POST') {
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: formatZodError(parsed.error),
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    const body = parsed.data;

    const insertPayload = {
      tenant_id: ctx.tenantId,
      entity_type: body.entity_type,
      // Nom stocké tel que saisi (trimé) — le matching normalise à la lecture
      // (cf. utils/moderation/entityBlacklist.ts).
      name: body.name,
      reason: nullableText(body.reason),
      notes: nullableText(body.notes),
      // banned_by = FK auth.users(id) → c'est l'auth user, pas le staff.id.
      banned_by: ctx.user.id,
      active: true,
    };

    const { data, error } = await admin
      .from('entity_blacklist')
      .insert(insertPayload)
      .select(SELECT_COLS)
      .single();

    if (error) {
      logger.error('[admin/entity-blacklist] create error', error);
      return res
        .status(500)
        .json({ error: 'Failed to create the entity blacklist entry.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'entity_blacklist_add',
        entity_type: 'entity_blacklist',
        entity_id: data.id,
        tenant_id: ctx.tenantId,
        payload: {
          entity_type: insertPayload.entity_type,
          name: insertPayload.name,
          reason: insertPayload.reason,
        },
      });
    }

    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, { permission: 'moderate_support' });
