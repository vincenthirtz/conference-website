// Réponses de /api/public/v1/matches* et tournaments/{id}/matches. Miroir de
// utils/public/readMatches.ts (égalité des types vérifiée par test).

import { z } from 'zod';
import { nullableInt, nullableString } from './common';

const logoUrl = nullableString.meta({
  description: 'Logo public de l’équipe (peut être null).',
});

export const publicV1MatchSchema = z
  .object({
    id: z.uuid(),
    stage_id: nullableString,
    round_number: nullableInt,
    bracket_side: nullableString,
    team1_id: nullableString,
    team1_name: nullableString,
    team1_logo_url: logoUrl,
    team2_id: nullableString,
    team2_name: nullableString,
    team2_logo_url: logoUrl,
    team1_score: nullableInt,
    team2_score: nullableInt,
    winner_team_id: nullableString,
    status: z.string(),
    scheduled_at: nullableString,
  })
  .meta({ id: 'PublicV1Match' });

export const publicV1MatchGameSchema = z
  .object({
    map_name: nullableString,
    map_order: nullableInt,
    team1_score: nullableInt,
    team2_score: nullableInt,
    winner_team_id: nullableString,
  })
  .meta({ id: 'PublicV1MatchGame' });

export const publicV1MatchDetailSchema = publicV1MatchSchema
  .extend({ games: z.array(publicV1MatchGameSchema) })
  .meta({ id: 'PublicV1MatchDetail' });
