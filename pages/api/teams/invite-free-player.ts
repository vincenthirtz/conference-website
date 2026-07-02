// pages/api/teams/invite-free-player.ts
//
// POST — un capitaine/manager invite un "joueur libre" (lié au site) dans son
// équipe. Crée une invitation pending (demandes type='invite') que la joueuse
// devra accepter (flux player/invitations/[demandeId] déjà existant).
//
// Gate : le caller doit gérer l'équipe ciblée (getManagedTeam ; teamId ===
// access.teamId), sinon 403.
//
// Garde-fous (mêmes que add-member) :
//   - roster lock de l'équipe (409),
//   - défense : authUserId DOIT être un free_player courant du tenant (404),
//   - déjà membre / invitation pending déjà existante → 409 (via createInvitation),
//   - alerte blacklist (fire-and-forget, ne bloque pas).
//
// Body (zod) : { teamId: uuid, authUserId: uuid }. Comptes liés uniquement.
//
// Auth : Bearer (withAuthRoute). Tenant : resolveTenantIdForUserRequestAsync.
//
// Réponse 200 : { ok: true, demandeId }.

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { withAuthRoute } from '@/utils/staff';
import {
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import { createInvitation } from '@/utils/teams/invitations';
import { alertIfBlacklisted } from '@/utils/moderation/blacklist';
import { logger } from '@/utils/logger';

// UUID validation via le helper maison (regex tolérante, cohérente avec le
// reste du codebase) plutôt que z.string().uuid() qui impose un nibble de
// version RFC strict.
const uuidField = z.string().refine(isValidUUID, { message: 'UUID requis' });

const bodySchema = z.object({
  teamId: uuidField,
  authUserId: uuidField,
});

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 20, windowMs: 10 * 60 * 1000 },
      'teams-invite-free-player'
    )
  ) {
    return;
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'teamId (UUID) et authUserId (UUID) requis.',
      code: 'INVALID_BODY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const { teamId, authUserId } = parsed.data;

  const tenantId = await resolveTenantIdForUserRequestAsync(req, { authUserId: user.id });

  // Gate : le caller doit gérer CETTE équipe.
  const access = await getManagedTeam(user.id, tenantId);
  if (!access || access.teamId !== teamId) {
    return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
  }

  // L'équipe existe bien dans ce tenant ?
  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, captain_id')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (teamErr) {
    logger.error('[teams/invite-free-player] team lookup error', teamErr);
    return res.status(500).json({ error: 'Erreur de chargement de l’équipe.' });
  }
  if (!team) {
    return res.status(404).json({ error: 'Équipe introuvable.' });
  }

  // Défense : la cible DOIT être un free_player courant du tenant, lié au site
  // (auth_user_id == authUserId). Empêche un capitaine d'épingler un user_id
  // arbitraire via cette route.
  const { data: freePlayer, error: fpErr } = await supabaseAdmin
    .from('free_players')
    .select('discord_user_id, discord_username, auth_user_id')
    .eq('tenant_id', tenantId)
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (fpErr) {
    logger.error('[teams/invite-free-player] free_player lookup error', fpErr);
    return res
      .status(500)
      .json({ error: 'Erreur de vérification du joueur libre.' });
  }
  if (!freePlayer) {
    return res.status(404).json({
      error: "Ce joueur n'est pas (ou plus) un joueur libre disponible.",
    });
  }

  // Roster lock : un capitaine ne peut pas forcer le verrouillage.
  const lockStatus = await isTeamRosterLocked(tenantId, teamId);
  if (lockStatus.locked) {
    return res.status(409).json({ error: rosterLockErrorMessage(lockStatus) });
  }

  // Création de l'invitation (réutilise la logique partagée : captain != invitee,
  // déjà membre → 400, pending déjà existante → 409, battletag).
  const result = await createInvitation(tenantId, {
    teamId,
    captainAuthUserId: user.id,
    inviteeAuthUserId: authUserId,
    inviteeDiscordUserId:
      typeof freePlayer.discord_user_id === 'string'
        ? freePlayer.discord_user_id
        : null,
    source: 'website',
  });
  if (!result.ok) {
    // Le helper renvoie 400 pour "déjà membre" ; on l'expose en 409 (conflit
    // d'état) sur cette surface, cohérent avec player/invitations/[demandeId].
    const status =
      result.status === 400 && /déjà membre/i.test(result.error)
        ? 409
        : result.status;
    return res.status(status).json({ error: result.error });
  }

  // Blacklist : alerte (ne bloque pas) si la joueuse invitée est bannie.
  void alertIfBlacklisted(supabaseAdmin, tenantId, 'add_member', {
    discordUserId:
      typeof freePlayer.discord_user_id === 'string'
        ? freePlayer.discord_user_id
        : null,
    displayName:
      typeof freePlayer.discord_username === 'string'
        ? freePlayer.discord_username
        : null,
  });

  return res.status(200).json({ ok: true, demandeId: result.data.id });
});
