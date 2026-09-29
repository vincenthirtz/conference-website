// features/admin/matches/repository/castAssignments.ts — casters assignés à
// un match (`cast_assignments`). `tenantId` OBLIGATOIRE partout.

import type { AdminDb } from '@/utils/admin/serviceContext';
import {
  CAST_ASSIGNMENT_ROW_COLUMNS,
  MATCH_CAST_ASSIGNMENT_COLUMNS,
} from '../schemas';

export async function listMatchCastAssignments(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data, error } = await db
    .from('cast_assignments')
    .select(MATCH_CAST_ASSIGNMENT_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId)
    .order('briefing_at', { ascending: true });
  return { rows: data, error };
}

/** Le match appartient-il au tenant du staff ? (recoupement avant écriture) */
export async function matchExistsInTenant(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data, error } = await db
    .from('matches')
    .select('id')
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { exists: !!data, error };
}

export async function getCastMemberActive(
  db: AdminDb,
  tenantId: string,
  castMemberId: string
) {
  const { data, error } = await db
    .from('cast_members')
    .select('id, is_active')
    .eq('id', castMemberId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function insertMatchCastAssignment(
  db: AdminDb,
  row: {
    tenant_id: string;
    match_id: string;
    cast_member_id: string;
    briefing_at: string;
  }
) {
  const { data, error } = await db
    .from('cast_assignments')
    .insert(row)
    .select(MATCH_CAST_ASSIGNMENT_COLUMNS)
    .single();
  return { row: data, error };
}

export async function getAssignmentSnapshot(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  assignmentId: string
) {
  const { data } = await db
    .from('cast_assignments')
    .select('briefing_at, cast_member_id')
    .eq('id', assignmentId)
    .eq('match_id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

export async function rescheduleAssignment(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  assignmentId: string,
  briefingAt: string
) {
  // Reprogrammer remet le rappel à zéro : le bot DM de nouveau à la bonne heure.
  const { data, error } = await db
    .from('cast_assignments')
    .update({
      briefing_at: briefingAt,
      briefing_reminder_sent_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', assignmentId)
    .eq('match_id', matchId)
    .eq('tenant_id', tenantId)
    .select(CAST_ASSIGNMENT_ROW_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}

export async function deleteAssignment(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  assignmentId: string
) {
  const { error } = await db
    .from('cast_assignments')
    .delete()
    .eq('id', assignmentId)
    .eq('match_id', matchId)
    .eq('tenant_id', tenantId);
  return { error };
}
