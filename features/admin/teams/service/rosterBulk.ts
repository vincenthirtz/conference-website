// features/admin/teams/service/rosterBulk.ts — actions roster en masse
// (POST /api/admin/teams/[teamId]/roster-bulk) : une opération appliquée à
// une liste de membres, un résultat par membre (best-effort).
//
//   set_role / set_substitute / remove / import_battle_tags
//
// Garde-fous conservés : le capitaine n'est JAMAIS retiré ni passé
// remplaçant par ce chemin ; l'équipe est lue DANS l'espace (404 sinon) ;
// un seul journal par appel (`bulk_roster_update`).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { validateRole } from '@/utils/apiHelpers';
import { validateBattleTag } from '@/utils/teams/addMember';
import { loadTeamInTenant } from '@/utils/teams/loadTeamInTenant';
import type { Audited } from '../../_shared/audited';
import * as roster from '../repository/roster';
import { fail } from './common';

export type RosterBulkOperation =
  | 'set_role'
  | 'set_substitute'
  | 'remove'
  | 'import_battle_tags';

const ALLOWED: RosterBulkOperation[] = [
  'set_role',
  'set_substitute',
  'remove',
  'import_battle_tags',
];

type PerMemberResult = { memberId: string; ok: boolean; error?: string };

type RosterBulkResult = {
  operation: RosterBulkOperation;
  results: PerMemberResult[];
  successCount: number;
  failureCount: number;
};

export async function rosterBulk(
  ctx: ServiceContext,
  teamId: string,
  body: Record<string, unknown>
): Promise<Audited<RosterBulkResult>> {
  const operation = body.operation as RosterBulkOperation | undefined;
  if (!operation || !ALLOWED.includes(operation)) {
    throw fail(400, 'Invalid or missing operation');
  }

  // Capitaine résolu pour les garde-fous ; équipe d'un autre espace = 404.
  const teamRead = await loadTeamInTenant<{
    id: string;
    captain_id: string | null;
  }>(teamId, ctx.tenantId, 'id, captain_id');
  if (!teamRead.ok) throw fail(teamRead.status, teamRead.error);
  const captainUserId: string | null = teamRead.team.captain_id ?? null;

  type ImportItem = { memberId: string; battleTag: string };
  let requestedIds: string[] = [];
  let importItems: ImportItem[] = [];

  if (operation === 'import_battle_tags') {
    const raw = (body.items ?? []) as unknown[];
    if (!Array.isArray(raw) || raw.length === 0) {
      throw fail(400, 'items[] is required');
    }
    importItems = raw
      .map((it) => {
        const o = (it ?? {}) as Record<string, unknown>;
        return {
          memberId: typeof o.memberId === 'string' ? o.memberId : '',
          battleTag: typeof o.battleTag === 'string' ? o.battleTag : '',
        };
      })
      .filter((it) => it.memberId);
    requestedIds = importItems.map((it) => it.memberId);
  } else {
    const raw = (body.memberIds ?? []) as unknown[];
    if (!Array.isArray(raw) || raw.length === 0) {
      throw fail(400, 'memberIds[] is required');
    }
    requestedIds = raw.filter((v): v is string => typeof v === 'string');
  }

  if (requestedIds.length === 0) {
    throw fail(400, 'No valid member ids provided');
  }
  if (requestedIds.length > 200) {
    throw fail(400, 'Too many members in one batch');
  }

  const { rows, error: membersErr } = await roster.listTeamMembersByIds(
    ctx.db,
    teamId,
    requestedIds
  );
  if (membersErr) {
    ctx.logger.error('[roster-bulk] load members error:', membersErr);
    throw fail(500, 'Failed to load team members');
  }
  const membersById = new Map(rows.map((m) => [m.id, m]));

  // Validation par opération (une fois, pas par membre).
  let normalizedRole = '';
  let substituteValue = false;
  if (operation === 'set_role') {
    const role = (body.role ?? '') as string;
    if (typeof role !== 'string' || !role.trim()) {
      throw fail(400, 'role is required');
    }
    normalizedRole = validateRole(role);
  }
  if (operation === 'set_substitute') {
    if (typeof body.isSubstitute !== 'boolean') {
      throw fail(400, 'isSubstitute (boolean) is required');
    }
    substituteValue = body.isSubstitute;
  }

  const results: PerMemberResult[] = [];
  for (const memberId of requestedIds) {
    const member = membersById.get(memberId);
    if (!member) {
      results.push({ memberId, ok: false, error: 'Member not found' });
      continue;
    }
    const isCaptain =
      captainUserId !== null && member.user_id === captainUserId;

    try {
      if (operation === 'set_role') {
        const { error } = await roster.updateTeamMember(
          ctx.db,
          teamId,
          memberId,
          { role: normalizedRole }
        );
        if (error) throw new Error('Failed to update role');
        results.push({ memberId, ok: true });
      } else if (operation === 'set_substitute') {
        if (isCaptain && substituteValue) {
          results.push({
            memberId,
            ok: false,
            error: 'Cannot mark the captain as substitute',
          });
          continue;
        }
        const { error } = await roster.updateTeamMember(
          ctx.db,
          teamId,
          memberId,
          { is_substitute: substituteValue }
        );
        if (error) throw new Error('Failed to update substitute flag');
        results.push({ memberId, ok: true });
      } else if (operation === 'remove') {
        if (isCaptain) {
          results.push({
            memberId,
            ok: false,
            error: 'Cannot remove the captain via bulk',
          });
          continue;
        }
        const { error } = await roster.deleteTeamMember(
          ctx.db,
          teamId,
          memberId
        );
        if (error) throw new Error('Failed to remove member');
        results.push({ memberId, ok: true });
      } else if (operation === 'import_battle_tags') {
        const item = importItems.find((it) => it.memberId === memberId);
        let validTag: string;
        try {
          validTag = validateBattleTag(item?.battleTag);
        } catch {
          results.push({
            memberId,
            ok: false,
            error: 'Invalid BattleTag (format Name#0000)',
          });
          continue;
        }
        const { error } = await roster.updateTeamMember(
          ctx.db,
          teamId,
          memberId,
          { battle_tag: validTag }
        );
        if (error) throw new Error('Failed to update BattleTag');
        results.push({ memberId, ok: true });
      }
    } catch (err: unknown) {
      results.push({
        memberId,
        ok: false,
        error: (err as Error)?.message || 'Operation failed',
      });
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  const failureCount = results.length - successCount;

  return {
    result: { operation, results, successCount, failureCount },
    audit: {
      entity_type: 'team',
      entity_id: teamId,
      payload: {
        operation,
        requested: requestedIds.length,
        success: successCount,
        failure: failureCount,
        member_ids: requestedIds,
      },
    },
  };
}
