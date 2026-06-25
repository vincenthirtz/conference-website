// pages/api/admin/moderation/blacklist/index.ts
//
// Feature Blacklist joueurs — Lot 2 (endpoints admin staff).
// Ref: docs/BLACKLIST_DESIGN.md.
//
// GET  → liste paginée/filtrée des entrées du tenant courant (recherche sur
//        battle_tag / display_name / discord_user_id, filtre `active`).
// POST → crée une entrée. Au moins un identifiant requis ; battle_tag normalisé
//        lowercase/trim à l'écriture. `banned_by` = auth.users id du staff,
//        `tenant_id` = tenant courant. Audit via logStaffAction('blacklist_add').
//
// La table `player_blacklist` est service-role only (RLS default-deny), donc on
// passe par supabaseAdmin et on scope explicitement par tenant_id.

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
  'id, tenant_id, battle_tag, display_name, discord_user_id, reason, notes, banned_by, active, created_at, updated_at';

// Body de création. Au moins un identifiant requis (CHECK DB miroir côté app
// pour renvoyer un 400 propre plutôt qu'une erreur Postgres brute).
const createSchema = z
  .object({
    battle_tag: z.string().trim().max(190).optional().nullable(),
    display_name: z.string().trim().max(190).optional().nullable(),
    discord_user_id: z
      .string()
      .trim()
      .regex(/^[0-9]{15,25}$/, 'discord_user_id invalide.')
      .optional()
      .nullable(),
    reason: z.string().trim().max(1000).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine(
    (v) =>
      !!(v.battle_tag?.trim() || v.display_name?.trim() || v.discord_user_id),
    {
      message:
        'Au moins un identifiant requis (battle_tag, display_name ou discord_user_id).',
    }
  );

/** Normalise une valeur texte optionnelle en `string | null` (vide → null). */
function nullableText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Normalise un battletag pour le stockage (lowercase + trim). */
function normalizeBattleTag(value: string | null | undefined): string | null {
  const trimmed = nullableText(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-blacklist')
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
    const { active } = req.query;

    let query = admin
      .from('player_blacklist')
      .select(SELECT_COLS, { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      const s = `%${escapePostgrestValue(search)}%`;
      query = query.or(
        `battle_tag.ilike.${s},display_name.ilike.${s},discord_user_id.ilike.${s}`
      );
    }

    if (active === 'true') {
      query = query.eq('active', true);
    } else if (active === 'false') {
      query = query.eq('active', false);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('[admin/blacklist] list error', error);
      return res.status(500).json({ error: 'Failed to load the blacklist.' });
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
      battle_tag: normalizeBattleTag(body.battle_tag),
      display_name: nullableText(body.display_name),
      discord_user_id: nullableText(body.discord_user_id),
      reason: nullableText(body.reason),
      notes: nullableText(body.notes),
      // banned_by = FK auth.users(id) → c'est l'auth user, pas le staff.id.
      banned_by: ctx.user.id,
      active: true,
    };

    const { data, error } = await admin
      .from('player_blacklist')
      .insert(insertPayload)
      .select(SELECT_COLS)
      .single();

    if (error) {
      logger.error('[admin/blacklist] create error', error);
      return res
        .status(500)
        .json({ error: 'Failed to create the blacklist entry.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'blacklist_add',
        entity_type: 'blacklist',
        entity_id: data.id,
        tenant_id: ctx.tenantId,
        payload: {
          battle_tag: insertPayload.battle_tag,
          display_name: insertPayload.display_name,
          discord_user_id: insertPayload.discord_user_id,
          reason: insertPayload.reason,
        },
      });
    }

    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'manager');
