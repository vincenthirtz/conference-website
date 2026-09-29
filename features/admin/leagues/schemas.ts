// features/admin/leagues/schemas.ts — formes d'entrée des routes admin des
// ligues (saisons multi-tournois). Source unique client + serveur (lot L6).
//
// Les corps ne passent PAS par la validation de `defineAdminRoute` : leur
// erreur historique (`{ error: 'Invalid body', code: 'INVALID_BODY',
// details }`) est lue telle quelle ; le service les applique et la reproduit.

import { z } from 'zod';
// Imports relatifs : ces schémas sont lus par l'assemblage OpenAPI (Node seul).
import { uuidPathParam as uuidParam } from '../../../utils/admin/pathParams';

/** `/api/admin/leagues/[id]` */
export const LeagueIdQuery = z.object({
  id: uuidParam('Missing or invalid id'),
});

/** `/api/admin/leagues/[id]/{recompute,standings,tournaments}` */
export const LeagueSubRouteQuery = z.object({
  id: uuidParam('Missing or invalid league id'),
});

/** `/api/admin/leagues/[id]/tournaments/[tournamentId]` */
export const LeagueTournamentQuery = z.object({
  id: uuidParam('Missing or invalid league id'),
  tournamentId: uuidParam('Missing or invalid tournament id'),
});

const pointsTableSchema = z.record(z.string(), z.number());

export const LeagueCreateBody = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with dashes'),
  description: z.string().trim().max(2000).optional().nullable(),
  game: z.string().trim().max(100).optional().nullable(),
  start_date: z.string().trim().optional().nullable(),
  end_date: z.string().trim().optional().nullable(),
  points_table: pointsTableSchema.optional(),
  is_public: z.boolean().optional(),
});
export type LeagueCreateBody = z.output<typeof LeagueCreateBody>;

export const LeaguePatchBody = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9-]+$/),
    description: z.string().trim().max(2000).nullable(),
    game: z.string().trim().max(100).nullable(),
    status: z.enum(['draft', 'active', 'finished', 'archived']),
    start_date: z.string().trim().nullable(),
    end_date: z.string().trim().nullable(),
    points_table: pointsTableSchema,
    is_public: z.boolean(),
  })
  .partial();
export type LeaguePatchBody = z.output<typeof LeaguePatchBody>;

export const LeagueLinkTournamentBody = z.object({
  tournament_id: z.string().uuid(),
  weight: z.number().positive().optional(),
});
export type LeagueLinkTournamentBody = z.output<
  typeof LeagueLinkTournamentBody
>;

/** Toutes les colonnes de `leagues` : ce que renvoyait le `select('*')`. */
export const LEAGUE_COLUMNS =
  'id, tenant_id, name, slug, description, game, status, start_date, end_date, points_table, is_public, created_at, updated_at' as const;

/** Toutes les colonnes de `league_tournaments` (ex-`select('*')`). */
export const LEAGUE_TOURNAMENT_COLUMNS =
  'league_id, tournament_id, tenant_id, weight, created_at' as const;
