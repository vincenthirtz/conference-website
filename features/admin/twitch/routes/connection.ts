// features/admin/twitch/routes/connection.ts — /api/admin/twitch/connection
//   GET    (caster+) : statut de la connexion broadcaster — JAMAIS les jetons.
//   DELETE (admin+)  : déconnecte la chaîne (supprime la ligne).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import {
  disconnectBroadcaster,
  getConnectionStatus,
} from '../service/connection';
import { PER_MIN_20, PER_MIN_60 } from './limits';

export default defineAdminRoute({
  key: 'admin-twitch-connection',
  // Ouverte au caster : le cockpit régie affiche le statut.
  guard: 'caster',
  GET: read({
    rateLimit: PER_MIN_60,
    handler: ({ ctx }) => getConnectionStatus(ctx),
  }),
  DELETE: mutate({
    guard: 'admin',
    rateLimit: PER_MIN_20,
    audit: 'disconnect_twitch_broadcaster',
    handler: ({ ctx }) => audited(ctx, disconnectBroadcaster(ctx)),
  }),
});
