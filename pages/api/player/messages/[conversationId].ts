// pages/api/player/messages/[conversationId].ts
// Detail d'une conversation entre capitaines
// - GET   : recuperer tous les messages d'une conversation
// - PATCH : marquer les messages entrants comme lus

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import {
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';

import { logger } from '../../../../utils/logger';
type CaptainTeam = { id: string; captain_id: string | null; name: string };

async function loadCaptainTeam(
  res: NextApiResponse,
  user: User
): Promise<CaptainTeam | null> {
  const access = await getManagedTeam(user.id);
  if (!access) {
    res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
    return null;
  }

  const { data: myTeam } = await supabaseAdmin
    .from('teams')
    .select('id, captain_id, name')
    .eq('id', access.teamId)
    .maybeSingle();

  if (!myTeam) {
    res.status(404).json({ error: 'Team introuvable.' });
    return null;
  }

  return myTeam as CaptainTeam;
}

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 40, windowMs: 60_000 },
      'player-messages-conv'
    )
  )
    return;

  const conversationId = req.query.conversationId as string;
  if (!conversationId || !conversationId.includes('_')) {
    return res.status(400).json({ error: 'Invalid conversation ID.' });
  }

  const [teamIdA, teamIdB] = conversationId.split('_');

  if (req.method === 'GET') {
    const team = await loadCaptainTeam(res, user);
    if (!team) return;

    // Verify captain is part of this conversation
    if (team.id !== teamIdA && team.id !== teamIdB) {
      return res
        .status(403)
        .json({ error: "Tu n'as pas acces a cette conversation." });
    }

    const otherTeamId = team.id === teamIdA ? teamIdB : teamIdA;

    // Fetch all messages in this conversation (both directions between the two teams)
    const { data: allMessages, error: allErr } = await supabaseAdmin!
      .from('demandes')
      .select('id, user_id, team_id, comment, payload, status, created_at')
      .eq('type', 'captain_message')
      .or(
        `and(payload->>from_team_id.eq.${teamIdA},team_id.eq.${teamIdB}),and(payload->>from_team_id.eq.${teamIdB},team_id.eq.${teamIdA})`
      )
      .order('created_at', { ascending: true });

    if (allErr) {
      logger.error('[player/messages/conv] GET error:', allErr);
      return res.status(500).json({ error: 'Failed to load conversation.' });
    }

    // Get other team info
    const { data: otherTeam } = await supabaseAdmin!
      .from('teams')
      .select('id, name, short_name, logo_url')
      .eq('id', otherTeamId)
      .maybeSingle();

    return res.status(200).json({
      conversationId,
      myTeamId: team.id,
      otherTeam: otherTeam || { id: otherTeamId, name: 'Equipe inconnue' },
      messages: (allMessages || []).map((m) => ({
        id: m.id,
        content: m.comment,
        senderId: m.user_id,
        senderTeamId: (m.payload as Record<string, unknown>)?.from_team_id,
        senderName:
          (m.payload as Record<string, unknown>)?.sender_display_name ||
          'Inconnu',
        fromTeamName: (m.payload as Record<string, unknown>)?.from_team_name,
        isRead: m.status !== 'pending',
        createdAt: m.created_at,
      })),
    });
  }

  if (req.method === 'PATCH') {
    const team = await loadCaptainTeam(res, user);
    if (!team) return;

    if (team.id !== teamIdA && team.id !== teamIdB) {
      return res
        .status(403)
        .json({ error: "Tu n'as pas acces a cette conversation." });
    }

    // Mark incoming messages as read (messages where team_id = my team, status = pending)
    const { error: updateErr, count } = await supabaseAdmin!
      .from('demandes')
      .update({ status: 'approved' })
      .eq('type', 'captain_message')
      .eq('team_id', team.id)
      .eq('status', 'pending')
      .or(
        `payload->>from_team_id.eq.${team.id === teamIdA ? teamIdB : teamIdA}`
      );

    if (updateErr) {
      logger.error('[player/messages/conv] PATCH error:', updateErr);
      return res.status(500).json({ error: 'Failed to mark as read.' });
    }

    return res.status(200).json({ success: true, markedRead: count || 0 });
  }

  res.setHeader('Allow', 'GET,PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
});
