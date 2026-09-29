// features/player/scrims/service/plannings.ts — grilles de disponibilités
// « When2Meet » côté joueuse / capitaine. Déplacé des routes
// pages/api/teams/scrim-plannings/* (lot P13) : mêmes gardes, mêmes messages.
//
// Appartenance : `resolvePlanningParty` (utils/teams/scrimPlanningParty) —
// team1 / team2 (permission `manage_scrims` sur une des deux équipes) ou
// staff ; sinon 403. Toute route de session passe par `requirePlanningParty`.
//
// Fuite d'info : la heatmap joueuse NE DOIT PAS exposer l'attribution
// nominative (qui, en face, a peint quel créneau) — `{ count, parties }` seul.

import { LegacyAdminError } from '@/utils/admin/errors';
import { getStaffRole } from '@/utils/staff';
import { getManagedTeam } from '@/utils/teams/managementAccess';
import { resolvePlanningParty } from '@/utils/teams/scrimPlanningParty';
import { planningConfigFromRow } from '@/utils/teams/scrimPlanningConfig';
import {
  availabilityPatternFromSlots,
  buildHeatmap,
  normalizePlanningSlots,
  slotsFromPattern,
  type PlanningAvailabilityInput as HeatmapInput,
} from '@/utils/teams/scrimPlanningOverlap';
import {
  listMyAvailabilities,
  listMyPastAvailabilities,
  listOpenPlannings,
  listPlanningAvailabilities,
  readMemberDisplayName,
  readPlanningDetail,
  readPlanningGrid,
  upsertMyAvailability,
  type PlanningGridRow,
} from '../repository/plannings';
import type {
  AnonHeatmap,
  PlanningAvailabilityInput,
  PlanningAvailabilityResponse,
  PlanningParty,
  PlanningSuggestResponse,
  ScrimPlanningDetailResponse,
  ScrimPlanningsResponse,
} from '../schemas';
import type { ScrimsCtx } from './context';

const FORBIDDEN_SESSION = 'Accès non autorisé à cette session.';
const NOT_FOUND = 'Scrim planning not found';
const LOAD_FAILED = 'Failed to load scrim planning.';

const asSlots = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]) : [];

/**
 * Sessions OUVERTES visibles : staff = toutes, sinon celles où l'équipe
 * gérée (désignée par `?teamId=`, repli première gérée) est team1 ou team2.
 * Aucun droit → liste vide (endpoint de listing, pas de 403).
 */
export async function listMyPlannings(
  ctx: ScrimsCtx,
  requestedTeamId: string | null
): Promise<ScrimPlanningsResponse> {
  const { db, tenantId, userId } = ctx;
  const managed = await getManagedTeam(userId, tenantId, requestedTeamId);
  const staffRole = await getStaffRole(userId);
  if (!managed && !staffRole) return { plannings: [] };

  const { plannings, error } = await listOpenPlannings(db, tenantId);
  if (error) {
    ctx.logger.error('[teams/scrim-plannings] GET error:', error);
    throw new LegacyAdminError(500, 'Failed to load scrim plannings.');
  }

  const visible = plannings.filter(
    (p) =>
      Boolean(staffRole) ||
      managed?.teamId === p.team1_id ||
      managed?.teamId === p.team2_id
  );

  const mine = new Map<string, string[]>();
  if (visible.length > 0) {
    const rows = await listMyAvailabilities(
      db,
      tenantId,
      userId,
      visible.map((p) => p.id)
    );
    for (const r of rows) mine.set(r.planning_id, asSlots(r.slots));
  }

  return {
    plannings: visible.map((planning) => {
      let myParty: PlanningParty | null = null;
      if (managed?.teamId === planning.team1_id) myParty = 'team1';
      else if (managed?.teamId === planning.team2_id) myParty = 'team2';
      else if (staffRole) myParty = 'staff';
      return {
        planning,
        myParty,
        myAvailability: mine.get(planning.id) ?? [],
      };
    }),
  };
}

async function requirePlanningParty(
  ctx: ScrimsCtx,
  planning: { team1_id: string; team2_id: string }
): Promise<PlanningParty> {
  const party = await resolvePlanningParty(
    ctx.userId,
    { team1_id: planning.team1_id, team2_id: planning.team2_id },
    ctx.tenantId
  );
  if (!party) throw new LegacyAdminError(403, FORBIDDEN_SESSION);
  return party;
}

/** Session ouverte + partie de l'appelante (peindre, suggérer). */
async function loadOpenGrid(
  ctx: ScrimsCtx,
  planningId: string,
  logTag: string
): Promise<{ planning: PlanningGridRow; party: PlanningParty }> {
  const { planning, error } = await readPlanningGrid(
    ctx.db,
    ctx.tenantId,
    planningId
  );
  if (error) {
    ctx.logger.error(
      `[teams/scrim-plannings/:id/${logTag}] load error:`,
      error
    );
    throw new LegacyAdminError(500, LOAD_FAILED);
  }
  if (!planning) throw new LegacyAdminError(404, NOT_FOUND);
  if (planning.status !== 'open') {
    throw new LegacyAdminError(
      409,
      `Session fermée (statut : ${planning.status}).`,
      { code: 'PLANNING_NOT_OPEN' }
    );
  }
  const party = await requirePlanningParty(ctx, planning);
  return { planning, party };
}

export async function readPlanningForParty(
  ctx: ScrimsCtx,
  planningId: string
): Promise<ScrimPlanningDetailResponse> {
  const { planning, error } = await readPlanningDetail(
    ctx.db,
    ctx.tenantId,
    planningId
  );
  if (error) {
    ctx.logger.error('[teams/scrim-plannings/:id] GET error:', error);
    throw new LegacyAdminError(500, LOAD_FAILED);
  }
  if (!planning) throw new LegacyAdminError(404, NOT_FOUND);
  const myParty = await requirePlanningParty(ctx, planning);

  const rows = await listPlanningAvailabilities(
    ctx.db,
    ctx.tenantId,
    planningId
  );
  const input: HeatmapInput[] = rows.map((r) => ({
    party: r.party,
    userId: r.user_id,
    displayName: r.display_name ?? null,
    slots: asSlots(r.slots),
  }));

  // Anonymise : `participants` ne sort jamais.
  const heatmap: AnonHeatmap = {};
  for (const [key, cell] of Object.entries(buildHeatmap(input))) {
    heatmap[key] = { count: cell.count, parties: cell.parties };
  }

  const mine = rows.find((r) => r.user_id === ctx.userId);
  return {
    planning,
    myParty,
    mySlots: mine ? asSlots(mine.slots) : [],
    heatmap,
  };
}

/**
 * « Dispos habituelles » : le motif (jour:minute) de la dernière peinture de
 * l'appelante sur une AUTRE session, rejoué sur la grille courante.
 */
export async function suggestPlanningSlots(
  ctx: ScrimsCtx,
  planningId: string
): Promise<PlanningSuggestResponse> {
  const { planning } = await loadOpenGrid(ctx, planningId, 'suggest');
  const past = await listMyPastAvailabilities(
    ctx.db,
    ctx.tenantId,
    ctx.userId,
    planningId
  );
  const recent = past.find((r) => asSlots(r.slots).length > 0);
  if (!recent) return { slots: [] };

  const config = planningConfigFromRow(planning as never);
  const pattern = availabilityPatternFromSlots(
    asSlots(recent.slots),
    config.timezone
  );
  return { slots: slotsFromPattern(config, pattern) };
}

export type UserMetadata = Record<string, unknown> | undefined;

/**
 * Remplace intégralement MES créneaux sur la session (liste vide = effacer).
 * Forme validée par la route, appartenance à la grille ici.
 */
export async function saveMyAvailability(
  ctx: ScrimsCtx,
  planningId: string,
  input: PlanningAvailabilityInput,
  userMetadata: UserMetadata
): Promise<PlanningAvailabilityResponse> {
  const { planning, party } = await loadOpenGrid(
    ctx,
    planningId,
    'availability'
  );
  const config = planningConfigFromRow(planning as never);
  const result = normalizePlanningSlots(input.slots, config);
  if (!result.ok) throw new LegacyAdminError(400, result.error);

  const displayName = await resolveDisplayName(ctx, userMetadata);
  const { error } = await upsertMyAvailability(ctx.db, {
    tenant_id: ctx.tenantId,
    planning_id: planningId,
    party,
    user_id: ctx.userId,
    display_name: displayName,
    slots: result.slots,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    ctx.logger.error(
      '[teams/scrim-plannings/:id/availability] upsert error:',
      error
    );
    throw new LegacyAdminError(500, 'Failed to save availability.');
  }
  return { success: true, mySlots: result.slots };
}

/** Nom affiché (survol admin) : fiche d'équipe, sinon metadata du compte. */
async function resolveDisplayName(
  ctx: ScrimsCtx,
  meta: UserMetadata
): Promise<string | null> {
  try {
    const fromMember = await readMemberDisplayName(
      ctx.db,
      ctx.tenantId,
      ctx.userId
    );
    if (fromMember) return fromMember;
  } catch (e) {
    ctx.logger.error(
      '[teams/scrim-plannings/availability] display_name lookup',
      e
    );
  }
  const m = meta ?? {};
  return (
    (m.display_name as string | null) || (m.full_name as string | null) || null
  );
}
