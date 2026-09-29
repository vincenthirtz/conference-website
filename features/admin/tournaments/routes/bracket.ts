// features/admin/tournaments/routes/bracket.ts — POST …/[id]/bracket
// action = generate | generate_double_elim (201) | save (200 / 207 partiel)
// | validate (lecture). Génération : moteur partagé utils/bracket.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { BracketBody, TournamentIdLowerQuery } from '../schemas';
import { runBracketAction } from '../service/matches';
import { respond } from './respond';

export default defineAdminRoute({
  key: 'admin-tournament-bracket',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: TournamentIdLowerQuery,
    body: BracketBody,
    // Slug de la méthode ; la sauvegarde se journalise `update_bracket`,
    // la validation ne se journalise pas.
    audit: 'create_match',
    handler: async ({ query, body, ctx, res }) => {
      const { response, audit } = await runBracketAction(ctx, query.id, body);
      ctx.audit(audit);
      return respond(res, response);
    },
  }),
});
