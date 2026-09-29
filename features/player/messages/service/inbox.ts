// features/player/messages/service/inbox.ts — boîte de réception et envoi
// (GET/POST /api/player/messages) (lot P15). Extrait tel quel de la route
// historique.

import { LegacyAdminError } from '@/utils/admin/errors';
import { parseBody } from '@/utils/player/errors';
import * as repo from '../repository';
import {
  SendMessageBody,
  type CaptainMessageRow,
  type ConversationSummary,
  type ConversationsResponse,
  type SendMessageResponse,
} from '../schemas';
import { loadMyTeam, type MessagesCtx, type SenderUser } from './context';

/** Identifiant de conversation déterministe à partir de deux équipes. */
export function conversationKey(teamA: string, teamB: string): string {
  return teamA < teamB ? `${teamA}_${teamB}` : `${teamB}_${teamA}`;
}

/** Regroupe les messages (plus récents d'abord) par conversation. */
export function groupConversations(
  messages: CaptainMessageRow[],
  myTeamId: string
): ConversationSummary[] {
  const convMap = new Map<string, ConversationSummary>();
  for (const msg of messages) {
    const convId =
      (msg.payload?.conversation_id as string) ||
      conversationKey((msg.payload?.from_team_id as string) || '', msg.team_id);
    const isIncoming = msg.team_id === myTeamId;
    const isUnread = isIncoming && msg.status === 'pending';
    const existing = convMap.get(convId);
    if (existing) {
      existing.messageCount++;
      if (isUnread) existing.unreadCount++;
      continue;
    }
    convMap.set(convId, {
      conversationId: convId,
      otherTeamId: isIncoming
        ? (msg.payload?.from_team_id as string)
        : msg.team_id,
      otherTeamName: isIncoming
        ? (msg.payload?.from_team_name as string) || 'Equipe inconnue'
        : (msg.payload?.target_team_name as string) || 'Equipe inconnue',
      lastMessage: msg,
      messageCount: 1,
      unreadCount: isUnread ? 1 : 0,
    });
  }
  return Array.from(convMap.values()).sort(
    (a, b) =>
      new Date(b.lastMessage.created_at).getTime() -
      new Date(a.lastMessage.created_at).getTime()
  );
}

export async function listConversations(
  ctx: MessagesCtx,
  requestedTeamId: string | null
): Promise<ConversationsResponse> {
  const team = await loadMyTeam(ctx, requestedTeamId);
  const { rows, error } = await repo.listTeamMessages(
    ctx.db,
    team.id,
    ctx.tenantId
  );
  if (error) {
    ctx.logger.error('[player/messages] GET error:', error);
    throw new LegacyAdminError(500, 'Failed to load messages.');
  }
  return { conversations: groupConversations(rows, team.id) };
}

export async function sendMessage(
  ctx: MessagesCtx,
  sender: SenderUser,
  requestedTeamId: string | null,
  rawBody: unknown
): Promise<SendMessageResponse> {
  const team = await loadMyTeam(ctx, requestedTeamId, 'send_captain_messages');

  const parsed = parseBody(SendMessageBody, rawBody);
  if (!parsed.ok) {
    throw new LegacyAdminError(400, parsed.body.error, {
      code: parsed.body.code,
      extra: { fields: parsed.body.fields },
    });
  }
  const { content, targetTeamId } = parsed.data;
  if (targetTeamId === team.id) {
    throw new LegacyAdminError(
      400,
      'Tu ne peux pas envoyer un message a ta propre equipe.'
    );
  }

  const target = await repo.readActiveTargetTeam(
    ctx.db,
    targetTeamId,
    ctx.tenantId
  );
  if (target.error || !target.team) {
    throw new LegacyAdminError(400, "L'equipe cible n'existe pas.");
  }

  const convId = conversationKey(team.id, targetTeamId);
  const { message, error } = await repo.insertMessage(ctx.db, {
    userId: ctx.userId,
    targetTeamId,
    content,
    tenantId: ctx.tenantId,
    payload: {
      conversation_id: convId,
      from_team_id: team.id,
      from_team_name: team.name,
      target_team_name: target.team.name,
      sender_display_name:
        sender.user_metadata?.display_name ||
        sender.user_metadata?.full_name ||
        sender.email,
    },
  });
  if (error) {
    ctx.logger.error('[player/messages] insert error:', error);
    throw new LegacyAdminError(500, 'Failed to send message.');
  }
  return { success: true, message, conversationId: convId };
}
