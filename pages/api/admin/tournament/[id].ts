// pages/api/admin/tournament/[id].ts
// Admin: détails d'un tournoi + modification du statut
// - GET  : récupérer les détails
// - PATCH: modifier le statut (et autres champs)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  validateFieldDefinitions,
  type RegistrationField,
} from '@/utils/registrationFields';

import { logger } from '../../../../utils/logger';
type TournamentDetail = {
  id: string;
  name: string;
  slug: string | null;
  game: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string | null;
  max_teams: number | null;
  min_players: number | null;
  max_players: number | null;
  roster_locked_at: string | null;
  is_public: boolean;
  is_featured: boolean;
  logo_url: string | null;
  banner_url: string | null;
  rules_url: string | null;
  description_info: string | null;
  schedule_details: string | null;
  schedule_rules: string | null;
  format_details: string | null;
  registration_fields: RegistrationField[] | null;
  created_at: string;
  updated_at: string | null;
};

type ApiResponse =
  | { tournament: TournamentDetail }
  | { error: string }
  | { success: boolean; tournament: TournamentDetail };

// The DB stores publication state as `visibility` ('public' | 'private'), but
// the edit UI consumes a boolean `is_public`. Map it on the way out so a full
// round-trip (GET → edit form → PATCH) preserves the flag.
function toTournamentDetail(row: Record<string, any>): TournamentDetail {
  const { visibility, ...rest } = row ?? {};
  return { ...rest, is_public: visibility === 'public' } as TournamentDetail;
}

const VALID_STATUSES = [
  'draft',
  'published',
  'running',
  'completed',
  'archived',
];

// Rôle minimum : manager
export default withStaffRoute(handler, { permission: 'manage_tournaments' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  const { id } = req.query;

  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Missing or invalid tournament id' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, id, ctx);
    case 'PATCH':
    case 'PUT':
      return handlePatch(req, res, id, ctx);
    default:
      res.setHeader('Allow', 'GET,PATCH,PUT');
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  id: string,
  ctx: AuthenticatedStaffContext
) {
  try {
    const { data, error } = await supabaseAdmin!
      .from('tournaments')
      .select(
        `
        id,
        name,
        slug,
        game,
        status,
        start_date,
        end_date,
        timezone,
        format,
        format_type,
        max_teams,
        min_players,
        max_players,
        roster_locked_at,
        visibility,
        is_featured,
        logo_url,
        banner_url,
        rules_url,
        description_info,
        schedule_details,
        schedule_rules,
        format_details,
        registration_fields,
        created_at,
        updated_at
`
      )
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (error) {
      logger.error('admin GET tournament error:', error);
      return res.status(500).json({ error: 'Failed to fetch tournament' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    return res.status(200).json({ tournament: toTournamentDetail(data) });
  } catch (err: unknown) {
    logger.error('admin GET tournament internal error:', err);
    return res
      .status(500)
      .json({ error: (err as Error)?.message || 'Internal server error' });
  }
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  id: string,
  ctx: AuthenticatedStaffContext
) {
  try {
    const {
      status,
      name,
      slug,
      game,
      start_date,
      end_date,
      roster_locked_at,
      timezone,
      format,
      format_type,
      max_teams,
      min_players,
      max_players,
      is_public,
      is_featured,
      logo_url,
      banner_url,
      rules_url,
      description_info,
      schedule_details,
      schedule_rules,
      format_details,
      registration_fields,
    } = req.body;

    // Champs d'inscription personnalisés (définitions). Validés via le contrat
    // partagé utils/registrationFields ; on persiste le tableau nettoyé.
    let cleanedRegistrationFields: RegistrationField[] | undefined;
    if (registration_fields !== undefined) {
      const fieldsResult = validateFieldDefinitions(registration_fields);
      if (!fieldsResult.ok) {
        return res.status(400).json({ error: fieldsResult.error });
      }
      cleanedRegistrationFields = fieldsResult.fields;
    }

    // --- Validation des champs ---

    // Statut
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Allowed values: ${VALID_STATUSES.join(', ')}`,
      });
    }

    // Nom non vide
    if (
      name !== undefined &&
      (typeof name !== 'string' || name.trim().length === 0)
    ) {
      return res.status(400).json({ error: 'Tournament name cannot be empty' });
    }

    // max_teams doit être un entier > 0
    if (max_teams !== undefined && max_teams !== null) {
      if (
        typeof max_teams !== 'number' ||
        !Number.isInteger(max_teams) ||
        max_teams < 1
      ) {
        return res
          .status(400)
          .json({ error: 'max_teams must be an integer >= 1' });
      }
    }

    // min_players doit être un entier > 0
    if (min_players !== undefined && min_players !== null) {
      if (
        typeof min_players !== 'number' ||
        !Number.isInteger(min_players) ||
        min_players < 1
      ) {
        return res
          .status(400)
          .json({ error: 'min_players must be an integer >= 1' });
      }
    }

    // max_players doit être un entier > 0
    if (max_players !== undefined && max_players !== null) {
      if (
        typeof max_players !== 'number' ||
        !Number.isInteger(max_players) ||
        max_players < 1
      ) {
        return res
          .status(400)
          .json({ error: 'max_players must be an integer >= 1' });
      }
    }

    // Validation des dates ISO
    if (
      start_date !== undefined &&
      start_date !== null &&
      isNaN(Date.parse(start_date))
    ) {
      return res.status(400).json({ error: 'start_date is not a valid date' });
    }
    if (
      end_date !== undefined &&
      end_date !== null &&
      isNaN(Date.parse(end_date))
    ) {
      return res.status(400).json({ error: 'end_date is not a valid date' });
    }

    if (
      roster_locked_at !== undefined &&
      roster_locked_at !== null &&
      isNaN(Date.parse(roster_locked_at))
    ) {
      return res
        .status(400)
        .json({ error: 'roster_locked_at is not a valid date' });
    }

    // Cohérence des dates : start_date < end_date
    if (start_date !== undefined && end_date !== undefined) {
      if (
        start_date &&
        end_date &&
        new Date(start_date) >= new Date(end_date)
      ) {
        return res.status(400).json({
          error: 'start_date must be before end_date',
        });
      }
    }

    // Vérifier l'unicité du slug si modifié
    if (slug !== undefined && slug !== null) {
      const { data: existingSlug } = await supabaseAdmin!
        .from('tournaments')
        .select('id')
        .eq('tenant_id', ctx.tenantId)
        .eq('slug', slug)
        .neq('id', id)
        .maybeSingle();

      if (existingSlug) {
        return res.status(409).json({
          error: `Un tournoi avec le slug "${slug}" existe déjà.`,
        } as any);
      }
    }

    // Récupérer l'état avant modification
    const { data: before, error: fetchErr } = await supabaseAdmin!
      .from('tournaments')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (fetchErr || !before) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Vérifier la cohérence des dates avec les valeurs existantes
    // (quand une seule date est modifiée)
    const effectiveStart =
      start_date !== undefined ? start_date : before.start_date;
    const effectiveEnd = end_date !== undefined ? end_date : before.end_date;
    if (
      effectiveStart &&
      effectiveEnd &&
      new Date(effectiveStart) >= new Date(effectiveEnd)
    ) {
      return res.status(400).json({
        error: 'start_date must be before end_date',
      });
    }

    // --- Gardes de transition de statut ---
    if (status !== undefined && status !== before.status) {
      const guards = await checkStatusTransitionGuards(
        id as string,
        before.status,
        status,
        ctx.tenantId
      );
      if (guards) {
        return res
          .status(400)
          .json({ error: guards.error, warnings: guards.warnings } as any);
      }
    }

    // Construire l'objet de mise à jour
    const updatePayload: Record<string, any> = {};

    if (status !== undefined) updatePayload.status = status;
    if (name !== undefined) updatePayload.name = name;
    if (slug !== undefined) updatePayload.slug = slug;
    if (game !== undefined) updatePayload.game = game;
    if (start_date !== undefined) updatePayload.start_date = start_date;
    if (end_date !== undefined) updatePayload.end_date = end_date;
    if (roster_locked_at !== undefined)
      updatePayload.roster_locked_at = roster_locked_at;
    if (timezone !== undefined) updatePayload.timezone = timezone;
    // `format` : libellé court (texte libre) affiché sur la carte FORMAT de la
    // page publique. Distinct de `format_type` (structure) et `format_details`.
    if (format !== undefined) updatePayload.format = format;
    if (format_type !== undefined) updatePayload.format_type = format_type;
    if (max_teams !== undefined) updatePayload.max_teams = max_teams;
    if (min_players !== undefined) updatePayload.min_players = min_players;
    if (max_players !== undefined) updatePayload.max_players = max_players;
    // Map is_public (frontend) to visibility (database)
    if (is_public !== undefined)
      updatePayload.visibility = is_public ? 'public' : 'private';
    if (is_featured !== undefined) updatePayload.is_featured = is_featured;
    if (logo_url !== undefined) updatePayload.logo_url = logo_url;
    if (banner_url !== undefined) updatePayload.banner_url = banner_url;
    if (rules_url !== undefined) updatePayload.rules_url = rules_url;
    if (description_info !== undefined)
      updatePayload.description_info = description_info;
    if (schedule_details !== undefined)
      updatePayload.schedule_details = schedule_details;
    if (schedule_rules !== undefined)
      updatePayload.schedule_rules = schedule_rules;
    if (format_details !== undefined)
      updatePayload.format_details = format_details;
    if (cleanedRegistrationFields !== undefined)
      updatePayload.registration_fields = cleanedRegistrationFields;

    // Si rien à mettre à jour
    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Mise à jour
    const { data: after, error: updateErr } = await supabaseAdmin!
      .from('tournaments')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .select(
        `
        id,
        name,
        slug,
        game,
        status,
        start_date,
        end_date,
        timezone,
        format,
        format_type,
        max_teams,
        min_players,
        max_players,
        roster_locked_at,
        visibility,
        is_featured,
        logo_url,
        banner_url,
        rules_url,
        description_info,
        schedule_details,
        schedule_rules,
        format_details,
        registration_fields,
        created_at,
        updated_at
`
      )
      .single();

    if (updateErr) {
      logger.error('admin PATCH tournament error:', updateErr);
      return res.status(500).json({ error: 'Failed to update tournament' });
    }

    // Log de l'action staff
    const staffId = ctx.staff?.id;
    if (staffId) {
      try {
        await logStaffAction({
          staff_id: staffId,
          action: 'tournament_update',
          entity_type: 'tournament',
          entity_id: id,
          tournament_id: id,
          payload: {
            changes: updatePayload,
            before: { status: before.status },
            after: { status: after.status },
          },
        });
      } catch (logErr) {
        logger.error('admin PATCH tournament logStaffAction error:', logErr);
      }
    }

    return res.status(200).json({
      success: true,
      tournament: toTournamentDetail(after),
    });
  } catch (err: unknown) {
    logger.error('admin PATCH tournament internal error:', err);
    return res
      .status(500)
      .json({ error: (err as Error)?.message || 'Internal server error' });
  }
}

/* -----------------------------------------------------------
 * Gardes de transition de statut
 * Vérifie les pré-conditions avant d'autoriser un changement de statut.
 * Retourne null si OK, sinon un objet { error, warnings }.
 * ---------------------------------------------------------*/
async function checkStatusTransitionGuards(
  tournamentId: string,
  currentStatus: string | null,
  newStatus: string,
  tenantId: string
): Promise<{ error: string; warnings?: string[] } | null> {
  // published -> doit avoir au moins 1 stage
  if (newStatus === 'published') {
    const { data: stages } = await supabaseAdmin!
      .from('tournament_stages')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .limit(1);

    if (!stages || stages.length === 0) {
      return {
        error:
          'Impossible de publier : le tournoi doit avoir au moins 1 phase (stage).',
      };
    }
  }

  // running -> doit avoir au moins 1 stage avec des équipes
  if (newStatus === 'running') {
    const { data: stages } = await supabaseAdmin!
      .from('tournament_stages')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .limit(1);

    if (!stages || stages.length === 0) {
      return {
        error:
          'Impossible de lancer : le tournoi doit avoir au moins 1 phase (stage).',
      };
    }

    const { data: teams } = await supabaseAdmin!
      .from('tournament_teams')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .limit(1);

    if (!teams || teams.length === 0) {
      return {
        error:
          'Impossible de lancer : le tournoi doit avoir au moins 1 équipe inscrite.',
      };
    }
  }

  // completed -> ne peut venir que de running
  if (newStatus === 'completed' && currentStatus !== 'running') {
    return {
      error:
        'Impossible de terminer : le tournoi doit être en cours (running) pour être marqué comme terminé.',
    };
  }

  return null;
}
