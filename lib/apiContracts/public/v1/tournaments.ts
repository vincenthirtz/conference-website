// Réponses de /api/public/v1/tournaments*. Miroir de utils/public/readTournaments.ts
// et readStandings.ts — l'égalité des types est vérifiée par
// tests/unit/publicV1ResponseContracts.test.ts.

import { z } from 'zod';
import { nullableString } from './common';

export const publicV1TournamentSummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: nullableString,
    game: nullableString,
    status: z.string(),
    start_date: nullableString,
    end_date: nullableString,
    format: nullableString,
  })
  .meta({ id: 'PublicV1TournamentSummary' });

export const publicV1StageSummarySchema = z
  .object({
    id: z.uuid(),
    name: nullableString,
    stage_type: nullableString,
    status: z
      .string()
      .meta({ description: 'Dérivé de `is_active` (active | inactive).' }),
  })
  .meta({ id: 'PublicV1StageSummary' });

export const publicV1TournamentDetailSchema = publicV1TournamentSummarySchema
  .extend({ stages: z.array(publicV1StageSummarySchema) })
  .meta({ id: 'PublicV1TournamentDetail' });

export const publicV1StandingSchema = z
  .object({
    rank: z.number().int(),
    teamId: z.uuid(),
    teamName: nullableString,
    teamSlug: nullableString,
    logoUrl: nullableString,
    prize: nullableString,
  })
  .meta({ id: 'PublicV1Standing' });
