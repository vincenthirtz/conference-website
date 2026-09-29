// features/admin/tournaments/service/tournaments.ts — règles staff d'un
// tournoi : liste, création, fiche, modification (gardes de statut), gardes
// affichées par le workflow visuel.
//
// Validations dans l'ordre et avec les messages des routes d'origine. Le
// journal staff est écrit par `defineAdminRoute` à partir de l'`audit` rendu.

import slugify from 'slugify';
import type { TablesUpdate } from '@/types/database.generated';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { sanitizeSearch } from '@/utils/apiHelpers';
import { getGame, isGameSlug, GAME_SLUGS } from '@/config/games';
import {
  validateFieldDefinitions,
  type RegistrationField,
} from '@/utils/registrationFields';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/tournaments';
import { fail } from './common';

/* ---------------------------------------------------------------------------
 * Liste / création
 * ------------------------------------------------------------------------ */

export async function listTournaments(
  ctx: ServiceContext,
  query: Record<string, unknown>,
  page: { limit: number; offset: number }
) {
  const { status, orderBy, orderDir, includeTotal, dateFrom, dateTo } = query;
  const orderByParam = Array.isArray(orderBy) ? orderBy[0] : orderBy;
  const { rows, count, error } = await repo.listTournaments(
    ctx.db,
    ctx.tenantId,
    {
      withCount: includeTotal === '1' || includeTotal === 'true',
      status: typeof status === 'string' && status ? status : null,
      search:
        sanitizeSearch(query.search as string | string[] | undefined) || null,
      dateFrom: typeof dateFrom === 'string' && dateFrom ? dateFrom : null,
      dateTo: typeof dateTo === 'string' && dateTo ? dateTo : null,
      orderBy: orderByParam === 'start_date' ? 'start_date' : 'created_at',
      ascending: orderDir === 'asc',
      offset: page.offset,
      limit: page.limit,
    }
  );
  if (error) {
    ctx.logger.error('admin GET tournaments error:', error);
    fail(500, 'Failed to fetch tournaments');
  }
  return { tournaments: rows, total: typeof count === 'number' ? count : null };
}

function isPositiveIntOrNil(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 1)
  );
}

export async function createTournament(
  ctx: ServiceContext,
  body: Record<string, unknown>
) {
  if (!body.name) fail(400, "Field 'name' is required");
  const name = body.name as string;
  if (body.game != null && !isGameSlug(body.game as string)) {
    fail(400, `Invalid game. Supported: ${GAME_SLUGS.join(', ')}`);
  }

  const slug =
    typeof body.slug === 'string' && body.slug.trim().length > 0
      ? body.slug.trim()
      : slugify(name, { lower: true, strict: true });

  if (await repo.findTournamentIdBySlug(ctx.db, ctx.tenantId, slug)) {
    fail(
      409,
      `Un tournoi avec le slug "${slug}" existe déjà. Choisissez un nom ou slug différent.`
    );
  }

  const start = body.start_date as string | null | undefined;
  const end = body.end_date as string | null | undefined;
  if (start && Number.isNaN(Date.parse(start))) {
    fail(400, 'start_date is not a valid date');
  }
  if (end && Number.isNaN(Date.parse(end))) {
    fail(400, 'end_date is not a valid date');
  }
  if (start && end && new Date(start) >= new Date(end)) {
    fail(400, 'start_date must be before end_date');
  }
  if (!isPositiveIntOrNil(body.max_teams)) {
    fail(400, 'max_teams must be an integer >= 1');
  }
  // Effectifs — mêmes règles que le PATCH (entier >= 1).
  for (const field of ['min_players', 'max_players'] as const) {
    if (!isPositiveIntOrNil(body[field])) {
      fail(400, `${field} must be an integer >= 1`);
    }
  }

  const { data, error } = await repo.insertTournament(ctx.db, {
    tenant_id: ctx.tenantId,
    name,
    slug,
    game: (body.game as string | null | undefined) ?? null,
    status: (body.status as string | null | undefined) ?? 'draft',
    start_date: start ?? null,
    end_date: end ?? null,
    max_teams: (body.max_teams as number | null | undefined) ?? null,
    min_players: (body.min_players as number | null | undefined) ?? null,
    max_players: (body.max_players as number | null | undefined) ?? null,
    format_type: (body.format_type as string | null | undefined) ?? null,
    solo_mode: body.solo_mode === true,
    is_featured: body.is_featured === true,
    logo_url: (body.logo_url as string | null | undefined) ?? null,
    banner_url: (body.banner_url as string | null | undefined) ?? null,
    // Correspondance IDENTIQUE à celle du PATCH ; défaut `private` : un
    // tournoi ne se publie pas par omission.
    visibility: body.is_public === true ? 'public' : 'private',
  });
  if (error || !data) {
    ctx.logger.error('admin POST tournaments error:', error);
    fail(500, 'Failed to create tournament');
  }

  // Auto-ajouter le pool de maps du jeu au tournoi (si applicable).
  const gameDef = data.game ? getGame(data.game) : null;
  if (gameDef?.hasMapVeto && gameDef.mapPool.length > 0) {
    try {
      const { error: mapsErr } = await repo.insertMaps(
        ctx.db,
        gameDef.mapPool.map((m, idx) => ({
          tenant_id: ctx.tenantId,
          tournament_id: data.id,
          map_name: m.name,
          map_slug: slugify(m.name, { lower: true, strict: true }),
          map_type: m.type,
          image_url: m.image,
          enabled: true,
          order_index: idx,
        }))
      );
      if (mapsErr)
        ctx.logger.error('Auto-insert tournament_maps error:', mapsErr);
    } catch (mapsInsertErr) {
      ctx.logger.error('Auto-insert tournament_maps exception:', mapsInsertErr);
    }
  }

  return {
    result: { tournament: data },
    audit: {
      entity_type: 'tournament',
      entity_id: data.id,
      tournament_id: data.id,
      payload: { name: data.name, slug: data.slug },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Fiche / modification
 * ------------------------------------------------------------------------ */

const VALID_STATUSES = [
  'draft',
  'published',
  'running',
  'completed',
  'archived',
];

// La base porte la publication en `visibility` ('public' | 'private'),
// l'écran d'édition en booléen `is_public` : on convertit à la sortie pour
// qu'un aller-retour GET → formulaire → PATCH conserve le drapeau.
function toTournamentDetail<R extends { visibility: string | null }>(row: R) {
  const { visibility, ...rest } = row;
  return { ...rest, is_public: visibility === 'public' };
}

export async function getTournament(ctx: ServiceContext, id: string) {
  const { data, error } = await repo.getTournamentDetail(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (error) {
    ctx.logger.error('admin GET tournament error:', error);
    fail(500, 'Failed to fetch tournament');
  }
  if (!data) fail(404, 'Tournament not found');
  return { tournament: toTournamentDetail(data) };
}

function isBadDate(v: unknown): boolean {
  return v !== undefined && v !== null && Number.isNaN(Date.parse(v as string));
}

export async function patchTournament(
  ctx: ServiceContext,
  id: string,
  body: Record<string, unknown>
) {
  const b = body;
  let cleanedRegistrationFields: RegistrationField[] | undefined;
  if (b.registration_fields !== undefined) {
    const fieldsResult = validateFieldDefinitions(b.registration_fields);
    if (!fieldsResult.ok) fail(400, fieldsResult.error);
    cleanedRegistrationFields = fieldsResult.fields;
  }

  if (b.status !== undefined && !VALID_STATUSES.includes(b.status as string)) {
    fail(400, `Invalid status. Allowed values: ${VALID_STATUSES.join(', ')}`);
  }
  if (
    b.name !== undefined &&
    (typeof b.name !== 'string' || b.name.trim().length === 0)
  ) {
    fail(400, 'Tournament name cannot be empty');
  }
  for (const field of ['max_teams', 'min_players', 'max_players'] as const) {
    if (!isPositiveIntOrNil(b[field])) {
      fail(400, `${field} must be an integer >= 1`);
    }
  }
  if (isBadDate(b.start_date)) fail(400, 'start_date is not a valid date');
  if (isBadDate(b.end_date)) fail(400, 'end_date is not a valid date');
  if (isBadDate(b.roster_locked_at)) {
    fail(400, 'roster_locked_at is not a valid date');
  }
  if (
    b.start_date !== undefined &&
    b.end_date !== undefined &&
    b.start_date &&
    b.end_date &&
    new Date(b.start_date as string) >= new Date(b.end_date as string)
  ) {
    fail(400, 'start_date must be before end_date');
  }

  if (b.slug !== undefined && b.slug !== null) {
    const taken = await repo.findTournamentIdBySlug(
      ctx.db,
      ctx.tenantId,
      b.slug as string,
      id
    );
    if (taken) fail(409, `Un tournoi avec le slug "${b.slug}" existe déjà.`);
  }

  const { data: before, error: fetchErr } = await repo.findTournament(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (fetchErr || !before) fail(404, 'Tournament not found');

  // Cohérence des dates avec les valeurs existantes (une seule date modifiée).
  const effectiveStart =
    b.start_date !== undefined
      ? (b.start_date as string | null)
      : before.start_date;
  const effectiveEnd =
    b.end_date !== undefined ? (b.end_date as string | null) : before.end_date;
  if (
    effectiveStart &&
    effectiveEnd &&
    new Date(effectiveStart) >= new Date(effectiveEnd)
  ) {
    fail(400, 'start_date must be before end_date');
  }

  if (b.status !== undefined && b.status !== before.status) {
    const guard = await checkStatusTransitionGuards(
      ctx,
      id,
      before.status,
      b.status as string
    );
    // `warnings` n'était jamais renseigné : la réponse ne portait que `error`.
    if (guard) fail(400, guard);
  }

  const patch: Record<string, unknown> = {};
  const copy = [
    'status',
    'name',
    'slug',
    'game',
    'start_date',
    'end_date',
    'roster_locked_at',
    'timezone',
    // `format` : libellé court affiché sur la carte FORMAT de la page publique.
    'format',
    'format_type',
    'max_teams',
    'min_players',
    'max_players',
  ] as const;
  for (const k of copy) if (b[k] !== undefined) patch[k] = b[k];
  if (b.solo_mode !== undefined) patch.solo_mode = b.solo_mode === true;
  if (b.pooled_teams !== undefined)
    patch.pooled_teams = b.pooled_teams === true;
  // Les deux modes d'inscription individuelle s'excluent.
  if (patch.solo_mode === true && patch.pooled_teams === true) {
    fail(400, 'solo_mode and pooled_teams are mutually exclusive.');
  }
  if (b.is_public !== undefined) {
    patch.visibility = b.is_public ? 'public' : 'private';
  }
  const copyTail = [
    'is_featured',
    'logo_url',
    'banner_url',
    'rules_url',
    'default_stream_url',
    'description_info',
    'schedule_details',
    'schedule_rules',
    'format_details',
  ] as const;
  for (const k of copyTail) if (b[k] !== undefined) patch[k] = b[k];
  if (cleanedRegistrationFields !== undefined) {
    patch.registration_fields = cleanedRegistrationFields;
  }

  if (Object.keys(patch).length === 0) fail(400, 'No fields to update');

  const { data: after, error: updateErr } = await repo.updateTournamentDetail(
    ctx.db,
    ctx.tenantId,
    id,
    patch as TablesUpdate<'tournaments'>
  );
  if (updateErr || !after) {
    ctx.logger.error('admin PATCH tournament error:', updateErr);
    fail(500, 'Failed to update tournament');
  }

  return {
    result: { success: true, tournament: toTournamentDetail(after) },
    audit: {
      entity_type: 'tournament',
      entity_id: id,
      tournament_id: id,
      payload: {
        changes: patch,
        before: { status: before.status },
        after: { status: after.status },
      },
    },
  } satisfies Audited<unknown>;
}

/**
 * Pré-conditions d'un changement de statut. `null` si la transition est
 * permise, sinon le message de refus.
 */
async function checkStatusTransitionGuards(
  ctx: ServiceContext,
  tournamentId: string,
  currentStatus: string | null,
  newStatus: string
): Promise<string | null> {
  if (newStatus === 'published' || newStatus === 'running') {
    const stages = await repo.firstStageId(ctx.db, ctx.tenantId, tournamentId);
    if (!stages || stages.length === 0) {
      return newStatus === 'published'
        ? 'Impossible de publier : le tournoi doit avoir au moins 1 phase (stage).'
        : 'Impossible de lancer : le tournoi doit avoir au moins 1 phase (stage).';
    }
  }
  if (newStatus === 'running') {
    const teams = await repo.firstTournamentTeamId(
      ctx.db,
      ctx.tenantId,
      tournamentId
    );
    if (!teams || teams.length === 0) {
      return 'Impossible de lancer : le tournoi doit avoir au moins 1 équipe inscrite.';
    }
  }
  if (newStatus === 'completed' && currentStatus !== 'running') {
    return 'Impossible de terminer : le tournoi doit être en cours (running) pour être marqué comme terminé.';
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * Gardes de statut (workflow visuel)
 * ------------------------------------------------------------------------ */

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  running: 'En cours',
  completed: 'Terminé',
  archived: 'Archivé',
};

type StatusGuard = {
  status: string;
  label: string;
  allowed: boolean;
  reason?: string;
};

export async function getStatusGuards(ctx: ServiceContext, id: string) {
  const { data: tournament } = await repo.findTournament(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (!tournament) fail(404, 'Tournament not found');
  const currentStatus = tournament.status ?? 'draft';
  const counts = await repo.countStagesAndTeams(ctx.db, ctx.tenantId, id);

  const guards: StatusGuard[] = [];
  for (const status of VALID_STATUSES) {
    if (status === currentStatus) {
      guards.push({
        status,
        label: STATUS_LABELS[status],
        allowed: false,
        reason: 'Statut actuel',
      });
      continue;
    }
    let allowed = true;
    let reason: string | undefined;
    if (status === 'published' && counts.stages === 0) {
      allowed = false;
      reason = 'Le tournoi doit avoir au moins 1 phase';
    } else if (status === 'running') {
      if (counts.stages === 0) {
        allowed = false;
        reason = 'Le tournoi doit avoir au moins 1 phase';
      } else if (counts.teams === 0) {
        allowed = false;
        reason = 'Le tournoi doit avoir au moins 1 équipe';
      }
    } else if (status === 'completed' && currentStatus !== 'running') {
      allowed = false;
      reason = 'Le tournoi doit être en cours';
    }
    guards.push({ status, label: STATUS_LABELS[status], allowed, reason });
  }
  return { current_status: currentStatus, guards };
}
