// utils/graphql/schema.ts
//
// Schéma GraphQL de l'API publique (feature "API publique élargie" — Lot 4).
//
// PRINCIPE : les resolvers ne portent AUCUNE logique métier neuve. Ils
// réutilisent :
//   - les lecteurs `utils/public/read*` (mêmes projections publiques que le
//     REST `/api/public/v1/*` — jointures faites une seule fois, pas de N+1) ;
//   - `applyMatchScore()` pour la mutation (même cœur que l'admin / le bot).
//
// AUTH : les QUERIES sont ouvertes en lecture anonyme (même posture que le REST
// public read). Les MUTATIONS exigent un token scopé (`matches:write`) — porté
// par le `context` (cf. utils/graphql/context.ts).
//
// Les champs SDL sont volontairement en snake_case pour matcher 1:1 les objets
// renvoyés par les read utils → resolvers par défaut, zéro mapping.

import { createSchema } from 'graphql-yoga';
import { GraphQLError } from 'graphql';
import {
  readPublicTournaments,
  readPublicTournamentDetail,
} from '@/utils/public/readTournaments';
import {
  readPublicTournamentMatches,
  readPublicMatchDetail,
} from '@/utils/public/readMatches';
import { readPublicTeam } from '@/utils/public/readTeam';
import { applyMatchScore } from '@/utils/matches/applyScore';
import { supabaseAdmin } from '@/utils/supabase';
import { hasScope } from '@/utils/apiScopes';
import { consumeApiQuota } from '@/utils/billing/apiQuota';
import { checkApiTokenAccess } from '@/utils/billing/apiPlanGate';
import { logger } from '@/utils/logger';
import type { GraphQLContext } from './context';

const typeDefs = /* GraphQL */ `
  type TeamMember {
    display_name: String
    role: String
    is_substitute: Boolean!
  }

  type Team {
    id: ID!
    name: String!
    short_name: String
    slug: String
    logo_url: String
    roster: [TeamMember!]!
  }

  type MatchGame {
    map_name: String
    map_order: Int
    team1_score: Int
    team2_score: Int
    winner_team_id: ID
  }

  type Match {
    id: ID!
    stage_id: ID
    round_number: Int
    bracket_side: String
    team1_id: ID
    team1_name: String
    team1_logo_url: String
    team2_id: ID
    team2_name: String
    team2_logo_url: String
    team1_score: Int
    team2_score: Int
    winner_team_id: ID
    status: String!
    scheduled_at: String
  }

  type MatchDetail {
    id: ID!
    stage_id: ID
    round_number: Int
    bracket_side: String
    team1_id: ID
    team1_name: String
    team1_logo_url: String
    team2_id: ID
    team2_name: String
    team2_logo_url: String
    team1_score: Int
    team2_score: Int
    winner_team_id: ID
    status: String!
    scheduled_at: String
    games: [MatchGame!]!
  }

  type StageSummary {
    id: ID!
    name: String
    stage_type: String
    status: String!
  }

  type TournamentSummary {
    id: ID!
    name: String!
    slug: String
    game: String
    status: String!
    start_date: String
    end_date: String
    format: String
  }

  type TournamentDetail {
    id: ID!
    name: String!
    slug: String
    game: String
    status: String!
    start_date: String
    end_date: String
    format: String
    stages: [StageSummary!]!
    matches: [Match!]!
  }

  type TournamentList {
    items: [TournamentSummary!]!
    count: Int!
  }

  type MatchResultPayload {
    matchId: ID!
    status: String!
    team1Score: Int!
    team2Score: Int!
    winnerTeamId: ID
  }

  type Query {
    "Liste paginée des tournois publics du tenant."
    tournaments(
      status: String
      game: String
      limit: Int = 50
      offset: Int = 0
    ): TournamentList!
    "Détail d'un tournoi (accepte id OU slug). null si inconnu/non-public."
    tournament(idOrSlug: String!): TournamentDetail
    "Détail d'un match public + games. null si inconnu/non-visible."
    match(id: ID!): MatchDetail
    "Équipe publique (accepte id OU slug)."
    team(idOrSlug: String!): Team
  }

  type Mutation {
    "Pose le score final d'un match. Requiert un token avec le scope matches:write."
    reportMatchResult(
      matchId: ID!
      team1Score: Int!
      team2Score: Int!
    ): MatchResultPayload!
  }
`;

const TERMINAL_STATUSES = new Set(['finished', 'walkover', 'cancelled']);

/** Exige un scope sur le token du contexte, sinon lève une GraphQLError. */
function requireScope(
  ctx: GraphQLContext,
  scope: Parameters<typeof hasScope>[1]
) {
  if (!ctx.token) {
    throw new GraphQLError('Authentication required.', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  // Plan gate : l'écriture via clé API est un produit payant. Le suffixe du
  // scope (`resource:write`) dérive l'action → capacité apiWrite (apiRead pour
  // `:read`). Une clé `comp` (partenaire) bypasse le gate. `foundation` passe ;
  // `discovery` / plan payant expiré (sans comp) → 403.
  const action = scope.endsWith(':write') ? 'write' : 'read';
  const planDenial = checkApiTokenAccess(ctx.token, action, Date.now());
  if (planDenial) {
    throw new GraphQLError(planDenial.message, {
      extensions: {
        code: 'FORBIDDEN',
        reason: planDenial.error,
        requiredCapability: planDenial.requiredCapability,
      },
    });
  }
  if (!hasScope(ctx.token.scopes, scope)) {
    throw new GraphQLError(`Token lacks required scope '${scope}'.`, {
      extensions: { code: 'FORBIDDEN' },
    });
  }
}

function clampLimit(v: number): number {
  if (!Number.isFinite(v)) return 50;
  return Math.min(100, Math.max(1, Math.floor(v)));
}

const resolvers = {
  Query: {
    tournaments: async (
      _root: unknown,
      args: {
        status?: string | null;
        game?: string | null;
        limit?: number;
        offset?: number;
      },
      ctx: GraphQLContext
    ) => {
      const limit = clampLimit(args.limit ?? 50);
      const offset = Math.max(0, Math.floor(args.offset ?? 0));
      return readPublicTournaments(ctx.tenantId, {
        status: args.status ?? null,
        game: args.game ?? null,
        limit,
        offset,
      });
    },
    tournament: async (
      _root: unknown,
      args: { idOrSlug: string },
      ctx: GraphQLContext
    ) => readPublicTournamentDetail(args.idOrSlug, ctx.tenantId),
    match: async (_root: unknown, args: { id: string }, ctx: GraphQLContext) =>
      readPublicMatchDetail(args.id, ctx.tenantId),
    team: async (
      _root: unknown,
      args: { idOrSlug: string },
      ctx: GraphQLContext
    ) => readPublicTeam(args.idOrSlug, ctx.tenantId),
  },

  TournamentDetail: {
    // Résolution paresseuse : seulement si le client demande `matches`.
    // readPublicTournamentMatches fait sa propre jointure teams → pas de N+1.
    matches: async (
      parent: { id: string },
      _args: unknown,
      ctx: GraphQLContext
    ) =>
      readPublicTournamentMatches(parent.id, ctx.tenantId, {
        stageId: null,
        status: null,
      }),
  },

  Mutation: {
    reportMatchResult: async (
      _root: unknown,
      args: { matchId: string; team1Score: number; team2Score: number },
      ctx: GraphQLContext
    ) => {
      requireScope(ctx, 'matches:write');
      const tenantId = ctx.token!.tenantId;

      // Quota + rate-limit durable (par plan, partagé). Une clé `comp`
      // (partenaire) n'est pas comptée. Fail-open si le compteur est indispo.
      if (!ctx.token!.comp) {
        const quota = await consumeApiQuota(tenantId, ctx.token!.plan);
        if (!quota.ok) {
          throw new GraphQLError(
            quota.scope === 'month'
              ? 'Monthly API quota exceeded for this plan.'
              : 'API rate limit exceeded.',
            {
              extensions: {
                code: quota.scope === 'month' ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED',
                retryAfterSec: quota.retryAfterSec,
                limit: quota.limit,
              },
            }
          );
        }
      }

      if (
        !Number.isInteger(args.team1Score) ||
        !Number.isInteger(args.team2Score) ||
        args.team1Score < 0 ||
        args.team2Score < 0 ||
        args.team1Score > 99 ||
        args.team2Score > 99
      ) {
        throw new GraphQLError('Scores invalides (entiers 0–99).', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const { data: match, error } = await supabaseAdmin!
        .from('matches')
        .select('id, status, is_bye, team1_id, team2_id')
        .eq('tenant_id', tenantId)
        .eq('id', args.matchId)
        .maybeSingle();

      if (error) {
        logger.error('[graphql/reportMatchResult] match lookup error', error);
        throw new GraphQLError('Erreur de lecture du match.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
      if (!match) {
        throw new GraphQLError('Match introuvable.', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      if (match.is_bye || !match.team1_id || !match.team2_id) {
        throw new GraphQLError(
          'Match non jouable (bye ou équipes manquantes).',
          {
            extensions: { code: 'BAD_USER_INPUT' },
          }
        );
      }
      if (TERMINAL_STATUSES.has(match.status)) {
        throw new GraphQLError(`Match déjà clôturé (status=${match.status}).`, {
          extensions: { code: 'CONFLICT' },
        });
      }

      const result = await applyMatchScore({
        tenantId,
        matchId: args.matchId,
        team1Score: args.team1Score,
        team2Score: args.team2Score,
        markFinished: true,
        staffId: null,
        propagateBracket: true,
      });

      return {
        matchId: args.matchId,
        status: 'finished',
        team1Score: args.team1Score,
        team2Score: args.team2Score,
        winnerTeamId: result.winnerTeamId,
      };
    },
  },
};

export const publicGraphQLSchema = createSchema<GraphQLContext>({
  typeDefs,
  resolvers,
});
