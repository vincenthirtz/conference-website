// pages/api/admin/teams/[teamId]/availability.ts
//
// Contraintes de disponibilité d'une équipe — CRUD staff (lot 2 de
// docs/PLAN-plateforme-tournois.md). Le modèle est décrit dans
// database/migrations/team_availability_constraints.sql.
//
// GET    — `?tournament_id=<uuid>` optionnel. Sans filtre : TOUTES les
//          contraintes de l'équipe. Avec : celles qui s'appliquent à ce
//          tournoi, donc les siennes ET les globales — c'est ce qui compte
//          pour planifier, et l'ignorer ferait manquer « on ne joue jamais
//          le lundi ».
// POST   — crée une contrainte → 201 `{ constraint }`.
// PATCH  — `?id=<uuid>` ; corps partiel → 200 `{ constraint }`.
// DELETE — `?id=<uuid>` → 204.
//
// Auth : permission `manage_teams`, scope tenant strict. Writes : rate-limit +
// idempotence. Audit : slugs dédiés (`team_availability_*`) — le fourre-tout
// `other` pèse déjà un quart du journal, on n'y ajoute rien.

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  AVAILABILITY_COLUMNS,
  rowToConstraint,
  type AvailabilityRow,
} from '@/utils/matches/availabilityRows';

const uuid = z.string().uuid();

/** `HH:MM` ou `HH:MM:SS`, bornes réelles — `25:00` n'est pas une heure. */
const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Heure attendue au format HH:MM');

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');

/**
 * Le fuseau est vérifié contre le runtime, pas contre une liste maison :
 * une contrainte posée sur un fuseau que Node ne connaît pas serait
 * silencieusement ignorée par le vérificateur (`checkConstraint` renvoie
 * `null` sur fuseau inconnu). Mieux vaut refuser à la saisie.
 */
const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'Fuseau IANA inconnu');

const NOTE_MAX = 500;

const baseFields = {
  tournament_id: uuid.nullable().optional(),
  timezone: timezone.optional(),
  note: z.string().trim().max(NOTE_MAX).nullable().optional(),
};

/**
 * Un schéma par nature plutôt qu'un objet permissif : c'est le pendant TypeScript
 * du CHECK SQL, et il rend l'erreur lisible à la saisie (« ends_on requis »)
 * au lieu d'un 500 PostgREST sur violation de contrainte.
 */
const createSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('blackout'),
    starts_on: isoDate,
    ends_on: isoDate,
    ...baseFields,
  }),
  z.object({ kind: z.literal('earliest'), time_of_day: timeOfDay, ...baseFields }),
  z.object({ kind: z.literal('latest'), time_of_day: timeOfDay, ...baseFields }),
  z.object({
    kind: z.literal('weekday'),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    ...baseFields,
  }),
]);

/** À la modification, la nature ne change pas : on change une valeur, pas un concept. */
const patchSchema = z
  .object({
    tournament_id: uuid.nullable().optional(),
    timezone: timezone.optional(),
    note: z.string().trim().max(NOTE_MAX).nullable().optional(),
    starts_on: isoDate.optional(),
    ends_on: isoDate.optional(),
    time_of_day: timeOfDay.optional(),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Corps vide' });

function readQueryParam(req: NextApiRequest, key: string): string | null {
  const raw = req.query[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  res.setHeader('Cache-Control', 'no-store');

  const teamId = readQueryParam(req, 'teamId');
  if (!teamId || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'Invalid teamId', code: 'INVALID_TEAM_ID' });
  }

  // L'équipe doit exister DANS le tenant courant : sans ce contrôle, une
  // contrainte pourrait être posée sur une équipe d'un autre tenant, que la
  // clé étrangère accepterait sans broncher.
  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('id', teamId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (teamErr) {
    logger.error('[admin/team-availability] team lookup', teamErr, { teamId });
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!team) {
    return res.status(404).json({ error: 'Team not found', code: 'TEAM_NOT_FOUND' });
  }

  if (req.method === 'GET') return handleList(req, res, ctx, teamId);

  if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE') {
    if (
      applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-team-availability')
    ) {
      return;
    }
    if (req.method === 'POST') {
      return handleCreate(req, res, ctx, teamId, team.name as string);
    }
    if (req.method === 'PATCH') {
      return handlePatch(req, res, ctx, teamId, team.name as string);
    }
    return handleDelete(req, res, ctx, teamId, team.name as string);
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}

async function handleList(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  teamId: string
) {
  const tournamentId = readQueryParam(req, 'tournament_id');
  if (tournamentId && !isValidUUID(tournamentId)) {
    return res
      .status(400)
      .json({ error: 'Invalid tournament id.', code: 'INVALID_TOURNAMENT_ID' });
  }

  let query = supabaseAdmin
    .from('team_availability_constraints')
    .select(AVAILABILITY_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('team_id', teamId);

  // Les globales comptent pour tous les tournois : les exclure du filtre
  // donnerait une liste rassurante et fausse.
  if (tournamentId) {
    query = query.or(`tournament_id.eq.${tournamentId},tournament_id.is.null`);
  }

  const { data, error } = await query.order('created_at', { ascending: true });

  if (error) {
    logger.error('[admin/team-availability] list', error, { teamId });
    return res.status(500).json({ error: 'Server error.' });
  }

  return res.status(200).json({
    teamId,
    constraints: ((data ?? []) as AvailabilityRow[]).map(rowToConstraint),
  });
}

async function handleCreate(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  teamId: string,
  teamName: string
) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid body.',
      code: 'INVALID_BODY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const body = parsed.data;

  if (body.kind === 'blackout' && body.ends_on < body.starts_on) {
    return res.status(400).json({
      error: 'La date de fin précède la date de début.',
      code: 'INVALID_RANGE',
    });
  }

  const tournamentId = body.tournament_id ?? null;
  if (tournamentId) {
    const { data: tournament } = await supabaseAdmin
      .from('tournaments')
      .select('id')
      .eq('id', tournamentId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    if (!tournament) {
      return res
        .status(404)
        .json({ error: 'Tournament not found', code: 'TOURNAMENT_NOT_FOUND' });
    }
  }

  const insert = {
    tenant_id: ctx.tenantId,
    team_id: teamId,
    tournament_id: tournamentId,
    kind: body.kind,
    starts_on: body.kind === 'blackout' ? body.starts_on : null,
    ends_on: body.kind === 'blackout' ? body.ends_on : null,
    time_of_day:
      body.kind === 'earliest' || body.kind === 'latest' ? body.time_of_day : null,
    weekdays: body.kind === 'weekday' ? body.weekdays : null,
    timezone: body.timezone ?? 'Europe/Paris',
    note: body.note ?? null,
    created_by: ctx.staff.id,
  };

  const { data: created, error } = await supabaseAdmin
    .from('team_availability_constraints')
    .insert(insert)
    .select(AVAILABILITY_COLUMNS)
    .single();

  if (error || !created) {
    logger.error('[admin/team-availability] insert', error, { teamId });
    return res.status(500).json({ error: 'Failed to create constraint.' });
  }

  const constraint = rowToConstraint(created as AvailabilityRow);
  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'team_availability_add',
    entity_type: 'team',
    entity_id: teamId,
    tenant_id: ctx.tenantId,
    tournament_id: tournamentId,
    payload: { team_name: teamName, constraint_id: constraint.id, kind: body.kind },
  });

  return res.status(201).json({ constraint });
}

async function loadOwned(
  ctx: AuthenticatedStaffContext,
  teamId: string,
  id: string
) {
  const { data } = await supabaseAdmin
    .from('team_availability_constraints')
    .select(AVAILABILITY_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .eq('team_id', teamId)
    .maybeSingle();
  return (data as AvailabilityRow | null) ?? null;
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  teamId: string,
  teamName: string
) {
  const id = readQueryParam(req, 'id');
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid id', code: 'INVALID_ID' });
  }

  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid body.',
      code: 'INVALID_BODY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const existing = await loadOwned(ctx, teamId, id);
  if (!existing) {
    return res.status(404).json({ error: 'Constraint not found', code: 'NOT_FOUND' });
  }

  // Les champs d'une AUTRE nature sont ignorés plutôt que refusés : le CHECK SQL
  // les rejetterait de toute façon, et l'appelant a plus probablement envoyé un
  // formulaire complet qu'une bêtise.
  const body = parsed.data;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('tournament_id' in body) update.tournament_id = body.tournament_id ?? null;
  if (body.timezone !== undefined) update.timezone = body.timezone;
  if (body.note !== undefined) update.note = body.note ?? null;
  if (existing.kind === 'blackout') {
    if (body.starts_on !== undefined) update.starts_on = body.starts_on;
    if (body.ends_on !== undefined) update.ends_on = body.ends_on;
    const from = (update.starts_on as string) ?? existing.starts_on;
    const to = (update.ends_on as string) ?? existing.ends_on;
    if (from && to && to < from) {
      return res.status(400).json({
        error: 'La date de fin précède la date de début.',
        code: 'INVALID_RANGE',
      });
    }
  }
  if (
    (existing.kind === 'earliest' || existing.kind === 'latest') &&
    body.time_of_day !== undefined
  ) {
    update.time_of_day = body.time_of_day;
  }
  if (existing.kind === 'weekday' && body.weekdays !== undefined) {
    update.weekdays = body.weekdays;
  }

  const { data: updated, error } = await supabaseAdmin
    .from('team_availability_constraints')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select(AVAILABILITY_COLUMNS)
    .single();

  if (error || !updated) {
    logger.error('[admin/team-availability] update', error, { id });
    return res.status(500).json({ error: 'Failed to update constraint.' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'team_availability_update',
    entity_type: 'team',
    entity_id: teamId,
    tenant_id: ctx.tenantId,
    tournament_id: (updated as AvailabilityRow).tournament_id,
    payload: { team_name: teamName, constraint_id: id, kind: existing.kind },
  });

  return res.status(200).json({ constraint: rowToConstraint(updated as AvailabilityRow) });
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  teamId: string,
  teamName: string
) {
  const id = readQueryParam(req, 'id');
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid id', code: 'INVALID_ID' });
  }

  const existing = await loadOwned(ctx, teamId, id);
  if (!existing) {
    return res.status(404).json({ error: 'Constraint not found', code: 'NOT_FOUND' });
  }

  const { error } = await supabaseAdmin
    .from('team_availability_constraints')
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);

  if (error) {
    logger.error('[admin/team-availability] delete', error, { id });
    return res.status(500).json({ error: 'Failed to delete constraint.' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'team_availability_delete',
    entity_type: 'team',
    entity_id: teamId,
    tenant_id: ctx.tenantId,
    tournament_id: existing.tournament_id,
    payload: { team_name: teamName, constraint_id: id, kind: existing.kind },
  });

  return res.status(204).end();
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-team-availability' }),
  { permission: 'manage_teams' }
);
