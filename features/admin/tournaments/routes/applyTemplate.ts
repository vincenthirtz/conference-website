// features/admin/tournaments/routes/applyTemplate.ts — POST
// …/[id]/apply-template { templateId, append? } : crée les phases d'un gabarit
// (intégré ou personnalisé du tenant).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { ApplyTemplateBody, TournamentIdQuery } from '../schemas';
import { applyTemplate } from '../service/structure';

export default defineAdminRoute({
  key: 'tournament-apply-template',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: TournamentIdQuery,
    body: ApplyTemplateBody,
    status: 201,
    audit: 'apply_template',
    handler: ({ query, body, ctx }) =>
      audited(ctx, applyTemplate(ctx, query.id, body)),
  }),
});
