// features/admin/users/service.ts

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError } from '@/utils/admin/errors';
import * as repo from './repository';

export type PlayerSearchResult = repo.UserSearchRow;

export async function searchPlayers(
  ctx: ServiceContext,
  query: string
): Promise<{ players: PlayerSearchResult[] }> {
  const { rows, error } = await repo.searchUsers(ctx.db, query);
  if (error) {
    ctx.logger.error('[api/admin/users/search] error:', error);
    throw new AdminError(500, 'internal', 'Search failed');
  }
  const players = rows.map((row) => ({
    id: row.id,
    email: row.email ?? null,
    display_name: row.display_name ?? null,
    battle_tag: row.battle_tag ?? null,
    team_id: row.team_id ?? null,
    team_name: row.team_name ?? null,
  }));
  return { players };
}
