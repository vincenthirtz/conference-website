// features/admin/twitch/service/connection.ts — statut et déconnexion de la
// chaîne broadcaster de l'espace. Le statut NE REND JAMAIS les jetons (ni
// chiffrés) : seules les colonnes de CONNECTION_STATUS_COLUMNS sont lues.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { Audited } from '../../_shared/audited';
import { deleteConnection, findConnectionStatus } from '../repository';
import { fail } from './common';

export type ConnectionStatus =
  | { connected: false }
  | {
      connected: true;
      broadcaster_login: string;
      scope: string[];
      expires_at: string;
    };

/** GET /twitch/connection. */
export async function getConnectionStatus(
  ctx: ServiceContext
): Promise<ConnectionStatus> {
  const { row, error } = await findConnectionStatus(ctx.db, ctx.tenantId);
  if (error) {
    ctx.logger.error('[admin/twitch/connection] lookup error', error);
    throw fail(500, 'Failed to load connection.');
  }
  if (!row) return { connected: false };
  return {
    connected: true,
    broadcaster_login: row.broadcaster_login,
    scope: row.scope ?? [],
    expires_at: row.expires_at,
  };
}

/** DELETE /twitch/connection — supprime la ligne (jetons compris). */
export async function disconnectBroadcaster(
  ctx: ServiceContext
): Promise<Audited<{ connected: false }>> {
  const { error } = await deleteConnection(ctx.db, ctx.tenantId);
  if (error) {
    ctx.logger.error('[admin/twitch/connection] delete error', error);
    throw fail(500, 'Failed to disconnect.');
  }
  return {
    result: { connected: false },
    audit: {
      entity_type: 'twitch_broadcaster_connection',
      entity_id: ctx.tenantId,
      payload: { action: 'disconnect_twitch_broadcaster' },
    },
  };
}
