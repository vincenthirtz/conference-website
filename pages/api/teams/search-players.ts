// pages/api/teams/search-players.ts
// Recherche de joueurs par email ou BattleTag pour les capitaines

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';

type PlayerResult = {
  id: string;
  email: string | null;
  display_name: string | null;
  battle_tag: string | null;
  has_team: boolean;
};

type SearchResponse =
  | { players: PlayerResult[] }
  | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SearchResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  // Check if user is authenticated and is a captain
  const supabase = getServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Check if user is captain of a team
  const { data: captainTeam } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('captain_id', user.id)
    .maybeSingle();

  if (!captainTeam) {
    return res.status(403).json({ error: 'You must be a team captain' });
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

      for (const authUser of matchingUsers.slice(0, 15)) {
        if (!seenUserIds.has(authUser.id)) {
          seenUserIds.add(authUser.id);

          // Check if user is already in a team
          const { data: membership } = await supabaseAdmin
            .from('team_members')
            .select('id, battle_tag')
            .eq('user_id', authUser.id)
            .maybeSingle();

          players.push({
            id: authUser.id,
            email: authUser.email || null,
            display_name: (authUser.user_metadata?.display_name as string) || null,
            battle_tag: membership?.battle_tag || null,
            has_team: !!membership,
          });
        }
      }
    }

    // 2) Search by battle_tag in team_members (only those not in a team or in captain's team)
    const { data: membersByTag } = await supabaseAdmin
      .from('team_members')
      .select('user_id, battle_tag, team_id')
      .ilike('battle_tag', `%${query}%`)
      .limit(15);

    if (membersByTag) {
      for (const member of membersByTag) {
        if (member.user_id && !seenUserIds.has(member.user_id)) {
          seenUserIds.add(member.user_id);

          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(member.user_id);

          players.push({
            id: member.user_id,
            email: userData?.user?.email || null,
            display_name: (userData?.user?.user_metadata?.display_name as string) || null,
            battle_tag: member.battle_tag || null,
            has_team: true,
          });
        }
      }
    }

    // 3) Also search in profiles table if it exists
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, username, battle_tag')
      .or(`username.ilike.%${query}%,battle_tag.ilike.%${query}%`)
      .limit(15);

    if (profiles) {
      for (const profile of profiles) {
        if (profile.id && !seenUserIds.has(profile.id)) {
          seenUserIds.add(profile.id);

          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(profile.id);
          const { data: membership } = await supabaseAdmin
            .from('team_members')
            .select('id, battle_tag')
            .eq('user_id', profile.id)
            .maybeSingle();

          players.push({
            id: profile.id,
            email: userData?.user?.email || null,
            display_name: profile.username || (userData?.user?.user_metadata?.display_name as string) || null,
            battle_tag: membership?.battle_tag || profile.battle_tag || null,
            has_team: !!membership,
          });
        }
      }
    }

    return res.status(200).json({ players: players.slice(0, 20) });
  } catch (err: any) {
    console.error('[api/teams/search-players] error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
}
