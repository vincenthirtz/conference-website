// features/player/invitations/service/teamByToken.ts — façade HISTORIQUE du
// lien privé d'invitation d'équipe (/api/teams/invitations/by-token, lot
// P11). Aucune règle propre : tout vit dans `utils/teams/inviteByToken.ts`,
// partagé avec /api/invitations/[token] — sinon les deux surfaces divergent.

import {
  actOnTeamInvitation,
  getTeamInvitationView,
} from '@/utils/teams/inviteByToken';
import { TeamInvitationByTokenBody } from '../schemas';
import type { TokenCtx, TokenReply, TokenUserCtx } from './context';

export function viewTeamInvitation(ctx: TokenCtx): Promise<TokenReply> {
  return getTeamInvitationView(ctx.token);
}

export async function respondToTeamInvitation(
  ctx: TokenUserCtx,
  rawBody: unknown
): Promise<TokenReply> {
  const parsed = TeamInvitationByTokenBody.safeParse(rawBody ?? {});
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "Action invalide : 'accept' ou 'reject' attendu." },
    };
  }
  return actOnTeamInvitation(ctx.token, parsed.data.action, ctx.user);
}
