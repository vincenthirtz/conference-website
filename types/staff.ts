import type { User } from '@supabase/supabase-js';
import type { StaffRole } from './admin';

export type StaffMember = {
  id: string;
  auth_user_id: string;
  email: string;
  role: StaffRole;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type StaffContext = {
  user: User | null;
  staff: StaffMember | null;
  role: StaffRole | null;
};

/**
 * Variante "garantie authentifiee" du StaffContext : tous les champs sont
 * non-null. C'est le type passe aux handlers proteges par `withStaffRoute`,
 * puisque ce wrapper rejette deja les requetes sans staff valide.
 *
 * `tenantId` : tenant courant sous lequel le staff opere. Resolu par
 * `requireStaffRoleFromRequest` selon l'ordre suivant (cf. S7) :
 *   1. cookie `staff_active_tenant_id` (UUID brut) si le staff a une row
 *      dans `tenant_staff` pour ce tenant → `currentTenantSource = 'cookie'`.
 *   2. sinon, premier tenant par slug ASC dans `tenant_staff` du staff →
 *      `currentTenantSource = 'fallback_first'`.
 *   3. sinon (staff sans aucune entree tenant_staff, cas degrade) →
 *      DEFAULT_TENANT_ID, `currentTenantSource = 'fallback_default'`.
 */
export type TenantSource = 'cookie' | 'fallback_first' | 'fallback_default';

export type AuthenticatedStaffContext = {
  user: User;
  staff: StaffMember;
  role: StaffRole;
  tenantId: string;
  currentTenantSource: TenantSource;
};
