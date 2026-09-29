// features/admin/matches/service/castAssignments.ts — casters d'un match :
// liste, assignation, reprogrammation du briefing, retrait. Chaque geste
// part au bot (utils/castEvents) pour les rappels et les embeds.
//
// ⚠️ DÉFAUT PRÉEXISTANT CONSERVÉ : l'assignation ne vérifie pas que
// `matchId` appartient au tenant du staff (seul le caster l'est) — on peut
// créer, dans son espace, une assignation pointant un match d'un autre.

import { LegacyAdminError } from '@/utils/admin/errors';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { isValidUUID } from '@/utils/apiHelpers';
import { emitCastEvent } from '@/utils/castEvents';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/castAssignments';

type Raw = Record<string, unknown>;

/** Briefing requis, valide, pas dans le passé (1 min de tolérance d'horloge). */
function parseBriefingAt(raw: unknown): Date {
  if (typeof raw !== 'string') {
    throw new LegacyAdminError(400, 'briefingAt requis');
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new LegacyAdminError(400, 'briefingAt invalide');
  }
  if (date.getTime() < Date.now() - 60_000) {
    throw new LegacyAdminError(400, 'briefingAt doit être dans le futur.');
  }
  return date;
}

export async function listCastAssignments(
  ctx: ServiceContext,
  matchId: string
) {
  const { rows, error } = await repo.listMatchCastAssignments(
    ctx.db,
    ctx.tenantId,
    matchId
  );
  if (error) {
    ctx.logger.error('[admin/cast-assignments] list error', error);
    throw new LegacyAdminError(500, 'Échec du chargement');
  }
  return { assignments: rows ?? [] };
}

export async function assignCaster(
  ctx: ServiceContext,
  matchId: string,
  body: Raw
): Promise<Audited<{ assignment: unknown }>> {
  const { castMemberId } = body;
  if (typeof castMemberId !== 'string' || !isValidUUID(castMemberId)) {
    throw new LegacyAdminError(400, 'castMemberId invalide');
  }
  const briefingDate = parseBriefingAt(body.briefingAt);

  // Un caster désactivé ne recevrait pas son rappel.
  const { row: castMember, error: castMemberErr } =
    await repo.getCastMemberActive(ctx.db, ctx.tenantId, castMemberId);
  if (castMemberErr) {
    ctx.logger.error(
      '[admin/cast-assignments] cast_member lookup error',
      castMemberErr
    );
    throw new LegacyAdminError(500, 'Échec de la vérification');
  }
  if (!castMember) throw new LegacyAdminError(404, 'Caster introuvable.');
  if (castMember.is_active === false) {
    throw new LegacyAdminError(409, 'Ce caster est désactivé.');
  }

  const { row: data, error } = await repo.insertMatchCastAssignment(ctx.db, {
    tenant_id: ctx.tenantId,
    match_id: matchId,
    cast_member_id: castMemberId,
    briefing_at: briefingDate.toISOString(),
  });
  if (error || !data) {
    // UNIQUE (match_id, cast_member_id)
    if (error?.code === '23505') {
      throw new LegacyAdminError(409, 'Ce caster est déjà assigné à ce match.');
    }
    ctx.logger.error('[admin/cast-assignments] create error', error);
    throw new LegacyAdminError(500, 'Échec de la création');
  }

  void emitCastEvent(
    'cast.assigned',
    {
      assignmentId: data.id,
      matchId,
      castMemberId,
      briefingAt: data.briefing_at ?? briefingDate.toISOString(),
    },
    ctx.tenantId
  );

  return {
    result: { assignment: data },
    audit: {
      entity_type: 'cast_assignment',
      entity_id: data.id,
      tournament_id: null,
      payload: { match_id: matchId, cast_member_id: castMemberId },
    },
  };
}

/** PATCH — reprogramme le briefing. Aucun journal staff à l'origine. */
export async function rescheduleCastAssignment(
  ctx: ServiceContext,
  matchId: string,
  assignmentId: string,
  body: Raw
) {
  const briefingDate = parseBriefingAt(body.briefingAt);

  // Ancien horaire : le bot sait s'il doit annuler le rappel déjà programmé.
  const previous = await repo.getAssignmentSnapshot(
    ctx.db,
    ctx.tenantId,
    matchId,
    assignmentId
  );

  const { row: data, error } = await repo.rescheduleAssignment(
    ctx.db,
    ctx.tenantId,
    matchId,
    assignmentId,
    briefingDate.toISOString()
  );
  if (error || !data) {
    ctx.logger.error('[admin/cast-assignments/id] patch error', error);
    throw new LegacyAdminError(500, 'Échec de la mise à jour');
  }

  void emitCastEvent(
    'cast.briefing.rescheduled',
    {
      assignmentId,
      matchId,
      castMemberId: data.cast_member_id as string,
      briefingAt: data.briefing_at ?? briefingDate.toISOString(),
    },
    ctx.tenantId,
    { previousBriefingAt: previous?.briefing_at ?? null }
  );

  return { assignment: data };
}

export async function unassignCaster(
  ctx: ServiceContext,
  matchId: string,
  assignmentId: string
): Promise<Audited<{ success: true }>> {
  // Instantané AVANT suppression : sans lui, cast.unassigned partirait vide.
  const before = await repo.getAssignmentSnapshot(
    ctx.db,
    ctx.tenantId,
    matchId,
    assignmentId
  );

  const { error } = await repo.deleteAssignment(
    ctx.db,
    ctx.tenantId,
    matchId,
    assignmentId
  );
  if (error) {
    ctx.logger.error('[admin/cast-assignments/id] delete error', error);
    throw new LegacyAdminError(500, 'Échec de la suppression');
  }

  if (before?.cast_member_id) {
    void emitCastEvent(
      'cast.unassigned',
      {
        assignmentId,
        matchId,
        castMemberId: before.cast_member_id,
        briefingAt: before.briefing_at ?? null,
      },
      ctx.tenantId
    );
  }

  return {
    result: { success: true },
    audit: {
      entity_type: 'cast_assignment',
      entity_id: assignmentId,
      tournament_id: null,
      payload: { match_id: matchId },
    },
  };
}
