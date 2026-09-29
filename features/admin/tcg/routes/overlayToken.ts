// features/admin/tcg/routes/overlayToken.ts — /api/admin/tcg/overlay-token
// Lien PORTEUR de la source OBS : GET l'actif, POST régénère (révoque le
// précédent), DELETE révoque. Jamais le jeton dans le journal.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { getOverlayToken, revokeToken, rotateToken } from '../service/economy';

const LIMIT = { max: 30, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'tcg-overlay-token',
  guard: { permission: 'manage_tcg' },
  GET: read({ rateLimit: LIMIT, handler: ({ ctx }) => getOverlayToken(ctx) }),
  POST: mutate({
    rateLimit: LIMIT,
    audit: 'tcg_overlay_token_rotate',
    handler: ({ ctx }) =>
      audited(ctx, rotateToken(ctx, ctx.staff.user?.id ?? null)),
  }),
  DELETE: mutate({
    rateLimit: LIMIT,
    audit: 'tcg_overlay_token_revoke',
    handler: ({ ctx }) => audited(ctx, revokeToken(ctx)),
  }),
});
