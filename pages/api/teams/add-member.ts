// pages/api/teams/add-member.ts
// Ajout d'un membre à une équipe par son capitaine ou manager

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { sendTeamJoinEmail } from '@/utils/email';
import { applyRateLimit } from '@/utils/rateLimit';
import { validateRole } from '@/utils/apiHelpers';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import {
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import {
  validateBattleTag,
  resolveUserIdByEmail,
  insertTeamMember,
} from '@/utils/teams/addMember';
import { withAuthRoute } from '@/utils/staff';

import { logger } from '../../../utils/logger';
type AddMemberResponse =
  | {
      teamMemberId?: string;
      teamId: string;
      userId: string;
      role: string;
      battle_tag?: string | null;
      info?: string;
    }
  | { error: string };

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AddMemberResponse>,
  { user }
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting: 10 member additions per 10 minutes
  if (
    applyRateLimit(
      req,
      res,
      { max: 10, windowMs: 10 * 60 * 1000 },
      'add-member'
    )
  )
    return;

  // Check if user can manage a team (captain OR manager)
  const access = await getManagedTeam(user.id);
  if (!access) {
    return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
  }

  const { data: captainTeam } = await supabaseAdmin
    .from('teams')
    .select('id, name, logo_url')
    .eq('id', access.teamId)
    .maybeSingle();

  if (!captainTeam) {
    return res.status(404).json({ error: 'Team not found' });
  }

  // Garde roster lock : un capitaine ne peut PAS forcer le verrouillage.
  const lockStatus = await isTeamRosterLocked(captainTeam.id);
  if (lockStatus.locked) {
    return res.status(409).json({
      error: rosterLockErrorMessage(lockStatus),
    } as any);
  }

  const { userId, email, role, battleTag } = req.body || {};
  const validatedRole = validateRole(role);

  let resolvedUserId =
    typeof userId === 'string' && userId.trim().length > 0 ? userId.trim() : '';

  let battleTagValue: string;
  try {
    battleTagValue = validateBattleTag(battleTag);
  } catch (err: unknown) {
    return res
      .status(400)
      .json({ error: (err as Error)?.message || 'Invalid BattleTag' });
  }

  try {
    // Resolve user by email (auto-create si pas trouve : route capitaine)
    if (!resolvedUserId) {
      if (!email || typeof email !== 'string') {
        return res
          .status(400)
          .json({ error: 'Provide userId or email to find the user' });
      }

      const resolved = await resolveUserIdByEmail({
        email,
        create: true,
        defaultRole: validatedRole,
      });
      if (!resolved.ok) {
        return res.status(resolved.status).json({ error: resolved.error });
      }
      resolvedUserId = resolved.userId;
      if (resolved.created) {
        logger.info(`[add-member] auto-created user for ${email}`);
      }
    }

    // Insert (le helper fait le pre-check max_players + traduit les erreurs)
    const insertResult = await insertTeamMember({
      teamId: captainTeam.id,
      userId: resolvedUserId,
      role: validatedRole,
      battleTag: battleTagValue,
      enforceMaxPlayersPreCheck: true,
    });

    if (!insertResult.ok) {
      return res.status(insertResult.status).json({ error: insertResult.error });
    }
    const member = { id: insertResult.memberId };
    const memberPayload = { role: validatedRole };

    // Send team join email (non-blocking)
    const memberEmail =
      typeof email === 'string' ? email.trim().toLowerCase() : null;
    if (memberEmail) {
      sendTeamJoinEmail(
        memberEmail,
        captainTeam.name,
        memberPayload.role
      ).catch((err) => {
        logger.error('[add-member] team join email error:', err);
      });
    } else if (resolvedUserId) {
      supabaseAdmin.auth.admin
        .getUserById(resolvedUserId)
        .then(({ data }) => {
          if (data?.user?.email) {
            sendTeamJoinEmail(
              data.user.email,
              captainTeam.name,
              memberPayload.role
            ).catch((err) => {
              logger.error('[add-member] team join email error:', err);
            });
          }
        })
        .catch(() => {});
    }

    // Create auto news
    try {
      const playerName = battleTagValue.split('#')[0];
      const newsSlug = `team-${captainTeam.id}-member-${Date.now().toString(36)}`;
      await supabaseAdmin.from('news').insert({
        title: `${playerName} rejoint ${captainTeam.name}`,
        slug: newsSlug,
        tag: 'teams',
        excerpt: `${playerName} rejoint ${captainTeam.name} en tant que ${memberPayload.role}.`,
        content: `${playerName} a rejoint ${captainTeam.name} en tant que ${memberPayload.role}. Bienvenue !`,
        image_url: captainTeam.logo_url ?? null,
        status: 'published',
        published_at: new Date().toISOString(),
      });
    } catch (newsErr) {
      logger.error('[/api/teams/add-member] create news error:', newsErr);
    }

    return res.status(200).json({
      teamMemberId: member.id ?? undefined,
      teamId: captainTeam.id,
      userId: resolvedUserId,
      role: memberPayload.role,
      battle_tag: battleTagValue,
      info: "Membre ajouté à l'équipe",
    });
  } catch (err: unknown) {
    logger.error('[/api/teams/add-member] error:', err);
    return res.status(500).json({
      error: (err as Error)?.message || 'Internal server error',
    });
  }
});
