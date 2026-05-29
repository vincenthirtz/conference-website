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

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { discordIdSchema } from '@/utils/botValidation';
import {
  requireBotPlayer,
  resolveActorPlayer,
  resolveActorStaff,
} from '@/utils/botActor';
import { logPlayerAction } from '@/utils/botPlayerLogs';
import { logger } from '@/utils/logger';

const BATTLE_TAG_RE = /^[A-Za-z0-9À-ɏ]+#[0-9]{4,6}$/;
const DISPLAY_NAME_MAX = 50;
const RANK_MAX = 30;
const STAFF_PRIVILEGED = new Set(['admin', 'owner']);

// displayName : optionnel ; null pour effacer ; sinon string trimmée bornée,
// vide -> null (efface). Préserve la sémantique inline ('field' in body).
const displayNameSchema = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length <= DISPLAY_NAME_MAX, {
    message: `displayName trop long (max ${DISPLAY_NAME_MAX}).`,
  })
  .transform((s) => s || null)
  .nullable()
  .optional();

// battleTag : null pour effacer ; sinon format Name#0000 (vide autorisé -> null).
const battleTagSchema = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s === '' || BATTLE_TAG_RE.test(s), {
    message: 'Format BattleTag invalide (ex: Pseudo#1234).',
  })
  .transform((s) => s || null)
  .nullable()
  .optional();

// mainRole : enum Overwatch (lowercased) ; null pour effacer ; vide -> null.
const ROLE_VALUES = ['tank', 'damage', 'support'] as const;
const mainRoleSchema = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .refine((s) => s === '' || (ROLE_VALUES as readonly string[]).includes(s), {
    message: `mainRole invalide. Valeurs : ${ROLE_VALUES.join(', ')}.`,
  })
  .transform((s) => (s || null) as (typeof ROLE_VALUES)[number] | null)
  .nullable()
  .optional();

// rank : str libre bornée ; null pour effacer ; vide -> null.
const rankSchema = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length <= RANK_MAX, {
    message: `rank trop long (max ${RANK_MAX}).`,
  })
  .transform((s) => s || null)
  .nullable()
  .optional();

const profileBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  displayName: displayNameSchema,
  battleTag: battleTagSchema,
  mainRole: mainRoleSchema,
  rank: rankSchema,
});
const profileQuerySchema = z.object({ discordUserId: discordIdSchema });

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { discordUserId: targetDiscordUserId } = req.botQuery as z.infer<
    typeof profileQuerySchema
  >;
  const input = req.botInput as z.infer<typeof profileBodySchema>;

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
          'Tu ne peux modifier que ton propre profil (sauf si tu es admin/owner).',
      });
    }
  }

  const target = await resolveActorPlayer(targetDiscordUserId);
  if (!target) {
    return res.status(404).json({ error: 'Compte cible non lié au site.' });
  }

  // Build updates pour user_metadata. On distingue "champ absent" (undefined,
  // pas touché) de "champ présent" (string transformée -> string|null) en
  // utilisant la clé dans le body brut (le schéma a déjà validé/normalisé).
  const metaUpdates: Record<string, string | null> = {};
  let battleTagChanged = false;

  if ('displayName' in body) {
    metaUpdates.display_name = input.displayName ?? null;
  }
  if ('battleTag' in body) {
    metaUpdates.battle_tag = input.battleTag ?? null;
    battleTagChanged = true;
  }
  if ('mainRole' in body) {
    metaUpdates.main_role = input.mainRole ?? null;
  }
  if ('rank' in body) {
    metaUpdates.rank = input.rank ?? null;
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
      .eq('tenant_id', req.botContext!.tenantId)
      .eq('user_id', target.authUserId);
    if (tmErr) {
      logger.error(
        '[bot/profile] team_members battle_tag propagation error',
        tmErr
      );
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
  bodySchema: profileBodySchema,
  querySchema: profileQuerySchema,
});
