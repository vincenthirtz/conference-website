// features/admin/staff-planning/routes/writer.ts — droits d'écriture du
// planning pour la requête en cours (cf. ../access.ts).
//
// Les routes d'écriture sont ouvertes à tout le staff (garde `helper`) pour
// « Mes dispos ». `manage_staff` garde la main sur tout le planning, avec la
// double authentification qu'imposait sa garde d'avant : sans `aal2` (quand
// elle est exigée), le gestionnaire retombe sur ses seuls créneaux, et un
// refus sur ceux des autres porte `reason: 'mfa_required'`.

import type { NextApiRequest, NextApiResponse } from 'next';
import { assertStaffMfa } from '@/utils/staff';
import { StaffMfaRequiredError } from '@/utils/staffMfa';
import { hasStaffPermission } from '@/utils/staffPermissions';
import type { AuthenticatedStaffContext } from '@/types/staff';
import { type PlanningWriter, selfNameOf } from '../access';

export async function resolvePlanningWriter(
  req: NextApiRequest,
  res: NextApiResponse,
  st: AuthenticatedStaffContext
): Promise<PlanningWriter> {
  const selfName = selfNameOf(st.staff.display_name);
  if (
    !hasStaffPermission(st.role, st.staff.extra_permissions, 'manage_staff')
  ) {
    return { manageAll: false, selfName };
  }
  try {
    await assertStaffMfa(req, res, { permission: 'manage_staff' });
    return { manageAll: true, selfName };
  } catch (err) {
    if (err instanceof StaffMfaRequiredError) {
      return { manageAll: false, selfName, mfaMissing: true };
    }
    throw err;
  }
}
