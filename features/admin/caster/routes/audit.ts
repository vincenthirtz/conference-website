// features/admin/caster/routes/audit.ts
// POST /api/admin/caster/audit — journal des actions notables du cockpit
// caster web (antenne, configuration), dans `staff_logs`.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { CasterAuditDoc } from '../schemas';
import { recordCasterAction } from '../service';

export default defineAdminRoute({
  key: 'caster-audit',
  // Même garde que la page.
  guard: 'caster',
  POST: mutate({
    body: CasterAuditDoc,
    // Généreux : un show actif produit quelques dizaines d'actions par heure,
    // mais une boucle côté client ne doit pas noyer staff_logs.
    rateLimit: { max: 120, windowMs: 60_000 },
    // Le service ÉCRIT l'entrée (action choisie dans l'allowlist) : pas de
    // second journal déclaré.
    audit: false,
    handler: ({ ctx, req }) =>
      recordCasterAction(ctx, ctx.staff.staff.id, req.body),
  }),
});
