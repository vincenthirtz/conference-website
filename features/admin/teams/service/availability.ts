// features/admin/teams/service/availability.ts — contraintes de disponibilité
// d'une équipe, CRUD staff (`/api/admin/teams/[teamId]/availability`, lot 2
// de docs/PLAN-plateforme-tournois.md).
//
// GET    — `?tournament_id=` optionnel : celles du tournoi ET les globales.
// POST   — crée une contrainte → 201 `{ constraint }`.
// PATCH  — `?id=` ; corps partiel → `{ constraint }`.
// DELETE — `?id=` → 204.
//
// L'équipe est vérifiée DANS l'espace avant tout : la clé étrangère seule
// accepterait une équipe d'un autre espace.

import * as z from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { isValidUUID } from '@/utils/apiHelpers';
import { rowToConstraint } from '@/utils/matches/availabilityRows';
import type { Audited } from '../../_shared/audited';
import * as availability from '../repository/availability';
import * as teams from '../repository/teams';
import { fail, queryString } from './common';

const uuid = z.string().uuid();

/** `HH:MM` ou `HH:MM:SS`, bornes réelles — `25:00` n'est pas une heure. */
const timeOfDay = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
    'Heure attendue au format HH:MM'
  );

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');

/**
 * Fuseau vérifié contre le runtime : un fuseau que Node ne connaît pas
 * serait silencieusement ignoré par le vérificateur.
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

/** Un schéma par nature : le pendant TypeScript du CHECK SQL. */
const createSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('blackout'),
    starts_on: isoDate,
    ends_on: isoDate,
    ...baseFields,
  }),
  z.object({
    kind: z.literal('earliest'),
    time_of_day: timeOfDay,
    ...baseFields,
  }),
  z.object({
    kind: z.literal('latest'),
    time_of_day: timeOfDay,
    ...baseFields,
  }),
  z.object({
    kind: z.literal('weekday'),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    ...baseFields,
  }),
]);

/** À la modification, la nature ne change pas. */
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

function parseBody<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw fail(400, 'Invalid body.', 'INVALID_BODY', {
    fields: parsed.error.flatten().fieldErrors,
  });
}

/** L'équipe DANS l'espace courant : `teamId` puis existence. */
async function loadTeam(ctx: ServiceContext, rawTeamId: unknown) {
  const teamId = queryString(rawTeamId);
  if (!teamId || !isValidUUID(teamId)) {
    throw fail(400, 'Invalid teamId', 'INVALID_TEAM_ID');
  }
  const { row: team, error } = await teams.getTeamName(
    ctx.db,
    ctx.tenantId,
    teamId
  );
  if (error) {
    ctx.logger.error('[admin/team-availability] team lookup', error, {
      teamId,
    });
    throw fail(500, 'Server error.');
  }
  if (!team) throw fail(404, 'Team not found', 'TEAM_NOT_FOUND');
  return { teamId, teamName: team.name as string };
}

function readConstraintId(raw: unknown): string {
  const id = queryString(raw);
  if (!id || !isValidUUID(id)) throw fail(400, 'Invalid id', 'INVALID_ID');
  return id;
}

export async function listTeamAvailability(
  ctx: ServiceContext,
  query: Record<string, unknown>
) {
  const { teamId } = await loadTeam(ctx, query.teamId);

  const tournamentId = queryString(query.tournament_id);
  if (tournamentId && !isValidUUID(tournamentId)) {
    throw fail(400, 'Invalid tournament id.', 'INVALID_TOURNAMENT_ID');
  }

  const { rows, error } = await availability.listConstraints(
    ctx.db,
    ctx.tenantId,
    teamId,
    tournamentId
  );
  if (error) {
    ctx.logger.error('[admin/team-availability] list', error, { teamId });
    throw fail(500, 'Server error.');
  }

  return { teamId, constraints: rows.map(rowToConstraint) };
}

export async function createTeamAvailability(
  ctx: ServiceContext,
  query: Record<string, unknown>,
  rawBody: unknown
): Promise<Audited<{ constraint: ReturnType<typeof rowToConstraint> }>> {
  const { teamId, teamName } = await loadTeam(ctx, query.teamId);
  const body = parseBody(createSchema, rawBody);

  if (body.kind === 'blackout' && body.ends_on < body.starts_on) {
    throw fail(
      400,
      'La date de fin précède la date de début.',
      'INVALID_RANGE'
    );
  }

  const tournamentId = body.tournament_id ?? null;
  if (
    tournamentId &&
    !(await teams.tournamentExists(ctx.db, ctx.tenantId, tournamentId))
  ) {
    throw fail(404, 'Tournament not found', 'TOURNAMENT_NOT_FOUND');
  }

  const { row: created, error } = await availability.insertConstraint(ctx.db, {
    tenant_id: ctx.tenantId,
    team_id: teamId,
    tournament_id: tournamentId,
    kind: body.kind,
    starts_on: body.kind === 'blackout' ? body.starts_on : null,
    ends_on: body.kind === 'blackout' ? body.ends_on : null,
    time_of_day:
      body.kind === 'earliest' || body.kind === 'latest'
        ? body.time_of_day
        : null,
    weekdays: body.kind === 'weekday' ? body.weekdays : null,
    timezone: body.timezone ?? 'Europe/Paris',
    note: body.note ?? null,
    created_by: ctx.actor.kind === 'staff' ? ctx.actor.staffId : null,
  });
  if (error || !created) {
    ctx.logger.error('[admin/team-availability] insert', error, { teamId });
    throw fail(500, 'Failed to create constraint.');
  }

  const constraint = rowToConstraint(created);
  return {
    result: { constraint },
    audit: {
      entity_type: 'team',
      entity_id: teamId,
      tournament_id: tournamentId,
      payload: {
        team_name: teamName,
        constraint_id: constraint.id,
        kind: body.kind,
      },
    },
  };
}

/**
 * Comme la création : un `tournament_id` modifié est recoupé avec l'espace
 * du staff avant toute écriture (404 `TOURNAMENT_NOT_FOUND`).
 */
export async function updateTeamAvailability(
  ctx: ServiceContext,
  query: Record<string, unknown>,
  rawBody: unknown
): Promise<Audited<{ constraint: ReturnType<typeof rowToConstraint> }>> {
  const { teamId, teamName } = await loadTeam(ctx, query.teamId);
  const id = readConstraintId(query.id);
  const body = parseBody(patchSchema, rawBody);

  const existing = await availability.getOwnedConstraint(
    ctx.db,
    ctx.tenantId,
    teamId,
    id
  );
  if (!existing) throw fail(404, 'Constraint not found', 'NOT_FOUND');

  // Les champs d'une AUTRE nature sont ignorés plutôt que refusés.
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if ('tournament_id' in body) {
    const tournamentId = body.tournament_id ?? null;
    if (
      tournamentId &&
      !(await teams.tournamentExists(ctx.db, ctx.tenantId, tournamentId))
    ) {
      throw fail(404, 'Tournament not found', 'TOURNAMENT_NOT_FOUND');
    }
    update.tournament_id = tournamentId;
  }
  if (body.timezone !== undefined) update.timezone = body.timezone;
  if (body.note !== undefined) update.note = body.note ?? null;
  if (existing.kind === 'blackout') {
    if (body.starts_on !== undefined) update.starts_on = body.starts_on;
    if (body.ends_on !== undefined) update.ends_on = body.ends_on;
    const from = (update.starts_on as string) ?? existing.starts_on;
    const to = (update.ends_on as string) ?? existing.ends_on;
    if (from && to && to < from) {
      throw fail(
        400,
        'La date de fin précède la date de début.',
        'INVALID_RANGE'
      );
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

  const { row: updated, error } = await availability.updateConstraint(
    ctx.db,
    ctx.tenantId,
    id,
    update
  );
  if (error || !updated) {
    ctx.logger.error('[admin/team-availability] update', error, { id });
    throw fail(500, 'Failed to update constraint.');
  }

  return {
    result: { constraint: rowToConstraint(updated) },
    audit: {
      entity_type: 'team',
      entity_id: teamId,
      tournament_id: updated.tournament_id,
      payload: { team_name: teamName, constraint_id: id, kind: existing.kind },
    },
  };
}

export async function deleteTeamAvailability(
  ctx: ServiceContext,
  query: Record<string, unknown>
): Promise<Audited<null>> {
  const { teamId, teamName } = await loadTeam(ctx, query.teamId);
  const id = readConstraintId(query.id);

  const existing = await availability.getOwnedConstraint(
    ctx.db,
    ctx.tenantId,
    teamId,
    id
  );
  if (!existing) throw fail(404, 'Constraint not found', 'NOT_FOUND');

  const { error } = await availability.deleteConstraint(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (error) {
    ctx.logger.error('[admin/team-availability] delete', error, { id });
    throw fail(500, 'Failed to delete constraint.');
  }

  return {
    result: null,
    audit: {
      entity_type: 'team',
      entity_id: teamId,
      tournament_id: existing.tournament_id,
      payload: { team_name: teamName, constraint_id: id, kind: existing.kind },
    },
  };
}
