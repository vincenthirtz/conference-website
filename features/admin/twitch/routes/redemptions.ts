// features/admin/twitch/routes/redemptions.ts — /api/admin/twitch/channel-points/redemptions
//   GET   : demandes d'une récompense (UNFULFILLED par défaut).
//   PATCH : FULFILLED / CANCELED en lot.
//
// La query du GET est validée par le service avec son schéma historique
// (lib/apiContracts/admin/twitch/channel-points/redemptions.query, déjà cité
// par le fragment) : son échec garde `{ error: 'Invalid query.', code:
// 'INVALID_PAYLOAD', details }`.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { PatchRedemptionsDoc } from '../schemas';
import { listRedemptions, updateRedemptions } from '../service/channelPoints';
import { PER_MIN_30, PER_MIN_60, TWITCH_GUARD } from './limits';

export default defineAdminRoute({
  key: 'admin-twitch-redemptions',
  guard: TWITCH_GUARD,
  GET: read({
    rateLimit: PER_MIN_60,
    handler: ({ ctx, req }) => listRedemptions(ctx, req.query),
  }),
  PATCH: mutate({
    body: PatchRedemptionsDoc,
    rateLimit: PER_MIN_30,
    audit: 'update_twitch_redemptions',
    handler: ({ ctx, req }) => audited(ctx, updateRedemptions(ctx, req.body)),
  }),
});
