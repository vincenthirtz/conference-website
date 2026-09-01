// pages/api/admin/teams/[teamId].ts
// Admin: gestion d'une équipe
// - GET        : récupérer une équipe
// - PUT/PATCH  : mettre à jour une équipe (meta)
// - DELETE     : désactiver (soft) ou supprimer (hard)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID, sanitizeUrl } from '@/utils/apiHelpers';
import { emitBotEvent } from '@/utils/botEvents';
import {
  SKILL_RATING_MAX,
  SKILL_RATING_MIN,
  isValidSkillRating,
} from '@/utils/overwatchRank';

import { logger } from '../../../../utils/logger';
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
  discord_role_id: string | null;
  discord_channel_id: string | null;
  discord_voice_channel_id: string | null;
  website: string | null;
  is_active: boolean;
  captain_id: string | null;
  /** SR d'ensemble déclaré (0-5000, `null` = non déclaré). */
  skill_rating: number | null;
  created_at: string;
  updated_at: string | null;
};

// rôle minimum : manager (gestion des équipes)
export default withStaffRoute(handler, { permission: 'manage_teams' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { teamId } = req.query;

  if (!teamId || Array.isArray(teamId) || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'Invalid teamId' });
  }

  const id = String(teamId);

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(id, req, res, ctx);
      case 'PUT':
      case 'PATCH':
        return await handlePut(id, req, res, ctx);
      case 'DELETE':
        return await handleDelete(id, req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: unknown) {
    logger.error('[/api/admin/teams/[teamId]] internal error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}

/* -----------------------------------------------------------
 * GET : récupérer une équipe
 *
 * Par défaut ne renvoie QUE `{ team }`. Les consommateurs `edit.tsx` et
 * `index.tsx` rechargent les membres via `/api/admin/teams/[teamId]/members`
 * et ignorent tout `members` renvoyé ici : ne rien joindre évite un
 * double-fetch. Seul `pages/admin/teams/my.tsx` (chemin admin) lit
 * `.members` de cette réponse — il passe `?withMembers=1` pour demander la
 * jointure explicitement.
 * ---------------------------------------------------------*/

async function handleGet(
  id: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (error || !data) {
    logger.error('admin GET team error:', error);
    return res.status(404).json({ error: 'Team not found' });
  }

  const withMembers =
    req.query.withMembers === '1' || req.query.withMembers === 'true';

  if (!withMembers) {
    return res.status(200).json({ team: data as TeamRow });
  }

  // Récupérer les membres de l'équipe (opt-in via ?withMembers=1)
  const { data: membersData, error: membersError } = await supabaseAdmin
    .from('team_members')
    .select(
      `
      id,
      user_id,
      role,
      battle_tag,
      profiles:user_id (
        id,
        display_name,
        email
      )
    `
    )
    .eq('tenant_id', ctx.tenantId)
    .eq('team_id', id);

  if (membersError) {
    logger.error('admin GET team members error:', membersError);
  }

  // Formater les membres
  const members = (membersData || []).map((m: any) => ({
    id: m.id,
    user_id: m.user_id,
    display_name: m.profiles?.display_name || m.battle_tag || null,
    role: m.role,
    battle_tag: m.battle_tag,
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
  ctx: AuthenticatedStaffContext
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
    'discord_role_id',
    'website',
    'is_active',
    'captain_id',
    'skill_rating',
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
  if (
    'name' in body &&
    (typeof body.name !== 'string' || body.name.trim().length === 0)
  ) {
    return res.status(400).json({ error: 'Team name cannot be empty' });
  }

  // short_name non vide si fourni
  if (
    'short_name' in body &&
    body.short_name !== null &&
    (typeof body.short_name !== 'string' || body.short_name.trim().length === 0)
  ) {
    return res.status(400).json({ error: 'short_name cannot be empty' });
  }

  // slug format si fourni : lowercase + chiffres + tirets, 1..64 chars
  if ('slug' in updatePayload && updatePayload.slug != null) {
    const v = updatePayload.slug;
    if (
      typeof v !== 'string' ||
      v.length === 0 ||
      v.length > 64 ||
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)
    ) {
      return res.status(400).json({
        error:
          'slug doit contenir uniquement [a-z0-9-] (1 à 64 caractères, sans tirets en bord)',
      });
    }
  }

  // skill_rating : SR d'ensemble déclaré. La boucle d'allowlist ci-dessus
  // recopie `body[key]` TEL QUEL — un « 3500 » venu d'un champ de formulaire
  // partirait donc en base sous forme de chaîne. On parse et on valide ici, et
  // on réécrit la valeur coercée dans le payload.
  if ('skill_rating' in updatePayload) {
    const raw = updatePayload.skill_rating as unknown;
    if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      updatePayload.skill_rating = null;
    } else {
      const parsed = typeof raw === 'string' ? Number(raw.trim()) : raw;
      if (!isValidSkillRating(parsed)) {
        return res.status(400).json({
          error: `skill_rating doit être un entier entre ${SKILL_RATING_MIN} et ${SKILL_RATING_MAX}, ou null`,
        });
      }
      updatePayload.skill_rating = parsed;
    }
  }

  // discord_role_id: numeric string (Discord snowflake ID) or null
  if (
    'discord_role_id' in updatePayload &&
    updatePayload.discord_role_id != null
  ) {
    const v = updatePayload.discord_role_id;
    if (typeof v !== 'string' || !/^\d{17,20}$/.test(v.trim())) {
      return res.status(400).json({
        error:
          'discord_role_id doit être un ID Discord (17 à 20 chiffres) ou null',
      });
    }
    updatePayload.discord_role_id = v.trim();
  }

  // Sanitize URL fields (reject javascript:, data: etc.)
  const urlFields = [
    'logo_url',
    'banner_url',
    'website',
    'twitter',
    'discord',
  ] as const;
  for (const field of urlFields) {
    if (
      field in updatePayload &&
      updatePayload[field as keyof TeamRow] != null
    ) {
      const val = updatePayload[field as keyof TeamRow];
      if (typeof val === 'string' && val !== '') {
        const safe = sanitizeUrl(val);
        if (!safe) {
          return res
            .status(400)
            .json({ error: `${field} must be a valid http(s) URL` });
        }
        (updatePayload as any)[field] = safe;
      }
    }
  }

  updatePayload.updated_at = new Date().toISOString();

  const { data: before, error: fetchErr } = await supabaseAdmin
    .from('teams')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (fetchErr || !before) {
    return res.status(404).json({ error: 'Team not found' });
  }

  const { data, error } = await supabaseAdmin
    .from('teams')
    .update(updatePayload)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    logger.error('admin PUT team error:', error);
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
      logger.error('admin PUT team logStaffAction error:', e);
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
  ctx: AuthenticatedStaffContext
) {
  const hard = req.query.hard === '1' || req.query.hard === 'true';

  const { data: before, error: fetchErr } = await supabaseAdmin
    .from('teams')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (fetchErr || !before) {
    return res.status(404).json({ error: 'Team not found' });
  }

  if (hard) {
    // Cascade delete : supprimer les dépendances avant l'équipe
    const { error: demandesErr } = await supabaseAdmin
      .from('demandes')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .eq('team_id', id);
    if (demandesErr) {
      logger.error(
        'admin hard delete team — demandes cleanup error:',
        demandesErr
      );
    }

    const { error: stageTeamsErr } = await supabaseAdmin
      .from('stage_teams')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .eq('team_id', id);
    if (stageTeamsErr) {
      logger.error(
        'admin hard delete team — stage_teams cleanup error:',
        stageTeamsErr
      );
    }

    const { error: membersErr } = await supabaseAdmin
      .from('team_members')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .eq('team_id', id);
    if (membersErr) {
      logger.error(
        'admin hard delete team — team_members cleanup error:',
        membersErr
      );
    }

    const { error } = await supabaseAdmin
      .from('teams')
      .delete()
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId);

    if (error) {
      logger.error('admin hard delete team error:', error);
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
            cascade: { demandes: true, stage_teams: true, team_members: true },
          },
        });
      } catch (e) {
        logger.error('admin hard delete team logStaffAction error:', e);
      }
    }

    void emitBotEvent(
      'team.dissolved',
      {
        teamId: id,
        name: (before as TeamRow).name,
        hardDelete: true,
        discordRoleId: (before as TeamRow).discord_role_id ?? null,
        discordChannelId: (before as TeamRow).discord_channel_id ?? null,
        discordVoiceChannelId:
          (before as TeamRow).discord_voice_channel_id ?? null,
      },
      ctx.tenantId
    ).catch((e) => logger.error('[botEvents] team.dissolved emit error:', e));

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
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    logger.error('admin soft delete team error:', error);
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
      logger.error('admin soft delete team logStaffAction error:', e);
    }
  }

  void emitBotEvent(
    'team.dissolved',
    {
      teamId: id,
      name: (before as TeamRow).name,
      hardDelete: false,
      discordRoleId: (before as TeamRow).discord_role_id ?? null,
      discordChannelId: (before as TeamRow).discord_channel_id ?? null,
      discordVoiceChannelId:
        (before as TeamRow).discord_voice_channel_id ?? null,
    },
    ctx.tenantId
  ).catch((e) => logger.error('[botEvents] team.dissolved emit error:', e));

  return res.status(200).json({
    success: true,
    hardDeleted: false,
    team: data as TeamRow,
  });
}
