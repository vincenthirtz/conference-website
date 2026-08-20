// POST /api/bot/v1/teams/leave
//
// Commande /quitter-equipe : une joueuse quitte son équipe.
// Pas de teamId en query : il est resolu via le membership de l'acteur (un
// utilisateur ne peut etre que dans une seule equipe a la fois cote schema).
//
// Refus si l'acteur est capitaine — il doit d'abord transferer le rôle via
// /transferer-capitaine. Refus aussi si le roster est verrouille par un
// tournoi en cours.

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  listMemberships,
  pickExclusiveMembership,
} from '@/utils/teams/memberships';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotPlayer } from '@/utils/botActor';
import { discordIdSchema } from '@/utils/botValidation';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import { emitRoleSyncEvent } from '@/utils/botRoleSync';
import { logPlayerAction } from '@/utils/botPlayerLogs';
import { logger } from '@/utils/logger';

// requireBotPlayer lit actorDiscordUserId dans le body brut (non muté).
const leaveBodySchema = z.object({ actorDiscordUserId: discordIdSchema });

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotPlayer(req, res, body);
  if (!actor) return;

  // Quitter est destructeur : on ne devine pas. Un manager multi-équipes n'a
  // pas d'appartenance « exclusive » à retirer et la commande Discord ne porte
  // pas d'équipe — on le renvoie vers le site, où le sélecteur d'équipe rend
  // le choix explicite (`?teamId=` sur /api/teams/leave).
  const memberships = await listMemberships(
    actor.authUserId,
    req.botContext.tenantId
  );
  if (memberships.length === 0) {
    return res.status(400).json({ error: "Tu n'es membre d'aucune équipe." });
  }
  const membership =
    pickExclusiveMembership(memberships) ??
    (memberships.length === 1 ? memberships[0] : null);
  if (!membership) {
    return res.status(409).json({
      error:
        'Tu encadres plusieurs équipes : quitte celle que tu veux depuis ton espace sur le site.',
      code: 'TEAM_AMBIGUOUS',
    });
  }

  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('captain_id')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', membership.team_id)
    .maybeSingle();
  if (teamErr) {
    logger.error('[bot/teams/leave] team lookup error', teamErr);
    return res.status(500).json({ error: 'Erreur de chargement de l’équipe' });
  }

  if (team?.captain_id === actor.authUserId) {
    return res.status(403).json({
      error:
        "Le capitaine ne peut pas quitter l'équipe. Transfère le rôle d'abord via /equipe transferer-capitaine.",
    });
  }

  const lockStatus = await isTeamRosterLocked(
    req.botContext.tenantId,
    membership.team_id
  );
  if (lockStatus.locked) {
    return res.status(409).json({ error: rosterLockErrorMessage(lockStatus) });
  }

  const { error: deleteErr } = await supabaseAdmin
    .from('team_members')
    .delete()
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', membership.id);
  if (deleteErr) {
    logger.error('[bot/teams/leave] delete error', deleteErr);
    return res.status(500).json({ error: "Échec de la sortie de l'équipe" });
  }

  void emitRoleSyncEvent(
    'team.member.removed',
    actor.authUserId,
    req.botContext.tenantId,
    {
      previousTeamId: membership.team_id,
      extras: { teamId: membership.team_id },
    }
  );

  void logPlayerAction({
    tenantId: req.botContext.tenantId,
    actorAuthUserId: actor.authUserId,
    actorDiscordUserId: actor.discordUserId,
    action: 'leave_team',
    entityType: 'team',
    entityId: membership.team_id,
  });

  return res.status(200).json({
    success: true,
    teamId: membership.team_id,
    authUserId: actor.authUserId,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 10, key: 'bot-team-leave' },
  idempotent: true,
  bodySchema: leaveBodySchema,
});
