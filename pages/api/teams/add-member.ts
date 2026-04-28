// pages/api/teams/add-member.ts
// Ajout d'un membre à une équipe par son capitaine

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import {
  findOrCreateUserByEmail,
  listUsersEmailMap,
} from '@/utils/find-or-create-user';
import { sendTeamJoinEmail } from '@/utils/email';
import { applyRateLimit } from '@/utils/rateLimit';
import { validateRole } from '@/utils/apiHelpers';
import { isTeamRosterLocked, rosterLockErrorMessage } from '@/utils/teams/rosterLock';

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AddMemberResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting: 10 member additions per 10 minutes
  if (applyRateLimit(req, res, { max: 10, windowMs: 10 * 60 * 1000 }, 'add-member')) return;

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  // Check if user is authenticated
  const supabase = getServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Check if user is captain of a team
  const { data: captainTeam } = await supabaseAdmin
    .from('teams')
    .select('id, name, logo_url')
    .eq('captain_id', user.id)
    .maybeSingle();

  if (!captainTeam) {
    return res.status(403).json({ error: 'You must be a team captain' });
  }

  // Garde roster lock : un capitaine ne peut PAS forcer le verrouillage.
  const lockStatus = await isTeamRosterLocked(captainTeam.id);
  if (lockStatus.locked) {
    return res.status(409).json({
      error: rosterLockErrorMessage(lockStatus),
    } as any);
  }

  const { userId, email, role, battleTag } = req.body || {};

  let resolvedUserId =
    typeof userId === 'string' && userId.trim().length > 0 ? userId.trim() : '';

  // Validate BattleTag
  const validateBattleTag = (tag: string) => {
    const trimmed = (tag || '').trim();
    const re = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;
    if (!re.test(trimmed)) {
      throw new Error(
        "BattleTag required (format Name#0000, alphanumeric + # + 3 to 6 digits)"
      );
    }
    return trimmed;
  };

  let battleTagValue: string;
  try {
    battleTagValue = validateBattleTag(battleTag);
  } catch (err: unknown) {
    return res.status(400).json({ error: (err as Error)?.message || 'Invalid BattleTag' });
  }

  try {
    // Resolve user by email (or create if not found)
    if (!resolvedUserId) {
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Provide userId or email to find the user' });
      }

      try {
        const emailMap = await listUsersEmailMap();
        const { userId, created } = await findOrCreateUserByEmail(
          email,
          validateRole(role),
          emailMap
        );
        resolvedUserId = userId;
        if (created) {
          console.log(`[add-member] auto-created user for ${email}`);
        }
      } catch (err: unknown) {
        console.error('[add-member] findOrCreateUser error:', err);
        return res.status(500).json({
          error: (err as Error)?.message || 'Failed to find or create user',
        });
      }
    }

    // Check max_players limit across all tournaments (coaches are excluded)
    const validatedRole = validateRole(role);
    if (validatedRole !== 'coach') {
      const [{ count: currentNonCoachCount }, { data: teamTournaments }] = await Promise.all([
        supabaseAdmin
          .from('team_members')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', captainTeam.id)
          .neq('role', 'coach'),
        supabaseAdmin
          .from('tournament_teams')
          .select('tournament_id, tournaments!inner(max_players)')
          .eq('team_id', captainTeam.id),
      ]);

      if (teamTournaments && teamTournaments.length > 0) {
        for (const tt of teamTournaments) {
          const maxPlayers = (tt as any).tournaments?.max_players;
          if (maxPlayers && (currentNonCoachCount ?? 0) >= maxPlayers) {
            return res.status(400).json({
              error: `L'équipe a atteint la limite de ${maxPlayers} joueur(s) imposée par un tournoi.`,
            });
          }
        }
      }
    }

    // Insert into team_members
    const memberPayload = {
      team_id: captainTeam.id,
      user_id: resolvedUserId,
      role: validateRole(role),
      battle_tag: battleTagValue,
    };

    const { data: member, error: insertErr } = await supabaseAdmin
      .from('team_members')
      .insert(memberPayload)
      .select('id')
      .maybeSingle();

    if (insertErr) {
      const msg =
        insertErr.message?.includes('duplicate') ||
        insertErr.message?.includes('unique')
          ? 'Ce joueur est déjà dans une équipe'
          : 'Échec de l\'ajout du membre';
      return res.status(400).json({ error: msg });
    }

    // Send team join email (non-blocking)
    const memberEmail = typeof email === 'string' ? email.trim().toLowerCase() : null;
    if (memberEmail) {
      sendTeamJoinEmail(memberEmail, captainTeam.name, memberPayload.role).catch((err) => {
        console.error('[add-member] team join email error:', err);
      });
    } else if (resolvedUserId) {
      supabaseAdmin.auth.admin.getUserById(resolvedUserId).then(({ data }) => {
        if (data?.user?.email) {
          sendTeamJoinEmail(data.user.email, captainTeam.name, memberPayload.role).catch((err) => {
            console.error('[add-member] team join email error:', err);
          });
        }
      }).catch(() => {});
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
      console.error('[/api/teams/add-member] create news error:', newsErr);
    }

    return res.status(200).json({
      teamMemberId: member?.id,
      teamId: captainTeam.id,
      userId: resolvedUserId,
      role: memberPayload.role,
      battle_tag: battleTagValue,
      info: 'Membre ajouté à l\'équipe',
    });
  } catch (err: unknown) {
    console.error('[/api/teams/add-member] error:', err);
    return res.status(500).json({
      error: (err as Error)?.message || 'Internal server error',
    });
  }
}
