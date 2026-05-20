// GET /api/bot/v1/players/by-discord/[discordUserId]/actions
//
// Lit l'audit trail bot d'une joueuse (table bot_player_actions). Sert au
// support pour retracer ce qu'une joueuse a fait/subi via le bot.
//
// Auth :
//   - self-service : actorDiscordUserId == discordUserId dans l'URL
//     (une joueuse peut voir son propre log).
//   - staff override : actor est admin/owner -> peut voir n'importe quel log.
//   - sinon -> 403.
//
// Query :
//   - actorDiscordUserId : requis (sert a l'auth ci-dessus)
//   - role               : 'actor' (defaut) ou 'target'. Filtre les rows ou
//                          la joueuse est respectivement l'acteur ou la cible.
//                          'both' renvoie les 2.
//   - action             : filtre exact (ex 'invite_accept')
//   - limit              : 1..100, defaut 25
//   - since              : ISO 8601, filtre created_at >= since

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { resolveActorPlayer, resolveActorStaff } from '@/utils/botActor';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;
const STAFF_PRIVILEGED = new Set(['admin', 'owner']);
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const VALID_ROLES = new Set(['actor', 'target', 'both']);

function queryString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.discordUserId;
  const targetDiscordUserId = Array.isArray(raw) ? raw[0] : raw;
  if (!targetDiscordUserId || !DISCORD_ID_RE.test(targetDiscordUserId)) {
    return res.status(400).json({ error: 'discordUserId invalide' });
  }

  const actorDiscordUserId = queryString(req.query.actorDiscordUserId);
  if (!actorDiscordUserId || !DISCORD_ID_RE.test(actorDiscordUserId)) {
    return res.status(400).json({ error: 'actorDiscordUserId requis' });
  }

  // Auth : self OR staff admin/owner.
  const isSelf = actorDiscordUserId === targetDiscordUserId;
  let isStaff = false;
  if (!isSelf) {
    const staffActor = await resolveActorStaff(actorDiscordUserId);
    if (staffActor.role && STAFF_PRIVILEGED.has(staffActor.role)) {
      isStaff = true;
    } else {
      return res.status(403).json({
        error:
          "Tu ne peux voir que ton propre audit log (sauf si tu es admin/owner).",
      });
    }
  }

  // Resolve target -> auth_user_id pour le query.
  const target = await resolveActorPlayer(targetDiscordUserId);
  if (!target) {
    return res
      .status(404)
      .json({ error: 'Compte Discord cible non lié au site.' });
  }

  const rawRole = queryString(req.query.role) ?? 'actor';
  const role = rawRole.toLowerCase();
  if (!VALID_ROLES.has(role)) {
    return res
      .status(400)
      .json({ error: `role invalide. Valeurs : ${[...VALID_ROLES].join(', ')}.` });
  }

  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const actionFilter = queryString(req.query.action);
  const sinceFilter = queryString(req.query.since);
  if (sinceFilter && Number.isNaN(Date.parse(sinceFilter))) {
    return res.status(400).json({ error: 'since invalide (ISO 8601 attendu)' });
  }

  let query = supabaseAdmin
    .from('bot_player_actions')
    .select(
      `id, created_at, action, entity_type, entity_id,
       actor_auth_user_id, actor_discord_user_id,
       target_auth_user_id, target_discord_user_id, payload`
    )
    .eq('tenant_id', req.botContext!.tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (role === 'actor') {
    query = query.eq('actor_auth_user_id', target.authUserId);
  } else if (role === 'target') {
    query = query.eq('target_auth_user_id', target.authUserId);
  } else {
    // 'both' : actor OR target
    query = query.or(
      `actor_auth_user_id.eq.${target.authUserId},target_auth_user_id.eq.${target.authUserId}`
    );
  }
  if (actionFilter) query = query.eq('action', actionFilter);
  if (sinceFilter) query = query.gte('created_at', sinceFilter);

  const { data, error } = await query;
  if (error) {
    logger.error('[bot/player-actions] query error', error);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }

  const items = (data ?? []).map((row) => {
    const r = row as {
      id: number;
      created_at: string;
      action: string;
      entity_type: string | null;
      entity_id: string | null;
      actor_auth_user_id: string;
      actor_discord_user_id: string;
      target_auth_user_id: string | null;
      target_discord_user_id: string | null;
      payload: unknown;
    };
    return {
      id: r.id,
      createdAt: r.created_at,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      actor: {
        authUserId: r.actor_auth_user_id,
        discordUserId: r.actor_discord_user_id,
        isSelf: r.actor_auth_user_id === target.authUserId,
      },
      target: r.target_auth_user_id
        ? {
            authUserId: r.target_auth_user_id,
            discordUserId: r.target_discord_user_id,
            isSelf: r.target_auth_user_id === target.authUserId,
          }
        : null,
      payload: r.payload ?? null,
    };
  });

  return res.status(200).json({
    player: {
      authUserId: target.authUserId,
      discordUserId: targetDiscordUserId,
    },
    role,
    items,
    count: items.length,
    accessedAs: isStaff ? 'staff' : 'self',
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-player-actions' },
});
