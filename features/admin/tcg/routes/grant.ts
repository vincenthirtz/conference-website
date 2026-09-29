// features/admin/tcg/routes/grant.ts — POST /api/admin/tcg/grant
// Correction du solde de pièces d'une joueuse (`admin_grant`). Idempotence
// portée par la base (`idempotencyKey` → `source_ref`) ; un rejeu n'est
// pas journalisé deux fois.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TcgGrantDoc } from '../schemas';
import { grantCoins } from '../service/economy';

export default defineAdminRoute({
  key: 'tcg-grant',
  guard: { permission: 'manage_tcg' },
  POST: mutate({
    body: TcgGrantDoc,
    rateLimit: { max: 30, windowMs: 60_000 },
    audit: 'tcg_admin_grant',
    handler: ({ body, ctx }) => audited(ctx, grantCoins(ctx, body)),
  }),
});
