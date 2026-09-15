// Réponses de /api/public/v1/leagues* (aussi /api/leagues*). Miroir de
// types/leagues.ts (égalité des types vérifiée par test).

import { z } from 'zod';
import { nullableInt, nullableString } from './common';

export const leagueSchema = z
  .object({
    id: z.uuid(),
    tenant_id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    description: nullableString,
    game: nullableString,
    status: z.enum(['draft', 'active', 'finished', 'archived']),
    start_date: nullableString,
    end_date: nullableString,
    points_table: z.record(z.string(), z.number()),
    is_public: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: 'League' });

/** League publique : sans `tenant_id` (cf. `PublicLeague`). */
export const publicLeagueSchema = leagueSchema
  .omit({ tenant_id: true })
  .meta({ id: 'PublicLeague' });

export const leagueStandingPublicSchema = z
  .object({
    teamId: z.string(),
    teamName: nullableString,
    teamSlug: nullableString,
    logoUrl: nullableString,
    points: z.number(),
    tournamentsCounted: z.number().int(),
    scrimsCounted: z.number().int().meta({
      description:
        "Scrims de la saison joués par l'équipe. Un scrim n'a pas de rang final : il compte à part, et n'entre ni dans `tournamentsCounted` ni dans `bestRank`.",
    }),
    bestRank: nullableInt,
    rank: z.number().int(),
  })
  .meta({ id: 'LeagueStandingPublic' });

export const leagueTournamentRefSchema = z
  .object({
    id: z.string(),
    name: nullableString,
    slug: nullableString,
    weight: z.number(),
  })
  .meta({ id: 'LeagueTournamentRef' });

export const leagueScrimRefSchema = z
  .object({
    id: z.string(),
    name: nullableString,
    slug: nullableString,
    weight: z.number(),
    team1Name: nullableString,
    team2Name: nullableString,
    team1Score: nullableInt,
    team2Score: nullableInt,
    scheduledDate: nullableString,
  })
  .meta({ id: 'LeagueScrimRef' });

export const leagueDetailResponseSchema = z
  .object({
    league: publicLeagueSchema,
    standings: z.array(leagueStandingPublicSchema),
    tournaments: z.array(leagueTournamentRefSchema),
    scrims: z.array(leagueScrimRefSchema),
  })
  .meta({ id: 'LeagueDetailResponse' });
