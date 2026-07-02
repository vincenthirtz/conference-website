// tests/unit/matchAnalytics.test.ts
//
// Couvre utils/analytics/matchAnalytics.ts (computeMatchAnalytics).
// Reducteur pur, aucune I/O -> pas de mock supabase necessaire.

import { describe, it, expect } from 'vitest';
import {
  computeMatchAnalytics,
  type MatchAnalyticsInput,
} from '../../utils/analytics/matchAnalytics';
import type {
  AnalyticsGame,
  AnalyticsVeto,
  AnalyticsDraftStep,
  AnalyticsHeroRef,
} from '../../utils/analytics/tournamentAnalytics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGame(overrides: Partial<AnalyticsGame> & { match_id?: string }): AnalyticsGame {
  return {
    match_id: overrides.match_id ?? 'm1',
    map_name: 'map_name' in overrides ? (overrides.map_name ?? null) : 'Ilios',
    map_order: 'map_order' in overrides ? (overrides.map_order ?? null) : 0,
    team1_score:
      'team1_score' in overrides ? (overrides.team1_score ?? null) : null,
    team2_score:
      'team2_score' in overrides ? (overrides.team2_score ?? null) : null,
    winner_team_id:
      'winner_team_id' in overrides ? (overrides.winner_team_id ?? null) : null,
    duration_minutes:
      'duration_minutes' in overrides
        ? (overrides.duration_minutes ?? null)
        : 10,
    is_tiebreaker:
      'is_tiebreaker' in overrides ? (overrides.is_tiebreaker ?? null) : false,
    went_overtime:
      'went_overtime' in overrides ? (overrides.went_overtime ?? null) : false,
  };
}

function makeVeto(
  overrides: Partial<AnalyticsVeto> & { step_number: number }
): AnalyticsVeto {
  return {
    match_id: overrides.match_id ?? 'm1',
    step_number: overrides.step_number,
    action: overrides.action ?? 'ban',
    team_id: 'team_id' in overrides ? (overrides.team_id ?? null) : null,
    map_name: overrides.map_name ?? 'Ilios',
  };
}

function makeDraft(overrides: Partial<AnalyticsDraftStep> = {}): AnalyticsDraftStep {
  return {
    match_id: overrides.match_id ?? 'm1',
    game_index: overrides.game_index ?? 1,
    action: overrides.action ?? 'pick',
    side: overrides.side ?? 'team1',
    hero_id: 'hero_id' in overrides ? (overrides.hero_id ?? null) : 'h1',
    phase: 'phase' in overrides ? (overrides.phase ?? null) : null,
  };
}

function heroesMap(...refs: AnalyticsHeroRef[]): Map<string, AnalyticsHeroRef> {
  return new Map(refs.map((r) => [r.id, r]));
}

function input(overrides: Partial<MatchAnalyticsInput> = {}): MatchAnalyticsInput {
  return {
    team1Id: 'team1Id' in overrides ? (overrides.team1Id ?? null) : 'A',
    team2Id: 'team2Id' in overrides ? (overrides.team2Id ?? null) : 'B',
    games: overrides.games ?? [],
    vetos: overrides.vetos ?? [],
    draftSteps: overrides.draftSteps ?? [],
    heroesById: overrides.heroesById ?? new Map(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeMatchAnalytics — games & mapScore', () => {
  it('sorts games by map_order and resolves winnerTeamId from winner or score', () => {
    const games: AnalyticsGame[] = [
      makeGame({ map_order: 2, team1_score: 1, team2_score: 3 }), // B wins by score
      makeGame({ map_order: 0, winner_team_id: 'A' }), // A wins explicit
      makeGame({ map_order: 1, team1_score: 3, team2_score: 2 }), // A wins by score
    ];
    const out = computeMatchAnalytics(input({ games }));

    expect(out.games.map((g) => g.mapOrder)).toEqual([0, 1, 2]);
    expect(out.games.map((g) => g.winnerTeamId)).toEqual(['A', 'A', 'B']);
    // A wins 2 maps, B wins 1.
    expect(out.mapScore).toEqual({ team1: 2, team2: 1 });
  });

  it('maps game fields (tiebreaker / overtime) to booleans and passes through scores', () => {
    const games: AnalyticsGame[] = [
      makeGame({
        map_order: 0,
        map_name: 'Nepal',
        team1_score: 2,
        team2_score: 1,
        duration_minutes: 12,
        is_tiebreaker: null,
        went_overtime: true,
      }),
    ];
    const out = computeMatchAnalytics(input({ games }));
    expect(out.games[0]).toMatchObject({
      mapName: 'Nepal',
      team1Score: 2,
      team2Score: 1,
      durationMinutes: 12,
      isTiebreaker: false, // null coerced to false
      wentOvertime: true,
    });
  });

  it('does not count a drawn game toward either team', () => {
    const games: AnalyticsGame[] = [
      makeGame({ map_order: 0, team1_score: 2, team2_score: 2 }),
    ];
    const out = computeMatchAnalytics(input({ games }));
    expect(out.games[0].winnerTeamId).toBeNull();
    expect(out.mapScore).toEqual({ team1: 0, team2: 0 });
  });
});

describe('computeMatchAnalytics — vetoSequence', () => {
  it('orders veto steps by step_number and preserves action/mapName/teamId', () => {
    const vetos: AnalyticsVeto[] = [
      makeVeto({ step_number: 3, action: 'decider', map_name: 'Busan', team_id: null }),
      makeVeto({ step_number: 1, action: 'ban', map_name: 'Ilios', team_id: 'A' }),
      makeVeto({ step_number: 2, action: 'pick', map_name: 'Nepal', team_id: 'B' }),
    ];
    const out = computeMatchAnalytics(input({ vetos }));

    expect(out.vetoSequence.map((v) => v.step)).toEqual([1, 2, 3]);
    expect(out.vetoSequence[0]).toEqual({
      step: 1,
      action: 'ban',
      mapName: 'Ilios',
      teamId: 'A',
    });
    expect(out.vetoSequence[2]).toEqual({
      step: 3,
      action: 'decider',
      mapName: 'Busan',
      teamId: null,
    });
  });
});

describe('computeMatchAnalytics — draft', () => {
  it('groups draft steps by gameIndex and resolves heroName from heroesById', () => {
    const draftSteps: AnalyticsDraftStep[] = [
      makeDraft({ game_index: 2, action: 'pick', side: 'team1', hero_id: 'h3' }),
      makeDraft({ game_index: 1, action: 'ban', side: 'team1', hero_id: 'h1' }),
      makeDraft({ game_index: 1, action: 'pick', side: 'team2', hero_id: 'h2' }),
    ];
    const out = computeMatchAnalytics(
      input({
        draftSteps,
        heroesById: heroesMap(
          { id: 'h1', name: 'Tracer' },
          { id: 'h2', name: 'Genji' },
          { id: 'h3', name: 'Reaper' }
        ),
      })
    );

    // Grouped and sorted by gameIndex asc.
    expect(out.draft.map((d) => d.gameIndex)).toEqual([1, 2]);

    // game 1 preserves insertion order of its two steps.
    expect(out.draft[0].steps).toEqual([
      { action: 'ban', side: 'team1', heroId: 'h1', heroName: 'Tracer' },
      { action: 'pick', side: 'team2', heroId: 'h2', heroName: 'Genji' },
    ]);

    expect(out.draft[1].steps).toEqual([
      { action: 'pick', side: 'team1', heroId: 'h3', heroName: 'Reaper' },
    ]);
  });

  it('sets heroName null when hero_id is absent or unknown to heroesById', () => {
    const draftSteps: AnalyticsDraftStep[] = [
      makeDraft({ game_index: 1, hero_id: null }), // no hero -> null
      makeDraft({ game_index: 1, hero_id: 'unknown' }), // not in map -> null
    ];
    const out = computeMatchAnalytics(
      input({ draftSteps, heroesById: heroesMap({ id: 'h1', name: 'Tracer' }) })
    );
    expect(out.draft[0].steps[0]).toMatchObject({ heroId: null, heroName: null });
    expect(out.draft[0].steps[1]).toMatchObject({ heroId: 'unknown', heroName: null });
  });
});

describe('computeMatchAnalytics — empty / degraded', () => {
  it('returns coherent empty structures when nothing is provided', () => {
    const out = computeMatchAnalytics(input());
    expect(out.games).toEqual([]);
    expect(out.vetoSequence).toEqual([]);
    expect(out.draft).toEqual([]);
    expect(out.mapScore).toEqual({ team1: 0, team2: 0 });
  });

  it('handles null team ids without crashing and yields no map wins by score', () => {
    const games: AnalyticsGame[] = [
      makeGame({ map_order: 0, team1_score: 3, team2_score: 1 }),
    ];
    const out = computeMatchAnalytics(input({ team1Id: null, team2Id: null, games }));
    // Score favors "team1" side but team1Id is null -> winnerTeamId resolves to null.
    expect(out.games[0].winnerTeamId).toBeNull();
    expect(out.mapScore).toEqual({ team1: 0, team2: 0 });
  });
});
