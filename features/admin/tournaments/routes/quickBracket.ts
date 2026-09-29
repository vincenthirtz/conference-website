// features/admin/tournaments/routes/quickBracket.ts
// POST /api/admin/quick-bracket — tournoi jouable complet en un appel
// (nom + format + participants collés) → { tournamentId, slug } (201).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { QuickBracketDoc } from '../schemas';
import { createQuickBracket } from '../service/quickBracket';

export default defineAdminRoute({
  key: 'quick-bracket',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    body: QuickBracketDoc,
    // La création d'un tournoi complet est coûteuse.
    rateLimit: { max: 20, windowMs: 60_000 },
    status: 201,
    audit: 'create_tournament',
    // Corps BRUT : le 400 garde son message historique (« Champ invalide … »).
    handler: ({ ctx, req }) => audited(ctx, createQuickBracket(ctx, req.body)),
  }),
});
