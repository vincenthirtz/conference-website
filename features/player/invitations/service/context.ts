// features/player/invitations/service/context.ts — ce que reçoit un service de
// jeton : la base, le jeton (de forme plausible, rien de plus) et la session
// quand la méthode en exige une (`defineTokenRoute`).

import type { User } from '@supabase/supabase-js';
import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';

export type TokenCtx = {
  db: AdminDb;
  token: string;
  logger: Logger;
};

export type TokenUserCtx = TokenCtx & { user: User };

/**
 * Réponse d'un service de jeton : statut + corps HISTORIQUES. Les utils
 * partagés (`utils/teams/inviteByToken.ts`, que le bot et la façade
 * historique appellent aussi) répondent déjà sous cette forme.
 */
export type TokenReply = { status: number; body: Record<string, unknown> };
