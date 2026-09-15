// Réponses de l'API publique v1 : les schémas zod de lib/apiContracts (qui
// génèrent la spec OpenAPI) doivent décrire EXACTEMENT les types TypeScript que
// les handlers renvoient. `expectTypeOf` est vérifié par le typecheck : ajouter
// un champ au type sans le schéma (ou l'inverse) casse `npm run typecheck`.

import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import type {
  LeagueDetailResponse,
  League,
  PublicLeague,
  LeagueScrimRef,
  LeagueStandingPublic,
  LeagueTournamentRef,
} from '../../types/leagues';
import type {
  LeaderboardPlayer,
  PlayerProfileResponse,
} from '../../types/rating';
import type { PublicApiPagination } from '../../utils/publicApi';
import type {
  PublicMatch,
  PublicMatchDetail,
  PublicMatchGame,
} from '../../utils/public/readMatches';
import type { PublicStanding } from '../../utils/public/readStandings';
import type { PublicTeam } from '../../utils/public/readTeam';
import type {
  PublicStageSummary,
  PublicTournamentDetail,
  PublicTournamentSummary,
} from '../../utils/public/readTournaments';
import type { PublicArbitrationResponse } from '../../pages/api/public/v1/tournaments/[id]/arbitration';
import type { publicV1PaginationSchema } from '../../lib/apiContracts/public/v1/common';
import type {
  publicV1StageSummarySchema,
  publicV1StandingSchema,
  publicV1TournamentDetailSchema,
  publicV1TournamentSummarySchema,
} from '../../lib/apiContracts/public/v1/tournaments';
import type {
  publicV1MatchDetailSchema,
  publicV1MatchGameSchema,
  publicV1MatchSchema,
} from '../../lib/apiContracts/public/v1/matches';
import type { publicV1TeamSchema } from '../../lib/apiContracts/public/v1/teams';
import type { publicV1TournamentArbitrationSchema } from '../../lib/apiContracts/public/v1/arbitration';
import type {
  leagueDetailResponseSchema,
  leagueSchema,
  publicLeagueSchema,
  leagueScrimRefSchema,
  leagueStandingPublicSchema,
  leagueTournamentRefSchema,
} from '../../lib/apiContracts/public/v1/leagues';
import type {
  leaderboardPlayerSchema,
  playerProfileResponseSchema,
} from '../../lib/apiContracts/public/v1/rating';

type Out<S extends z.ZodType> = z.output<S>;
/** Aplatit une intersection (`A & { … }`) en objet simple, comparable à z.output. */
type Flat<T> = { [K in keyof T]: T[K] } & {};

describe('API publique v1 — schémas de réponse ≡ types des handlers', () => {
  it('tournois, phases, classement', () => {
    expectTypeOf<
      Out<typeof publicV1TournamentSummarySchema>
    >().toEqualTypeOf<PublicTournamentSummary>();
    expectTypeOf<
      Out<typeof publicV1StageSummarySchema>
    >().toEqualTypeOf<PublicStageSummary>();
    expectTypeOf<Out<typeof publicV1TournamentDetailSchema>>().toEqualTypeOf<
      Flat<PublicTournamentDetail>
    >();
    expectTypeOf<
      Out<typeof publicV1StandingSchema>
    >().toEqualTypeOf<PublicStanding>();
    expectTypeOf<
      Out<typeof publicV1PaginationSchema>
    >().toEqualTypeOf<PublicApiPagination>();
  });

  it('matchs', () => {
    expectTypeOf<
      Out<typeof publicV1MatchSchema>
    >().toEqualTypeOf<PublicMatch>();
    expectTypeOf<
      Out<typeof publicV1MatchGameSchema>
    >().toEqualTypeOf<PublicMatchGame>();
    expectTypeOf<Out<typeof publicV1MatchDetailSchema>>().toEqualTypeOf<
      Flat<PublicMatchDetail>
    >();
  });

  it('équipe et arbitrage', () => {
    expectTypeOf<Out<typeof publicV1TeamSchema>>().toEqualTypeOf<PublicTeam>();
    expectTypeOf<
      Out<typeof publicV1TournamentArbitrationSchema>
    >().toEqualTypeOf<PublicArbitrationResponse>();
  });

  it('ligues', () => {
    expectTypeOf<Out<typeof leagueSchema>>().toEqualTypeOf<League>();
    expectTypeOf<Out<typeof publicLeagueSchema>>().toEqualTypeOf<
      Flat<PublicLeague>
    >();
    expectTypeOf<
      Out<typeof leagueStandingPublicSchema>
    >().toEqualTypeOf<LeagueStandingPublic>();
    expectTypeOf<
      Out<typeof leagueTournamentRefSchema>
    >().toEqualTypeOf<LeagueTournamentRef>();
    expectTypeOf<
      Out<typeof leagueScrimRefSchema>
    >().toEqualTypeOf<LeagueScrimRef>();
    expectTypeOf<
      Out<typeof leagueDetailResponseSchema>
    >().toEqualTypeOf<LeagueDetailResponse>();
  });

  it('classement et profil joueuse', () => {
    expectTypeOf<Out<typeof leaderboardPlayerSchema>>().toEqualTypeOf<
      Flat<LeaderboardPlayer>
    >();
    expectTypeOf<
      Out<typeof playerProfileResponseSchema>
    >().toEqualTypeOf<PlayerProfileResponse>();
  });
});
