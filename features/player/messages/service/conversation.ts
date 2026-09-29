// features/player/messages/service/conversation.ts — une conversation entre
// deux équipes (GET) et son marquage « lu » (PATCH) (lot P15). Extrait tel
// quel de la route historique.

import { LegacyAdminError } from '@/utils/admin/errors';
import { isValidUUID } from '@/utils/apiHelpers';
import * as repo from '../repository';
import type { ConversationDetail, MarkReadResponse } from '../schemas';
import { loadMyTeam, type MessagesCtx } from './context';

/**
 * L'id doit être EXACTEMENT deux UUID d'équipe joints par un `_` : les deux
 * moitiés sont interpolées dans des filtres `.or()` PostgREST, et seul un
 * UUID garantit l'absence de caractères d'opérateur (injection de filtre).
 */
export function parseConversationId(raw: unknown): [string, string, string] {
  const id = typeof raw === 'string' ? raw : '';
  const parts = id.split('_');
  if (
    !id ||
    parts.length !== 2 ||
    !isValidUUID(parts[0]) ||
    !isValidUUID(parts[1])
  ) {
    throw new LegacyAdminError(400, 'Invalid conversation ID.');
  }
  return [id, parts[0], parts[1]];
}

const notInConversation = () =>
  new LegacyAdminError(403, "Tu n'as pas acces a cette conversation.");

export async function readConversation(
  ctx: MessagesCtx,
  rawConversationId: unknown,
  requestedTeamId: string | null
): Promise<ConversationDetail> {
  const [conversationId, teamA, teamB] = parseConversationId(rawConversationId);
  const team = await loadMyTeam(ctx, requestedTeamId);
  if (team.id !== teamA && team.id !== teamB) throw notInConversation();
  const otherTeamId = team.id === teamA ? teamB : teamA;

  const { rows, error } = await repo.listConversationMessages(
    ctx.db,
    teamA,
    teamB,
    ctx.tenantId
  );
  if (error) {
    ctx.logger.error('[player/messages/conv] GET error:', error);
    throw new LegacyAdminError(500, 'Failed to load conversation.');
  }
  const otherTeam = await repo.readOtherTeam(ctx.db, otherTeamId, ctx.tenantId);

  return {
    conversationId,
    myTeamId: team.id,
    otherTeam: otherTeam || { id: otherTeamId, name: 'Equipe inconnue' },
    messages: rows.map((m) => ({
      id: m.id,
      content: m.comment,
      senderId: m.user_id,
      senderTeamId: m.payload?.from_team_id,
      senderName: m.payload?.sender_display_name || 'Inconnu',
      fromTeamName: m.payload?.from_team_name,
      isRead: m.status !== 'pending',
      createdAt: m.created_at,
    })),
  };
}

/**
 * Marquer « lu » n'est pas une lecture : les messages entrants passent à
 * `approved` et les compteurs non lus retombent. Même droit que l'ENVOI —
 * sinon une coach déléguée aux seuls scrims pouvait vider la boîte d'équipe.
 */
export async function markConversationRead(
  ctx: MessagesCtx,
  rawConversationId: unknown,
  requestedTeamId: string | null
): Promise<MarkReadResponse> {
  const [, teamA, teamB] = parseConversationId(rawConversationId);
  const team = await loadMyTeam(ctx, requestedTeamId, 'send_captain_messages');
  if (team.id !== teamA && team.id !== teamB) throw notInConversation();

  const { count, error } = await repo.markIncomingRead(ctx.db, {
    myTeamId: team.id,
    fromTeamId: team.id === teamA ? teamB : teamA,
    tenantId: ctx.tenantId,
  });
  if (error) {
    ctx.logger.error('[player/messages/conv] PATCH error:', error);
    throw new LegacyAdminError(500, 'Failed to mark as read.');
  }
  return { success: true, markedRead: count };
}
