// PATCH /api/bot/v1/players/by-discord/[discordUserId]/profile
//
// Self-service : la joueuse met a jour son propre profil depuis Discord.
// L'acteur (actorDiscordUserId en body) DOIT etre le meme que celui de
// l'URL — pas de cross-update, sauf si l'acteur est staff admin/owner
// (auquel cas il peut editer le profil d'une autre joueuse).
//
// Champs editables (tous optionnels, omis = pas touche, null = efface) :
//   - displayName : str (max 50)
//   - battleTag   : str au format Name#0000 (propage aussi a team_members)
//   - mainRole    : 'tank' | 'damage' | 'support' (Overwatch)
//   - rank        : str libre (ex 'Diamant 3', 'GM 1')
//
// Auth : x-api-key + actorDiscordUserId lie au site.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import {
  requireBotPlayer,
  resolveActorPlayer,
  resolveActorStaff,
} from '@/utils/botActor';
import { logPlayerAction } from '@/utils/botPlayerLogs';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;
const BATTLE_TAG_RE = /^[A-Za-z0-9À-ɏ]+#[0-9]{4,6}$/;
const DISPLAY_NAME_MAX = 50;
const RANK_MAX = 30;
const VALID_ROLES = new Set(['tank', 'damage', 'support']);
const STAFF_PRIVILEGED = new Set(['admin', 'owner']);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.discordUserId;
  const targetDiscordUserId = Array.isArray(raw) ? raw[0] : raw;
  if (!targetDiscordUserId || !DISCORD_ID_RE.test(targetDiscordUserId)) {
    return res.status(400).json({ error: 'discordUserId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  // Acteur : soit la cible elle-meme (self-service), soit un staff admin/owner.
  const actor = await requireBotPlayer(req, res, body);
  if (!actor) return;

  const isSelf = actor.discordUserId === targetDiscordUserId;
  let isStaffOverride = false;
  if (!isSelf) {
    const staffActor = await resolveActorStaff(actor.discordUserId);
    if (staffActor.role && STAFF_PRIVILEGED.has(staffActor.role)) {
      isStaffOverride = true;
    } else {
      return res.status(403).json({
        error:
          "Tu ne peux modifier que ton propre profil (sauf si tu es admin/owner).",
      });
    }
  }

  const target = await resolveActorPlayer(targetDiscordUserId);
  if (!target) {
    return res.status(404).json({ error: 'Compte cible non lié au site.' });
  }

  // Build updates pour user_metadata
  const metaUpdates: Record<string, string | null> = {};
  let battleTagChanged = false;

  if ('displayName' in body) {
    const v = body.displayName;
    if (v === null) {
      metaUpdates.display_name = null;
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed.length > DISPLAY_NAME_MAX) {
        return res.status(400).json({
          error: `displayName trop long (max ${DISPLAY_NAME_MAX}).`,
        });
      }
      metaUpdates.display_name = trimmed || null;
    } else {
      return res.status(400).json({ error: 'displayName doit être string ou null' });
    }
  }

  if ('battleTag' in body) {
    const v = body.battleTag;
    if (v === null) {
      metaUpdates.battle_tag = null;
      battleTagChanged = true;
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed && !BATTLE_TAG_RE.test(trimmed)) {
        return res
          .status(400)
          .json({ error: 'Format BattleTag invalide (ex: Pseudo#1234).' });
      }
      metaUpdates.battle_tag = trimmed || null;
      battleTagChanged = true;
    } else {
      return res.status(400).json({ error: 'battleTag doit être string ou null' });
    }
  }

  if ('mainRole' in body) {
    const v = body.mainRole;
    if (v === null) {
      metaUpdates.main_role = null;
    } else if (typeof v === 'string') {
      const trimmed = v.trim().toLowerCase();
      if (trimmed && !VALID_ROLES.has(trimmed)) {
        return res.status(400).json({
          error: `mainRole invalide. Valeurs : ${[...VALID_ROLES].join(', ')}.`,
        });
      }
      metaUpdates.main_role = trimmed || null;
    } else {
      return res.status(400).json({ error: 'mainRole doit être string ou null' });
    }
  }

  if ('rank' in body) {
    const v = body.rank;
    if (v === null) {
      metaUpdates.rank = null;
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed.length > RANK_MAX) {
        return res.status(400).json({ error: `rank trop long (max ${RANK_MAX}).` });
      }
      metaUpdates.rank = trimmed || null;
    } else {
      return res.status(400).json({ error: 'rank doit être string ou null' });
    }
  }

  if (Object.keys(metaUpdates).length === 0) {
    return res.status(400).json({
      error:
        'Aucun champ à mettre à jour (displayName, battleTag, mainRole, rank).',
    });
  }

  // Merge dans user_metadata existant
  const { data: existing, error: getErr } =
    await supabaseAdmin.auth.admin.getUserById(target.authUserId);
  if (getErr || !existing?.user) {
    logger.error('[bot/profile] getUserById error', getErr);
    return res.status(500).json({ error: 'Erreur de chargement du profil.' });
  }

  const merged = {
    ...(existing.user.user_metadata ?? {}),
    ...metaUpdates,
  };

  const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
    target.authUserId,
    { user_metadata: merged }
  );
  if (updErr) {
    logger.error('[bot/profile] updateUser error', updErr);
    return res.status(500).json({ error: 'Échec de la mise à jour.' });
  }

  // Si battle_tag modifie, propager vers team_members (cohérent avec UI).
  if (battleTagChanged) {
    const { error: tmErr } = await supabaseAdmin
      .from('team_members')
      .update({ battle_tag: metaUpdates.battle_tag })
      .eq('user_id', target.authUserId);
    if (tmErr) {
      logger.error('[bot/profile] team_members battle_tag propagation error', tmErr);
    }
  }

  void logPlayerAction({
    actorAuthUserId: actor.authUserId,
    actorDiscordUserId: actor.discordUserId,
    action: 'update_profile',
    entityType: 'profile',
    entityId: target.authUserId,
    targetAuthUserId: isStaffOverride ? target.authUserId : null,
    targetDiscordUserId: isStaffOverride ? targetDiscordUserId : null,
    payload: {
      fields: Object.keys(metaUpdates),
      edited_by: isStaffOverride ? 'staff' : 'self',
    },
  });

  return res.status(200).json({
    success: true,
    authUserId: target.authUserId,
    discordUserId: targetDiscordUserId,
    updates: metaUpdates,
    editedBy: isStaffOverride ? 'staff' : 'self',
  });
}

export default withBotRoute(handler, {
  methods: ['PATCH'],
  rateLimit: { max: 20, key: 'bot-player-profile' },
  idempotent: true,
});
