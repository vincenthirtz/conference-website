// features/admin/scrims/service/plannings.ts — grilles de dispos partagées
// « When2Meet » entre deux équipes (`/api/admin/scrim-plannings/**`).
//
// Une grille N'EST PAS un scrim : la validation d'un créneau en matérialise
// un (status 'scheduled'), ou replanifie le scrim pour lequel la grille a été
// ouverte. Idempotent sur `scrims.source_planning_id` : un retry renvoie le
// scrim déjà créé, sans en dupliquer un ni re-journaliser.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  LegacyAdminError,
  NotFoundError,
  ValidationError,
} from '@/utils/admin/errors';
import type { TablesUpdate } from '@/types/database.generated';
import { isValidUUID, sanitizeSearch } from '@/utils/apiHelpers';
import { emitScrimEvent } from '@/utils/scrimEvents';
import { emitScrimPlanningEvent } from '@/utils/scrimPlanningEvents';
import {
  planningConfigFromRow,
  todayInTimezone,
} from '@/utils/teams/scrimPlanningConfig';
import {
  buildHeatmap,
  isSlotValidatable,
  normalizePlanningSlots,
  slotKeysForHorizon,
  type PlanningAvailabilityInput,
} from '@/utils/teams/scrimPlanningOverlap';
import {
  findScrimConflicts,
  type SlotConflict,
} from '@/utils/teams/scrimConflicts';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/plannings';
import {
  PLANNING_PATCHABLE_FIELDS,
  PLANNING_PATCHABLE_STATUSES,
  PLANNING_STATUSES,
  PlanningConflictsBody,
  PlanningCreateBody,
} from '../schemas';
import { asScrimEventRow } from './scrims';

type AvailabilityRow = {
  party: string;
  user_id: string;
  display_name: string | null;
  slots: unknown;
};

function heatmapInputOf(rows: AvailabilityRow[]): PlanningAvailabilityInput[] {
  return rows.map((r) => ({
    party: r.party as PlanningAvailabilityInput['party'],
    userId: r.user_id,
    displayName: r.display_name ?? null,
    slots: Array.isArray(r.slots) ? (r.slots as string[]) : [],
  }));
}

/** La ligne telle que l'attendent les helpers d'événements (lignes non typées). */
function asPlanningEventRow(
  row: object
): Parameters<typeof emitScrimPlanningEvent>[1] {
  return row as Parameters<typeof emitScrimPlanningEvent>[1];
}

/* ---------------------------------------------------------------------------
 * Liste / ouverture
 * ------------------------------------------------------------------------ */

export async function listPlannings(
  ctx: ServiceContext,
  query: Record<string, unknown>,
  page: { limit: number; offset: number }
) {
  const { status, teamId } = query;
  let statusFilter: string | null = null;
  if (typeof status === 'string' && status) {
    if (!(PLANNING_STATUSES as readonly string[]).includes(status)) {
      throw new ValidationError(
        `Statut invalide. Valeurs : ${PLANNING_STATUSES.join(', ')}.`
      );
    }
    statusFilter = status;
  }

  const { rows, count, error } = await repo.listPlannings(
    ctx.db,
    ctx.tenantId,
    {
      status: statusFilter,
      teamId: typeof teamId === 'string' && isValidUUID(teamId) ? teamId : null,
      search:
        sanitizeSearch(query.search as string | string[] | undefined) || null,
      offset: page.offset,
      limit: page.limit,
    }
  );
  if (error) {
    ctx.logger.error('[admin/scrim-plannings] GET error:', error);
    throw new AdminError(500, 'internal', 'Failed to fetch scrim plannings');
  }
  return { plannings: rows, total: typeof count === 'number' ? count : null };
}

export async function openPlanning(ctx: ServiceContext, rawBody: unknown) {
  const parsed = PlanningCreateBody.safeParse(rawBody ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first?.path?.join('.') || undefined;
    throw new LegacyAdminError(400, first?.message || 'Requête invalide.', {
      extra: field ? { field } : {},
    });
  }
  const body = parsed.data;

  const timezone = body.timezone ?? 'Europe/Paris';
  const horizonStart = body.horizon_start ?? todayInTimezone(timezone);

  const { row: data, error } = await repo.insertPlanning(ctx.db, {
    tenant_id: ctx.tenantId,
    created_by: ctx.actor.kind === 'staff' ? ctx.actor.staffId : null,
    team1_id: body.team1_id,
    team2_id: body.team2_id,
    title: body.title ?? null,
    game: body.game ?? null,
    status: 'open',
    horizon_start: horizonStart,
    horizon_days: body.horizon_days ?? 21,
    slot_minutes: body.slot_minutes ?? 30,
    day_start_min: body.day_start_min ?? 960,
    day_end_min: body.day_end_min ?? 1440,
    timezone,
    scrim_id: body.scrim_id ?? null,
    is_public: false,
    staff_required: body.staff_required ?? false,
    source_demande_id: body.source_demande_id ?? null,
  });
  if (error || !data) {
    ctx.logger.error('[admin/scrim-plannings] POST error:', error);
    throw new AdminError(500, 'internal', 'Failed to create scrim planning');
  }

  void emitScrimPlanningEvent(
    'scrim.planning.opened',
    asPlanningEventRow(data),
    ctx.tenantId
  );

  return {
    result: { planning: data },
    audit: {
      entity_type: 'scrim_planning',
      entity_id: data.id,
      tournament_id: null,
      payload: {
        subject: 'create_scrim_planning',
        title: data.title,
        team1_id: data.team1_id,
        team2_id: data.team2_id,
      },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Fiche / modification / corbeille
 * ------------------------------------------------------------------------ */

export async function getPlanningDetail(ctx: ServiceContext, id: string) {
  const { row: planning, error } = await repo.getPlanningWithTeams(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (error) {
    ctx.logger.error('[admin/scrim-plannings/:id] GET error:', error);
    throw new AdminError(500, 'internal', 'Failed to fetch scrim planning');
  }
  if (!planning) throw new NotFoundError('Scrim planning not found');

  const { rows, error: availErr } = await repo.listAvailabilities(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (availErr) {
    ctx.logger.error('[admin/scrim-plannings/:id] avail error:', availErr);
    throw new AdminError(500, 'internal', 'Failed to fetch availabilities');
  }

  // Admin : heatmap avec attribution COMPLÈTE (display_name inclus).
  const heatmap = buildHeatmap(heatmapInputOf(rows));
  return { planning, availabilities: rows, heatmap };
}

export async function updatePlanning(
  ctx: ServiceContext,
  id: string,
  body: Record<string, unknown>
) {
  const updatePayload: Record<string, unknown> = {};
  for (const field of PLANNING_PATCHABLE_FIELDS) {
    if (body[field] !== undefined) updatePayload[field] = body[field];
  }
  if (Object.keys(updatePayload).length === 0) {
    throw new ValidationError('No fields to update');
  }
  if (
    updatePayload.status !== undefined &&
    !(PLANNING_PATCHABLE_STATUSES as readonly unknown[]).includes(
      updatePayload.status
    )
  ) {
    throw new ValidationError(
      `Statut invalide. Valeurs : ${PLANNING_PATCHABLE_STATUSES.join(', ')}.`
    );
  }

  const { row: before } = await repo.getPlanning(ctx.db, ctx.tenantId, id);
  if (!before) throw new NotFoundError('Scrim planning not found');

  updatePayload.updated_at = new Date().toISOString();

  const { row: after, error: updErr } = await repo.updatePlanning(
    ctx.db,
    ctx.tenantId,
    id,
    updatePayload as TablesUpdate<'scrim_plannings'>
  );
  if (updErr || !after) {
    ctx.logger.error('[admin/scrim-plannings/:id] PATCH error:', updErr);
    throw new AdminError(500, 'internal', 'Failed to update scrim planning');
  }

  return {
    result: { success: true as const, planning: after },
    audit: {
      entity_type: 'scrim_planning',
      entity_id: id,
      tournament_id: null,
      payload: { subject: 'update_scrim_planning', changes: updatePayload },
    },
  } satisfies Audited<unknown>;
}

export async function deletePlanning(ctx: ServiceContext, id: string) {
  const { row: before } = await repo.getPlanning(ctx.db, ctx.tenantId, id);
  if (!before) throw new NotFoundError('Scrim planning not found');

  const { error } = await repo.softDeletePlanning(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/scrim-plannings/:id] DELETE error:', error);
    throw new AdminError(500, 'internal', 'Failed to delete scrim planning');
  }

  return {
    result: { success: true as const },
    audit: {
      entity_type: 'scrim_planning',
      entity_id: id,
      tournament_id: null,
      payload: { subject: 'delete_scrim_planning', title: before.title },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Dispos du staff lui-même (party='staff')
 * ------------------------------------------------------------------------ */

async function loadPlanningForAvailability(ctx: ServiceContext, id: string) {
  if (ctx.actor.kind !== 'staff' || !ctx.actor.userId) {
    throw new AdminError(403, 'forbidden', 'Staff non résolu.');
  }
  const { row: planning, error } = await repo.getPlanning(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (error) {
    ctx.logger.error(
      '[admin/scrim-plannings/:id/availability] load error:',
      error
    );
    throw new AdminError(500, 'internal', 'Failed to load scrim planning.');
  }
  if (!planning) throw new NotFoundError('Scrim planning not found');
  return { planning, userId: ctx.actor.userId };
}

export async function getMyAvailability(ctx: ServiceContext, id: string) {
  const { userId } = await loadPlanningForAvailability(ctx, id);
  const slots = await repo.getMyAvailabilitySlots(
    ctx.db,
    ctx.tenantId,
    id,
    userId
  );
  return { slots: Array.isArray(slots) ? (slots as string[]) : [] };
}

export async function saveMyAvailability(
  ctx: ServiceContext,
  id: string,
  body: Record<string, unknown>,
  displayName: string | null
) {
  const { planning, userId } = await loadPlanningForAvailability(ctx, id);
  if (planning.status !== 'open') {
    throw new LegacyAdminError(
      409,
      `Session fermée (statut : ${planning.status}).`,
      { code: 'PLANNING_NOT_OPEN' }
    );
  }

  const config = planningConfigFromRow(planning as never);
  const result = normalizePlanningSlots(body.slots, config);
  if (!result.ok) throw new ValidationError(result.error);

  const { error } = await repo.upsertStaffAvailability(ctx.db, {
    tenant_id: ctx.tenantId,
    planning_id: id,
    user_id: userId,
    display_name: displayName,
    slots: result.slots,
  });
  if (error) {
    ctx.logger.error(
      '[admin/scrim-plannings/:id/availability] upsert error:',
      error
    );
    throw new AdminError(500, 'internal', 'Failed to save availability.');
  }
  return { success: true as const, slots: result.slots };
}

/* ---------------------------------------------------------------------------
 * Aperçu des conflits (lecture seule) — même `findScrimConflicts` que le 409
 * SLOT_CONFLICT de la validation : l'aperçu et le blocage ne divergent pas.
 * ------------------------------------------------------------------------ */

export async function previewPlanningConflicts(
  ctx: ServiceContext,
  id: string,
  rawBody: unknown
) {
  const parsed = PlanningConflictsBody.safeParse(rawBody ?? {});
  if (!parsed.success) throw new ValidationError('Requête invalide.');

  const { row: planning, error: planErr } = await repo.getPlanningTeams(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (planErr) {
    ctx.logger.error('[admin/scrim-plannings/conflicts] load error:', planErr);
    throw new AdminError(500, 'internal', 'Failed to load scrim planning');
  }
  if (!planning) throw new NotFoundError('Scrim planning not found');

  // Dédupe + canonicalise les créneaux (ISO), ignore les dates invalides.
  const seen = new Set<string>();
  for (const raw of parsed.data.slots) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) seen.add(d.toISOString());
  }
  const teamIds = [planning.team1_id, planning.team2_id];

  try {
    const entries = await Promise.all(
      Array.from(seen).map(async (slotIso) => {
        const conflicts = await findScrimConflicts(ctx.db, {
          tenantId: ctx.tenantId,
          teamIds,
          slotIso,
        });
        return [slotIso, conflicts] as [string, SlotConflict[]];
      })
    );
    const conflicts: Record<string, SlotConflict[]> = {};
    for (const [slot, list] of entries) conflicts[slot] = list;
    return { conflicts };
  } catch (err) {
    ctx.logger.error('[admin/scrim-plannings/conflicts] error:', err);
    throw new AdminError(500, 'internal', 'Failed to check conflicts');
  }
}

/* ---------------------------------------------------------------------------
 * Validation d'un créneau → scrim planifié
 * ------------------------------------------------------------------------ */

export async function validatePlanningSlot(
  ctx: ServiceContext,
  id: string,
  body: { slot: string; force?: boolean }
) {
  // 1) Charge la planning (404 si absente / supprimée / mauvais tenant).
  const { row: planning, error: planErr } = await repo.getPlanning(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (planErr) {
    ctx.logger.error('[admin/scrim-plannings/validate] load error:', planErr);
    throw new AdminError(500, 'internal', 'Failed to load scrim planning');
  }
  if (!planning) throw new NotFoundError('Scrim planning not found');

  // 2) Idempotence : si un scrim existe déjà pour cette planning, on le renvoie
  //    tel quel (retry) — AVANT le check de statut, pour qu'un second appel sur
  //    une planning déjà 'validated' ne renvoie pas 409. Rien de neuf : pas de
  //    journal, pas d'annonce.
  const existingScrim = await repo.findScrimBySourcePlanning(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (existingScrim) {
    return {
      result: { scrim: existingScrim, planning } as ValidateResult,
      audit: { skip: true },
    } satisfies Audited<unknown>;
  }

  // 3) La planning doit être ouverte pour être validée.
  if (planning.status !== 'open') {
    throw new LegacyAdminError(
      409,
      `Planning non ouverte (statut : ${planning.status}).`,
      { code: 'PLANNING_NOT_OPEN' }
    );
  }

  // 4) Le créneau doit appartenir à la grille de la session.
  const config = planningConfigFromRow(planning as never);
  const slotDate = new Date(body.slot);
  if (Number.isNaN(slotDate.getTime())) {
    throw new ValidationError('slot invalide');
  }
  const slotIso = slotDate.toISOString();
  const validKeys = new Set(slotKeysForHorizon(config));
  if (!validKeys.has(slotIso)) {
    throw new LegacyAdminError(400, 'Créneau hors grille.', {
      code: 'SLOT_OUT_OF_GRID',
    });
  }

  // 5) Overlap : on n'impose PAS que les deux équipes soient dispo (override
  //    admin), mais on prévient si le créneau n'est pas « planifiable ».
  const { rows: availabilities } = await repo.listAvailabilities(
    ctx.db,
    ctx.tenantId,
    id
  );
  const heatmap = buildHeatmap(heatmapInputOf(availabilities));
  const requireStaff = planning.staff_required === true;
  const overlapWarning = isSlotValidatable(heatmap[slotIso], requireStaff)
    ? undefined
    : requireStaff
      ? 'Créneau validé sans les deux équipes ET le staff (staff requis).'
      : 'Créneau validé sans overlap complet des deux équipes.';

  // 5b) Conflits : le créneau ne doit pas chevaucher (± fenêtre) un scrim déjà
  //     planifié ni un match programmé pour l'une des deux équipes. Bloque en
  //     409 (code SLOT_CONFLICT) sauf si `force: true` (override admin).
  const conflicts = await findScrimConflicts(ctx.db, {
    tenantId: ctx.tenantId,
    teamIds: [planning.team1_id, planning.team2_id],
    slotIso,
  });
  if (conflicts.length > 0 && !body.force) {
    throw new LegacyAdminError(
      409,
      'Conflit de créneau : une équipe est déjà prise à cette heure.',
      { code: 'SLOT_CONFLICT', extra: { conflicts } }
    );
  }

  const conflictWarning =
    conflicts.length > 0
      ? `Validé malgré ${conflicts.length} conflit(s) de créneau.`
      : undefined;
  const warning =
    [overlapWarning, conflictWarning].filter(Boolean).join(' ') || undefined;

  // 6) Résout les noms d'équipes pour le nom du scrim.
  const teams = await repo.listTeamNamesByIds(ctx.db, [
    planning.team1_id,
    planning.team2_id,
  ]);
  const nameById = new Map<string, string>(
    teams.map((t) => [t.id, t.name ?? 'Équipe'])
  );
  const team1Name = nameById.get(planning.team1_id) ?? 'Équipe 1';
  const team2Name = nameById.get(planning.team2_id) ?? 'Équipe 2';

  // 7) Crée le scrim (status 'scheduled'), tagué source_planning_id. Une
  //    grille ouverte POUR un scrim existant le replanifie au lieu d'en créer
  //    un second (sinon : doublon mécanique à côté du scrim sans date).
  const { row: scrim, error: scrimErr } = planning.scrim_id
    ? await repo.rescheduleScrimFromPlanning(
        ctx.db,
        ctx.tenantId,
        planning.scrim_id,
        {
          status: 'scheduled',
          scheduled_date: slotIso,
          timezone: planning.timezone,
          source_planning_id: id,
          updated_at: new Date().toISOString(),
        }
      )
    : await repo.insertScrimFromPlanning(ctx.db, {
        tenant_id: ctx.tenantId,
        name: `${team1Name} vs ${team2Name}`,
        status: 'scheduled',
        team1_id: planning.team1_id,
        team2_id: planning.team2_id,
        scheduled_date: slotIso,
        timezone: planning.timezone,
        is_public: false,
        source_planning_id: id,
        source_demande_id: planning.source_demande_id ?? null,
      });
  if (scrimErr || !scrim) {
    ctx.logger.error(
      '[admin/scrim-plannings/validate] scrim create error:',
      scrimErr
    );
    throw new AdminError(500, 'internal', 'Failed to create scrim');
  }

  // 8) Bascule la planning en 'validated'.
  const { row: updatedPlanning, error: updErr } = await repo.updatePlanning(
    ctx.db,
    ctx.tenantId,
    id,
    {
      status: 'validated',
      validated_slot: slotIso,
      scrim_id: scrim.id,
      updated_at: new Date().toISOString(),
    }
  );
  if (updErr || !updatedPlanning) {
    ctx.logger.error(
      '[admin/scrim-plannings/validate] planning update error:',
      updErr
    );
    throw new AdminError(500, 'internal', 'Failed to validate scrim planning');
  }

  void emitScrimEvent('scrim.scheduled', asScrimEventRow(scrim), ctx.tenantId, {
    previousStatus: 'draft',
  });
  void emitScrimPlanningEvent(
    'scrim.planning.validated',
    asPlanningEventRow(updatedPlanning),
    ctx.tenantId,
    { scrimId: scrim.id }
  );

  return {
    result: {
      scrim,
      planning: updatedPlanning,
      warning,
    } as ValidateResult,
    audit: {
      entity_type: 'scrim_planning',
      entity_id: id,
      tournament_id: null,
      payload: {
        subject: 'validate_scrim_planning',
        slot: slotIso,
        scrim_id: scrim.id,
      },
    },
  } satisfies Audited<unknown>;
}

type ValidateResult = {
  scrim: NonNullable<
    Awaited<ReturnType<typeof repo.findScrimBySourcePlanning>>
  >;
  planning: NonNullable<Awaited<ReturnType<typeof repo.getPlanning>>['row']>;
  warning?: string;
};
