// features/player/invitations/repository/tenantInvitations.ts — invitations
// d'ESPACE (staff) retrouvées par empreinte de jeton, et rattachement du
// compte accepté (lot P11). La base ne contient jamais le jeton en clair.

import type { AdminDb } from '@/utils/admin/serviceContext';

export type TenantInvitationRow = {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

export async function readTenantInvitationByHash(
  db: AdminDb,
  tokenHash: string
) {
  const { data, error } = await db
    .from('tenant_invitations')
    .select('id, tenant_id, email, role, expires_at, accepted_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  return { invitation: data as TenantInvitationRow | null, error };
}

export async function readTenantName(
  db: AdminDb,
  tenantId: string
): Promise<string> {
  const { data } = await db
    .from('tenants')
    .select('name, slug')
    .eq('id', tenantId)
    .maybeSingle();
  return (data as { name?: string } | null)?.name ?? '';
}

export async function readStaffIdByUser(db: AdminDb, userId: string) {
  const { data } = await db
    .from('staff')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * Compte staff au rôle GLOBAL le plus bas : l'invitation donne un accès à UN
 * espace, pas un rôle sur la plateforme (l'élévation vient de `tenant_staff`).
 */
export async function insertStaffForInvitation(
  db: AdminDb,
  userId: string,
  email: string
) {
  const { data, error } = await db
    .from('staff')
    .insert({
      auth_user_id: userId,
      email,
      role: 'caster',
      is_active: true,
    } as never)
    .select('id')
    .single();
  return { staffId: (data as { id?: string } | null)?.id ?? null, error };
}

export async function upsertTenantStaff(
  db: AdminDb,
  tenantId: string,
  staffId: string,
  role: string
) {
  const { error } = await db
    .from('tenant_staff')
    .upsert({ tenant_id: tenantId, staff_id: staffId, role } as never, {
      onConflict: 'tenant_id,staff_id',
    });
  return { error };
}

/** Marque acceptée — conditionné à `accepted_at IS NULL` (pas de réécriture). */
export async function markTenantInvitationAccepted(
  db: AdminDb,
  invitationId: string,
  staffId: string
) {
  const { error } = await db
    .from('tenant_invitations')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_staff_id: staffId,
    } as never)
    .eq('id', invitationId)
    .is('accepted_at', null);
  return { error };
}
