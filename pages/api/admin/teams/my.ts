// Route cote utilisateur (capitaine ou manager) via withAuthRoute, pas une
// route staff. Le GET délègue à `loadManagedTeamSlice` (helper serveur partagé
// avec /api/player/dashboard) : source de vérité UNIQUE pour « mon équipe /
// suis-je capitaine ». La route est désormais scopée tenant (via
// resolveTenantIdForUserRequest), ce qui corrige l'ancien bug S5c où
// getManagedTeam était appelé sans tenantId et les queries non scopées.
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { sanitizeUrl } from '@/utils/apiHelpers';
import { withSubjectRoute } from '@/utils/subject';
import {
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { loadManagedTeamSlice } from '@/utils/teams/managedTeamSlice';

import { logger } from '../../../../utils/logger';
type MemberRow = {
  id: string;
  user_id: string | null;
  role: string | null;
  battle_tag: string | null;
  battle_tag_verified_at: string | null;
  specialty: string | null;
  is_substitute: boolean;
  captain?: boolean | null;
  is_captain?: boolean | null;
};

type TeamRow = {
  id: string;
  slug: string | null;
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
  isManager: boolean;
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

export default withSubjectRoute(
  async function handler(
    req: NextApiRequest,
    res: NextApiResponse<GetResponse | { error: string }>,
    { user, subject }
  ) {
    if (
      applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-teams-my')
    )
      return;

    // GET inspectable par le staff (`?as=`) ; le PATCH plus bas reste
    // strictement l'affaire de l'appelant (le wrapper refuse `?as=` en écriture).
    const userId = user.id;

    if (req.method === 'GET') {
      const slice = await loadManagedTeamSlice(
        subject.userId,
        subject.tenantId
      );

      // Payload public inchangé en forme : { team, members, isCaptain, isManager }.
      // La tranche renvoyée par le helper est un surensemble (team.captain_id /
      // open_for_scrim, member.battle_tag_verified_at / captain / is_captain) —
      // ajouts additifs, non cassants pour les consommateurs existants.
      return res.status(200).json({
        team: slice.team,
        members: slice.members,
        isCaptain: slice.isCaptain,
        isManager: slice.isManager,
      });
    }

    if (req.method === 'PATCH') {
      const body = req.body as UpdateBody;
      if (!body?.teamId) {
        return res.status(400).json({ error: 'teamId required.' });
      }

      // Vérifier que l'utilisateur peut gérer cette team (capitaine ou manager)
      const access = await getManagedTeam(userId);
      if (!access || access.teamId !== body.teamId) {
        return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
      }

      const { data: teamData, error: teamErr } = await supabaseAdmin
        .from('teams')
        .select('captain_id')
        .eq('id', body.teamId)
        .maybeSingle();

      if (teamErr || !teamData) {
        return res.status(404).json({ error: 'Team not found.' });
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
        logger.error('[teams/my] update error:', updateErr);
        return res.status(500).json({ error: 'Failed to update team.' });
      }

      return res.status(200).json({
        team: updatedTeam,
        members: [],
        isCaptain: access.isCaptain,
        isManager: access.isManager,
      });
    }

    res.setHeader('Allow', 'GET,PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  },
  { auditAction: 'view_captain_data' }
);
