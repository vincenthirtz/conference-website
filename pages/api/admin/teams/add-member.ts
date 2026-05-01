// pages/api/admin/teams/add-member.ts
// Ajout d'un membre à une équipe (option: le définir capitaine)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';

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
  res: NextApiResponse<AddMemberResponse>
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

  let resolvedUserId =
    typeof userId === 'string' && userId.trim().length > 0 ? userId.trim() : '';

  const validateBattleTag = (tag: string) => {
    const trimmed = (tag || '').trim();
    const re = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;
    if (!re.test(trimmed)) {
      throw new Error('BattleTag required (format Name#0000)');
    }
    return trimmed;
  };
  let battleTagValue: string;
  try {
    battleTagValue = validateBattleTag(battleTag);
  } catch (err: unknown) {
    return res.status(400).json({ error: 'Invalid BattleTag' });
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

    // Résoudre l'utilisateur par email si nécessaire
    if (!resolvedUserId) {
      if (!email || typeof email !== 'string') {
        return res
          .status(400)
          .json({ error: 'Provide userId or email to find the user' });
      }

      const emailLower = email.toLowerCase();
      const { data: usersData, error: listErr } =
        await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 100,
        });

      if (listErr) {
        logger.error('add-member listUsers error:', listErr);
        return res
          .status(500)
          .json({ error: listErr.message || 'Failed to list users' });
      }

      const found = usersData?.users?.find(
        (u) => u.email?.toLowerCase() === emailLower
      );

      if (!found?.id) {
        return res.status(404).json({ error: 'User not found for this email' });
      }

      resolvedUserId = found.id;
    }

    // Check max_players limit across all tournaments the team is registered in
    const [{ count: currentMemberCount }, { data: teamTournaments }] =
      await Promise.all([
        supabaseAdmin
          .from('team_members')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', teamId),
        supabaseAdmin
          .from('tournament_teams')
          .select('tournament_id, tournaments!inner(max_players)')
          .eq('team_id', teamId),
      ]);

    if (teamTournaments && teamTournaments.length > 0) {
      for (const tt of teamTournaments) {
        const maxPlayers = (tt as any).tournaments?.max_players;
        if (maxPlayers && (currentMemberCount ?? 0) >= maxPlayers) {
          return res.status(400).json({
            error: `L'équipe a atteint la limite de ${maxPlayers} joueur(s) imposée par un tournoi.`,
          });
        }
      }
    }

    // Insérer dans team_members
    const memberPayload = {
      team_id: teamId,
      user_id: resolvedUserId,
      role: typeof role === 'string' && role.trim() ? role.trim() : 'player',
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
          ? 'User already in this team'
          : 'Failed to add member';
      return res.status(400).json({ error: msg });
    }

    let captainSet = false;

    if (setCaptain) {
      const { error: captainErr } = await supabaseAdmin
        .from('teams')
        .update({ captain_id: resolvedUserId })
        .eq('id', teamId);

      if (captainErr) {
        logger.error('add-member captain update error:', captainErr);
        return res.status(500).json({
          error:
            captainErr.message ||
            'Member added but failed to set as captain (check teams.captain_id column)',
        });
      }

      captainSet = true;
    }

    // Créer une news auto
    try {
      const playerName = battleTagValue.split('#')[0];
      const teamName = team?.name || 'une equipe';
      const newsSlug = `team-${teamId}-member-${Date.now().toString(36)}`;
      await supabaseAdmin.from('news').insert({
        title: `${playerName} rejoint ${teamName}`,
        slug: newsSlug,
        tag: 'teams',
        excerpt: `${playerName} rejoint ${teamName} en tant que ${memberPayload.role}.`,
        content: `${playerName} a rejoint ${teamName} en tant que ${memberPayload.role}. Bienvenue !`,
        image_url: team?.logo_url ?? null,
        status: 'published',
        published_at: new Date().toISOString(),
      });
    } catch (newsErr) {
      logger.error('[/api/admin/teams/add-member] create news error:', newsErr);
    }

    return res.status(200).json({
      teamMemberId: member?.id,
      teamId,
      userId: resolvedUserId,
      role: memberPayload.role,
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
