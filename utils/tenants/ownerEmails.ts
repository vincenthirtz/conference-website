// utils/tenants/ownerEmails.ts
//
// Les adresses des propriétaires d'un espace.
//
// Extrait du cron de renouvellement, qui en était le seul appelant : dès qu'un
// second usage est arrivé (les alertes de quota, T3), recopier la résolution
// aurait garanti deux définitions de « qui prévenir » — et l'une des deux aurait
// fini par oublier le filtre sur les comptes désactivés.
//
// Best-effort par construction : une résolution qui échoue rend [] plutôt que
// de jeter. Une alerte est utile, elle n'est pas critique.

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';

/**
 * Résout les emails des owner(s) d'un tenant : staff scopés au tenant
 * (tenant_staff) dont le rôle staff est `owner` et qui sont actifs, puis email
 * via l'API admin auth. Dédupliqué. Best-effort : une résolution qui échoue
 * renvoie [] plutôt que de jeter.
 */
export async function resolveOwnerEmails(tenantId: string): Promise<string[]> {
  const { data: tsRows, error: tsErr } = await supabaseAdmin
    .from('tenant_staff')
    .select('staff_id')
    .eq('tenant_id', tenantId);
  if (tsErr) {
    logger.error('[ownerEmails] tenant_staff load error', tsErr);
    return [];
  }
  const staffIds = ((tsRows ?? []) as Array<{ staff_id: string }>)
    .map((r) => r.staff_id)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  if (staffIds.length === 0) return [];

  const { data: staffRows, error: staffErr } = await supabaseAdmin
    .from('staff')
    .select('auth_user_id, role, is_active, deleted_at')
    .in('id', staffIds);
  if (staffErr) {
    logger.error('[ownerEmails] staff load error', staffErr);
    return [];
  }

  const owners = (
    (staffRows ?? []) as Array<{
      auth_user_id: string | null;
      role: string | null;
      is_active?: boolean | null;
      deleted_at?: string | null;
    }>
  ).filter(
    (r) =>
      r.role === 'owner' &&
      r.is_active !== false &&
      !r.deleted_at &&
      typeof r.auth_user_id === 'string' &&
      r.auth_user_id.length > 0
  );

  const emails = new Set<string>();
  for (const o of owners) {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(
        o.auth_user_id as string
      );
      if (error || !data?.user) continue;
      const email = data.user.email;
      if (typeof email === 'string' && email.length > 0) emails.add(email);
    } catch (err) {
      logger.error(
        '[ownerEmails] getUserById error for %s',
        o.auth_user_id,
        err
      );
    }
  }
  return Array.from(emails);
}
