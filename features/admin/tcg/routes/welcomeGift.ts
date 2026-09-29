// features/admin/tcg/routes/welcomeGift.ts — /api/admin/tcg/welcome-gift
// GET simule, POST distribue le cadeau d'accueil de l'édition en cours.
// L'idempotence (`Idempotency-Key`) n'est PAS décorative : rien ne protège
// des doublons de PAQUETS en base.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { welcomeGift } from '../service/economy';

const LIMIT = { max: 20, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'tcg-welcome-gift',
  guard: { permission: 'manage_tcg' },
  GET: read({
    rateLimit: LIMIT,
    handler: async ({ ctx }) => (await welcomeGift(ctx, true)).result,
  }),
  POST: mutate({
    rateLimit: LIMIT,
    audit: 'tcg_welcome_gift_grant',
    handler: ({ ctx }) => audited(ctx, welcomeGift(ctx, false)),
  }),
});
