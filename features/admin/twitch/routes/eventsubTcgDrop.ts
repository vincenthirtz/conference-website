// features/admin/twitch/routes/eventsubTcgDrop.ts — /api/admin/twitch/eventsub/tcg-drop
//   GET    : récompense désignée, abonnement webhook présent ou non.
//   POST   : désigne une récompense ET crée l'abonnement.
//   DELETE : supprime l'abonnement (la récompense désignée reste).
// Le secret EventSub part chez Twitch, jamais dans la réponse ni le journal.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TcgDropSubscribeDoc } from '../schemas';
import {
  getTcgDropState,
  subscribeTcgDrop,
  unsubscribeTcgDrop,
} from '../service/eventsub';
import { PER_MIN_30, TWITCH_GUARD } from './limits';

export default defineAdminRoute({
  key: 'admin-twitch-eventsub-tcg-drop',
  guard: TWITCH_GUARD,
  GET: read({
    rateLimit: PER_MIN_30,
    handler: ({ ctx }) => getTcgDropState(ctx),
  }),
  POST: mutate({
    body: TcgDropSubscribeDoc,
    rateLimit: PER_MIN_30,
    audit: 'subscribe_twitch_tcg_drop',
    handler: ({ ctx, req }) => audited(ctx, subscribeTcgDrop(ctx, req.body)),
  }),
  DELETE: mutate({
    rateLimit: PER_MIN_30,
    audit: 'unsubscribe_twitch_tcg_drop',
    handler: ({ ctx }) => audited(ctx, unsubscribeTcgDrop(ctx)),
  }),
});
