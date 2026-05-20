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
 * `tenantId` : tenant courant sous lequel le staff opere. En S5b, on default
 * systematiquement a DEFAULT_TENANT_ID (toujours mono-tenant en prod). S7
 * ajoutera un selecteur dans /admin/tenants qui pourra surcharger ce champ
 * via cookie / session.
 */
export type AuthenticatedStaffContext = {
  user: User;
  staff: StaffMember;
  role: StaffRole;
  tenantId: string;
};
