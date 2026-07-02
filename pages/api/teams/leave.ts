// pages/api/teams/leave.ts
// POST : l'utilisateur authentifié quitte son équipe
// Le capitaine doit d'abord transférer son rôle via PATCH /api/teams/transfer-captain

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import { withAuthRoute } from '@/utils/staff';
import { emitBotEvent } from '@/utils/botEvents';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';

import { logger } from '../../../utils/logger';
export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'teams-leave'))
    return;

  const userId = user.id;
  const tenantId = await resolveTenantIdForUserRequestAsync(req, { authUserId: userId });

  // Trouver le membership
  const { data: membership, error: membershipErr } = await supabaseAdmin
    .from('team_members')
    .select('id, team_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (membershipErr) {
    logger.error('[teams/leave] membership error:', membershipErr);
    return res.status(500).json({ error: 'Failed to check membership.' });
  }

  if (!membership) {
    return res.status(400).json({ error: "Tu n'es membre d'aucune équipe." });
  }

  // Vérifier si l'utilisateur est capitaine
  const { data: team } = await supabaseAdmin
    .from('teams')
    .select(
      'captain_id, name, discord_role_id, discord_channel_id, discord_voice_channel_id'
    )
    .eq('id', membership.team_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const isCaptain = team?.captain_id === userId;

  // Compter les membres de l'équipe : détermine si le capitaine est le dernier
  // (auquel cas quitter dissout l'équipe) ou s'il reste des membres (auquel
  // cas il doit d'abord transférer le capitanat — sinon cul-de-sac).
  let memberCount = 1;
  if (isCaptain) {
    const { count } = await supabaseAdmin
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', membership.team_id)
      .eq('tenant_id', tenantId);
    memberCount = count ?? 1;
  }

  // Capitaine avec d'autres membres encore présents → il doit transférer
  // d'abord (comportement historique conservé).
  if (isCaptain && memberCount > 1) {
    return res.status(403).json({
      error:
        "Le capitaine ne peut pas quitter l'équipe tant qu'il reste d'autres membres. Transfère le rôle de capitaine à un autre membre d'abord.",
    });
  }

  // Garde roster lock : un membre (capitaine seul inclus) ne peut pas quitter
  // une equipe avec roster verrouille. L'admin peut forcer via l'API admin.
  const lockStatus = await isTeamRosterLocked(tenantId, membership.team_id);
  if (lockStatus.locked) {
    return res.status(409).json({
      error: rosterLockErrorMessage(lockStatus),
    });
  }

  // Cas capitaine SEUL membre : quitter dissout l'équipe (soft-delete cohérent
  // avec le DELETE admin : is_active=false, deleted_at=now()). On retire le
  // membership PUIS on désactive l'équipe. Un capitaine sans autre membre
  // n'avait aucune sortie possible auparavant (leave interdit + transfer
  // impossible faute de cible).
  if (isCaptain) {
    const nowIso = new Date().toISOString();

    const { error: deleteErr } = await supabaseAdmin
      .from('team_members')
      .delete()
      .eq('id', membership.id)
      .eq('tenant_id', tenantId);

    if (deleteErr) {
      logger.error('[teams/leave] delete membership (dissolve) error:', deleteErr);
      return res.status(500).json({ error: 'Failed to leave team.' });
    }

    const { error: dissolveErr } = await supabaseAdmin
      .from('teams')
      .update({ is_active: false, deleted_at: nowIso, updated_at: nowIso })
      .eq('id', membership.team_id)
      .eq('tenant_id', tenantId);

    if (dissolveErr) {
      logger.error('[teams/leave] dissolve team error:', dissolveErr);
      return res.status(500).json({ error: 'Failed to dissolve team.' });
    }

    // Event bot : dissolution d'équipe (mêmes clés que le DELETE admin soft).
    void emitBotEvent(
      'team.dissolved',
      {
        teamId: membership.team_id,
        name: team?.name ?? null,
        hardDelete: false,
        discordRoleId: team?.discord_role_id ?? null,
        discordChannelId: team?.discord_channel_id ?? null,
        discordVoiceChannelId: team?.discord_voice_channel_id ?? null,
      },
      tenantId
    ).catch((e) =>
      logger.error('[botEvents] team.dissolved emit error:', e)
    );

    return res.status(200).json({
      success: true,
      info: "Tu as quitté l'équipe et elle a été dissoute (dernier membre).",
      dissolved: true,
    });
  }

  // Cas standard : membre non-capitaine quitte l'équipe.
  const { error: deleteErr } = await supabaseAdmin
    .from('team_members')
    .delete()
    .eq('id', membership.id)
    .eq('tenant_id', tenantId);

  if (deleteErr) {
    logger.error('[teams/leave] delete error:', deleteErr);
    return res.status(500).json({ error: 'Failed to leave team.' });
  }

  void emitBotEvent(
    'team.member.removed',
    {
      authUserId: userId,
      teamId: membership.team_id,
    },
    tenantId
  ).catch((e) =>
    logger.error('[botEvents] team.member.removed emit error:', e)
  );

  return res.status(200).json({
    success: true,
    info: "Tu as quitté l'équipe.",
  });
});
