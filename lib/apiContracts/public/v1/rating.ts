// Réponses de /api/public/v1/leaderboard et players/{userId} (aussi
// /api/players/*). Miroir de types/rating.ts (égalité des types vérifiée par test).

import { z } from 'zod';
import { nullableString } from './common';

const result = z.enum(['win', 'loss', 'draw']);

const teamIdentity = {
  teamName: nullableString.meta({
    description:
      "Nom de l'équipe la plus récente de la joueuse. Sert de contexte d'affichage, pas de filtre.",
  }),
  teamSlug: nullableString,
  teamLogoUrl: nullableString.meta({
    description:
      "Logo de l'équipe, utilisé comme repli d'avatar quand `avatarUrl` est nul.",
  }),
};

export const leaderboardPlayerSchema = z
  .object({
    ...teamIdentity,
    userId: z.string(),
    displayName: nullableString,
    battleTag: nullableString,
    avatarUrl: nullableString,
    rating: z.number(),
    rd: z.number(),
    gamesPlayed: z.number().int(),
    wins: z.number().int(),
    losses: z.number().int(),
    rank: z.number().int(),
  })
  .meta({ id: 'LeaderboardPlayer' });

export const playerProfileCoreSchema = z
  .object({
    userId: z.string(),
    displayName: nullableString,
    battleTag: nullableString,
    avatarUrl: nullableString,
    twitch: nullableString.meta({
      description:
        'Chaîne Twitch déclarée (handle nu ou URL), ou à défaut celle de sa fiche de roster ; null si non déclarée.',
    }),
    unrated: z.boolean().meta({
      description:
        "true quand la joueuse n'a encore joué aucun match classé : les chiffres de rating valent alors 0 et ne doivent PAS être affichés.",
    }),
    rating: z.number(),
    rd: z.number(),
    volatility: z.number(),
    peakRating: z.number(),
    gamesPlayed: z.number().int(),
    wins: z.number().int(),
    losses: z.number().int(),
    rank: z
      .number()
      .int()
      .nullable()
      .meta({ description: 'null pour une joueuse non classée.' }),
  })
  .meta({ id: 'PlayerProfileCore' });

export const playerProfileHistoryPointSchema = z
  .object({
    matchId: z.string(),
    tournamentId: nullableString,
    occurredAt: z.string(),
    ratingBefore: z.number(),
    ratingAfter: z.number(),
    result,
    opponentAvgRating: z.number().nullable(),
  })
  .meta({ id: 'PlayerProfileHistoryPoint' });

export const playerProfileRecentMatchSchema = z
  .object({
    matchId: z.string(),
    tournamentId: nullableString,
    occurredAt: z.string(),
    result,
    opponentTeamId: nullableString,
    opponentTeamName: nullableString,
  })
  .meta({ id: 'PlayerProfileRecentMatch' });

export const playerProfileH2HSchema = z
  .object({
    opponentUserId: z.string(),
    opponentDisplayName: nullableString,
    opponentBattleTag: nullableString,
    wins: z.number().int(),
    losses: z.number().int(),
    games: z.number().int(),
  })
  .meta({ id: 'PlayerProfileH2H' });

export const profileBadgeSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    description: z.string(),
    tier: z.enum(['bronze', 'silver', 'gold', 'platinum']).nullable(),
  })
  .meta({ id: 'ProfileBadge' });

export const profilePlacementSchema = z
  .object({
    tournamentId: z.string(),
    tournamentName: nullableString,
    tournamentSlug: nullableString,
    teamId: z.string(),
    teamName: nullableString,
    rank: z.number().int(),
    date: nullableString,
  })
  .meta({ id: 'ProfilePlacement' });

export const profileSeasonSchema = z
  .object({
    leagueId: z.string(),
    leagueName: nullableString,
    leagueSlug: nullableString,
    teamId: z.string(),
    teamName: nullableString,
    rank: z.number().int().nullable(),
    points: z.number(),
  })
  .meta({ id: 'ProfileSeason' });

export const profileAchievementsSchema = z
  .object({
    badges: z.array(profileBadgeSchema),
    palmares: z.array(profilePlacementSchema),
    seasons: z.array(profileSeasonSchema),
  })
  .meta({
    id: 'ProfileAchievements',
    description:
      'Badges, palmarès (placements en tournoi) et historique de saison dérivés du parcours de la joueuse (utils/profile/achievements.ts). Toujours présent, vide si rien à agréger.',
  });

export const playerProfileResponseSchema = z
  .object({
    player: playerProfileCoreSchema,
    history: z.array(playerProfileHistoryPointSchema),
    recentMatches: z.array(playerProfileRecentMatchSchema),
    h2h: z.array(playerProfileH2HSchema),
    achievements: profileAchievementsSchema,
  })
  .meta({ id: 'PlayerProfileResponse' });
