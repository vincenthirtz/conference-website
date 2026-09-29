// features/admin/tenants/routes/planCheckout.ts — POST /api/admin/tenants/[id]/plan-checkout
// Lien de paiement HelloAsso ciblé (espace + plan), après double consentement
// CGV. Owner global : tout espace ; sinon, uniquement le sien (T10).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { IdQuery, PlanCheckoutDoc } from '../schemas';
import { staffScope } from '../service/scope';
import { createPlanCheckout } from '../service/settings';

export default defineAdminRoute({
  key: 'admin-tenants-plan-checkout',
  guard: { permission: 'manage_tenant' },
  POST: mutate({
    query: IdQuery,
    body: PlanCheckoutDoc,
    rateLimit: { max: 10, windowMs: 60_000 },
    // Comme avant la migration : chaque appel est une commande distincte.
    idempotent: false,
    audit: 'generate_plan_checkout',
    handler: ({ ctx, req }) => {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      return audited(
        ctx,
        createPlanCheckout(
          ctx,
          staffScope(ctx.staff),
          req.query.id,
          req.body,
          `${proto}://${req.headers.host}`
        )
      );
    },
  }),
});
