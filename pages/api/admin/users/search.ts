// pages/api/admin/users/search.ts
// Recherche de joueurs par email ou BattleTag pour les admins

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';

import { logger } from '../../../../utils/logger';
type PlayerResult = {
  id: string;
  email: string | null;
  display_name: string | null;
  battle_tag: string | null;
  team_id: string | null;
  team_name: string | null;
};

type SearchResponse = { players: PlayerResult[] } | { error: string };

export default withStaffRoute(handler, { permission: 'manage_staff' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SearchResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const { q } = req.query;
  const query = typeof q === 'string' ? q.trim() : '';

  if (!query || query.length < 2) {
    return res
      .status(400)
      .json({ error: 'Query must be at least 2 characters' });
  }

  if (query.length > 100) {
    return res
      .status(400)
      .json({ error: 'Query too long (max 100 characters)' });
  }

  // Une seule fonction Postgres résout la recherche (email/display_name via
  // auth.users + battle_tag/username via team_members/profiles + jointure
  // équipe) — remplace les 5+ requêtes + la boucle N+1 getUserById.
  const { data, error } = await supabaseAdmin.rpc('admin_search_users', {
    p_query: query,
  });

  if (error) {
    logger.error('[api/admin/users/search] error:', error);
    return res.status(500).json({ error: 'Search failed' });
  }

  type RpcRow = {
    id: string;
    email: string | null;
    display_name: string | null;
    battle_tag: string | null;
    team_id: string | null;
    team_name: string | null;
  };

  const players: PlayerResult[] = ((data as RpcRow[] | null) ?? []).map(
    (row) => ({
      id: row.id,
      email: row.email ?? null,
      display_name: row.display_name ?? null,
      battle_tag: row.battle_tag ?? null,
      team_id: row.team_id ?? null,
      team_name: row.team_name ?? null,
    })
  );

  return res.status(200).json({ players });
}
