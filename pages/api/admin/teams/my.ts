import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { sanitizeUrl } from '@/utils/apiHelpers';
import { withAuthRoute } from '@/utils/staff';

type MemberRow = {
  id: string;
  user_id: string | null;
  role: string | null;
  battle_tag: string | null;
  is_substitute: boolean;
  captain?: boolean | null;
  is_captain?: boolean | null;
};

type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  description: string | null;
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
  logo_url?: string | null;
  country?: string | null;
  description?: string | null;
  discord?: string | null;
  website?: string | null;
};

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetResponse | { error: string }>,
  { user }
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-teams-my'))
    return;

  const userId = user.id;

  if (req.method === 'GET') {
    // Chercher l'équipe où l'utilisateur est membre
    const { data: membership, error: membershipErr } = await supabaseAdmin
      .from('team_members')
      .select(
        'team_id, teams!inner(id, name, short_name, logo_url, country, description, captain_id, is_joinable)'
      )
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (membershipErr) {
      console.error('[teams/my] membership error:', membershipErr);
      return res.status(500).json({ error: 'Failed to load your team.' });
    }

    if (!membership) {
      return res.status(200).json({
        team: null,
        members: [],
        isCaptain: false,
      });
    }

    const teamId = (membership as any).team_id as string;
    const teamRaw = (membership as any).teams as any;
    const captainId = teamRaw.captain_id as string | null;
    const isCaptain = captainId === userId;
    const team: TeamRow & { is_joinable?: boolean } = {
      id: teamRaw.id,
      name: teamRaw.name,
      short_name: teamRaw.short_name,
      logo_url: teamRaw.logo_url,
      country: teamRaw.country,
      description: teamRaw.description,
      is_joinable: teamRaw.is_joinable ?? false,
    };

    const { data: membersRaw, error: membersErr } = await supabaseAdmin
      .from('team_members')
      .select('id, user_id, role, battle_tag, is_substitute')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true });

    if (membersErr) {
      console.error('[teams/my] members error:', membersErr);
      return res
        .status(500)
        .json({ error: 'Failed to load your team members.' });
    }

    // Dériver le statut capitaine depuis teams.captain_id
    const members = (membersRaw || []).map((m: any) => ({
      ...m,
      captain: captainId === m.user_id,
      is_captain: captainId === m.user_id,
    }));

    return res.status(200).json({
      team,
      members,
      isCaptain,
    });
  }

  if (req.method === 'PATCH') {
    const body = req.body as UpdateBody;
    if (!body?.teamId) {
      return res.status(400).json({ error: 'teamId required.' });
    }

    // Vérifier capitaine via teams.captain_id
    const { data: teamData, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('captain_id')
      .eq('id', body.teamId)
      .maybeSingle();

    if (teamErr || !teamData) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    if (teamData.captain_id !== userId) {
      return res
        .status(403)
        .json({ error: 'Access restricted to team captain.' });
    }

    // Validations
    if (typeof body.name === 'string') {
      const trimmed = body.name.trim();
      if (trimmed.length < 2 || trimmed.length > 100) {
        return res
          .status(400)
          .json({ error: 'Le nom doit faire entre 2 et 100 caractères.' });
      }
    }

    if (
      'description' in body &&
      body.description &&
      body.description.length > 2000
    ) {
      return res.status(400).json({
        error: 'La description ne peut pas dépasser 2000 caractères.',
      });
    }

    // Valider les URLs
    const urlFields = ['logo_url', 'website', 'discord'] as const;
    for (const field of urlFields) {
      if (field in body && body[field]) {
        const safe = sanitizeUrl(body[field] as string);
        if (!safe) {
          return res
            .status(400)
            .json({ error: `${field} doit être une URL http(s) valide.` });
        }
      }
    }

    const updatePayload: Record<string, any> = {};
    if (typeof body.name === 'string') updatePayload.name = body.name.trim();
    if ('short_name' in body)
      updatePayload.short_name = body.short_name?.trim() || null;
    if ('logo_url' in body)
      updatePayload.logo_url = body.logo_url
        ? sanitizeUrl(body.logo_url)
        : null;
    if ('country' in body) updatePayload.country = body.country || null;
    if ('description' in body)
      updatePayload.description = body.description || null;
    if ('discord' in body)
      updatePayload.discord = body.discord ? sanitizeUrl(body.discord) : null;
    if ('website' in body)
      updatePayload.website = body.website ? sanitizeUrl(body.website) : null;

    updatePayload.updated_at = new Date().toISOString();

    const { data: updatedTeam, error: updateErr } = await supabaseAdmin
      .from('teams')
      .update(updatePayload)
      .eq('id', body.teamId)
      .select('*')
      .maybeSingle();

    if (updateErr) {
      console.error('[teams/my] update error:', updateErr);
      return res.status(500).json({ error: 'Failed to update team.' });
    }

    return res
      .status(200)
      .json({ team: updatedTeam, members: [], isCaptain: true });
  }

  res.setHeader('Allow', 'GET,PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
});
