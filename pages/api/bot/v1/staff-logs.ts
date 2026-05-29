// GET /api/bot/v1/staff-logs
//
// Commande /logs (admin) : derniers staff_logs avec filtres optionnels.
// Query params :
//   - limit      : 1..100, defaut 20 (bot embed plus compact)
//   - action     : filtre exact sur la colonne action
//   - tournament : UUID de tournoi
//   - entityType : 'team' | 'tournament' | 'match' | 'stage' | etc.
//
// Reponse formattee pour la consommation Discord : on extrait les champs
// utiles (qui, quand, quoi) sans renvoyer le JSON brut du payload.
//
// Auth : x-api-key + actorDiscordUserId staff admin/owner.

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

function queryString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  // requireBotStaff lit actorDiscordUserId dans body OU query (on accepte
  // les deux ici puisque c'est un GET). Le helper actuel ne lit que body
  // donc on aplatit la query dans un body-like.
  const actorDiscordUserId =
    queryString(req.query.actorDiscordUserId) ??
    queryString(
      (req.body as Record<string, unknown> | null)?.actorDiscordUserId
    );
  const actor = await requireBotStaff(req, res, {
    actorDiscordUserId: actorDiscordUserId ?? '',
  });
  if (!actor) return;

  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const action = queryString(req.query.action);
  const tournamentId = queryString(req.query.tournament);
  const entityType = queryString(req.query.entityType);
  if (tournamentId && !isValidUUID(tournamentId)) {
    return res.status(400).json({ error: 'tournament invalide' });
  }

  let query = supabaseAdmin
    .from('staff_logs')
    .select(
      `id, action, entity_type, entity_id, tournament_id, payload, created_at,
       staff:staff!fk_staff_logs_staff(id, display_name, role)`
    )
    .eq('tenant_id', req.botContext.tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (action) query = query.eq('action', action);
  if (tournamentId) query = query.eq('tournament_id', tournamentId);
  if (entityType) query = query.eq('entity_type', entityType);

  const { data, error } = await query;
  if (error) {
    logger.error('[bot/staff-logs] query error', error);
    return res.status(500).json({ error: 'Erreur de lecture des logs' });
  }

  const logs = (data ?? []).map((row) => {
    const staffRel = Array.isArray((row as any).staff)
      ? (row as any).staff[0]
      : (row as any).staff;
    const payload = (row as any).payload ?? {};
    return {
      id: (row as any).id,
      createdAt: (row as any).created_at,
      action: (row as any).action,
      entityType: (row as any).entity_type ?? null,
      entityId: (row as any).entity_id ?? null,
      tournamentId: (row as any).tournament_id ?? null,
      via: typeof payload?.via === 'string' ? payload.via : 'website',
      summary:
        typeof payload?.action_type === 'string' ? payload.action_type : null,
      staff: staffRel
        ? {
            id: staffRel.id,
            displayName: staffRel.display_name ?? null,
            role: staffRel.role ?? null,
          }
        : null,
    };
  });

  return res.status(200).json({ logs, count: logs.length });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 30, key: 'bot-staff-logs' },
});
