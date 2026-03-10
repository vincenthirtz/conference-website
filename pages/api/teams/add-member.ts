// pages/api/teams/add-member.ts
// Ajout d'un membre à une équipe par son capitaine

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';

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
    .select('id, name')
    .eq('captain_id', user.id)
    .maybeSingle();

  if (!captainTeam) {
    return res.status(403).json({ error: 'You must be a team captain' });
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
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Invalid BattleTag' });
  }

  try {
    // Resolve user by email if needed
    if (!resolvedUserId) {
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Provide userId or email to find the user' });
      }

      const emailLower = email.toLowerCase();
      const { data: usersData, error: listErr } =
        await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 100,
        });

      if (listErr) {
        console.error('add-member listUsers error:', listErr);
        return res.status(500).json({ error: listErr.message || 'Failed to list users' });
      }

      const found = usersData?.users?.find(
        (u) => u.email?.toLowerCase() === emailLower
      );

      if (!found?.id) {
        return res.status(404).json({ error: 'User not found for this email' });
      }

      resolvedUserId = found.id;
    }

    // Insert into team_members
    const memberPayload = {
      team_id: captainTeam.id,
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
          ? 'Ce joueur est déjà dans une équipe'
          : 'Échec de l\'ajout du membre';
      return res.status(400).json({ error: msg });
    }

    // Create auto news
    try {
      const newsSlug = `team-${captainTeam.id}-member-${Date.now().toString(36)}`;
      await supabaseAdmin.from('news').insert({
        title: `Nouveau membre dans ${captainTeam.name}`,
        slug: newsSlug,
        tag: 'teams',
        excerpt: `Un nouveau membre rejoint ${captainTeam.name}.`,
        content: `Une nouvelle recrue a rejoint ${captainTeam.name} en tant que ${memberPayload.role}. Bienvenue !`,
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
  } catch (err: any) {
    console.error('[/api/teams/add-member] error:', err);
    return res.status(500).json({
      error: err?.message || 'Internal server error',
    });
  }
}
