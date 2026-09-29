// features/admin/stages/service/stage.ts — une phase de tournoi : fiche,
// modification, désactivation / suppression, clonage, historique staff et
// état d'achèvement.
//
// Règles métier inchangées (validation des champs, verrou du format de match
// dès qu'un match a démarré — utils/stages/stageLockStatus, réglages validés
// par utils/stageSettings). Journal : mêmes slugs et payloads qu'à l'origine.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { TablesUpdate } from '@/types/database.generated';
import type { StageSettings } from '@/types/stages';
import type { StageType } from '@/types/admin';
import { validateStageSettings } from '@/utils/stageSettings';
import { getStageLockSnapshot } from '@/utils/stages/stageLockStatus';
import { formatStaffLog, type StaffLog } from '@/utils/staffLogs';
import { firstString } from '@/utils/admin/pathParams';
import type { Audited } from '../../_shared/audited';
import * as stages from '../repository/stages';
import * as matches from '../repository/matches';
import * as related from '../repository/related';
import { STAGE_UPDATABLE_FIELDS } from '../schemas';
import { fail, settingsOrNull, stageNotFound } from './common';

type Body = Record<string, unknown>;

const VALID_STAGE_TYPES = [
  'group',
  'bracket',
  'swiss',
  'round_robin',
  'showmatch',
  'other',
];

/* --------------------------------- fiche -------------------------------- */

export async function getStage(ctx: ServiceContext, id: string) {
  const { row, error } = await stages.getStage(ctx.db, ctx.tenantId, id);
  if (error || !row) {
    ctx.logger.error('admin GET stage error:', error);
    throw stageNotFound();
  }
  return { stage: row };
}

/* ------------------------------ modification ---------------------------- */

const isBadDate = (v: unknown) => Number.isNaN(Date.parse(v as string));

export async function updateStage(
  ctx: ServiceContext,
  id: string,
  body: Body
): Promise<Audited<{ stage: unknown }>> {
  const updatePayload: Record<string, unknown> = {};
  for (const key of STAGE_UPDATABLE_FIELDS) {
    if (key in body) updatePayload[key] = body[key];
  }
  if (Object.keys(updatePayload).length === 0) {
    throw fail(
      400,
      'No valid fields to update. Allowed: ' + STAGE_UPDATABLE_FIELDS.join(', ')
    );
  }

  if (
    'name' in body &&
    (typeof body.name !== 'string' || body.name.trim().length === 0)
  ) {
    throw fail(400, 'Stage name cannot be empty');
  }

  if ('order_index' in body && body.order_index !== null) {
    const oi = body.order_index;
    if (typeof oi !== 'number' || !Number.isInteger(oi) || oi < 0) {
      throw fail(400, 'order_index must be an integer >= 0');
    }
  }

  if ('stage_type' in body && body.stage_type !== null) {
    if (!VALID_STAGE_TYPES.includes(body.stage_type as string)) {
      throw fail(
        400,
        `Invalid stage_type. Allowed values: ${VALID_STAGE_TYPES.join(', ')}`
      );
    }
  }

  if (
    'start_date' in body &&
    body.start_date !== null &&
    isBadDate(body.start_date)
  ) {
    throw fail(400, 'start_date is not a valid date');
  }
  if (
    'end_date' in body &&
    body.end_date !== null &&
    isBadDate(body.end_date)
  ) {
    throw fail(400, 'end_date is not a valid date');
  }

  if ('start_date' in body && 'end_date' in body) {
    if (
      body.start_date &&
      body.end_date &&
      new Date(body.start_date as string) >= new Date(body.end_date as string)
    ) {
      throw fail(400, 'start_date must be before end_date');
    }
  }

  // Réglages validés contre le type du corps (sinon, plus bas, celui en base).
  if ('settings' in body && body.settings !== null) {
    const effectiveType = (body.stage_type ?? null) as StageType | null;
    if (effectiveType) {
      const r = validateStageSettings(effectiveType, body.settings);
      if (!r.valid) throw fail(400, r.error);
    }
  }

  updatePayload.updated_at = new Date().toISOString();

  const { row: before, error: fetchErr } = await stages.getStage(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (fetchErr || !before) throw stageNotFound();

  if ('settings' in body && body.settings !== null && !('stage_type' in body)) {
    const resolvedType = (before.stage_type ?? 'other') as StageType;
    const r = validateStageSettings(resolvedType, body.settings);
    if (!r.valid) throw fail(400, r.error);
  }

  // Garde « phase engagée » : pas de changement de `settings.match_format`
  // dès qu'un match a quitté pending/cancelled.
  if (
    'settings' in body &&
    body.settings &&
    typeof body.settings === 'object'
  ) {
    const beforeFormat = settingsOrNull(before.settings)?.match_format ?? null;
    const newFormat =
      (body.settings as StageSettings | null)?.match_format ?? null;
    if (beforeFormat !== newFormat) {
      const snap = await getStageLockSnapshot(id);
      if (snap.locked) {
        throw fail(
          409,
          `Impossible de modifier le format de la phase : ${snap.lockedMatchCount} match(s) ont déjà démarré ou sont terminés. Pour changer le format, annuler / réinitialiser ces matchs d'abord.`,
          'STAGE_FORMAT_LOCKED',
          { lockedMatchCount: snap.lockedMatchCount }
        );
      }
    }
  }

  const effectiveStart =
    'start_date' in body ? body.start_date : before.start_date;
  const effectiveEnd = 'end_date' in body ? body.end_date : before.end_date;
  if (
    effectiveStart &&
    effectiveEnd &&
    new Date(effectiveStart as string) >= new Date(effectiveEnd as string)
  ) {
    throw fail(400, 'start_date must be before end_date');
  }

  const { row: data, error } = await stages.updateStage(
    ctx.db,
    ctx.tenantId,
    id,
    updatePayload as TablesUpdate<'tournament_stages'>
  );
  if (error || !data) {
    ctx.logger.error('admin PUT stage error:', error);
    throw fail(500, 'Failed to update stage');
  }

  return {
    result: { stage: data },
    audit: {
      entity_type: 'stage',
      entity_id: id,
      tournament_id: data.tournament_id,
      payload: { before, after: data },
    },
  };
}

/* --------------------- désactivation / suppression ---------------------- */

export async function deleteStage(
  ctx: ServiceContext,
  id: string,
  hardRaw: unknown
): Promise<Audited<Record<string, unknown>>> {
  const hard = hardRaw === '1' || hardRaw === 'true';

  const { row: before, error: fetchErr } = await stages.getStage(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (fetchErr || !before) throw stageNotFound();

  const tournamentId = before.tournament_id ?? null;

  if (hard) {
    const { error } = await stages.deleteStage(ctx.db, ctx.tenantId, id);
    if (error) {
      ctx.logger.error('admin hard delete stage error:', error);
      throw fail(500, 'Failed to hard-delete stage');
    }
    return {
      result: { success: true, hardDeleted: true },
      audit: {
        action: 'delete_stage',
        entity_type: 'stage',
        entity_id: id,
        tournament_id: tournamentId,
        payload: { hard_delete: true },
      },
    };
  }

  const { row: data, error } = await stages.updateStage(
    ctx.db,
    ctx.tenantId,
    id,
    {
      is_active: false,
      is_public: false,
      updated_at: new Date().toISOString(),
    }
  );
  if (error || !data) {
    ctx.logger.error('admin soft delete stage error:', error);
    throw fail(500, 'Failed to deactivate stage');
  }

  return {
    result: { success: true, hardDeleted: false, stage: data },
    audit: {
      // Désactivation = modification (slug historique `update_stage`).
      action: 'update_stage',
      entity_type: 'stage',
      entity_id: id,
      tournament_id: tournamentId,
      payload: {
        soft_delete: true,
        new_is_active: false,
        new_is_public: false,
      },
    },
  };
}

/* -------------------------------- clonage ------------------------------- */

export async function cloneStage(
  ctx: ServiceContext,
  id: string,
  body: Body
): Promise<Audited<{ stage: unknown; clonedMatchCount: number }>> {
  const { row: source, error: fetchErr } = await stages.getStage(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (fetchErr || !source) throw stageNotFound();

  const includeMatches = body.includeMatches ?? false;
  const name = body.name;
  const tournamentId = (body.targetTournamentId ||
    source.tournament_id) as string;
  // Tournoi cible fourni par le client : il doit appartenir à l'espace du
  // staff, sinon rien n'est créé.
  if (body.targetTournamentId) {
    if (
      typeof body.targetTournamentId !== 'string' ||
      !(await related.tournamentSummary(ctx.db, ctx.tenantId, tournamentId))
    ) {
      throw fail(404, 'Tournament not found');
    }
  }

  const existingStages = await stages.maxStageOrder(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  const maxOrder = existingStages?.[0]?.order_index ?? -1;
  const nextOrder = (typeof maxOrder === 'number' ? maxOrder : -1) + 1;

  const cloneName = (name || `${source.name} (copie)`) as string;
  const cloneSlug = `${source.slug || source.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-copy-${Date.now()}`;

  const { row: cloned, error: insertErr } = await stages.insertStage(ctx.db, {
    tenant_id: ctx.tenantId,
    tournament_id: tournamentId,
    name: cloneName,
    slug: cloneSlug,
    stage_type: source.stage_type,
    order_index: nextOrder,
    is_active: false,
    is_public: false,
    start_date: source.start_date,
    end_date: source.end_date,
    settings: source.settings,
  });
  if (insertErr || !cloned) {
    ctx.logger.error('clone stage insert error:', insertErr);
    throw fail(500, 'Failed to clone stage');
  }

  let clonedMatchCount = 0;

  if (includeMatches) {
    const { rows: sourceMatches, error: matchErr } =
      await matches.cloneSourceMatches(ctx.db, ctx.tenantId, id);

    if (!matchErr && sourceMatches && sourceMatches.length > 0) {
      const now = new Date().toISOString();
      const oldToNew = new Map<string, string>();

      const payloads = sourceMatches.map((m) => ({
        tenant_id: ctx.tenantId,
        tournament_id: tournamentId,
        stage_id: cloned.id,
        status: 'pending',
        is_bye: m.is_bye ?? false,
        match_format: m.match_format,
        round_name: m.round_name,
        round_number: m.round_number,
        bracket_side: m.bracket_side,
        group_key: m.group_key,
        best_of: m.best_of,
        team1_id: m.team1_id,
        team2_id: m.team2_id,
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
        scheduled_at: m.scheduled_at,
        completed_at: null,
        stream_url: null,
        lobby_code: null,
        notes: m.notes,
        // Liens de bracket recâblés en seconde passe.
        next_match_win_id: null,
        next_match_win_slot: m.next_match_win_slot,
        next_match_lose_id: null,
        next_match_lose_slot: m.next_match_lose_slot,
        created_at: now,
        updated_at: null,
      }));

      const { rows: inserted, error: insertMatchErr } =
        await matches.insertMatchesReturningIds(ctx.db, payloads);

      if (!insertMatchErr && inserted) {
        clonedMatchCount = inserted.length;
        // Ordre d'insertion = ordre source.
        sourceMatches.forEach((m, i) => {
          if (inserted[i]) oldToNew.set(m.id, inserted[i].id);
        });

        for (const m of sourceMatches) {
          const newId = oldToNew.get(m.id);
          if (!newId) continue;
          const newWinId = m.next_match_win_id
            ? (oldToNew.get(m.next_match_win_id) ?? null)
            : null;
          const newLoseId = m.next_match_lose_id
            ? (oldToNew.get(m.next_match_lose_id) ?? null)
            : null;
          if (newWinId || newLoseId) {
            await matches.updateMatchLinks(ctx.db, ctx.tenantId, newId, {
              next_match_win_id: newWinId,
              next_match_lose_id: newLoseId,
            });
          }
        }
      }
    }
  }

  const stageTeams = await stages.stageTeamsForClone(ctx.db, ctx.tenantId, id);
  if (stageTeams && stageTeams.length > 0) {
    await stages.insertStageTeams(
      ctx.db,
      stageTeams.map((st) => ({
        tenant_id: ctx.tenantId,
        stage_id: cloned.id,
        team_id: st.team_id,
        seed: st.seed,
      }))
    );
  }

  return {
    result: { stage: cloned, clonedMatchCount },
    audit: {
      entity_type: 'stage',
      entity_id: cloned.id,
      tournament_id: tournamentId,
      payload: {
        source_stage_id: id,
        clone_name: cloneName,
        include_matches: includeMatches,
        cloned_match_count: clonedMatchCount,
      },
    },
  };
}

/* ------------------------------ historique ------------------------------ */

/** Même lecture que `parsePagination(req, { limit: 200 })` (limite seule). */
function historyLimit(raw: unknown): number {
  const v = firstString(raw);
  return Math.max(1, Math.min(1000, Number.parseInt(v ?? '200', 10) || 200));
}

export async function stageHistory(
  ctx: ServiceContext,
  id: string,
  query: Record<string, unknown>
) {
  const entityType =
    typeof query.entityType === 'string' ? query.entityType : null;
  const action = typeof query.action === 'string' ? query.action : null;
  const limit = historyLimit(query.limit);

  // 1) Entrées attachées à la phase (le filtre `entityType` ne s'y applique
  //    pas, pour ne pas perdre l'historique direct).
  const direct = await related.stageLogs(ctx.db, ctx.tenantId, id, {
    action,
    limit,
  });
  if (direct.error)
    ctx.logger.error('stage history: stageLogs error:', direct.error);

  // 2) Entrées d'autres entités qui citent la phase via payload.stage_id.
  const cited = await related.payloadStageLogs(ctx.db, ctx.tenantId, id, {
    entityType,
    action,
    limit,
  });
  if (cited.error)
    ctx.logger.error('stage history: payloadLogs error:', cited.error);

  const rawLogs: StaffLog[] = [
    ...((direct.rows as unknown as StaffLog[]) ?? []),
    ...((cited.rows as unknown as StaffLog[]) ?? []),
  ];
  rawLogs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return { stageId: id, logs: rawLogs.map((log) => formatStaffLog(log)) };
}

/* ----------------------------- achèvement ------------------------------- */

export async function completionStatus(ctx: ServiceContext, id: string) {
  const { row: stage, error: stageErr } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (stageErr || !stage) throw stageNotFound();

  const { rows, error: matchErr } = await matches.activeStageMatches(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (matchErr) throw fail(500, 'Failed to fetch matches');

  const all = rows || [];
  const totalMatches = all.length;
  const finishedMatches = all.filter((m) => m.status === 'finished').length;
  const pendingMatches = all.filter((m) => m.status === 'pending').length;
  const ongoingMatches = all.filter((m) => m.status === 'ongoing').length;
  const isComplete = totalMatches > 0 && finishedMatches === totalMatches;

  let nextStage: {
    id: string;
    name: string;
    stage_type: string | null;
  } | null = null;
  if (stage.order_index !== null) {
    const next = await stages.nextStage(
      ctx.db,
      ctx.tenantId,
      stage.tournament_id,
      stage.order_index
    );
    if (next) {
      nextStage = { id: next.id, name: next.name, stage_type: next.stage_type };
    }
  }

  const advancementRules =
    settingsOrNull(stage.settings)?.advancement_rules ?? null;
  const hasAutoAdvancement = !!(
    advancementRules?.advance_top && advancementRules?.target_stage_id
  );
  const canAdvance = isComplete && (nextStage !== null || hasAutoAdvancement);

  return {
    stageId: id,
    stageName: stage.name,
    stageType: stage.stage_type,
    totalMatches,
    finishedMatches,
    pendingMatches,
    ongoingMatches,
    isComplete,
    nextStage,
    canAdvance,
    advancementRules: hasAutoAdvancement ? advancementRules : undefined,
  };
}
