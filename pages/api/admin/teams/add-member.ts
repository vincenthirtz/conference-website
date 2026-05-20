// pages/api/admin/teams/add-member.ts
// Ajout d'un membre à une équipe (option: le définir capitaine)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import {
  validateBattleTag,
  resolveUserIdByEmail,
  insertTeamMember,
  setTeamCaptain,
} from '@/utils/teams/addMember';

import { logger } from '../../../../utils/logger';
type AddMemberResponse =
  | {
      teamMemberId?: string;
      teamId: string;
      userId: string;
      role: string;
      battle_tag?: string | null;
      captainSet: boolean;
      info?: string;
    }
  | { error: string };

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AddMemberResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Supabase service role not configured' });
  }

  const { teamId, userId, email, role, setCaptain, battleTag } = req.body || {};

  if (!teamId || typeof teamId !== 'string') {
    return res.status(400).json({ error: 'teamId is required' });
  }

  const resolvedRole =
    typeof role === 'string' && role.trim() ? role.trim() : 'player';

  let resolvedUserId =
    typeof userId === 'string' && userId.trim().length > 0 ? userId.trim() : '';

  let battleTagValue: string;
  try {
    battleTagValue = validateBattleTag(battleTag);
  } catch (err: unknown) {
    return res
      .status(400)
      .json({ error: (err as Error)?.message ?? 'Invalid BattleTag' });
  }

  try {
    // Vérifier l'équipe
    const { data: team, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, name, logo_url')
      .eq('id', teamId)
      .maybeSingle();
    if (teamErr || !team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Résoudre l'utilisateur par email si nécessaire (pas de creation cote admin)
    if (!resolvedUserId) {
      if (!email || typeof email !== 'string') {
        return res
          .status(400)
          .json({ error: 'Provide userId or email to find the user' });
      }
      const resolved = await resolveUserIdByEmail({ email, create: false });
      if (!resolved.ok) {
        return res.status(resolved.status).json({ error: resolved.error });
      }
      resolvedUserId = resolved.userId;
    }

    // Insert (le helper traduit les erreurs trigger/duplicate en messages metier)
    const insertResult = await insertTeamMember({
      tenantId: ctx.tenantId,
      teamId,
      userId: resolvedUserId,
      role: resolvedRole,
      battleTag: battleTagValue,
      enforceMaxPlayersPreCheck: true,
    });
    if (!insertResult.ok) {
      return res.status(insertResult.status).json({ error: insertResult.error });
    }

    let captainSet = false;
    if (setCaptain) {
      const captainResult = await setTeamCaptain(teamId, resolvedUserId);
      if (!captainResult.ok) {
        return res.status(captainResult.status).json({ error: captainResult.error });
      }
      captainSet = true;
    }

    // Créer une news auto
    try {
      const playerName = battleTagValue.split('#')[0];
      const teamName = team?.name || 'une equipe';
      const newsSlug = `team-${teamId}-member-${Date.now().toString(36)}`;
      await supabaseAdmin.from('news').insert({
        tenant_id: ctx.tenantId,
        title: `${playerName} rejoint ${teamName}`,
        slug: newsSlug,
        tag: 'teams',
        excerpt: `${playerName} rejoint ${teamName} en tant que ${resolvedRole}.`,
        content: `${playerName} a rejoint ${teamName} en tant que ${resolvedRole}. Bienvenue !`,
        image_url: team?.logo_url ?? null,
        status: 'published',
        published_at: new Date().toISOString(),
      });
    } catch (newsErr) {
      logger.error('[/api/admin/teams/add-member] create news error:', newsErr);
    }

    return res.status(200).json({
      teamMemberId: insertResult.memberId ?? undefined,
      teamId,
      userId: resolvedUserId,
      role: resolvedRole,
      battle_tag: battleTagValue,
      captainSet,
      info: captainSet
        ? 'Member added and set as captain'
        : 'Member added to team',
    });
  } catch (err: unknown) {
    logger.error('[/api/admin/teams/add-member] error:', err);
    return res.status(500).json({
      error: (err as Error)?.message || 'Internal server error',
    });
  }
}
