// features/admin/tournaments/service/structure.ts — structure d'un tournoi :
// phases (liste, création, réordonnancement), gabarits, clonage, jour forcé
// de l'overlay, fenêtre de déverrouillage du roster.

import slugify from 'slugify';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { TOURNAMENT_TEMPLATES } from '@/config/tournament-templates';
import { validateStageSettings } from '@/utils/stageSettings';
import {
  activeDayOverride,
  dayOverrideExpiresAt,
  isDayString,
} from '@/utils/overlay/dayOverride';
import type { Json } from '@/types/database.generated';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/tournaments';
import { fail, failWith } from './common';

/* ---------------------------------------------------------------------------
 * Phases
 * ------------------------------------------------------------------------ */

const VALID_STAGE_TYPES = [
  'group',
  'bracket',
  'swiss',
  'round_robin',
  'showmatch',
  'other',
];

function slugOf(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function listStages(ctx: ServiceContext, tournamentId: string) {
  const { data, error } = await repo.listStages(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (error) {
    ctx.logger.error('admin GET tournament stages error:', error);
    fail(500, 'Failed to fetch tournament stages');
  }
  return { stages: data ?? [] };
}

export async function createStage(
  ctx: ServiceContext,
  tournamentId: string,
  body: Record<string, unknown>
) {
  const { name, slug, stage_type, order_index } = body;
  const start = body.start_date as string | undefined;
  const end = body.end_date as string | undefined;

  if (!name || typeof name !== 'string' || !name.trim()) {
    fail(400, 'name is required');
  }
  if (stage_type && !VALID_STAGE_TYPES.includes(stage_type as string)) {
    fail(
      400,
      `Invalid stage_type. Allowed values: ${VALID_STAGE_TYPES.join(', ')}`
    );
  }
  if (start && Number.isNaN(Date.parse(start))) {
    fail(400, 'start_date is not a valid date');
  }
  if (end && Number.isNaN(Date.parse(end))) {
    fail(400, 'end_date is not a valid date');
  }
  if (start && end && new Date(start) >= new Date(end)) {
    fail(400, 'start_date must be before end_date');
  }
  if (
    order_index !== undefined &&
    order_index !== null &&
    (typeof order_index !== 'number' ||
      !Number.isInteger(order_index) ||
      order_index < 0)
  ) {
    fail(400, 'order_index must be an integer >= 0');
  }

  const { data: tournament, error: tErr } = await repo.findTournament(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (tErr || !tournament) fail(404, 'Tournament not found');

  let finalOrderIndex = order_index as number | null | undefined;
  if (finalOrderIndex === undefined || finalOrderIndex === null) {
    const existing = await repo.stagesByOrderDesc(
      ctx.db,
      ctx.tenantId,
      tournamentId
    );
    const maxOrder = existing[0]?.order_index ?? -1;
    finalOrderIndex = (typeof maxOrder === 'number' ? maxOrder : -1) + 1;
  }

  const effectiveType = (stage_type as string) || 'other';
  const settingsValidation = validateStageSettings(
    effectiveType as Parameters<typeof validateStageSettings>[0],
    body.settings
  );
  if (!settingsValidation.valid) fail(400, settingsValidation.error as string);

  const { data, error } = await repo.insertStage(ctx.db, {
    tenant_id: ctx.tenantId,
    tournament_id: tournamentId,
    name: name.trim(),
    slug: (slug as string) || slugOf(name),
    stage_type: effectiveType,
    order_index: finalOrderIndex,
    is_active: (body.is_active as boolean | undefined) ?? false,
    is_public: (body.is_public as boolean | undefined) ?? false,
    start_date: start || null,
    end_date: end || null,
    settings: (body.settings as Json) || null,
  });
  if (error || !data) {
    ctx.logger.error('admin POST tournament stage error:', error);
    fail(500, 'Failed to create stage');
  }

  return {
    result: { stage: data },
    audit: {
      entity_type: 'stage',
      entity_id: data.id,
      tournament_id: tournamentId,
      payload: {
        name: data.name,
        stage_type: data.stage_type,
        order_index: data.order_index,
      },
    },
  } satisfies Audited<unknown>;
}

export async function reorderStages(
  ctx: ServiceContext,
  tournamentId: string,
  body: Record<string, unknown>
) {
  const { stages } = body;
  if (!Array.isArray(stages) || stages.length === 0) {
    fail(400, 'stages must be a non-empty array of { id, order_index }');
  }
  for (const entry of stages as Record<string, unknown>[]) {
    if (!entry.id || typeof entry.id !== 'string') {
      fail(400, 'Each stage entry must have a valid id');
    }
    if (
      typeof entry.order_index !== 'number' ||
      !Number.isInteger(entry.order_index) ||
      entry.order_index < 0
    ) {
      fail(400, 'Each stage entry must have an integer order_index >= 0');
    }
  }
  const entries = stages as { id: string; order_index: number }[];

  const { data: tournament, error: tErr } = await repo.findTournament(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (tErr || !tournament) fail(404, 'Tournament not found');

  const errors: string[] = [];
  for (const entry of entries) {
    const { error } = await repo.updateStageOrder(
      ctx.db,
      ctx.tenantId,
      tournamentId,
      entry.id,
      entry.order_index
    );
    if (error) {
      errors.push(`Failed to update stage ${entry.id}: ${error.message}`);
    }
  }
  if (errors.length > 0) {
    ctx.logger.error('admin PATCH tournament stages errors:', errors);
    fail(500, 'Some stages failed to update');
  }

  const list = await listStages(ctx, tournamentId);
  return {
    result: list,
    audit: {
      entity_type: 'tournament',
      entity_id: tournamentId,
      tournament_id: tournamentId,
      payload: {
        stages: entries.map((s) => ({ id: s.id, order_index: s.order_index })),
      },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Gabarits
 * ------------------------------------------------------------------------ */

type Template = (typeof TOURNAMENT_TEMPLATES)[number];

export async function applyTemplate(
  ctx: ServiceContext,
  tournamentId: string,
  body: Record<string, unknown>
) {
  const { templateId, append } = body;
  if (!templateId || typeof templateId !== 'string') {
    fail(400, 'templateId is required');
  }

  let template: Template | undefined = TOURNAMENT_TEMPLATES.find(
    (t) => t.id === templateId
  );
  if (!template) {
    const raw = await repo.readCustomTemplates(ctx.db, ctx.tenantId);
    if (raw) {
      try {
        const custom = JSON.parse(raw);
        if (Array.isArray(custom)) {
          template = (custom as { id?: unknown }[]).find(
            (t) => t.id === templateId
          ) as Template | undefined;
        }
      } catch {
        /* JSON illisible : comme un gabarit absent */
      }
    }
  }
  if (!template) fail(400, `Template "${templateId}" not found`);

  const { data: tournament, error: tErr } = await repo.findTournament(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (tErr || !tournament) fail(404, 'Tournament not found');

  const existing = await repo.stagesByOrderDesc(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  const hasExisting = existing.length > 0;
  if (hasExisting && !append) {
    fail(
      400,
      'Ce tournoi a deja des stages. Supprimez-les avant d\'appliquer un template, ou utilisez le mode "append".'
    );
  }
  const startIndex = hasExisting
    ? (existing[0].order_index ?? existing.length - 1) + 1
    : 0;

  const { data: created, error: insertErr } = await repo.insertStages(
    ctx.db,
    template.stages.map((s, idx) => ({
      tenant_id: ctx.tenantId,
      tournament_id: tournamentId,
      name: s.name,
      slug: slugOf(s.name),
      stage_type: s.stage_type,
      order_index: startIndex + idx,
      is_active: false,
      is_public: false,
      start_date: null,
      end_date: null,
      settings: (s.settings as Json) || null,
    }))
  );
  if (insertErr || !created) {
    ctx.logger.error('apply-template insert stages error:', insertErr);
    fail(500, 'Failed to create stages from template');
  }

  return {
    result: { stages: created },
    audit: {
      entity_type: 'tournament',
      entity_id: tournamentId,
      tournament_id: tournamentId,
      payload: {
        template_id: templateId,
        template_name: template.name,
        append: !!append,
        created_stage_ids: created.map((s) => s.id),
      },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Clonage : structure seule (phases, pool de maps), sans équipes ni résultats
 * ------------------------------------------------------------------------ */

export async function cloneTournament(
  ctx: ServiceContext,
  sourceId: string,
  body: Record<string, unknown>
) {
  const { data: source, error: srcErr } = await repo.getTournamentRow(
    ctx.db,
    ctx.tenantId,
    sourceId
  );
  if (srcErr || !source) fail(404, 'Tournament not found');

  const cloneName =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : `${source.name} (copie)`;
  let cloneSlug =
    typeof body.slug === 'string' && body.slug.trim()
      ? body.slug.trim()
      : slugify(cloneName, { lower: true, strict: true });
  if (await repo.findTournamentIdBySlug(ctx.db, ctx.tenantId, cloneSlug)) {
    cloneSlug = `${cloneSlug}-${Date.now().toString(36)}`;
  }

  const { data: cloned, error: createErr } = await repo.insertTournament(
    ctx.db,
    {
      tenant_id: ctx.tenantId,
      name: cloneName,
      slug: cloneSlug,
      game: source.game,
      status: 'draft',
      start_date: null,
      end_date: null,
      timezone: source.timezone,
      format_type: source.format_type,
      max_teams: source.max_teams,
      min_players: source.min_players,
      max_players: source.max_players,
      visibility: source.visibility,
      is_featured: false,
      logo_url: source.logo_url,
      banner_url: source.banner_url,
    }
  );
  if (createErr || !cloned) {
    ctx.logger.error('clone: create tournament error', createErr);
    fail(500, 'Failed to create cloned tournament');
  }

  const sourceStages = await repo.sourceStagesForClone(
    ctx.db,
    ctx.tenantId,
    sourceId
  );
  let createdStages: unknown[] = [];
  if (sourceStages.length > 0) {
    const { data: stages, error: stagesErr } = await repo.insertStages(
      ctx.db,
      sourceStages.map((s) => ({
        tenant_id: ctx.tenantId,
        tournament_id: cloned.id,
        name: s.name,
        slug: s.slug,
        stage_type: s.stage_type,
        order_index: s.order_index,
        is_active: false,
        is_public: false,
        start_date: null,
        end_date: null,
        settings: s.settings,
      }))
    );
    if (stagesErr) ctx.logger.error('clone: copy stages error', stagesErr);
    else createdStages = stages ?? [];
  }

  const sourceMaps = await repo.sourceMapsForClone(
    ctx.db,
    ctx.tenantId,
    sourceId
  );
  let copiedMapsCount = 0;
  if (sourceMaps.length > 0) {
    const mapInserts = sourceMaps.map((m) => ({
      tenant_id: ctx.tenantId,
      tournament_id: cloned.id,
      map_name: m.map_name,
      map_slug: m.map_slug,
      map_type: m.map_type,
      image_url: m.image_url,
      enabled: m.enabled,
      order_index: m.order_index,
    }));
    const { error: mapsErr } = await repo.insertMaps(ctx.db, mapInserts);
    if (mapsErr) ctx.logger.error('clone: copy maps error', mapsErr);
    else copiedMapsCount = mapInserts.length;
  }

  return {
    result: {
      tournament: cloned,
      stages: createdStages,
      maps: copiedMapsCount,
    },
    audit: {
      entity_type: 'tournament',
      entity_id: cloned.id,
      tournament_id: cloned.id,
      payload: {
        cloned_from: sourceId,
        cloned_from_name: source.name,
        stages_count: createdStages.length,
        maps_count: copiedMapsCount,
      },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Jour forcé de la source OBS « Matchs du jour »
 * ------------------------------------------------------------------------ */

type OverlayDayRow = {
  id: string;
  overlay_day_date: string | null;
  overlay_day_set_at: string | null;
};

function overlayView(row: OverlayDayRow) {
  return {
    date: row.overlay_day_date,
    setAt: row.overlay_day_set_at,
    expiresAt: dayOverrideExpiresAt(row.overlay_day_set_at),
    active: activeDayOverride(row, Date.now()) !== null,
  };
}

export async function getOverlayDay(ctx: ServiceContext, id: string) {
  const { data, error } = await repo.readOverlayDay(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/overlay-day] read error:', error);
    fail(500, 'Lecture impossible');
  }
  if (!data) fail(404, 'Tournament not found');
  return overlayView(data);
}

export async function setOverlayDay(
  ctx: ServiceContext,
  id: string,
  body: Record<string, unknown>
) {
  const date = body.date === null || body.date === '' ? null : body.date;
  if (date !== null && !isDayString(date)) {
    fail(400, 'date invalide (format AAAA-MM-JJ, ou null)');
  }
  const { data, error } = await repo.updateOverlayDay(
    ctx.db,
    ctx.tenantId,
    id,
    {
      overlay_day_date: date as string | null,
      overlay_day_set_at: date ? new Date().toISOString() : null,
    }
  );
  if (error) {
    ctx.logger.error('[admin/overlay-day] write error:', error);
    fail(500, 'Enregistrement impossible');
  }
  if (!data) fail(404, 'Tournament not found');
  return {
    result: overlayView(data),
    audit: {
      entity_type: 'tournament',
      entity_id: id,
      tournament_id: id,
      payload: { overlay_day_date: date },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Fenêtre de déverrouillage du roster
 * ------------------------------------------------------------------------ */

/**
 * Bornes de la fenêtre. Le maximum (24 h) est le vrai garde-fou : une
 * dérogation « une semaine » n'est plus une dérogation, c'est un verrou
 * déplacé — et pour ça il y a `roster_locked_at`.
 */
const MIN_UNLOCK_MINUTES = 5;
const MAX_UNLOCK_MINUTES = 24 * 60;
const DEFAULT_UNLOCK_MINUTES = 60;

async function loadForRosterUnlock(ctx: ServiceContext, id: string) {
  // Filtre tenant : sans lui, un id deviné déverrouillerait le roster d'un
  // autre espace.
  const { data, error } = await repo.findTournament(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/roster-unlock] tournament load error', error);
    fail(500, 'Server error.');
  }
  if (!data) failWith(404, 'Tournament not found.', 'UNKNOWN_TOURNAMENT');
  return data;
}

export async function openRosterUnlock(
  ctx: ServiceContext,
  id: string,
  body: Record<string, unknown>
) {
  const tournament = await loadForRosterUnlock(ctx, id);
  const minutes =
    body.minutes === undefined ? DEFAULT_UNLOCK_MINUTES : Number(body.minutes);
  if (
    !Number.isFinite(minutes) ||
    !Number.isInteger(minutes) ||
    minutes < MIN_UNLOCK_MINUTES ||
    minutes > MAX_UNLOCK_MINUTES
  ) {
    failWith(
      400,
      `minutes doit être un entier entre ${MIN_UNLOCK_MINUTES} et ${MAX_UNLOCK_MINUTES}.`,
      'INVALID_MINUTES'
    );
  }

  // La fenêtre part de MAINTENANT, pas de la fin d'une fenêtre déjà ouverte.
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  const { error } = await repo.updateTournament(ctx.db, ctx.tenantId, id, {
    roster_unlocked_until: until,
  });
  if (error) {
    ctx.logger.error('[admin/roster-unlock] unlock error', error);
    fail(500, 'Failed to unlock the roster.');
  }

  return {
    result: {
      rosterUnlockedUntil: until,
      minutes,
      // Informatif : une fenêtre sur un tournoi jamais verrouillé ne change rien.
      rosterLockedAt: tournament.roster_locked_at ?? null,
    },
    audit: {
      entity_type: 'tournament',
      entity_id: id,
      payload: {
        action: 'roster_unlock',
        tournamentName: tournament.name,
        minutes,
        until,
      },
    },
  } satisfies Audited<unknown>;
}

export async function closeRosterUnlock(ctx: ServiceContext, id: string) {
  const tournament = await loadForRosterUnlock(ctx, id);
  const { error } = await repo.updateTournament(ctx.db, ctx.tenantId, id, {
    roster_unlocked_until: null,
  });
  if (error) {
    ctx.logger.error('[admin/roster-unlock] relock error', error);
    fail(500, 'Failed to re-lock the roster.');
  }
  return {
    result: { rosterUnlockedUntil: null },
    audit: {
      entity_type: 'tournament',
      entity_id: id,
      payload: {
        action: 'roster_relock',
        tournamentName: tournament.name,
        // Ce qui était ouvert : la trace doit dire de quoi on a coupé court.
        previousUnlockedUntil: tournament.roster_unlocked_until ?? null,
      },
    },
  } satisfies Audited<unknown>;
}
