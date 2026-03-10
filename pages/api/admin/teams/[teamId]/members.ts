// pages/api/admin/teams/[teamId]/members.ts
// Gestion des membres d'une équipe (admin): GET, POST, PATCH, DELETE

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';

type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  battle_tag?: string | null;
  created_at: string;
};

type MembersResponse =
  | {
      members: TeamMemberRow[];
      total: number | null;
    }
  | {
      member: TeamMemberRow;
      info?: string;
    }
  | { success: boolean; info?: string }
  | { error: string };

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MembersResponse>
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Supabase service role not configured' });
  }

  const { teamId } = req.query;
  if (!teamId || Array.isArray(teamId)) {
    return res.status(400).json({ error: 'Invalid teamId' });
  }

  // GET - Liste des membres
  if (req.method === 'GET') {
    const { data, error, count } = await supabaseAdmin
      .from('team_members')
      .select('id, team_id, user_id, role, battle_tag, created_at', {
        count: 'exact',
      })
      .eq('team_id', teamId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('admin GET team members error:', error);
      return res.status(500).json({ error: 'Failed to fetch team members' });
    }

    return res.status(200).json({
      members: (data || []) as TeamMemberRow[],
      total: typeof count === 'number' ? count : null,
    });
  }

  // POST - Ajouter un membre
  if (req.method === 'POST') {
    const { userId, email, role, battleTag, setCaptain } = req.body || {};

    let resolvedUserId =
      typeof userId === 'string' && userId.trim().length > 0 ? userId.trim() : '';

    // BattleTag est obligatoire pour rejoindre une équipe
    if (!battleTag || typeof battleTag !== 'string' || !battleTag.trim()) {
      return res.status(400).json({
        error: 'BattleTag is required to join a team',
      });
    }

    // Valider le format du BattleTag
    const trimmedBattleTag = battleTag.trim();
    const re = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;
    if (!re.test(trimmedBattleTag)) {
      return res.status(400).json({
        error: 'Invalid BattleTag (format Name#0000)',
      });
    }
    const battleTagValue = trimmedBattleTag;

    try {
      // Vérifier l'équipe
      const { data: team, error: teamErr } = await supabaseAdmin
        .from('teams')
        .select('id, name')
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
          console.error('add-member listUsers error:', listErr);
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

      // Insérer dans team_members (battle_tag est toujours requis)
      const memberPayload = {
        team_id: teamId,
        user_id: resolvedUserId,
        role: typeof role === 'string' && role.trim() ? role.trim() : 'player',
        battle_tag: battleTagValue,
      };

      const { data: member, error: insertErr } = await supabaseAdmin
        .from('team_members')
        .insert(memberPayload)
        .select('id, team_id, user_id, role, battle_tag, created_at')
        .maybeSingle();

      if (insertErr) {
        const msg =
          insertErr.message?.includes('duplicate') ||
          insertErr.message?.includes('unique')
            ? 'User already in this team'
            : 'Failed to add member';
        return res.status(400).json({ error: msg });
      }

      // Définir comme capitaine si demandé
      if (setCaptain) {
        await supabaseAdmin
          .from('teams')
          .update({ captain_id: resolvedUserId })
          .eq('id', teamId);
      }

      return res.status(201).json({
        member: member as TeamMemberRow,
        info: setCaptain ? 'Member added and set as captain' : 'Member added',
      });
    } catch (err: any) {
      console.error('[members POST] error:', err);
      return res.status(500).json({
        error: err?.message || 'Internal server error',
      });
    }
  }

  // PATCH - Modifier un membre
  if (req.method === 'PATCH') {
    const { memberId, role, battleTag } = req.body || {};

    if (!memberId || typeof memberId !== 'string') {
      return res.status(400).json({ error: 'memberId is required' });
    }

    const updatePayload: any = {};
    if (typeof role === 'string') {
      updatePayload.role = role.trim() || 'player';
    }
    if (typeof battleTag === 'string') {
      if (battleTag.trim()) {
        const trimmed = battleTag.trim();
        const re = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;
        if (!re.test(trimmed)) {
          return res.status(400).json({
            error: 'Invalid BattleTag (format Name#0000)',
          });
        }
        updatePayload.battle_tag = trimmed;
      } else {
        updatePayload.battle_tag = null;
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    try {
      const { data: member, error: updateErr } = await supabaseAdmin
        .from('team_members')
        .update(updatePayload)
        .eq('id', memberId)
        .eq('team_id', teamId)
        .select('id, team_id, user_id, role, battle_tag, created_at')
        .maybeSingle();

      if (updateErr) {
        console.error('[members PATCH] error:', updateErr);
        return res.status(500).json({ error: 'Failed to update member' });
      }

      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      return res.status(200).json({
        member: member as TeamMemberRow,
        info: 'Member updated',
      });
    } catch (err: any) {
      console.error('[members PATCH] error:', err);
      return res.status(500).json({
        error: err?.message || 'Internal server error',
      });
    }
  }

  // DELETE - Supprimer un membre
  if (req.method === 'DELETE') {
    const { memberId } = req.body || {};

    if (!memberId || typeof memberId !== 'string') {
      return res.status(400).json({ error: 'memberId is required' });
    }

    try {
      // Récupérer le membre pour vérifier s'il est capitaine
      const { data: member, error: fetchErr } = await supabaseAdmin
        .from('team_members')
        .select('id, user_id')
        .eq('id', memberId)
        .eq('team_id', teamId)
        .maybeSingle();

      if (fetchErr || !member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      // Vérifier si ce membre est le capitaine
      const { data: team } = await supabaseAdmin
        .from('teams')
        .select('captain_id')
        .eq('id', teamId)
        .maybeSingle();

      // Supprimer le membre
      const { error: deleteErr } = await supabaseAdmin
        .from('team_members')
        .delete()
        .eq('id', memberId)
        .eq('team_id', teamId);

      if (deleteErr) {
        console.error('[members DELETE] error:', deleteErr);
        return res.status(500).json({ error: 'Failed to delete member' });
      }

      // Si c'était le capitaine, retirer le captain_id
      if (team?.captain_id === member.user_id) {
        await supabaseAdmin
          .from('teams')
          .update({ captain_id: null })
          .eq('id', teamId);
      }

      return res.status(200).json({
        success: true,
        info: 'Member removed from team',
      });
    } catch (err: any) {
      console.error('[members DELETE] error:', err);
      return res.status(500).json({
        error: err?.message || 'Internal server error',
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
