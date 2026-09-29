// features/admin/scrims/service/scrims.ts — règles staff d'un scrim : liste,
// création, fiche, modification, corbeille, agenda.
//
// Les effets de bord sont ceux des routes d'origine, dans le même ordre :
// équipes extérieures créées à la volée APRÈS toutes les validations, purge
// des reports capitaines AVANT l'écriture d'un statut qui les rendrait
// caducs, écriture conditionnelle au statut lu (409 `SCRIM_CHANGED`),
// annonce au bot sur transition de statut, miroir noté (rating / saison)
// réaligné, conflits de créneau remontés sans bloquer. Le journal staff est
// écrit par `defineAdminRoute` à partir de l'`audit` rendu.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  LegacyAdminError,
  NotFoundError,
  ValidationError,
  adminErrorFromStatus,
} from '@/utils/admin/errors';
import type { TablesInsert, TablesUpdate } from '@/types/database.generated';
import slugify from 'slugify';
import { isValidUUID, sanitizeSearch } from '@/utils/apiHelpers';
import {
  findScrimConflicts,
  type SlotConflict,
} from '@/utils/teams/scrimConflicts';
import { emitScrimEvent, statusTransitionEvent } from '@/utils/scrimEvents';
import { syncScrimRatedMatch } from '@/utils/scrims/ratedMatch';
import {
  parseExternalTeamNames,
  resolveScrimExternalTeams,
} from '@/utils/teams/externalScrimTeam';
import {
  purgeScoreReports,
  scrimTransitionPurgesReports,
  type PurgedScoreReport,
} from '@/utils/matches/scoreReports';
import type { Audited } from '../../_shared/audited';
import { firstString } from '@/utils/admin/pathParams';
import * as repo from '../repository/scrims';
import {
  SCRIM_PATCHABLE_FIELDS,
  SCRIM_STATUSES,
  type ScrimStatus,
} from '../schemas';

const INVALID_STATUS = `Statut invalide. Valeurs : ${SCRIM_STATUSES.join(', ')}.`;

/**
 * La ligne lue (slug nullable pour la base) telle que l'attend
 * `emitScrimEvent`, qui type le slug comme toujours présent : même
 * conversion que faisaient les routes d'origine (lignes non typées).
 */
export function asScrimEventRow(
  row: object
): Parameters<typeof emitScrimEvent>[1] {
  return row as Parameters<typeof emitScrimEvent>[1];
}

function isScrimStatus(v: unknown): v is ScrimStatus {
  return (SCRIM_STATUSES as readonly unknown[]).includes(v);
}

/* ---------------------------------------------------------------------------
 * Liste
 * ------------------------------------------------------------------------ */

export async function listScrims(
  ctx: ServiceContext,
  query: Record<string, unknown>,
  page: { limit: number; offset: number }
) {
  const { status, teamId, dateFrom, dateTo, orderBy, orderDir, includeTotal } =
    query;
  const includeDeleted =
    query.includeDeleted === '1' || query.includeDeleted === 'true';

  let statusFilter: string | null = null;
  if (typeof status === 'string' && status) {
    if (!isScrimStatus(status)) throw new ValidationError(INVALID_STATUS);
    statusFilter = status;
  }

  const { rows, count, error } = await repo.listScrims(ctx.db, ctx.tenantId, {
    withCount: includeTotal === '1' || includeTotal === 'true',
    includeDeleted,
    status: statusFilter,
    teamId: typeof teamId === 'string' && isValidUUID(teamId) ? teamId : null,
    search:
      sanitizeSearch(query.search as string | string[] | undefined) || null,
    dateFrom: typeof dateFrom === 'string' && dateFrom ? dateFrom : null,
    dateTo: typeof dateTo === 'string' && dateTo ? dateTo : null,
    orderBy: orderBy === 'scheduled_date' ? 'scheduled_date' : 'created_at',
    ascending: orderDir === 'asc',
    offset: page.offset,
    limit: page.limit,
  });
  if (error) {
    ctx.logger.error('[admin/scrims] GET error:', error);
    throw new AdminError(500, 'internal', 'Failed to fetch scrims');
  }
  return { scrims: rows, total: typeof count === 'number' ? count : null };
}

/* ---------------------------------------------------------------------------
 * Création
 * ------------------------------------------------------------------------ */

export async function createScrim(
  ctx: ServiceContext,
  body: Record<string, unknown>
) {
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    throw new ValidationError("Field 'name' is required");
  }
  const name = body.name.trim();
  const slug =
    typeof body.slug === 'string' && body.slug.trim().length > 0
      ? body.slug.trim()
      : slugify(`${name}-${Date.now().toString(36)}`, {
          lower: true,
          strict: true,
        });

  const status = body.status ?? 'draft';
  if (!isScrimStatus(status)) throw new ValidationError(INVALID_STATUS);

  const team1Id = body.team1_id as string | null | undefined;
  const team2Id = body.team2_id as string | null | undefined;
  if (team1Id && !isValidUUID(team1Id)) {
    throw new ValidationError('team1_id invalide');
  }
  if (team2Id && !isValidUUID(team2Id)) {
    throw new ValidationError('team2_id invalide');
  }
  if (team1Id && team2Id && team1Id === team2Id) {
    throw new ValidationError('team1_id et team2_id doivent etre distincts');
  }

  const externalNames = parseExternalTeamNames(body);
  if (!externalNames.ok) throw new ValidationError(externalNames.error);

  const scheduledDate = body.scheduled_date as string | null | undefined;
  if (scheduledDate && Number.isNaN(Date.parse(scheduledDate))) {
    throw new ValidationError('scheduled_date invalide');
  }

  if (await repo.findScrimIdBySlug(ctx.db, ctx.tenantId, slug)) {
    throw new AdminError(
      409,
      'conflict',
      `Un scrim avec le slug "${slug}" existe deja.`
    );
  }

  // Équipes extérieures : résolues APRÈS toutes les validations, pour ne pas
  // laisser d'équipe orpheline derrière un 400/409.
  const external = await resolveScrimExternalTeams({
    tenantId: ctx.tenantId,
    names: externalNames.names,
    team1Id: team1Id ?? null,
    team2Id: team2Id ?? null,
    staffId: ctx.actor.kind === 'staff' ? ctx.actor.staffId : null,
  });
  if (!external.ok) throw adminErrorFromStatus(external.status, external.error);

  const { row: data, error } = await repo.insertScrim(ctx.db, {
    tenant_id: ctx.tenantId,
    name,
    slug,
    game: (body.game as string | null | undefined) ?? null,
    status,
    team1_id: external.team1Id ?? null,
    team2_id: external.team2Id ?? null,
    scheduled_date: scheduledDate ?? null,
    timezone: (body.timezone as string | null | undefined) ?? 'Europe/Paris',
    is_public: (body.is_public as boolean | null | undefined) ?? false,
    description: (body.description as string | null | undefined) ?? null,
    stream_url: (body.stream_url as string | null | undefined) ?? null,
  });
  if (error || !data) {
    ctx.logger.error('[admin/scrims] POST error:', error);
    throw new AdminError(500, 'internal', 'Failed to create scrim');
  }

  void emitScrimEvent('scrim.created', asScrimEventRow(data), ctx.tenantId);
  // Si on naît directement en 'scheduled', le bot doit aussi pouvoir s'accrocher
  // à l'event de programmation (annonce dans #scrims, etc.).
  if (data.status === 'scheduled') {
    void emitScrimEvent(
      'scrim.scheduled',
      asScrimEventRow(data),
      ctx.tenantId,
      {
        previousStatus: 'draft',
      }
    );
  }

  return {
    result: { scrim: data },
    audit: {
      entity_type: 'scrim',
      entity_id: data.id,
      tournament_id: null,
      payload: { subject: 'create_scrim', name: data.name, slug: data.slug },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Fiche
 * ------------------------------------------------------------------------ */

export async function getScrim(ctx: ServiceContext, id: string) {
  const { row, error } = await repo.getScrimDetail(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/scrims/:id] GET error:', error);
    throw new AdminError(500, 'internal', 'Failed to fetch scrim');
  }
  if (!row) throw new NotFoundError('Scrim not found');

  const matchesCount = await repo.countScrimMatches(ctx.db, ctx.tenantId, id);
  return { scrim: row, matches_count: matchesCount ?? 0 };
}

/* ---------------------------------------------------------------------------
 * Modification (PATCH / PUT)
 * ------------------------------------------------------------------------ */

export async function updateScrim(
  ctx: ServiceContext,
  id: string,
  body: Record<string, unknown>
) {
  const updatePayload: Record<string, unknown> = {};
  for (const field of SCRIM_PATCHABLE_FIELDS) {
    if (body[field] !== undefined) updatePayload[field] = body[field];
  }

  // team1_name / team2_name : équipe extérieure créée à la volée (hors
  // SCRIM_PATCHABLE_FIELDS, ce ne sont pas des colonnes de `scrims`).
  const externalNames = parseExternalTeamNames(body);
  if (!externalNames.ok) throw new ValidationError(externalNames.error);
  const hasExternalName = Boolean(
    externalNames.names.team1Name || externalNames.names.team2Name
  );

  if (Object.keys(updatePayload).length === 0 && !hasExternalName) {
    throw new ValidationError('No fields to update');
  }
  if (
    updatePayload.status !== undefined &&
    !isScrimStatus(updatePayload.status)
  ) {
    throw new ValidationError(INVALID_STATUS);
  }
  if (
    updatePayload.name !== undefined &&
    (typeof updatePayload.name !== 'string' ||
      updatePayload.name.trim().length === 0)
  ) {
    throw new ValidationError('Le nom ne peut pas etre vide.');
  }
  for (const teamField of ['team1_id', 'team2_id'] as const) {
    const v = updatePayload[teamField];
    if (v !== undefined && v !== null && !isValidUUID(v as string)) {
      throw new ValidationError(`${teamField} invalide`);
    }
  }
  if (
    updatePayload.scheduled_date !== undefined &&
    updatePayload.scheduled_date !== null &&
    Number.isNaN(Date.parse(updatePayload.scheduled_date as string))
  ) {
    throw new ValidationError('scheduled_date invalide');
  }
  if (
    updatePayload.duration_minutes !== undefined &&
    updatePayload.duration_minutes !== null
  ) {
    const dm = Number(updatePayload.duration_minutes);
    if (!Number.isInteger(dm) || dm < 15 || dm > 720) {
      throw new ValidationError(
        'duration_minutes doit être un entier entre 15 et 720'
      );
    }
    updatePayload.duration_minutes = dm;
  }

  // Slug unique si modifié.
  if (typeof updatePayload.slug === 'string' && updatePayload.slug.trim()) {
    const slug = updatePayload.slug.trim();
    updatePayload.slug = slug;
    if (await repo.findScrimIdBySlug(ctx.db, ctx.tenantId, slug, id)) {
      throw new AdminError(
        409,
        'conflict',
        `Un scrim avec le slug "${slug}" existe deja.`
      );
    }
  }

  const before = await repo.getScrimRow(ctx.db, ctx.tenantId, id);
  if (!before) throw new NotFoundError('Scrim not found');

  // Équipes extérieures : résolues une fois le scrim trouvé et le corps
  // validé, pour ne pas créer d'équipe derrière un 400/404/409.
  if (hasExternalName) {
    const external = await resolveScrimExternalTeams({
      tenantId: ctx.tenantId,
      names: externalNames.names,
      team1Id: updatePayload.team1_id as string | null | undefined,
      team2Id: updatePayload.team2_id as string | null | undefined,
      staffId: ctx.actor.kind === 'staff' ? ctx.actor.staffId : null,
    });
    if (!external.ok) {
      throw adminErrorFromStatus(external.status, external.error);
    }
    if (external.team1Id !== undefined) {
      updatePayload.team1_id = external.team1Id;
    }
    if (external.team2Id !== undefined) {
      updatePayload.team2_id = external.team2Id;
    }
  }

  // Vérifier team1 != team2 sur l'état résultant.
  const effectiveTeam1 =
    updatePayload.team1_id !== undefined
      ? (updatePayload.team1_id as string | null)
      : before.team1_id;
  const effectiveTeam2 =
    updatePayload.team2_id !== undefined
      ? (updatePayload.team2_id as string | null)
      : before.team2_id;
  if (effectiveTeam1 && effectiveTeam2 && effectiveTeam1 === effectiveTeam2) {
    throw new ValidationError('team1_id et team2_id doivent etre distincts');
  }

  // Rouvrir un scrim clos ou en litige (completed/cancelled/disputed →
  // draft/scheduled/running) invalide les reports déjà posés : ce PATCH ne fixe
  // jamais de score, et un report resté en base redeviendrait un vote — la
  // capitaine gagnante n'aurait qu'à renvoyer le sien pour re-clore le scrim
  // sur le résultat que le staff vient d'écarter. Purge AVANT l'écriture du
  // statut (aucun intervalle où l'ancien vote compte) ; si elle échoue, rien
  // n'est modifié.
  let purgedReports: PurgedScoreReport[] | null = null;
  if (
    updatePayload.status !== undefined &&
    scrimTransitionPurgesReports(before.status, updatePayload.status as string)
  ) {
    const purge = await purgeScoreReports('scrim', ctx.tenantId, id);
    if (!purge.ok) throw new AdminError(500, 'internal', purge.error);
    purgedReports = purge.purged;
  }

  // Un changement de STATUT n'est appliqué que si le scrim est toujours dans
  // l'état que le staff a lu : sinon une annulation pouvait croiser l'accord
  // des capitaines (ou l'inverse) et écraser un état qu'elle n'a jamais vu.
  const { row: after, error: updErr } = await repo.updateScrim(
    ctx.db,
    ctx.tenantId,
    id,
    updatePayload as TablesUpdate<'scrims'>,
    updatePayload.status !== undefined && before.status ? before.status : null
  );
  if (updErr) {
    ctx.logger.error('[admin/scrims/:id] PATCH error:', updErr);
    throw new AdminError(500, 'internal', 'Failed to update scrim');
  }
  if (!after) {
    throw new LegacyAdminError(
      409,
      'Le scrim a changé entre-temps (résultat déclaré ou statut modifié) : recharge-le avant de le modifier.',
      { code: 'SCRIM_CHANGED' }
    );
  }

  // Émet un bot event sur transition de status. On utilise `after` (la row
  // post-update) pour avoir le slug + équipes à jour si elles ont changé
  // dans le même PATCH.
  const beforeStatus = before.status || 'draft';
  const afterStatus = after.status || beforeStatus;
  const transitionEvent = statusTransitionEvent(beforeStatus, afterStatus);
  if (transitionEvent) {
    void emitScrimEvent(transitionEvent, asScrimEventRow(after), ctx.tenantId, {
      previousStatus: beforeStatus,
    });
  }

  // Le staff peut clore, rouvrir ou annuler un scrim ici : le miroir noté
  // (cf. utils/scrims/ratedMatch.ts) doit suivre, sinon un scrim annulé
  // laisserait ses points au classement des joueuses.
  if (
    updatePayload.status !== undefined ||
    updatePayload.team1_id !== undefined ||
    updatePayload.team2_id !== undefined
  ) {
    await syncScrimRatedMatch(ctx.tenantId, id);
  }

  // Replanification : si scheduled_date a changé et que le scrim est planifié,
  // on remonte (sans bloquer) les conflits de créneau détectés — l'agenda
  // affiche un avertissement « une équipe est déjà prise ».
  let conflicts: SlotConflict[] = [];
  if (
    updatePayload.scheduled_date !== undefined &&
    after.scheduled_date &&
    after.status === 'scheduled'
  ) {
    conflicts = await findScrimConflicts(ctx.db, {
      tenantId: ctx.tenantId,
      teamIds: [after.team1_id as string, after.team2_id as string],
      slotIso: after.scheduled_date,
      excludeScrimId: id,
    });
  }

  return {
    result: { success: true as const, scrim: after, conflicts },
    audit: {
      entity_type: 'scrim',
      entity_id: id,
      tournament_id: null,
      payload: {
        subject: 'update_scrim',
        changes: updatePayload,
        ...(purgedReports ? { purged_reports: purgedReports } : {}),
      },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Corbeille (soft-delete)
 * ------------------------------------------------------------------------ */

export async function deleteScrim(ctx: ServiceContext, id: string) {
  // Snapshot complet AVANT delete : on en a besoin pour l'event scrim.deleted
  // (le bot peut vouloir cleaner un thread / annonce associé via les ids
  // team1/team2 ou le slug).
  const before = await repo.getScrimRow(ctx.db, ctx.tenantId, id);
  if (!before) throw new NotFoundError('Scrim not found');

  // Soft-delete : conserve la row + ses matches liés pour restauration via
  // /admin/recycle-bin. Idempotent : delete une scrim déjà soft-deleted no-op.
  const { error } = await repo.softDeleteScrim(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/scrims/:id] DELETE error:', error);
    throw new AdminError(500, 'internal', 'Failed to delete scrim');
  }

  // Corbeille : le scrim redevient invisible, ses points de rating aussi.
  await syncScrimRatedMatch(ctx.tenantId, id);

  void emitScrimEvent('scrim.deleted', asScrimEventRow(before), ctx.tenantId, {
    previousStatus: before.status,
  });

  return {
    result: { success: true as const },
    audit: {
      entity_type: 'scrim',
      entity_id: id,
      tournament_id: null,
      payload: {
        subject: 'delete_scrim',
        name: before.name,
        slug: before.slug,
      },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Agenda
 * ------------------------------------------------------------------------ */

const MAX_CALENDAR_RANGE_MS = 92 * 24 * 3600 * 1000;

export async function getScrimCalendar(
  ctx: ServiceContext,
  query: Record<string, unknown>
) {
  const fromRaw = firstString(query.from);
  const toRaw = firstString(query.to);
  const fromMs = fromRaw ? Date.parse(fromRaw) : NaN;
  const toMs = toRaw ? Date.parse(toRaw) : NaN;
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || toMs <= fromMs) {
    throw new ValidationError('from/to (ISO) requis, to > from');
  }
  if (toMs - fromMs > MAX_CALENDAR_RANGE_MS) {
    throw new ValidationError('Plage trop large (max ~90 jours).');
  }
  const from = new Date(fromMs).toISOString();
  const to = new Date(toMs).toISOString();

  try {
    const [scrimRows, matchRows] = await Promise.all([
      repo.listCalendarScrims(ctx.db, ctx.tenantId, from, to),
      repo.listCalendarMatches(ctx.db, ctx.tenantId, from, to),
    ]);

    // Résout les noms d'équipes en un seul lookup.
    const teamIds = new Set<string>();
    for (const r of [...scrimRows, ...matchRows]) {
      if (r.team1_id) teamIds.add(r.team1_id);
      if (r.team2_id) teamIds.add(r.team2_id);
    }
    const nameById = new Map<string, string>();
    if (teamIds.size > 0) {
      const teams = await repo.listTeamNames(
        ctx.db,
        ctx.tenantId,
        Array.from(teamIds)
      );
      for (const t of teams) nameById.set(t.id, t.name ?? '');
    }
    const nm = (id: string | null) => (id ? (nameById.get(id) ?? null) : null);

    const scrims = scrimRows.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      scheduled_date: s.scheduled_date,
      duration_minutes: s.duration_minutes ?? null,
      team1_id: s.team1_id,
      team2_id: s.team2_id,
      team1Name: nm(s.team1_id),
      team2Name: nm(s.team2_id),
    }));

    // Les ids d'équipe sont exposés au même titre que ceux des scrims : sans
    // eux, l'agenda ne pouvait filtrer les matchs que sur le NOM de l'équipe —
    // deux homonymes se mélangeaient, et une différence de casse faisait
    // rater le filtre en silence.
    const matches = matchRows.map((m) => ({
      id: m.id,
      status: m.status,
      scheduled_at: m.scheduled_at,
      team1_id: m.team1_id,
      team2_id: m.team2_id,
      team1Name: nm(m.team1_id),
      team2Name: nm(m.team2_id),
    }));

    return { scrims, matches };
  } catch (err) {
    ctx.logger.error('[admin/scrims/calendar] error:', err);
    throw new AdminError(500, 'internal', 'Failed to load calendar events');
  }
}

/* ---------------------------------------------------------------------------
 * Transfert d'une demande de scrim externe vers une autre équipe
 * ------------------------------------------------------------------------ */

export async function forwardScrimRequest(
  ctx: ServiceContext,
  body: Record<string, unknown>
) {
  const { demandeId, targetTeamId } = body as {
    demandeId?: string;
    targetTeamId?: string;
  };
  if (!demandeId || !isValidUUID(demandeId)) {
    throw new ValidationError('demandeId invalide.');
  }
  if (!targetTeamId || !isValidUUID(targetTeamId)) {
    throw new ValidationError('targetTeamId invalide.');
  }

  const { row: source, error: fetchErr } = await repo.getScrimDemande(
    ctx.db,
    ctx.tenantId,
    demandeId
  );
  if (fetchErr || !source) throw new NotFoundError('Demande introuvable.');

  if (source.source !== 'public') {
    throw new ValidationError(
      'Seules les demandes externes peuvent être transférées.'
    );
  }
  if (source.team_id === targetTeamId) {
    throw new ValidationError('La demande est déjà destinée à cette équipe.');
  }

  const targetTeam = await repo.getActiveTeam(
    ctx.db,
    ctx.tenantId,
    targetTeamId
  );
  if (!targetTeam) {
    throw new ValidationError(
      "L'équipe cible n'existe pas ou n'est pas active."
    );
  }

  // Évite un double transfert vers la même équipe si une demande attend déjà.
  const sourcePayload =
    (source.payload as Record<string, unknown> | null) || {};
  const requesterEmail = sourcePayload.requester_email;
  if (requesterEmail) {
    const dup = await repo.findPendingScrimDemande(
      ctx.db,
      ctx.tenantId,
      targetTeamId,
      requesterEmail as string
    );
    if (dup) {
      throw new AdminError(
        409,
        'conflict',
        'Une demande de scrim de ce contact vers cette équipe est déjà en attente.'
      );
    }
  }

  const newPayload: Record<string, unknown> = {
    ...sourcePayload,
    target_team_name: targetTeam.name,
    forwarded_from: {
      demande_id: source.id,
      original_team_id: source.team_id,
      forwarded_at: new Date().toISOString(),
    },
  };

  const { row: inserted, error: insertErr } = await repo.insertDemande(ctx.db, {
    tenant_id: ctx.tenantId,
    user_id: null,
    team_id: targetTeamId,
    type: 'scrim',
    status: 'pending',
    comment: source.comment,
    source: 'public',
    payload: newPayload as TablesInsert<'demandes'>['payload'],
  });
  if (insertErr || !inserted) {
    ctx.logger.error('[admin/scrims/forward] insert error:', insertErr);
    throw new AdminError(500, 'internal', 'Échec du transfert.');
  }

  // Annote la demande d'origine pour que le staff retrouve le relais.
  const existingNote = (source.staff_note || '').toString();
  const newNote = [
    existingNote,
    `Transférée vers ${targetTeam.name} (${targetTeam.id})`,
  ]
    .filter(Boolean)
    .join('\n');
  await repo.updateDemandeStaffNote(ctx.db, ctx.tenantId, source.id, newNote);

  return {
    result: {
      success: true as const,
      newDemandeId: inserted.id,
      targetTeam: { id: targetTeam.id, name: targetTeam.name },
    },
    audit: {
      entity_type: 'demande',
      entity_id: source.id,
      tournament_id: null,
      payload: {
        subject: 'scrim_forward',
        source_demande_id: source.id,
        new_demande_id: inserted.id,
        original_team_id: source.team_id,
        target_team_id: targetTeamId,
        target_team_name: targetTeam.name,
      },
    },
  } satisfies Audited<unknown>;
}
