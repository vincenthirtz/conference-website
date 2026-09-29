// features/admin/tcg/routes/players.ts — GET /api/admin/tcg/players?q=
// Recherche d'une joueuse RATTACHÉE à l'espace (RPC cantonnée, sans email).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { TcgPlayersQuery } from '../schemas';
import { searchPlayers } from '../service/economy';

export default defineAdminRoute({
  key: 'tcg-players',
  guard: { permission: 'manage_tcg' },
  GET: read({
    query: TcgPlayersQuery,
    // Une frappe = une requête (débounce 250 ms côté client).
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ query, ctx }) => searchPlayers(ctx, query.q),
  }),
});
