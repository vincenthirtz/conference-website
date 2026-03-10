// pages/api/admin/teams/[teamId].ts
// Admin: gestion d'une équipe
// - GET        : récupérer une équipe
// - PUT/PATCH  : mettre à jour une équipe (meta)
// - DELETE     : désactiver (soft) ou supprimer (hard)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

export type TeamRow = {
  id: string;
  name: string;
  slug: string | null;
  short_name: string | null;
  logo_url: string | null;
  banner_url: string | null;
  country: string | null;
  description: string | null;
  twitter: string | null;
  discord: string | null;
  website: string | null;
  is_active: boolean;
  captain_id: string | null;
  created_at: string;
  updated_at: string | null;
};

// rôle minimum : manager (gestion des équipes)
export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: any) {
  const { teamId } = req.query;

  if (!teamId || Array.isArray(teamId)) {
    return res.status(400).json({ error: 'Invalid teamId' });
  }

  const id = String(teamId);

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(id, res);
      case 'PUT':
      case 'PATCH':
        return await handlePut(id, req, res, ctx);
      case 'DELETE':
        return await handleDelete(id, req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: any) {
    console.error('[/api/admin/teams/[teamId]] internal error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      detail: err?.message,
    });
  }
}

/* -----------------------------------------------------------
 * GET : récupérer une équipe
 * ---------------------------------------------------------*/

async function handleGet(id: string, res: NextApiResponse) {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    console.error('admin GET team error:', error);
    return res.status(404).json({ error: 'Team not found' });
  }

  // Récupérer les membres de l'équipe
  const { data: membersData, error: membersError } = await supabaseAdmin
    .from('team_members')
    .select(`
      id,
      user_id,
      role,
      battle_tag,
      profiles:user_id (
        id,
        display_name,
        email
      )
    `)
    .eq('team_id', id);

  if (membersError) {
    console.error('admin GET team members error:', membersError);
  }

  // Formater les membres
  const members = (membersData || []).map((m: any) => ({
    id: m.id,
    user_id: m.user_id,
    display_name: m.profiles?.display_name || m.battle_tag || null,
    role: m.role,
    battle_tag: m.battle_tag,
    captain: data.captain_id === m.user_id,
    is_captain: data.captain_id === m.user_id,
  }));

  return res.status(200).json({
    team: data as TeamRow,
    members,
  });
}

/* -----------------------------------------------------------
 * PUT / PATCH : mise à jour d'une équipe
 * Body : partial<TeamRow> (sans id/created_at)
 * ---------------------------------------------------------*/

async function handlePut(
  id: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const body = req.body || {};

  const allowedFields: (keyof TeamRow)[] = [
    'name',
    'slug',
    'short_name',
    'logo_url',
    'banner_url',
    'country',
    'description',
    'twitter',
    'discord',
    'website',
    'is_active',
    'captain_id',
  ];

  const updatePayload: Partial<TeamRow> = {};

  for (const key of allowedFields) {
    if (key in body) {
      updatePayload[key as keyof TeamRow] = body[key];
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({
      error: 'No valid fields to update. Allowed: ' + allowedFields.join(', '),
    });
  }

  // --- Validation des champs ---

  // Nom non vide
  if ('name' in body && (typeof body.name !== 'string' || body.name.trim().length === 0)) {
    return res.status(400).json({ error: 'Team name cannot be empty' });
  }

  // short_name non vide si fourni
  if ('short_name' in body && body.short_name !== null && (typeof body.short_name !== 'string' || body.short_name.trim().length === 0)) {
    return res.status(400).json({ error: 'short_name cannot be empty' });
  }

  // URLs basiques (logo_url, banner_url, website)
  const urlFields = ['logo_url', 'banner_url', 'website'] as const;
  for (const field of urlFields) {
    if (field in body && body[field] !== null && body[field] !== '') {
      if (typeof body[field] !== 'string') {
        return res.status(400).json({ error: `${field} must be a string` });
      }
    }
  }

  updatePayload.updated_at = new Date().toISOString();

  const { data: before, error: fetchErr } = await supabaseAdmin
    .from('teams')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !before) {
    return res.status(404).json({ error: 'Team not found' });
  }

  const { data, error } = await supabaseAdmin
    .from('teams')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    console.error('admin PUT team error:', error);
    return res.status(500).json({
      error: 'Failed to update team',
    });
  }

  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'update_team',
        entity_type: 'team',
        entity_id: id,
        tournament_id: null,
        payload: {
          before,
          after: data,
        },
      });
    } catch (e) {
      console.error('admin PUT team logStaffAction error:', e);
    }
  }

  return res.status(200).json({
    team: data as TeamRow,
  });
}

/* -----------------------------------------------------------
 * DELETE :
 *  - soft (par défaut) : is_active=false
 *  - hard (?hard=1) : suppression DB
 * ---------------------------------------------------------*/

async function handleDelete(
  id: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const hard = req.query.hard === '1' || req.query.hard === 'true';

  const { data: before, error: fetchErr } = await supabaseAdmin
    .from('teams')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !before) {
    return res.status(404).json({ error: 'Team not found' });
  }

  if (hard) {
    const { error } = await supabaseAdmin.from('teams').delete().eq('id', id);

    if (error) {
      console.error('admin hard delete team error:', error);
      return res.status(500).json({
        error: 'Failed to hard-delete team',
      });
    }

    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'delete_team',
          entity_type: 'team',
          entity_id: id,
          tournament_id: null,
          payload: {
            hard_delete: true,
          },
        });
      } catch (e) {
        console.error('admin hard delete team logStaffAction error:', e);
      }
    }

    return res.status(200).json({
      success: true,
      hardDeleted: true,
    });
  }

  // soft delete
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('teams')
    .update({
      is_active: false,
      deleted_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    console.error('admin soft delete team error:', error);
    return res.status(500).json({
      error: 'Failed to deactivate team',
    });
  }

  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'update_team',
        entity_type: 'team',
        entity_id: id,
        tournament_id: null,
        payload: {
          soft_delete: true,
          new_is_active: false,
        },
      });
    } catch (e) {
      console.error('admin soft delete team logStaffAction error:', e);
    }
  }

  return res.status(200).json({
    success: true,
    hardDeleted: false,
    team: data as TeamRow,
  });
}
