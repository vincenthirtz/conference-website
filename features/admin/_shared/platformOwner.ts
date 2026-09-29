// features/admin/_shared/platformOwner.ts — privilège de PLATEFORME.
//
// Pôle-admin, ou owner GLOBAL (`staff.role`). Un owner EFFECTIF — élevé par
// `tenant_staff` sur son espace, compte développeur compris — ne l'est pas :
// son rôle dit ce qu'il peut faire CHEZ LUI, pas sur les données partagées
// (tables globales, modèles du tenant par défaut, clés gratuites…).

import type { AuthenticatedStaffContext } from '@/types/staff';

export function isPlatformOwnerStaff(
  staff: AuthenticatedStaffContext
): boolean {
  return (
    (staff.staff as { is_pole_admin?: boolean }).is_pole_admin === true ||
    staff.globalRole === 'owner'
  );
}
