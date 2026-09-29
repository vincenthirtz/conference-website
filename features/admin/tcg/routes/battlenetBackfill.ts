// features/admin/tcg/routes/battlenetBackfill.ts —
// /api/admin/tcg/battlenet-backfill : GET simule, POST distribue la
// récompense « compte Battle.net vérifié » aux comptes de l'ESPACE.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { runBackfill, simulateBackfill } from '../service/economy';

const LIMIT = { max: 20, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'tcg-battlenet-backfill',
  guard: { permission: 'manage_tcg' },
  GET: read({ rateLimit: LIMIT, handler: ({ ctx }) => simulateBackfill(ctx) }),
  POST: mutate({
    rateLimit: LIMIT,
    audit: 'tcg_battlenet_backfill',
    handler: ({ ctx }) => audited(ctx, runBackfill(ctx)),
  }),
});
