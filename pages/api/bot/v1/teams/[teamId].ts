// GET  /api/bot/v1/teams/[teamId]
// PATCH /api/bot/v1/teams/[teamId]
//
// GET   : resoud une equipe par UUID ou slug. Renvoie l'equipe + ses membres
//         (utile pour le bot Discord : commandes /scrim, /team show, autocomplete).
// PATCH : modifie les champs editable par le capitaine de l'equipe :
//         name, short_name, description, discord, website, is_joinable.
//         Refuse les autres champs (slug, country, captain_id, logo/banner —
//         a faire via UI admin pour eviter les changements qui cassent les liens
//         ou les invariants de transfert).
//
// Auth: x-api-key valide contre BOT_API_KEY. PATCH requiert en plus
// actorDiscordUserId == captain_id (resolu via requireBotPlayer).
//
// Staff override: si le body contient `actorIsStaff: true`, requireBotStaff
// remplace requireBotPlayer (Discord ID -> staff admin/owner) et le check
// captain est skippe. Mute utilise par /modifier-equipe-admin (bot Discord).
// Log dans staff_logs ('update_team') en plus de player_logs.

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import {
  requireBotPlayer,
  requireBotStaff,
  logBotStaffAction,
} from '@/utils/botActor';
import { isValidUUID, sanitizeUrl } from '@/utils/apiHelpers';
import { logPlayerAction } from '@/utils/botPlayerLogs';
import { logger } from '@/utils/logger';

// querySchema seulement : teamId est un id-OU-slug (pas un UUID strict) et le
// body PATCH a une sémantique trop riche pour un schéma zod sans changer le
// contrat (clés alias shortName/short_name & isJoinable/is_joinable, null/'' =
// clear, website nettoyé via sanitizeUrl puis stocké, message 400 par champ,
// règle "au moins un champ"). On garde donc la validation inline du body et on
// n'ajoute qu'un querySchema. actorDiscordUserId reste lu via requireBotPlayer/
// requireBotStaff (body brut).
const teamQuerySchema = z.object({
  teamId: z.string().optional(),
  includeMembers: z.string().optional(),
});

const TEAM_SELECT_COLUMNS =
  'id, name, slug, short_name, logo_url, banner_url, country, description, discord, discord_role_id, website, is_active, is_joinable, captain_id, created_at, updated_at';

const NAME_MIN = 2;
const NAME_MAX = 100;
const SHORT_NAME_MAX = 20;
const DESCRIPTION_MAX = 2000;
const DISCORD_MAX = 200;

async function loadTeam(idOrSlug: string, tenantId: string) {
  let q = supabaseAdmin
    .from('teams')
    .select(TEAM_SELECT_COLUMNS)
    .eq('tenant_id', tenantId);
  q = isValidUUID(idOrSlug) ? q.eq('id', idOrSlug) : q.eq('slug', idOrSlug);
  return q.maybeSingle();
}

async function handleGet(req: BotTenantRequest, res: NextApiResponse) {
  const raw = req.query.teamId;
  const idOrSlug = Array.isArray(raw) ? raw[0] : raw;
  if (!idOrSlug) {
    return res.status(400).json({ error: 'teamId requis' });
  }

  const includeMembers =
    req.query.includeMembers === '1' || req.query.includeMembers === 'true';

  const { data: team, error } = await loadTeam(
    idOrSlug,
    req.botContext.tenantId
  );
  if (error) {
    logger.error('[bot/team] fetch error', error);
    return res.status(500).json({ error: 'Failed to load team' });
  }
  if (!team) return res.status(404).json({ error: 'Equipe introuvable' });

  let members: unknown[] = [];
  if (includeMembers) {
    const { data: m, error: mErr } = await supabaseAdmin
      .from('team_members')
      .select('id, user_id, role, battle_tag, is_substitute, created_at')
      .eq('tenant_id', req.botContext.tenantId)
      .eq('team_id', team.id)
      .order('created_at', { ascending: true });
    if (mErr) {
      logger.error('[bot/team] members fetch error', mErr);
    } else {
      members = m ?? [];
    }
  }

  return res.status(200).json({ team, members });
}

async function handlePatch(req: BotTenantRequest, res: NextApiResponse) {
  const raw = req.query.teamId;
  const idOrSlug = Array.isArray(raw) ? raw[0] : raw;
  if (!idOrSlug) {
    return res.status(400).json({ error: 'teamId requis' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  // `actorIsStaff: true` -> override capitaine (cf. /modifier-equipe-admin).
  // requireBotStaff repond 400/403 si Discord ID absent / pas staff
  // admin|owner ; sinon on resout l'auth_user_id via user_discord_links
  // pour le logPlayerAction.
  const wantsStaffOverride = body.actorIsStaff === true;

  let actorAuthUserId: string;
  let actorDiscordUserId: string;
  let actorStaffId: string | null = null;

  if (wantsStaffOverride) {
    const staff = await requireBotStaff(req, res, body);
    if (!staff) return;
    // requireBotStaff garantit role admin|owner -> link user_discord_links
    // existe et auth_user_id est non-null. Garde defensive pour le typage.
    if (!staff.authUserId) {
      logger.error('[bot/team PATCH] staff actor without authUserId', staff);
      return res
        .status(500)
        .json({ error: 'Staff actor non resolu (auth_user_id manquant)' });
    }
    actorAuthUserId = staff.authUserId;
    actorStaffId = staff.staffId;
    actorDiscordUserId =
      typeof body.actorDiscordUserId === 'string'
        ? body.actorDiscordUserId.trim()
        : '';
  } else {
    const actor = await requireBotPlayer(req, res, body);
    if (!actor) return;
    actorAuthUserId = actor.authUserId;
    actorDiscordUserId = actor.discordUserId;
  }

  const { data: team, error: teamErr } = await loadTeam(
    idOrSlug,
    req.botContext.tenantId
  );
  if (teamErr) {
    logger.error('[bot/team PATCH] fetch error', teamErr);
    return res.status(500).json({ error: 'Failed to load team' });
  }
  if (!team) return res.status(404).json({ error: 'Equipe introuvable' });

  if (!wantsStaffOverride && team.captain_id !== actorAuthUserId) {
    return res
      .status(403)
      .json({ error: 'Action réservée au capitaine de cette équipe.' });
  }

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string') {
      return res.status(400).json({ error: 'name doit être une string' });
    }
    const name = body.name.trim();
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      return res.status(400).json({
        error: `name doit faire ${NAME_MIN}-${NAME_MAX} caractères`,
      });
    }
    updates.name = name;
  }

  if (body.shortName !== undefined || body.short_name !== undefined) {
    const raw = (body.shortName ?? body.short_name) as unknown;
    if (raw === null || raw === '') {
      updates.short_name = null;
    } else if (typeof raw !== 'string') {
      return res.status(400).json({ error: 'shortName doit être une string' });
    } else {
      const v = raw.trim();
      if (v.length > SHORT_NAME_MAX) {
        return res
          .status(400)
          .json({ error: `shortName max ${SHORT_NAME_MAX} caractères` });
      }
      updates.short_name = v || null;
    }
  }

  if (body.description !== undefined) {
    const raw = body.description;
    if (raw === null || raw === '') {
      updates.description = null;
    } else if (typeof raw !== 'string') {
      return res
        .status(400)
        .json({ error: 'description doit être une string' });
    } else {
      const v = raw.trim();
      if (v.length > DESCRIPTION_MAX) {
        return res
          .status(400)
          .json({ error: `description max ${DESCRIPTION_MAX} caractères` });
      }
      updates.description = v || null;
    }
  }

  if (body.discord !== undefined) {
    const raw = body.discord;
    if (raw === null || raw === '') {
      updates.discord = null;
    } else if (typeof raw !== 'string') {
      return res.status(400).json({ error: 'discord doit être une string' });
    } else {
      const v = raw.trim();
      if (v.length > DISCORD_MAX) {
        return res
          .status(400)
          .json({ error: `discord max ${DISCORD_MAX} caractères` });
      }
      updates.discord = v || null;
    }
  }

  if (body.website !== undefined) {
    const raw = body.website;
    if (raw === null || raw === '') {
      updates.website = null;
    } else if (typeof raw !== 'string') {
      return res.status(400).json({ error: 'website doit être une string' });
    } else {
      const clean = sanitizeUrl(raw);
      if (!clean) {
        return res
          .status(400)
          .json({ error: 'website invalide (http/https attendu)' });
      }
      updates.website = clean;
    }
  }

  if (body.isJoinable !== undefined || body.is_joinable !== undefined) {
    const raw = body.isJoinable ?? body.is_joinable;
    if (typeof raw !== 'boolean') {
      return res.status(400).json({ error: 'isJoinable doit être un booléen' });
    }
    updates.is_joinable = raw;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      error:
        'Aucun champ modifiable fourni (name, shortName, description, discord, website, isJoinable).',
    });
  }

  updates.updated_at = new Date().toISOString();

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('teams')
    .update(updates)
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', team.id)
    .select(TEAM_SELECT_COLUMNS)
    .single();
  if (updErr) {
    logger.error('[bot/team PATCH] update error', updErr);
    return res.status(500).json({ error: 'Échec de la mise à jour' });
  }

  const changedFields = Object.keys(updates).filter((k) => k !== 'updated_at');

  void logPlayerAction({
    tenantId: req.botContext.tenantId,
    actorAuthUserId,
    actorDiscordUserId,
    action: 'update_team',
    entityType: 'team',
    entityId: team.id,
    payload: {
      fields: changedFields,
      ...(wantsStaffOverride ? { via: 'staff_admin_override' } : {}),
    },
  });

  if (wantsStaffOverride) {
    void logBotStaffAction({
      staffId: actorStaffId,
      action: 'update_team',
      entity_type: 'team',
      entity_id: team.id,
      payload: { fields: changedFields },
    });
  }

  return res.status(200).json({ team: updated });
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  if (req.method === 'PATCH') return handlePatch(req, res);
  return handleGet(req, res);
}

export default withBotRoute(handler, {
  methods: ['GET', 'PATCH'],
  rateLimit: { max: 60, key: 'bot-team-id' },
  querySchema: teamQuerySchema,
});
