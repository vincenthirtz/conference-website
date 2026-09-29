// features/admin/tenants/repository/staffFlags.ts — drapeau `staff.is_pole_admin`.

import type { AdminDb } from '@/utils/admin/serviceContext';

export async function findStaffForPoleAdmin(db: AdminDb, staffId: string) {
  const { data, error } = await db
    .from('staff')
    .select('id, auth_user_id, role, is_pole_admin, is_active, deleted_at')
    .eq('id', staffId)
    .maybeSingle();
  return { row: data, error };
}

export async function listPoleAdminOwners(db: AdminDb) {
  const { data, error } = await db
    .from('staff')
    .select('id, role, is_pole_admin, is_active, deleted_at')
    .eq('role', 'owner')
    .eq('is_pole_admin', true);
  return { rows: data ?? [], error };
}

export async function setPoleAdmin(
  db: AdminDb,
  staffId: string,
  value: boolean
) {
  const { error } = await db
    .from('staff')
    .update({ is_pole_admin: value })
    .eq('id', staffId);
  return { error };
}
