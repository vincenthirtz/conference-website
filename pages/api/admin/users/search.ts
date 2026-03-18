// pages/api/admin/users/search.ts
// Recherche de joueurs par email ou BattleTag pour les admins

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { isValidUUID, escapePostgrestValue } from '@/utils/apiHelpers';

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

  if (query.length > 100) {
    return res.status(400).json({ error: 'Query too long (max 100 characters)' });
  }

  const safeQuery = escapePostgrestValue(query);

  try {
    // Collect candidate user IDs from multiple sources, then batch-fetch memberships
    type Candidate = {
      id: string;
      email: string | null;
      display_name: string | null;
      battle_tag_hint: string | null; // from profiles or members search
    };
    const candidates: Candidate[] = [];
    const seenUserIds = new Set<string>();

    // 1) Search by email/display_name in auth.users
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 50,
    });

    if (!authError && authUsers?.users) {
      const lowerQuery = query.toLowerCase();
      const matchingUsers = authUsers.users.filter(u =>
        u.email?.toLowerCase().includes(lowerQuery) ||
        (u.user_metadata?.display_name as string)?.toLowerCase().includes(lowerQuery)
      );

      for (const user of matchingUsers.slice(0, 20)) {
        if (!seenUserIds.has(user.id)) {
          seenUserIds.add(user.id);
          candidates.push({
            id: user.id,
            email: user.email || null,
            display_name: (user.user_metadata?.display_name as string) || null,
            battle_tag_hint: null,
          });
        }
      }
    }

    // 2) Search by battle_tag in team_members (batch — no N+1)
    const { data: membersByTag, error: tagError } = await supabaseAdmin
      .from('team_members')
      .select('user_id, battle_tag, team:teams(id, name)')
      .ilike('battle_tag', `%${safeQuery}%`)
      .limit(20);

    if (!tagError && membersByTag) {
      for (const member of membersByTag) {
        if (member.user_id && !seenUserIds.has(member.user_id)) {
          seenUserIds.add(member.user_id);
          candidates.push({
            id: member.user_id,
            email: null,
            display_name: null,
            battle_tag_hint: member.battle_tag || null,
          });
        }
      }
    }

    // 3) Search in profiles table
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, username, battle_tag, discord')
      .or(`username.ilike.%${safeQuery}%,battle_tag.ilike.%${safeQuery}%`)
      .limit(20);

    if (profiles) {
      for (const profile of profiles) {
        if (profile.id && !seenUserIds.has(profile.id)) {
          seenUserIds.add(profile.id);
          candidates.push({
            id: profile.id,
            email: null,
            display_name: profile.username || null,
            battle_tag_hint: profile.battle_tag || null,
          });
        }
      }
    }

    // Cap candidates before batch-fetching
    const limitedCandidates = candidates.slice(0, 30);
    const candidateIds = limitedCandidates.map(c => c.id);

    // Batch-fetch team memberships for all candidates in a single query
    const membershipMap = new Map<string, { battle_tag: string | null; team_id: string | null; team_name: string | null }>();
    if (candidateIds.length > 0) {
      const { data: allMemberships } = await supabaseAdmin
        .from('team_members')
        .select('user_id, battle_tag, team:teams(id, name)')
        .in('user_id', candidateIds);

      if (allMemberships) {
        for (const m of allMemberships) {
          if (m.user_id) {
            membershipMap.set(m.user_id, {
              battle_tag: m.battle_tag || null,
              team_id: (m.team as any)?.id || null,
              team_name: (m.team as any)?.name || null,
            });
          }
        }
      }
    }

    // Batch-fetch auth data for candidates missing email (from steps 2 & 3)
    const needsAuth = limitedCandidates.filter(c => !c.email);
    const authMap = new Map<string, { email: string | null; display_name: string | null }>();
    await Promise.all(
      needsAuth.map(async (c) => {
        try {
          const { data: userData } = await supabaseAdmin!.auth.admin.getUserById(c.id);
          if (userData?.user) {
            authMap.set(c.id, {
              email: userData.user.email || null,
              display_name: (userData.user.user_metadata?.display_name as string) || null,
            });
          }
        } catch {
          // Skip users that can't be fetched
        }
      })
    );

    // Assemble final results
    const players: PlayerResult[] = limitedCandidates.map(c => {
      const membership = membershipMap.get(c.id);
      const auth = authMap.get(c.id);
      return {
        id: c.id,
        email: c.email || auth?.email || null,
        display_name: c.display_name || auth?.display_name || null,
        battle_tag: membership?.battle_tag || c.battle_tag_hint || null,
        team_id: membership?.team_id || null,
        team_name: membership?.team_name || null,
      };
    });

    return res.status(200).json({ players });
  } catch (err: unknown) {
    console.error('[api/admin/users/search] error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
}
