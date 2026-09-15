// lib/apiContracts/public/v1/index.ts
//
// Schémas de RÉPONSE de l'API publique v1, enregistrés sous `response.<Composant>`.
// Chaque composant de docs/openapi/components/schemas porte `x-zod: response.<Nom>` ;
// les sous-schémas nommés (`.meta({ id })`) sont remontés par l'assembleur.

import type { ApiContractEntry } from '../../index';
import { publicV1ArbitrationMetricsSchema, publicV1TournamentArbitrationSchema } from './arbitration';
import { publicV1PaginationSchema } from './common';
import { leagueDetailResponseSchema, leagueSchema } from './leagues';
import { publicV1MatchDetailSchema, publicV1MatchGameSchema, publicV1MatchSchema } from './matches';
import { leaderboardPlayerSchema, playerProfileResponseSchema } from './rating';
import { publicV1TeamMemberSchema, publicV1TeamSchema } from './teams';
import { publicV1StageSummarySchema, publicV1StandingSchema, publicV1TournamentDetailSchema, publicV1TournamentSummarySchema } from './tournaments';

const out = (schema: ApiContractEntry['schema']): ApiContractEntry => ({
  schema,
  io: 'output',
});

export const PUBLIC_V1_RESPONSE_SCHEMAS: Record<string, ApiContractEntry> = {
  'response.PublicV1Pagination': out(publicV1PaginationSchema),
  'response.PublicV1TournamentSummary': out(publicV1TournamentSummarySchema),
  'response.PublicV1StageSummary': out(publicV1StageSummarySchema),
  'response.PublicV1TournamentDetail': out(publicV1TournamentDetailSchema),
  'response.PublicV1Standing': out(publicV1StandingSchema),
  'response.PublicV1Match': out(publicV1MatchSchema),
  'response.PublicV1MatchGame': out(publicV1MatchGameSchema),
  'response.PublicV1MatchDetail': out(publicV1MatchDetailSchema),
  'response.PublicV1TeamMember': out(publicV1TeamMemberSchema),
  'response.PublicV1Team': out(publicV1TeamSchema),
  'response.PublicV1ArbitrationMetrics': out(publicV1ArbitrationMetricsSchema),
  'response.PublicV1TournamentArbitration': out(publicV1TournamentArbitrationSchema),
  'response.League': out(leagueSchema),
  'response.LeagueDetailResponse': out(leagueDetailResponseSchema),
  'response.LeaderboardPlayer': out(leaderboardPlayerSchema),
  'response.PlayerProfileResponse': out(playerProfileResponseSchema),
};
