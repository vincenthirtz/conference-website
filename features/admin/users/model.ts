// features/admin/users/model.ts — formes de réponse des écrans comptes, lues
// par le client du site. Types seuls (le service les porte en signature) :
// le site les reçoit sans tirer service ni repository. La fiche d'un compte
// vit dans profileModel.ts.

import type { StaffPermission } from '@/utils/staffPermissions';

/** `GET /api/admin/users/[userId]/permissions` : rôle, permissions du rôle, extras, effectif, et ce que l'appelant peut accorder. */
export type StaffPermissionsPayload = {
  staffId: string;
  userId: string;
  displayName: string | null;
  email: string;
  role: string;
  rolePermissions: StaffPermission[];
  extraPermissions: string[];
  effective: StaffPermission[];
  grantable: StaffPermission[];
};
