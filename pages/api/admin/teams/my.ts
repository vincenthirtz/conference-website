import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';

type MemberRow = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  role: string | null;
  captain?: boolean | null;
  is_captain?: boolean | null;
};

type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  bio: string | null;
  country?: string | null;
  description?: string | null;
};

type GetResponse = {
  team: TeamRow | null;
  members: MemberRow[];
  isCaptain: boolean;
};

type UpdateBody = {
  teamId: string;
  name?: string;
  short_name?: string | null;
  bio?: string | null;
  logo_url?: string | null;
  country?: string | null;
  description?: string | null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetResponse | { error: string }>
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-teams-my')) return;
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Token required.' });
  }

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
    token
  );
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'User not authenticated.' });
  }
  const userId = userData.user.id;

  if (req.method === 'GET') {
    // Chercher l'équipe où l'utilisateur est capitaine
    const { data: membership, error: membershipErr } = await supabaseAdmin
      .from('team_members')
      .select(
        'team_id, captain, is_captain, teams!inner(id, name, short_name, logo_url, bio, country, description)'
      )
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (membershipErr) {
      console.error('[teams/my] membership error:', membershipErr);
      return res
        .status(500)
        .json({ error: 'Failed to load your team.' });
    }

    if (!membership) {
      return res.status(200).json({
        team: null,
        members: [],
        isCaptain: false,
      });
    }

    const teamId = (membership as any).team_id as string;
    const team = (membership as any).teams as TeamRow;
    const isCaptain =
      Boolean((membership as any).captain) ||
      Boolean((membership as any).is_captain);

    const { data: members, error: membersErr } = await supabaseAdmin
      .from('team_members')
      .select(
        'id, user_id, display_name, role, captain, is_captain, battle_tag'
      )
      .eq('team_id', teamId)
      .order('captain', { ascending: false })
      .order('is_captain', { ascending: false });

    if (membersErr) {
      console.error('[teams/my] members error:', membersErr);
      return res
        .status(500)
        .json({ error: 'Failed to load your team members.' });
    }

    return res.status(200).json({
      team,
      members: members || [],
      isCaptain,
    });
  }

  if (req.method === 'PATCH') {
    const body = req.body as UpdateBody;
    if (!body?.teamId) {
      return res.status(400).json({ error: 'teamId required.' });
    }

    // Vérifier capitaine
    const { data: membership, error: membershipErr } = await supabaseAdmin
      .from('team_members')
      .select('captain, is_captain')
      .eq('team_id', body.teamId)
      .eq('user_id', userId)
      .maybeSingle();

    if (membershipErr) {
      console.error('[teams/my] membership check error:', membershipErr);
      return res
        .status(500)
        .json({ error: 'Failed to verify your permissions on this team.' });
    }

    const isCaptain =
      Boolean((membership as any)?.captain) ||
      Boolean((membership as any)?.is_captain);

    if (!isCaptain) {
      return res.status(403).json({ error: 'Access restricted to team captain.' });
    }

    const updatePayload: Record<string, any> = {};
    if (typeof body.name === 'string') updatePayload.name = body.name.trim();
    if ('short_name' in body)
      updatePayload.short_name = body.short_name?.trim() || null;
    if ('bio' in body) updatePayload.bio = body.bio || null;
    if ('logo_url' in body) updatePayload.logo_url = body.logo_url || null;
    if ('country' in body) updatePayload.country = body.country || null;
    if ('description' in body)
      updatePayload.description = body.description || null;

    const { error: updateErr } = await supabaseAdmin
      .from('teams')
      .update(updatePayload)
      .eq('id', body.teamId);

    if (updateErr) {
      console.error('[teams/my] update error:', updateErr);
      return res
        .status(500)
        .json({ error: 'Failed to update team.' });
    }

    return res.status(200).json({ team: null, members: [], isCaptain: true });
  }

  res.setHeader('Allow', 'GET,PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}
