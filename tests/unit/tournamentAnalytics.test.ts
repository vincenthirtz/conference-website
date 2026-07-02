// tests/unit/tournamentAnalytics.test.ts
//
// Couvre utils/analytics/tournamentAnalytics.ts (computeTournamentAnalytics).
// Reducteur pur, aucune I/O -> pas de mock supabase necessaire.

import { describe, it, expect } from 'vitest';
import {
  computeTournamentAnalytics,
  type AnalyticsMatch,
  type AnalyticsGame,
  type AnalyticsVeto,
  type AnalyticsDraftStep,
  type AnalyticsHeroRef,
  type AnalyticsTeamRef,
  type TournamentAnalyticsInput,
} from '../../utils/analytics/tournamentAnalytics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMatch(overrides: Partial<AnalyticsMatch> & { id: string }): AnalyticsMatch {
  return {
    id: overrides.id,
    team1_id: 'team1_id' in overrides ? (overrides.team1_id ?? null) : null,
    team2_id: 'team2_id' in overrides ? (overrides.team2_id ?? null) : null,
    winner_team_id:
      'winner_team_id' in overrides ? (overrides.winner_team_id ?? null) : null,
    status: 'status' in overrides ? (overrides.status ?? null) : 'finished',
    is_bye: overrides.is_bye ?? false,
  };
}

function makeGame(overrides: Partial<AnalyticsGame> & { match_id: string }): AnalyticsGame {
  return {
    match_id: overrides.match_id,
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
  overrides: Partial<AnalyticsVeto> & { match_id: string; step_number: number }
): AnalyticsVeto {
  return {
    match_id: overrides.match_id,
    step_number: overrides.step_number,
    action: overrides.action ?? 'ban',
    team_id: 'team_id' in overrides ? (overrides.team_id ?? null) : null,
    map_name: overrides.map_name ?? 'Ilios',
  };
}

function makeDraft(
  overrides: Partial<AnalyticsDraftStep> & { match_id: string }
): AnalyticsDraftStep {
  return {
    match_id: overrides.match_id,
    game_index: overrides.game_index ?? 1,
    action: overrides.action ?? 'pick',
    side: overrides.side ?? 'team1',
    hero_id: 'hero_id' in overrides ? (overrides.hero_id ?? null) : 'h1',
    phase: 'phase' in overrides ? (overrides.phase ?? null) : null,
  };
}

function teamsMap(...refs: AnalyticsTeamRef[]): Map<string, AnalyticsTeamRef> {
  return new Map(refs.map((r) => [r.id, r]));
}
function heroesMap(...refs: AnalyticsHeroRef[]): Map<string, AnalyticsHeroRef> {
  return new Map(refs.map((r) => [r.id, r]));
}

function emptyInput(
  overrides: Partial<TournamentAnalyticsInput> = {}
): TournamentAnalyticsInput {
  return {
    matches: overrides.matches ?? [],
    games: overrides.games ?? [],
    vetos: overrides.vetos ?? [],
    draftSteps: overrides.draftSteps ?? [],
    heroesById: overrides.heroesById ?? new Map(),
    teamsById: overrides.teamsById ?? new Map(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeTournamentAnalytics — teams', () => {
  it('computes played/wins/losses/winRate and sorts by winRate desc then wins desc', () => {
    // A: 2 wins 0 loss (rate 1.0), B: 1 win 1 loss (0.5), C: 0 win 2 loss (0.0)
    const matches: AnalyticsMatch[] = [
      makeMatch({ id: 'm1', team1_id: 'A', team2_id: 'B', winner_team_id: 'A' }),
      makeMatch({ id: 'm2', team1_id: 'A', team2_id: 'C', winner_team_id: 'A' }),
      makeMatch({ id: 'm3', team1_id: 'B', team2_id: 'C', winner_team_id: 'B' }),
    ];
    const input = emptyInput({
      matches,
      teamsById: teamsMap(
        { id: 'A', name: 'Alpha' },
        { id: 'B', name: 'Bravo' },
        { id: 'C', name: 'Charlie' }
      ),
    });

    const out = computeTournamentAnalytics(input);

    expect(out.teams.map((t) => t.teamId)).toEqual(['A', 'B', 'C']);

    const a = out.teams[0];
    expect(a).toMatchObject({
      teamId: 'A',
      name: 'Alpha',
      played: 2,
      wins: 2,
      losses: 0,
      winRate: 1,
    });

    const b = out.teams[1];
    expect(b).toMatchObject({ teamId: 'B', played: 2, wins: 1, losses: 1 });
    expect(b.winRate).toBeCloseTo(0.5, 10);

    const c = out.teams[2];
    expect(c).toMatchObject({ teamId: 'C', played: 2, wins: 0, losses: 2, winRate: 0 });
  });

  it('breaks winRate ties by wins desc', () => {
    // Both A and B at winRate 1.0, but A has 2 wins, B has 1 win.
    const matches: AnalyticsMatch[] = [
      makeMatch({ id: 'm1', team1_id: 'A', team2_id: 'X', winner_team_id: 'A' }),
      makeMatch({ id: 'm2', team1_id: 'A', team2_id: 'Y', winner_team_id: 'A' }),
      makeMatch({ id: 'm3', team1_id: 'B', team2_id: 'Z', winner_team_id: 'B' }),
    ];
    const out = computeTournamentAnalytics(emptyInput({ matches }));
    // A (2 wins) before B (1 win), both winRate 1.0.
    const idx = (id: string) => out.teams.findIndex((t) => t.teamId === id);
    expect(idx('A')).toBeLessThan(idx('B'));
    expect(out.teams[0].teamId).toBe('A');
  });

  it('falls back to teamId as name when team not in teamsById', () => {
    const matches: AnalyticsMatch[] = [
      makeMatch({ id: 'm1', team1_id: 'A', team2_id: 'B', winner_team_id: 'A' }),
    ];
    const out = computeTournamentAnalytics(emptyInput({ matches }));
    const a = out.teams.find((t) => t.teamId === 'A');
    expect(a?.name).toBe('A');
  });

  it('aggregates mapWins/mapLosses per team from games', () => {
    const matches: AnalyticsMatch[] = [
      makeMatch({ id: 'm1', team1_id: 'A', team2_id: 'B', winner_team_id: 'A' }),
    ];
    // A wins 2 maps (via winner_team_id and via score), B wins 1 (via score).
    const games: AnalyticsGame[] = [
      makeGame({ match_id: 'm1', map_order: 0, winner_team_id: 'A' }),
      makeGame({ match_id: 'm1', map_order: 1, team1_score: 3, team2_score: 1 }), // A by score
      makeGame({ match_id: 'm1', map_order: 2, team1_score: 1, team2_score: 3 }), // B by score
    ];
    const out = computeTournamentAnalytics(emptyInput({ matches, games }));
    const a = out.teams.find((t) => t.teamId === 'A')!;
    const b = out.teams.find((t) => t.teamId === 'B')!;
    expect(a.mapWins).toBe(2);
    expect(a.mapLosses).toBe(1);
    expect(b.mapWins).toBe(1);
    expect(b.mapLosses).toBe(2);
  });

  it('ignores byes for match-level win/loss counts', () => {
    const matches: AnalyticsMatch[] = [
      makeMatch({ id: 'm1', team1_id: 'A', team2_id: 'B', winner_team_id: 'A' }),
      makeMatch({
        id: 'bye',
        team1_id: 'A',
        team2_id: null,
        winner_team_id: 'A',
        is_bye: true,
      }),
    ];
    const out = computeTournamentAnalytics(emptyInput({ matches }));
    const a = out.teams.find((t) => t.teamId === 'A')!;
    expect(a.wins).toBe(1); // bye not counted
    expect(out.summary.totalMatches).toBe(1);
  });

  it('does not count non-finished matches toward wins/losses', () => {
    const matches: AnalyticsMatch[] = [
      makeMatch({
        id: 'm1',
        team1_id: 'A',
        team2_id: 'B',
        winner_team_id: 'A',
        status: 'in_progress',
      }),
    ];
    const out = computeTournamentAnalytics(emptyInput({ matches }));
    expect(out.teams).toEqual([]); // no team aggregate produced from an unfinished match
    expect(out.summary.finishedMatches).toBe(0);
    expect(out.summary.totalMatches).toBe(1);
  });
});

describe('computeTournamentAnalytics — summary', () => {
  it('computes totalMatches, finishedMatches, totalGames', () => {
    const matches: AnalyticsMatch[] = [
      makeMatch({ id: 'm1', team1_id: 'A', team2_id: 'B', winner_team_id: 'A', status: 'finished' }),
      makeMatch({ id: 'm2', team1_id: 'A', team2_id: 'B', status: 'in_progress' }),
    ];
    const games: AnalyticsGame[] = [
      makeGame({ match_id: 'm1', map_order: 0 }),
      makeGame({ match_id: 'm1', map_order: 1 }),
    ];
    const out = computeTournamentAnalytics(emptyInput({ matches, games }));
    expect(out.summary.totalMatches).toBe(2);
    expect(out.summary.finishedMatches).toBe(1);
    expect(out.summary.totalGames).toBe(2);
  });

  it('avgGameDurationMin averages only non-null positive durations', () => {
    const matches: AnalyticsMatch[] = [
      makeMatch({ id: 'm1', team1_id: 'A', team2_id: 'B', winner_team_id: 'A' }),
    ];
    const games: AnalyticsGame[] = [
      makeGame({ match_id: 'm1', map_order: 0, duration_minutes: 10 }),
      makeGame({ match_id: 'm1', map_order: 1, duration_minutes: 20 }),
      makeGame({ match_id: 'm1', map_order: 2, duration_minutes: null }), // ignored
      makeGame({ match_id: 'm1', map_order: 3, duration_minutes: 0 }), // ignored (not > 0)
    ];
    const out = computeTournamentAnalytics(emptyInput({ matches, games }));
    // average of 10 and 20 -> 15
    expect(out.summary.avgGameDurationMin).toBe(15);
  });

  it('overtimeRate is share of games that went_overtime', () => {
    const games: AnalyticsGame[] = [
      makeGame({ match_id: 'm1', map_order: 0, went_overtime: true }),
      makeGame({ match_id: 'm1', map_order: 1, went_overtime: false }),
      makeGame({ match_id: 'm1', map_order: 2, went_overtime: true }),
      makeGame({ match_id: 'm1', map_order: 3, went_overtime: false }),
    ];
    const out = computeTournamentAnalytics(emptyInput({ games }));
    expect(out.summary.overtimeRate).toBeCloseTo(0.5, 10);
  });

  it('tiebreakerGameRate is share of games flagged is_tiebreaker', () => {
    // tiebreakerGameRate = tiebreaker GAMES / totalGames,
    // NOT "matches that reached the decider".
    const games: AnalyticsGame[] = [
      makeGame({ match_id: 'm1', map_order: 0, is_tiebreaker: false }),
      makeGame({ match_id: 'm1', map_order: 1, is_tiebreaker: false }),
      makeGame({ match_id: 'm1', map_order: 2, is_tiebreaker: true }),
      makeGame({ match_id: 'm2', map_order: 0, is_tiebreaker: false }),
    ];
    const out = computeTournamentAnalytics(emptyInput({ games }));
    expect(out.summary.tiebreakerGameRate).toBeCloseTo(0.25, 10);
  });
});

describe('computeTournamentAnalytics — maps', () => {
  it('counts picks/bans from vetos and gamesPlayed from games, sorted by gamesPlayed desc', () => {
    const vetos: AnalyticsVeto[] = [
      makeVeto({ match_id: 'm1', step_number: 1, action: 'ban', map_name: 'Ilios' }),
      makeVeto({ match_id: 'm1', step_number: 2, action: 'pick', map_name: 'Nepal' }),
      makeVeto({ match_id: 'm1', step_number: 3, action: 'pick', map_name: 'Nepal' }),
      // decider counts as a pick (else-branch in impl)
      makeVeto({ match_id: 'm1', step_number: 4, action: 'decider', map_name: 'Busan' }),
    ];
    const games: AnalyticsGame[] = [
      makeGame({ match_id: 'm1', map_order: 0, map_name: 'Nepal' }),
      makeGame({ match_id: 'm1', map_order: 1, map_name: 'Nepal' }),
      makeGame({ match_id: 'm1', map_order: 2, map_name: 'Busan' }),
    ];
    const out = computeTournamentAnalytics(emptyInput({ vetos, games }));

    // Sorted by gamesPlayed desc: Nepal(2) > Busan(1) > Ilios(0)
    expect(out.maps.map((m) => m.mapName)).toEqual(['Nepal', 'Busan', 'Ilios']);

    const nepal = out.maps.find((m) => m.mapName === 'Nepal')!;
    expect(nepal).toMatchObject({ picks: 2, bans: 0, gamesPlayed: 2 });

    const ilios = out.maps.find((m) => m.mapName === 'Ilios')!;
    expect(ilios).toMatchObject({ picks: 0, bans: 1, gamesPlayed: 0 });

    const busan = out.maps.find((m) => m.mapName === 'Busan')!;
    // decider treated as a pick
    expect(busan.picks).toBe(1);
    expect(busan.gamesPlayed).toBe(1);
  });

  it('computes per-map avgDurationMin and overtimeRate', () => {
    const games: AnalyticsGame[] = [
      makeGame({ match_id: 'm1', map_order: 0, map_name: 'Nepal', duration_minutes: 10, went_overtime: true }),
      makeGame({ match_id: 'm1', map_order: 1, map_name: 'Nepal', duration_minutes: 20, went_overtime: false }),
    ];
    const out = computeTournamentAnalytics(emptyInput({ games }));
    const nepal = out.maps.find((m) => m.mapName === 'Nepal')!;
    expect(nepal.avgDurationMin).toBe(15);
    expect(nepal.overtimeRate).toBeCloseTo(0.5, 10);
  });
});

describe('computeTournamentAnalytics — heroes', () => {
  it('returns [] when there are no draftSteps', () => {
    const matches: AnalyticsMatch[] = [
      makeMatch({ id: 'm1', team1_id: 'A', team2_id: 'B', winner_team_id: 'A' }),
    ];
    const games: AnalyticsGame[] = [makeGame({ match_id: 'm1', map_order: 0 })];
    const out = computeTournamentAnalytics(emptyInput({ matches, games }));
    expect(out.heroes).toEqual([]);
  });

  it('counts picks/bans, resolves hero names, sorts by (picks+bans) desc', () => {
    const draftSteps: AnalyticsDraftStep[] = [
      makeDraft({ match_id: 'm1', game_index: 1, action: 'pick', hero_id: 'h1' }),
      makeDraft({ match_id: 'm1', game_index: 1, action: 'pick', hero_id: 'h1' }),
      makeDraft({ match_id: 'm1', game_index: 1, action: 'ban', hero_id: 'h1' }),
      makeDraft({ match_id: 'm1', game_index: 1, action: 'pick', hero_id: 'h2' }),
      makeDraft({ match_id: 'm1', game_index: 1, action: 'ban', hero_id: null }), // ignored (no hero_id)
    ];
    const out = computeTournamentAnalytics(
      emptyInput({
        draftSteps,
        heroesById: heroesMap({ id: 'h1', name: 'Tracer' }, { id: 'h2', name: 'Genji' }),
      })
    );

    // h1 total 3 (2 picks + 1 ban), h2 total 1 -> h1 first
    expect(out.heroes.map((h) => h.heroId)).toEqual(['h1', 'h2']);
    const h1 = out.heroes[0];
    expect(h1).toMatchObject({ heroId: 'h1', name: 'Tracer', picks: 2, bans: 1 });
    const h2 = out.heroes[1];
    expect(h2).toMatchObject({ heroId: 'h2', name: 'Genji', picks: 1, bans: 0 });
  });

  it('falls back to heroId when hero not in heroesById', () => {
    const draftSteps: AnalyticsDraftStep[] = [
      makeDraft({ match_id: 'm1', game_index: 1, action: 'pick', hero_id: 'hX' }),
    ];
    const out = computeTournamentAnalytics(emptyInput({ draftSteps }));
    expect(out.heroes[0].name).toBe('hX');
  });

  it('computes hero win/loss on an unambiguous game<->draft pairing', () => {
    // Single game, map_order 0 <-> game_index 1. team1 wins the game.
    const matches: AnalyticsMatch[] = [
      makeMatch({ id: 'm1', team1_id: 'A', team2_id: 'B', winner_team_id: 'A' }),
    ];
    const games: AnalyticsGame[] = [
      makeGame({ match_id: 'm1', map_order: 0, winner_team_id: 'A' }),
    ];
    const draftSteps: AnalyticsDraftStep[] = [
      // team1 (A) picks h1 -> win
      makeDraft({ match_id: 'm1', game_index: 1, action: 'pick', side: 'team1', hero_id: 'h1' }),
      // team2 (B) picks h2 -> loss
      makeDraft({ match_id: 'm1', game_index: 1, action: 'pick', side: 'team2', hero_id: 'h2' }),
      // ban never counts as win/loss
      makeDraft({ match_id: 'm1', game_index: 1, action: 'ban', side: 'team1', hero_id: 'h3' }),
    ];
    const out = computeTournamentAnalytics(
      emptyInput({
        matches,
        games,
        draftSteps,
        heroesById: heroesMap(
          { id: 'h1', name: 'Tracer' },
          { id: 'h2', name: 'Genji' },
          { id: 'h3', name: 'Reaper' }
        ),
      })
    );

    const h1 = out.heroes.find((h) => h.heroId === 'h1')!;
    expect(h1).toMatchObject({ picks: 1, wins: 1, losses: 0, winRate: 1 });

    const h2 = out.heroes.find((h) => h.heroId === 'h2')!;
    expect(h2).toMatchObject({ picks: 1, wins: 0, losses: 1, winRate: 0 });

    const h3 = out.heroes.find((h) => h.heroId === 'h3')!;
    expect(h3).toMatchObject({ bans: 1, picks: 0, wins: 0, losses: 0, winRate: 0 });
  });

  it('does not attribute win/loss when the game pairing is ambiguous', () => {
    // Two games share map_order 0 -> byOrder.length > 1 -> resolveGame returns null.
    const matches: AnalyticsMatch[] = [
      makeMatch({ id: 'm1', team1_id: 'A', team2_id: 'B', winner_team_id: 'A' }),
    ];
    const games: AnalyticsGame[] = [
      makeGame({ match_id: 'm1', map_order: 0, winner_team_id: 'A' }),
      makeGame({ match_id: 'm1', map_order: 0, winner_team_id: 'B' }),
    ];
    const draftSteps: AnalyticsDraftStep[] = [
      makeDraft({ match_id: 'm1', game_index: 1, action: 'pick', side: 'team1', hero_id: 'h1' }),
    ];
    const out = computeTournamentAnalytics(emptyInput({ matches, games, draftSteps }));
    const h1 = out.heroes.find((h) => h.heroId === 'h1')!;
    expect(h1.picks).toBe(1); // pick still counted
    expect(h1.wins).toBe(0);
    expect(h1.losses).toBe(0);
  });
});

describe('computeTournamentAnalytics — robustness on empty input', () => {
  it('returns empty lists and 0 (not NaN) rates for a fully empty input', () => {
    const out = computeTournamentAnalytics(emptyInput());

    expect(out.teams).toEqual([]);
    expect(out.maps).toEqual([]);
    expect(out.heroes).toEqual([]);

    expect(out.summary).toEqual({
      totalMatches: 0,
      finishedMatches: 0,
      totalGames: 0,
      avgGameDurationMin: 0,
      overtimeRate: 0,
      tiebreakerGameRate: 0,
    });

    // Explicit NaN guards.
    expect(Number.isNaN(out.summary.avgGameDurationMin)).toBe(false);
    expect(Number.isNaN(out.summary.overtimeRate)).toBe(false);
    expect(Number.isNaN(out.summary.tiebreakerGameRate)).toBe(false);
  });
});
