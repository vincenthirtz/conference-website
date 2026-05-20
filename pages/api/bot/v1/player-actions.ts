// GET /api/bot/v1/player-actions
//
// Audit trail des actions joueuses depuis le bot, pour le support staff.
// Query params filtrables (ANDed) :
//   - actorDiscordUserId    filtre par acteur (Discord ID)
//   - actorAuthUserId       filtre par acteur (UUID auth)
//   - targetDiscordUserId   filtre par cible (Discord ID)
//   - targetAuthUserId      filtre par cible (UUID auth)
//   - action                filtre exact sur la colonne action
//   - entityType            filtre exact ('team', 'match', etc.)
//   - since                 ISO 8601, ne retourne que les entries posterieures
//   - limit                 1..200, defaut 50
//
// Auth : x-api-key + actorDiscordUserId staff admin/owner (lu en query).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

function queryString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // requireBotStaff lit dans body OU query — ici on est en GET donc query.
  const actorDiscordUserId =
    queryString(req.query.actorDiscordUserId) ??
    queryString(
      (req.body as Record<string, unknown> | null)?.actorDiscordUserId
    );
  // On detecte les double-usage : si on filtre par actor, ce n'est pas le
  // meme champ que le staff acteur de la requete. On reserve la query var
  // 'filterActorDiscordUserId' pour le filtre.
  // Mais pour rester simple : si actorDiscordUserId est present ET staff,
  // on prend ce Discord comme staff. Le filtre par acteur passe par
  // filterActorDiscordUserId.
  const staffActorDiscordUserId =
    queryString(req.query.staffDiscordUserId) ?? actorDiscordUserId ?? '';
  const staff = await requireBotStaff(req, res, {
    actorDiscordUserId: staffActorDiscordUserId,
  });
  if (!staff) return;

  // Filtres dedies (different de l'actor staff au-dessus)
  const filterActorDiscord =
    queryString(req.query.filterActorDiscordUserId) ?? null;
  const filterActorAuth = queryString(req.query.actorAuthUserId);
  const filterTargetDiscord = queryString(req.query.targetDiscordUserId);
  const filterTargetAuth = queryString(req.query.targetAuthUserId);
  const filterAction = queryString(req.query.action);
  const filterEntityType = queryString(req.query.entityType);
  const since = queryString(req.query.since);

  if (filterActorDiscord && !DISCORD_ID_RE.test(filterActorDiscord)) {
    return res
      .status(400)
      .json({ error: 'filterActorDiscordUserId invalide' });
  }
  if (filterTargetDiscord && !DISCORD_ID_RE.test(filterTargetDiscord)) {
    return res.status(400).json({ error: 'targetDiscordUserId invalide' });
  }
  if (filterActorAuth && !isValidUUID(filterActorAuth)) {
    return res.status(400).json({ error: 'actorAuthUserId invalide' });
  }
  if (filterTargetAuth && !isValidUUID(filterTargetAuth)) {
    return res.status(400).json({ error: 'targetAuthUserId invalide' });
  }
  if (since && Number.isNaN(Date.parse(since))) {
    return res
      .status(400)
      .json({ error: 'since invalide (ISO 8601 attendu)' });
  }

  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  let query = supabaseAdmin
    .from('bot_player_actions')
    .select(
      `id, actor_auth_user_id, actor_discord_user_id, action, entity_type,
       entity_id, target_auth_user_id, target_discord_user_id, payload,
       created_at`
    )
    .eq('tenant_id', req.botContext!.tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (filterActorDiscord)
    query = query.eq('actor_discord_user_id', filterActorDiscord);
  if (filterActorAuth) query = query.eq('actor_auth_user_id', filterActorAuth);
  if (filterTargetDiscord)
    query = query.eq('target_discord_user_id', filterTargetDiscord);
  if (filterTargetAuth)
    query = query.eq('target_auth_user_id', filterTargetAuth);
  if (filterAction) query = query.eq('action', filterAction);
  if (filterEntityType) query = query.eq('entity_type', filterEntityType);
  if (since) query = query.gte('created_at', since);

  const { data, error } = await query;
  if (error) {
    logger.error('[bot/player-actions] query error', error);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }

  const actions = (data ?? []).map((row) => {
    const r = row as {
      id: number;
      actor_auth_user_id: string;
      actor_discord_user_id: string;
      action: string;
      entity_type: string | null;
      entity_id: string | null;
      target_auth_user_id: string | null;
      target_discord_user_id: string | null;
      payload: Record<string, unknown> | null;
      created_at: string;
    };
    return {
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      actor: {
        authUserId: r.actor_auth_user_id,
        discordUserId: r.actor_discord_user_id,
      },
      target: r.target_auth_user_id
        ? {
            authUserId: r.target_auth_user_id,
            discordUserId: r.target_discord_user_id,
          }
        : null,
      payload: r.payload,
      createdAt: r.created_at,
    };
  });

  return res.status(200).json({ actions, count: actions.length });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 30, key: 'bot-player-actions' },
});
