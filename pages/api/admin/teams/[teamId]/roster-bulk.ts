// pages/api/admin/teams/[teamId]/roster-bulk.ts
// Actions roster en masse (staff/manager) : applique une operation a une liste
// de membres d'une equipe et renvoie un resultat par membre (best-effort).
//
// Operations supportees :
//   - set_role       : assigne `role` a tous les membres selectionnes
//   - set_substitute : (un)marque `is_substitute` pour tous les membres
//   - remove         : retire les membres selectionnes (jamais le capitaine)
//   - import_battle_tags : applique un battle_tag par membre (matche cote client,
//                          re-valide ici via validateBattleTag)
//
// Garde-fous :
//   - withStaffRoute('manager') (gate identique aux autres /api/admin/teams/*)
//   - rate-limit
//   - le capitaine ne peut JAMAIS etre retire ni passe remplacant via bulk
//   - audit UNE fois par appel via logStaffAction('bulk_roster_update')

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID, validateRole } from '@/utils/apiHelpers';
import { validateBattleTag } from '@/utils/teams/addMember';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

const MEMBER_SELECT =
  'id, team_id, user_id, role, battle_tag, is_substitute, created_at';

export type RosterBulkOperation =
  | 'set_role'
  | 'set_substitute'
  | 'remove'
  | 'import_battle_tags';

type PerMemberResult = {
  memberId: string;
  ok: boolean;
  error?: string;
};

type RosterBulkResponse =
  | {
      operation: RosterBulkOperation;
      results: PerMemberResult[];
      successCount: number;
      failureCount: number;
    }
  | { error: string };

type MemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  battle_tag: string | null;
  is_substitute: boolean;
};

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RosterBulkResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 20, windowMs: 60_000 },
      'admin-team-roster-bulk'
    )
  )
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Supabase service role not configured' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { teamId } = req.query;
  if (!teamId || Array.isArray(teamId) || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'Invalid teamId' });
  }

  const { operation } = (req.body || {}) as {
    operation?: RosterBulkOperation;
  };

  const ALLOWED: RosterBulkOperation[] = [
    'set_role',
    'set_substitute',
    'remove',
    'import_battle_tags',
  ];
  if (!operation || !ALLOWED.includes(operation)) {
    return res.status(400).json({ error: 'Invalid or missing operation' });
  }

  // --- Resolve the captain so we can guard against demote / removal ---
  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, captain_id')
    .eq('id', teamId)
    .maybeSingle();

  if (teamErr || !team) {
    return res.status(404).json({ error: 'Team not found' });
  }
  const captainUserId: string | null =
    (team as { captain_id: string | null }).captain_id ?? null;

  // --- Normalise the requested member set ---
  // For import_battle_tags the payload is a list of { memberId, battleTag }.
  // For everything else it's a flat list of member ids.
  type ImportItem = { memberId: string; battleTag: string };
  let requestedIds: string[] = [];
  let importItems: ImportItem[] = [];

  if (operation === 'import_battle_tags') {
    const raw = (req.body?.items ?? []) as unknown[];
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ error: 'items[] is required' });
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
    const raw = (req.body?.memberIds ?? []) as unknown[];
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ error: 'memberIds[] is required' });
    }
    requestedIds = raw.filter((v): v is string => typeof v === 'string');
  }

  if (requestedIds.length === 0) {
    return res.status(400).json({ error: 'No valid member ids provided' });
  }
  // Cap the batch size — defense against a runaway payload.
  if (requestedIds.length > 200) {
    return res.status(400).json({ error: 'Too many members in one batch' });
  }

  // --- Load the targeted members, scoped to this team ---
  const { data: membersData, error: membersErr } = await supabaseAdmin
    .from('team_members')
    .select(MEMBER_SELECT)
    .eq('team_id', teamId)
    .in('id', requestedIds);

  if (membersErr) {
    logger.error('[roster-bulk] load members error:', membersErr);
    return res.status(500).json({ error: 'Failed to load team members' });
  }

  const membersById = new Map<string, MemberRow>();
  for (const m of (membersData || []) as MemberRow[]) {
    membersById.set(m.id, m);
  }

  const results: PerMemberResult[] = [];

  // --- Per-operation validation of the payload (once, not per member) ---
  let normalizedRole = '';
  let substituteValue = false;
  if (operation === 'set_role') {
    const role = (req.body?.role ?? '') as string;
    if (typeof role !== 'string' || !role.trim()) {
      return res.status(400).json({ error: 'role is required' });
    }
    normalizedRole = validateRole(role);
  }
  if (operation === 'set_substitute') {
    if (typeof req.body?.isSubstitute !== 'boolean') {
      return res
        .status(400)
        .json({ error: 'isSubstitute (boolean) is required' });
    }
    substituteValue = req.body.isSubstitute;
  }

  // --- Apply per member (best-effort) ---
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
        const { error } = await supabaseAdmin
          .from('team_members')
          .update({ role: normalizedRole })
          .eq('id', memberId)
          .eq('team_id', teamId);
        if (error) throw new Error('Failed to update role');
        results.push({ memberId, ok: true });
      } else if (operation === 'set_substitute') {
        // Captain can never be demoted to substitute via bulk.
        if (isCaptain && substituteValue) {
          results.push({
            memberId,
            ok: false,
            error: 'Cannot mark the captain as substitute',
          });
          continue;
        }
        const { error } = await supabaseAdmin
          .from('team_members')
          .update({ is_substitute: substituteValue })
          .eq('id', memberId)
          .eq('team_id', teamId);
        if (error) throw new Error('Failed to update substitute flag');
        results.push({ memberId, ok: true });
      } else if (operation === 'remove') {
        // Never remove the captain through bulk.
        if (isCaptain) {
          results.push({
            memberId,
            ok: false,
            error: 'Cannot remove the captain via bulk',
          });
          continue;
        }
        const { error } = await supabaseAdmin
          .from('team_members')
          .delete()
          .eq('id', memberId)
          .eq('team_id', teamId);
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
        const { error } = await supabaseAdmin
          .from('team_members')
          .update({ battle_tag: validTag })
          .eq('id', memberId)
          .eq('team_id', teamId);
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

  // --- Audit ONCE per bulk call ---
  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'bulk_roster_update',
    entity_type: 'team',
    entity_id: String(teamId),
    tenant_id: ctx.tenantId,
    payload: {
      operation,
      requested: requestedIds.length,
      success: successCount,
      failure: failureCount,
      member_ids: requestedIds,
    },
  });

  return res.status(200).json({
    operation,
    results,
    successCount,
    failureCount,
  });
}
