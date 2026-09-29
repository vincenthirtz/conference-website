// features/admin/twitch/routes/tcgDropSetup.ts — POST /api/admin/twitch/tcg-drop/setup
// Met le drop TCG en service : reprend NOTRE récompense si elle existe, sinon
// la crée. L'abonnement reste `eventsub/tcg-drop`.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TcgDropSetupDoc } from '../schemas';
import { setupTcgDrop } from '../service/tcgDropSetup';
import { PER_MIN_5, TWITCH_GUARD } from './limits';

export {
  TCG_DROP_REWARD_TITLE,
  featuredRewardTitle,
} from '../service/tcgDropSetup';

export default defineAdminRoute({
  key: 'admin-twitch-tcg-drop-setup',
  guard: TWITCH_GUARD,
  POST: mutate({
    body: TcgDropSetupDoc,
    rateLimit: PER_MIN_5,
    audit: 'settings_update',
    handler: ({ ctx, req }) => audited(ctx, setupTcgDrop(ctx, req.body)),
  }),
});
