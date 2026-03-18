// pages/api/teams/search-players.ts
// Recherche de joueurs par email ou BattleTag pour les capitaines

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { escapePostgrestValue } from '@/utils/apiHelpers';

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
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  // Rate limiting: 30 searches per minute
  if (applyRateLimit(req, res, { max: 30, windowMs: 60 * 1000 }, 'search-players')) return;

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
      battle_tag_hint: string | null;
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

      for (const authUser of matchingUsers.slice(0, 15)) {
        if (!seenUserIds.has(authUser.id)) {
          seenUserIds.add(authUser.id);
          candidates.push({
            id: authUser.id,
            email: authUser.email || null,
            display_name: (authUser.user_metadata?.display_name as string) || null,
            battle_tag_hint: null,
          });
        }
      }
    }

    // 2) Search by battle_tag in team_members
    const { data: membersByTag } = await supabaseAdmin
      .from('team_members')
      .select('user_id, battle_tag, team_id')
      .ilike('battle_tag', `%${safeQuery}%`)
      .limit(15);

    if (membersByTag) {
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
      .select('id, username, battle_tag')
      .or(`username.ilike.%${safeQuery}%,battle_tag.ilike.%${safeQuery}%`)
      .limit(15);

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
    const limitedCandidates = candidates.slice(0, 20);
    const candidateIds = limitedCandidates.map(c => c.id);

    // Batch-fetch team memberships in a single query (avoids N+1)
    const membershipMap = new Map<string, { battle_tag: string | null; has_team: boolean }>();
    if (candidateIds.length > 0) {
      const { data: allMemberships } = await supabaseAdmin
        .from('team_members')
        .select('user_id, battle_tag')
        .in('user_id', candidateIds);

      if (allMemberships) {
        for (const m of allMemberships) {
          if (m.user_id) {
            membershipMap.set(m.user_id, {
              battle_tag: m.battle_tag || null,
              has_team: true,
            });
          }
        }
      }
    }

    // Batch-fetch auth data for candidates missing email
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
        has_team: membership?.has_team || false,
      };
    });

    return res.status(200).json({ players });
  } catch (err: unknown) {
    console.error('[api/teams/search-players] error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
}
