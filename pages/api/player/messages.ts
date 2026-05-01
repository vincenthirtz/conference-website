// pages/api/player/messages.ts
// Messagerie entre capitaines d'equipe
// - GET  : lister les conversations du capitaine connecte
// - POST : envoyer un nouveau message (demarrer ou poursuivre une conversation)

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';

import { logger } from '../../../utils/logger';
export type SendMessageBody = {
  targetTeamId: string;
  content: string;
};

/** Deterministic conversation ID from two team UUIDs */
function conversationId(teamA: string, teamB: string): string {
  return teamA < teamB ? `${teamA}_${teamB}` : `${teamB}_${teamA}`;
}

type CaptainTeam = { id: string; captain_id: string | null; name: string };

async function loadCaptainTeam(
  res: NextApiResponse,
  user: User
): Promise<CaptainTeam | null> {
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

  if (!myTeam || myTeam.captain_id !== user.id) {
    res
      .status(403)
      .json({ error: 'Seul le capitaine peut utiliser la messagerie.' });
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
    applyRateLimit(req, res, { max: 40, windowMs: 60_000 }, 'player-messages')
  )
    return;

  if (req.method === 'GET') {
    const team = await loadCaptainTeam(res, user);
    if (!team) return;

    // Fetch all captain_message demandes involving this captain's team
    // Either sent by this user OR targeting this team
    const { data: messages, error: msgErr } = await supabaseAdmin!
      .from('demandes')
      .select('id, user_id, team_id, comment, payload, status, created_at')
      .eq('type', 'captain_message')
      .or(`payload->>from_team_id.eq.${team.id},team_id.eq.${team.id}`)
      .order('created_at', { ascending: false });

    if (msgErr) {
      logger.error('[player/messages] GET error:', msgErr);
      return res.status(500).json({ error: 'Failed to load messages.' });
    }

    // Group by conversation_id
    type Message = {
      id: string;
      user_id: string;
      team_id: string;
      comment: string | null;
      payload: Record<string, unknown>;
      status: string;
      created_at: string;
    };

    const convMap = new Map<
      string,
      {
        conversationId: string;
        otherTeamId: string;
        otherTeamName: string;
        lastMessage: Message;
        messageCount: number;
        unreadCount: number;
      }
    >();

    for (const msg of (messages || []) as Message[]) {
      const convId =
        (msg.payload?.conversation_id as string) ||
        conversationId(
          (msg.payload?.from_team_id as string) || '',
          msg.team_id
        );

      const existing = convMap.get(convId);

      const isIncoming = msg.team_id === team.id;
      const otherTeamId = isIncoming
        ? (msg.payload?.from_team_id as string)
        : msg.team_id;
      const otherTeamName = isIncoming
        ? (msg.payload?.from_team_name as string) || 'Equipe inconnue'
        : (msg.payload?.target_team_name as string) || 'Equipe inconnue';

      const isUnread = isIncoming && msg.status === 'pending';

      if (!existing) {
        convMap.set(convId, {
          conversationId: convId,
          otherTeamId,
          otherTeamName,
          lastMessage: msg,
          messageCount: 1,
          unreadCount: isUnread ? 1 : 0,
        });
      } else {
        existing.messageCount++;
        if (isUnread) existing.unreadCount++;
        // lastMessage is already the most recent (ordered desc)
      }
    }

    const conversations = Array.from(convMap.values()).sort(
      (a, b) =>
        new Date(b.lastMessage.created_at).getTime() -
        new Date(a.lastMessage.created_at).getTime()
    );

    return res.status(200).json({ conversations });
  }

  if (req.method === 'POST') {
    const team = await loadCaptainTeam(res, user);
    if (!team) return;

    const body = req.body as SendMessageBody;

    if (!body?.content?.trim()) {
      return res
        .status(400)
        .json({ error: 'Le message ne peut pas etre vide.' });
    }

    const content = body.content.trim();
    if (content.length > 2000) {
      return res
        .status(400)
        .json({ error: 'Message trop long (max 2000 caracteres).' });
    }

    if (!body?.targetTeamId?.trim()) {
      return res.status(400).json({ error: 'Equipe cible requise.' });
    }

    const targetTeamId = body.targetTeamId.trim();

    // Cannot message own team
    if (targetTeamId === team.id) {
      return res.status(400).json({
        error: 'Tu ne peux pas envoyer un message a ta propre equipe.',
      });
    }

    // Check target team exists and is active
    const { data: targetTeam, error: teamErr } = await supabaseAdmin!
      .from('teams')
      .select('id, name')
      .eq('id', targetTeamId)
      .eq('is_active', true)
      .maybeSingle();

    if (teamErr || !targetTeam) {
      return res.status(400).json({ error: "L'equipe cible n'existe pas." });
    }

    const convId = conversationId(team.id, targetTeamId);

    const payload: Record<string, unknown> = {
      conversation_id: convId,
      from_team_id: team.id,
      from_team_name: team.name,
      target_team_name: targetTeam.name,
      sender_display_name:
        user.user_metadata?.display_name ||
        user.user_metadata?.full_name ||
        user.email,
    };

    const { data: newMessage, error: insertErr } = await supabaseAdmin!
      .from('demandes')
      .insert({
        user_id: user.id,
        team_id: targetTeamId,
        type: 'captain_message',
        status: 'pending',
        comment: content,
        source: 'website',
        payload,
      })
      .select('*')
      .single();

    if (insertErr) {
      logger.error('[player/messages] insert error:', insertErr);
      return res.status(500).json({ error: 'Failed to send message.' });
    }

    return res.status(201).json({
      success: true,
      message: newMessage,
      conversationId: convId,
    });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
});
