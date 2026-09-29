// features/admin/tournaments/routes/templates.ts — /api/admin/tournament-templates
//   GET    : modèles personnalisés
//   POST   : crée un modèle (201)
//   DELETE : supprime un modèle (`templateId` dans le corps)

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import {
  TournamentTemplateCreateDoc,
  TournamentTemplateDeleteDoc,
} from '../schemas';
import {
  createTournamentTemplate,
  deleteTournamentTemplate,
  listTournamentTemplates,
} from '../service/templates';

export default defineAdminRoute({
  key: 'tournament-templates',
  guard: { permission: 'manage_tournaments' },
  GET: read({ handler: ({ ctx }) => listTournamentTemplates(ctx) }),
  POST: mutate({
    body: TournamentTemplateCreateDoc,
    status: 201,
    audit: 'update_tournament_template',
    handler: ({ body, ctx }) =>
      audited(ctx, createTournamentTemplate(ctx, body)),
  }),
  DELETE: mutate({
    body: TournamentTemplateDeleteDoc,
    audit: 'update_tournament_template',
    handler: ({ body, ctx }) =>
      audited(ctx, deleteTournamentTemplate(ctx, body)),
  }),
});
