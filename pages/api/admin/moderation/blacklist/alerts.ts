// pages/api/admin/moderation/blacklist/alerts.ts
//
// Feature Blacklist joueurs — lecture admin du journal des alertes de détection.
// Ref: docs/BLACKLIST_DESIGN.md.
//
// GET → liste paginée (curseur descendant sur created_at) des alertes du tenant
//       courant. Une alerte est enregistrée soit par le bot (scan / arrivée d'un
//       membre, via POST /api/bot/v1/moderation/blacklist-alert), soit par le
//       flux d'inscription site (source='registration', via alertIfBlacklisted).
//
// La table `blacklist_alerts` est service-role only (RLS default-deny) → on
// passe par supabaseAdmin et on scope explicitement par tenant_id. Lecture
// réservée au rôle `manager` (aligné sur l'endpoint blacklist admin existant).

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { formatZodError } from '@/utils/validation';
import { logger } from '@/utils/logger';

const SELECT_COLS =
  'id, created_at, discord_user_id, battle_tag, display_name, matched_on, strength, source, context, reason, blacklist_entry_id';

// Query : tous les champs proviennent de req.query (string|string[]). On valide
// via zod (parse + extraction typée) plutôt qu'avec des guards inline — meilleur
// pour le suivi de taint statique.
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  before: z
    .string()
    .trim()
    .refine((s) => Number.isFinite(Date.parse(s)), 'Curseur invalide.')
    .optional(),
  strength: z.enum(['strong', 'soft']).optional(),
  source: z.enum(['bot_scan', 'bot_member_add', 'registration']).optional(),
  discordUserId: z.string().trim().min(1).max(32).optional(),
});

type AlertRow = {
  id: string;
  created_at: string;
  discord_user_id: string;
  battle_tag: string | null;
  display_name: string | null;
  matched_on: string;
  strength: string;
  source: string;
  context: string | null;
  reason: string | null;
  blacklist_entry_id: string | null;
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
      'admin-blacklist-alerts'
    )
  )
    return;

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

  const parsed = querySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: formatZodError(parsed.error),
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const q = parsed.data;

  // On lit limit+1 pour savoir s'il reste une page (curseur = created_at de la
  // dernière row renvoyée). Tri descendant strict.
  let query = admin
    .from('blacklist_alerts')
    .select(SELECT_COLS)
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(q.limit + 1);

  if (q.before) {
    query = query.lt('created_at', new Date(q.before).toISOString());
  }
  if (q.strength) {
    query = query.eq('strength', q.strength);
  }
  if (q.source) {
    query = query.eq('source', q.source);
  }
  if (q.discordUserId) {
    query = query.eq('discord_user_id', q.discordUserId);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[admin/blacklist/alerts] list error', error);
    return res
      .status(500)
      .json({ error: 'Failed to load the blacklist alerts.' });
  }

  const rows = (data ?? []) as AlertRow[];
  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const nextCursor =
    hasMore && page.length > 0 ? page[page.length - 1].created_at : null;

  const alerts = page.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    discordUserId: r.discord_user_id,
    battleTag: r.battle_tag,
    displayName: r.display_name,
    matchedOn: r.matched_on,
    strength: r.strength,
    source: r.source,
    context: r.context,
    reason: r.reason,
    blacklistEntryId: r.blacklist_entry_id,
  }));

  return res.status(200).json({ alerts, nextCursor });
}

export default withStaffRoute(handler, 'admin');
