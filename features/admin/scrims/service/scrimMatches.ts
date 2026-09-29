// features/admin/scrims/service/scrimMatches.ts — matchs d'un scrim et
// casters assignés à un scrim (`/api/admin/scrims/[scrimId]/matches`,
// `/api/admin/scrims/[scrimId]/cast-assignments`).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  NotFoundError,
  ValidationError,
} from '@/utils/admin/errors';
import type { TablesInsert } from '@/types/database.generated';
import { isValidUUID } from '@/utils/apiHelpers';
import { emitScheduleEvents } from '@/utils/matches/scheduleEvents';
import { emitCastEvent } from '@/utils/castEvents';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/scrims';
import { SCRIM_MATCH_STATUSES } from '../schemas';

/* ---------------------------------------------------------------------------
 * Matchs
 * ------------------------------------------------------------------------ */

type MatchInput = {
  status?: string;
  is_bye?: boolean;
  best_of?: number | null;
  match_format?: string | null;
  team1_id?: string | null;
  team2_id?: string | null;
  scheduled_at?: string | null;
  stream_url?: string | null;
  lobby_code?: string | null;
  notes?: string | null;
};

type MatchRow = TablesInsert<'matches'> & { tenant_id: string };

function normalizeMatch(
  scrimId: string,
  tenantId: string,
  input: MatchInput,
  defaults: { team1Id: string | null; team2Id: string | null }
): { row?: MatchRow; error?: string } {
  if (input.team1_id && !isValidUUID(input.team1_id))
    return { error: 'team1_id invalide' };
  if (input.team2_id && !isValidUUID(input.team2_id))
    return { error: 'team2_id invalide' };

  const status = input.status ?? 'pending';
  if (!(SCRIM_MATCH_STATUSES as readonly string[]).includes(status)) {
    return {
      error: `status invalide. Valeurs : ${SCRIM_MATCH_STATUSES.join(', ')}.`,
    };
  }

  if (input.scheduled_at && Number.isNaN(Date.parse(input.scheduled_at))) {
    return { error: 'scheduled_at invalide' };
  }

  if (
    input.best_of !== undefined &&
    input.best_of !== null &&
    (!Number.isInteger(input.best_of) || input.best_of < 1)
  ) {
    return { error: 'best_of doit etre un entier >= 1' };
  }

  return {
    row: {
      tenant_id: tenantId,
      tournament_id: null,
      scrim_id: scrimId,
      stage_id: null,
      status,
      is_bye: input.is_bye ?? false,
      best_of: input.best_of ?? null,
      match_format: input.match_format ?? null,
      team1_id: input.team1_id ?? defaults.team1Id,
      team2_id: input.team2_id ?? defaults.team2Id,
      scheduled_at: input.scheduled_at ?? null,
      stream_url: input.stream_url ?? null,
      lobby_code: input.lobby_code ?? null,
      notes: input.notes ?? null,
    },
  };
}

export async function listScrimMatches(ctx: ServiceContext, scrimId: string) {
  const { rows, error } = await repo.listScrimMatches(
    ctx.db,
    ctx.tenantId,
    scrimId
  );
  if (error) {
    ctx.logger.error('[admin/scrims/:id/matches] GET error:', error);
    throw new AdminError(500, 'internal', 'Failed to fetch matches');
  }
  return { matches: rows };
}

export async function createScrimMatches(
  ctx: ServiceContext,
  scrimId: string,
  body: Record<string, unknown>
) {
  // Vérifier que le scrim existe + récupérer team1/team2 pour pré-remplir.
  const scrim = await repo.getScrimTeams(ctx.db, ctx.tenantId, scrimId);
  if (!scrim) throw new NotFoundError('Scrim introuvable');

  let inputs: MatchInput[];
  if (Array.isArray(body.matches)) {
    inputs = body.matches as MatchInput[];
  } else if (body.match && typeof body.match === 'object') {
    inputs = [body.match as MatchInput];
  } else {
    inputs = [{}]; // création d'un match vide pré-rempli avec les équipes du scrim
  }

  if (inputs.length === 0) throw new ValidationError('Aucun match a creer');
  if (inputs.length > 50) {
    throw new ValidationError('Maximum 50 matchs par requete');
  }

  const rows: MatchRow[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const { row, error } = normalizeMatch(scrimId, ctx.tenantId, inputs[i], {
      team1Id: scrim.team1_id ?? null,
      team2Id: scrim.team2_id ?? null,
    });
    if (error) throw new ValidationError(`match[${i}]: ${error}`);
    if (row) rows.push(row);
  }

  const { rows: inserted, error: insErr } = await repo.insertMatches(
    ctx.db,
    rows
  );
  if (insErr || !inserted) {
    ctx.logger.error('[admin/scrims/:id/matches] insert error:', insErr);
    throw new AdminError(500, 'internal', 'Echec de creation des matchs');
  }

  // Un match créé DÉJÀ daté est un match planifié : match.scheduled, pour que
  // l'event Discord natif existe dès la création (null → date). Attendu, en
  // une insertion outbox pour tout le lot. Ne rejette jamais.
  await emitScheduleEvents(
    inserted.map((m) => ({
      matchId: m.id,
      tournamentId: null,
      scrimId,
      previous: null,
      next: m.scheduled_at ?? null,
    })),
    ctx.tenantId
  );

  return {
    result: { matches: inserted, count: inserted.length },
    audit: {
      entity_type: 'match',
      entity_id: inserted.length === 1 ? inserted[0].id : null,
      tournament_id: null,
      payload: {
        subject: 'create_scrim_match',
        scrim_id: scrimId,
        count: inserted.length,
        match_ids: inserted.map((m) => m.id),
      },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Casters d'un scrim (parité avec matches/[matchId]/cast-assignments)
 * ------------------------------------------------------------------------ */

export async function listScrimCastAssignments(
  ctx: ServiceContext,
  scrimId: string
) {
  const { rows, error } = await repo.listScrimCastAssignments(
    ctx.db,
    ctx.tenantId,
    scrimId
  );
  if (error) {
    ctx.logger.error('[admin/scrims/cast-assignments] list error', error);
    throw new AdminError(500, 'internal', 'Échec du chargement');
  }
  return { assignments: rows };
}

export async function assignScrimCaster(
  ctx: ServiceContext,
  scrimId: string,
  body: Record<string, unknown>
) {
  const { castMemberId, briefingAt } = body;
  if (typeof castMemberId !== 'string' || !isValidUUID(castMemberId)) {
    throw new ValidationError('castMemberId invalide');
  }
  if (typeof briefingAt !== 'string') {
    throw new ValidationError('briefingAt requis');
  }
  const briefingDate = new Date(briefingAt);
  if (Number.isNaN(briefingDate.getTime())) {
    throw new ValidationError('briefingAt invalide');
  }
  if (briefingDate.getTime() < Date.now() - 60_000) {
    throw new ValidationError('briefingAt doit être dans le futur.');
  }

  // Existence + actif du caster.
  const { row: castMember, error: castMemberErr } = await repo.getCastMember(
    ctx.db,
    ctx.tenantId,
    castMemberId
  );
  if (castMemberErr) {
    ctx.logger.error(
      '[admin/scrims/cast-assignments] cast_member lookup error',
      castMemberErr
    );
    throw new AdminError(500, 'internal', 'Échec de la vérification');
  }
  if (!castMember) throw new NotFoundError('Caster introuvable.');
  if (castMember.is_active === false) {
    throw new AdminError(409, 'conflict', 'Ce caster est désactivé.');
  }

  // Existence du scrim + tenant scope.
  if (!(await repo.scrimExists(ctx.db, ctx.tenantId, scrimId))) {
    throw new NotFoundError('Scrim introuvable.');
  }

  const { row: data, error } = await repo.insertScrimCastAssignment(ctx.db, {
    tenant_id: ctx.tenantId,
    scrim_id: scrimId,
    cast_member_id: castMemberId,
    briefing_at: briefingDate.toISOString(),
  });
  if (error || !data) {
    if (error?.code === '23505') {
      throw new AdminError(
        409,
        'conflict',
        'Ce caster est déjà assigné à ce scrim.'
      );
    }
    ctx.logger.error('[admin/scrims/cast-assignments] create error', error);
    throw new AdminError(500, 'internal', 'Échec de la création');
  }

  // Même event que pour un match : le bot consomme `cast.assigned` quelle que
  // soit l'entité, `scrimId` (vs `matchId`) lui dit quoi charger.
  void emitCastEvent(
    'cast.assigned',
    {
      assignmentId: data.id,
      scrimId,
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
      payload: { scrim_id: scrimId, cast_member_id: castMemberId },
    },
  } satisfies Audited<unknown>;
}
