// pages/api/admin/users/search.ts
// Recherche de joueurs par email ou BattleTag pour les admins

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';

type PlayerResult = {
  id: string;
  email: string | null;
  display_name: string | null;
  battle_tag: string | null;
  team_id: string | null;
  team_name: string | null;
};

type SearchResponse =
  | { players: PlayerResult[] }
  | { error: string };

export default withStaffRoute(handler, 'manager');

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
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  try {
    const players: PlayerResult[] = [];
    const seenUserIds = new Set<string>();

    // 1) Search by email in auth.users
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 50,
    });

    if (!authError && authUsers?.users) {
      const matchingUsers = authUsers.users.filter(u =>
        u.email?.toLowerCase().includes(query.toLowerCase()) ||
        (u.user_metadata?.display_name as string)?.toLowerCase().includes(query.toLowerCase())
      );

      for (const user of matchingUsers.slice(0, 20)) {
        if (!seenUserIds.has(user.id)) {
          seenUserIds.add(user.id);

          // Check if user is in a team
          const { data: membership } = await supabaseAdmin
            .from('team_members')
            .select('battle_tag, team:teams(id, name)')
            .eq('user_id', user.id)
            .maybeSingle();

          players.push({
            id: user.id,
            email: user.email || null,
            display_name: (user.user_metadata?.display_name as string) || null,
            battle_tag: membership?.battle_tag || null,
            team_id: (membership?.team as any)?.id || null,
            team_name: (membership?.team as any)?.name || null,
          });
        }
      }
    }

    // 2) Search by battle_tag in team_members
    const { data: membersByTag, error: tagError } = await supabaseAdmin
      .from('team_members')
      .select('user_id, battle_tag, team:teams(id, name)')
      .ilike('battle_tag', `%${query}%`)
      .limit(20);

    if (!tagError && membersByTag) {
      for (const member of membersByTag) {
        if (member.user_id && !seenUserIds.has(member.user_id)) {
          seenUserIds.add(member.user_id);

          // Get user email from auth
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(member.user_id);

          players.push({
            id: member.user_id,
            email: userData?.user?.email || null,
            display_name: (userData?.user?.user_metadata?.display_name as string) || null,
            battle_tag: member.battle_tag || null,
            team_id: (member.team as any)?.id || null,
            team_name: (member.team as any)?.name || null,
          });
        }
      }
    }

    // 3) Also search in profiles table if it exists
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, username, battle_tag, discord')
      .or(`username.ilike.%${query}%,battle_tag.ilike.%${query}%`)
      .limit(20);

    if (profiles) {
      for (const profile of profiles) {
        if (profile.id && !seenUserIds.has(profile.id)) {
          seenUserIds.add(profile.id);

          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(profile.id);
          const { data: membership } = await supabaseAdmin
            .from('team_members')
            .select('battle_tag, team:teams(id, name)')
            .eq('user_id', profile.id)
            .maybeSingle();

          players.push({
            id: profile.id,
            email: userData?.user?.email || null,
            display_name: profile.username || (userData?.user?.user_metadata?.display_name as string) || null,
            battle_tag: membership?.battle_tag || profile.battle_tag || null,
            team_id: (membership?.team as any)?.id || null,
            team_name: (membership?.team as any)?.name || null,
          });
        }
      }
    }

    return res.status(200).json({ players: players.slice(0, 30) });
  } catch (err: any) {
    console.error('[api/admin/users/search] error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
}
