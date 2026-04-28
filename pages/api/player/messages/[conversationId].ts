// pages/api/player/messages/[conversationId].ts
// Detail d'une conversation entre capitaines
// - GET   : recuperer tous les messages d'une conversation
// - PATCH : marquer les messages entrants comme lus

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';

async function authenticateCaptain(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    res
      .status(500)
      .json({ error: 'Database not configured (missing service role).' });
    return null;
  }

  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

  if (!token) {
    res.status(401).json({ error: 'Token required.' });
    return null;
  }

  const { data: userData, error: userErr } =
    await supabaseAdmin.auth.getUser(token);

  if (userErr || !userData?.user) {
    res.status(401).json({ error: 'Not authenticated.' });
    return null;
  }

  const user = userData.user;

  const { data: membership, error: memberErr } = await supabaseAdmin
    .from('team_members')
    .select('id, team_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberErr) {
    res.status(500).json({ error: 'Verification error.' });
    return null;
  }

  if (!membership) {
    res.status(400).json({ error: "Tu n'es membre d'aucune equipe." });
    return null;
  }

  const { data: myTeam } = await supabaseAdmin
    .from('teams')
    .select('id, captain_id, name')
    .eq('id', membership.team_id)
    .maybeSingle();

  if (myTeam?.captain_id !== user.id) {
    res
      .status(403)
      .json({ error: 'Seul le capitaine peut utiliser la messagerie.' });
    return null;
  }

  return { user, team: myTeam };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
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
    const auth = await authenticateCaptain(req, res);
    if (!auth) return;

    const { team } = auth;

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
      console.error('[player/messages/conv] GET error:', allErr);
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
    const auth = await authenticateCaptain(req, res);
    if (!auth) return;

    const { team } = auth;

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
      console.error('[player/messages/conv] PATCH error:', updateErr);
      return res.status(500).json({ error: 'Failed to mark as read.' });
    }

    return res.status(200).json({ success: true, markedRead: count || 0 });
  }

  res.setHeader('Allow', 'GET,PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}
