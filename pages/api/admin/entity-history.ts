// pages/api/admin/entity-history.ts
//
// « Qui a touché à ça, et quand ? » — lot A6 de docs/PLAN-espace-admin.md.
//
// Le tiroir d'historique existait, faisait exactement ce qu'il faut… et
// seulement pour les MATCHS (`/api/admin/matches/[matchId]/history` +
// `MatchHistoryDrawer`). Pour une équipe, une joueuse, un tournoi ou un ticket,
// il fallait aller filtrer le journal global — c'est-à-dire changer d'écran et
// reconstruire mentalement le contexte qu'on venait de quitter.
//
// Cette route généralise la lecture à n'importe quelle entité journalisée.
// Elle ne remplace PAS la route match, qui fait davantage (elle rattrape aussi
// les logs de `game` reliés par `payload.match_id`) : les deux coexistent, et
// l'historique match reste le cas particulier qu'il est.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { formatStaffLog, type StaffLog } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

/**
 * Types d'entité exposés. Liste FERMÉE : `entity_type` est du texte libre en
 * base, et laisser un client choisir sa valeur ferait de cette route un
 * lecteur universel du journal, filtrable par n'importe quoi.
 */
export const HISTORY_ENTITY_TYPES = [
  'team',
  'tournament',
  'user',
  'support_ticket',
  'event_run',
] as const;

export type HistoryEntityType = (typeof HISTORY_ENTITY_TYPES)[number];

const LIMIT = 50;

export default withStaffRoute(handler, { permission: 'manage_settings' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'entity-history')
  ) {
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database unavailable' });
  }

  const type = String(req.query.type ?? '');
  const id = String(req.query.id ?? '');

  if (!(HISTORY_ENTITY_TYPES as readonly string[]).includes(type)) {
    return res.status(400).json({ error: 'Unknown entity type' });
  }
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid entity id' });
  }

  const { data, error } = await supabaseAdmin
    .from('staff_logs')
    .select(
      `
      id, created_at, staff_id, action, entity_type, entity_id,
      tournament_id, payload,
      staff:staff!fk_staff_logs_staff(id, auth_user_id, role, display_name, avatar_url)
      `
    )
    .eq('tenant_id', ctx.tenantId)
    .eq('entity_type', type)
    .eq('entity_id', id)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (error) {
    logger.error('[entity-history] read error', error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const logs = ((data ?? []) as unknown as StaffLog[]).map((row) =>
    formatStaffLog(row)
  );

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({ entityType: type, entityId: id, logs });
}
