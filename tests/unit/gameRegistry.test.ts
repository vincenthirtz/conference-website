import { describe, it, expect } from 'vitest';
import {
  GAME_SLUGS,
  getGame,
  isGameSlug,
  listGames,
  type GameDef,
  type MatchFormat,
} from '../../config/games';

const VALID_FORMATS: readonly MatchFormat[] = ['bo1', 'bo3', 'bo5', 'bo7'];
const VETO_GAMES = ['overwatch', 'valorant', 'cs2', 'r6-siege', 'marvel-rivals'] as const;
const DRAFT_GAMES = ['lol', 'dota2'] as const;
const EXPECTED_GAME_COUNT = 8;

describe('game registry', () => {
  describe('listGames()', () => {
    it(`returns ${EXPECTED_GAME_COUNT} games`, () => {
      expect(listGames()).toHaveLength(EXPECTED_GAME_COUNT);
    });

    it('slugs are unique', () => {
      const slugs = listGames().map((g) => g.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it('every slug is listed in GAME_SLUGS', () => {
      for (const game of listGames()) {
        expect(GAME_SLUGS).toContain(game.slug);
      }
    });

    it(`GAME_SLUGS itself has ${EXPECTED_GAME_COUNT} unique entries`, () => {
      expect(GAME_SLUGS).toHaveLength(EXPECTED_GAME_COUNT);
      expect(new Set(GAME_SLUGS).size).toBe(GAME_SLUGS.length);
    });
  });

  describe('per-game invariants', () => {
    for (const slug of [
      'overwatch',
      'valorant',
      'cs2',
      'rocket-league',
      'r6-siege',
      'marvel-rivals',
      'lol',
      'dota2',
    ] as const) {
      describe(slug, () => {
        const game = getGame(slug) as GameDef;

        it('exists and exposes slug + label', () => {
          expect(game).not.toBeNull();
          expect(game.slug).toBe(slug);
          expect(typeof game.label).toBe('string');
          expect(game.label.length).toBeGreaterThan(0);
        });

        it('has at least one match format, all in the allowed enum', () => {
          expect(game.matchFormats.length).toBeGreaterThan(0);
          for (const fmt of game.matchFormats) {
            expect(VALID_FORMATS).toContain(fmt);
          }
        });
      });
    }
  });

  describe('games with map veto', () => {
    for (const slug of VETO_GAMES) {
      describe(slug, () => {
        const game = getGame(slug) as GameDef;

        it('has hasMapVeto = true', () => {
          expect(game.hasMapVeto).toBe(true);
        });

        it('has at least 5 maps in its pool', () => {
          expect(game.mapPool.length).toBeGreaterThanOrEqual(5);
        });

        it('every map has non-empty name / type / image', () => {
          for (const map of game.mapPool) {
            expect(map.name).toBeTruthy();
            expect(map.type).toBeTruthy();
            expect(map.image).toBeTruthy();
          }
        });

        it('map names are unique within the pool', () => {
          const names = game.mapPool.map((m) => m.name);
          expect(new Set(names).size).toBe(names.length);
        });
      });
    }
  });

  describe('Rocket League', () => {
    const rl = getGame('rocket-league') as GameDef;

    it('has hasMapVeto = false', () => {
      expect(rl.hasMapVeto).toBe(false);
    });

    it('has an empty map pool', () => {
      expect(rl.mapPool).toEqual([]);
    });
  });

  describe('games with draft (MOBA)', () => {
    for (const slug of DRAFT_GAMES) {
      describe(slug, () => {
        const game = getGame(slug) as GameDef;

        it('has hasDraft = true and hasMapVeto = false', () => {
          expect(game.hasDraft).toBe(true);
          expect(game.hasMapVeto).toBe(false);
        });

        it('has an empty map pool', () => {
          expect(game.mapPool).toEqual([]);
        });

        it('defines draftFlows for every advertised match format', () => {
          expect(game.draftFlows).toBeDefined();
          for (const fmt of game.matchFormats) {
            expect(game.draftFlows![fmt]).toBeDefined();
            expect(game.draftFlows![fmt]!.steps.length).toBeGreaterThan(0);
          }
        });

        it('step_numbers are strictly increasing and start at 1', () => {
          for (const fmt of game.matchFormats) {
            const steps = game.draftFlows![fmt]!.steps;
            expect(steps[0].step_number).toBe(1);
            for (let i = 1; i < steps.length; i++) {
              expect(steps[i].step_number).toBe(steps[i - 1].step_number + 1);
            }
          }
        });

        it('alternates between ban and pick phases (no pick→ban within same phase)', () => {
          for (const fmt of game.matchFormats) {
            const steps = game.draftFlows![fmt]!.steps;
            for (const step of steps) {
              const expectedAction = step.phase.startsWith('ban') ? 'ban' : 'pick';
              expect(step.action).toBe(expectedAction);
            }
          }
        });
      });
    }
  });

  describe('LoL Tournament Draft specifics', () => {
    const lol = getGame('lol') as GameDef;
    const flow = lol.draftFlows!.bo3!;

    it('has exactly 20 steps (10 bans + 10 picks)', () => {
      expect(flow.steps).toHaveLength(20);
      const bans = flow.steps.filter((s) => s.action === 'ban');
      const picks = flow.steps.filter((s) => s.action === 'pick');
      expect(bans).toHaveLength(10);
      expect(picks).toHaveLength(10);
    });

    it('balances bans and picks evenly per side (5/5/5/5)', () => {
      const counts = { team1: { ban: 0, pick: 0 }, team2: { ban: 0, pick: 0 } };
      for (const s of flow.steps) counts[s.side][s.action]++;
      expect(counts.team1.ban).toBe(5);
      expect(counts.team2.ban).toBe(5);
      expect(counts.team1.pick).toBe(5);
      expect(counts.team2.pick).toBe(5);
    });
  });

  describe('Dota 2 Captains Mode specifics', () => {
    const dota = getGame('dota2') as GameDef;
    const flow = dota.draftFlows!.bo3!;

    it('has 19 steps (9 bans + 10 picks)', () => {
      expect(flow.steps).toHaveLength(19);
      expect(flow.steps.filter((s) => s.action === 'ban')).toHaveLength(9);
      expect(flow.steps.filter((s) => s.action === 'pick')).toHaveLength(10);
    });

    it('each team picks exactly 5 heroes', () => {
      const team1Picks = flow.steps.filter((s) => s.side === 'team1' && s.action === 'pick').length;
      const team2Picks = flow.steps.filter((s) => s.side === 'team2' && s.action === 'pick').length;
      expect(team1Picks).toBe(5);
      expect(team2Picks).toBe(5);
    });
  });

  describe('getGame()', () => {
    it('returns the GameDef for a known slug', () => {
      const ow = getGame('overwatch');
      expect(ow).not.toBeNull();
      expect(ow!.slug).toBe('overwatch');
      expect(ow!.label).toBe('Overwatch');
    });

    it('returns null for an unknown slug', () => {
      expect(getGame('invalid')).toBeNull();
      expect(getGame('fortnite')).toBeNull();
      expect(getGame('')).toBeNull();
    });
  });

  describe('isGameSlug()', () => {
    it('returns true for every registered slug', () => {
      for (const slug of GAME_SLUGS) {
        expect(isGameSlug(slug)).toBe(true);
      }
    });

    it('returns false for unknown strings', () => {
      expect(isGameSlug('fortnite')).toBe(false);
      expect(isGameSlug('Overwatch')).toBe(false); // case-sensitive
      expect(isGameSlug('')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isGameSlug(null)).toBe(false);
      expect(isGameSlug(undefined)).toBe(false);
      expect(isGameSlug(42)).toBe(false);
      expect(isGameSlug({})).toBe(false);
      expect(isGameSlug([])).toBe(false);
      expect(isGameSlug(true)).toBe(false);
    });
  });

  describe('CS2 vetoFlows', () => {
    const cs2 = getGame('cs2') as GameDef;

    it('defines vetoFlows for bo1, bo3 and bo5', () => {
      expect(cs2.vetoFlows).toBeDefined();
      expect(cs2.vetoFlows!.bo1).toBeDefined();
      expect(cs2.vetoFlows!.bo3).toBeDefined();
      expect(cs2.vetoFlows!.bo5).toBeDefined();
    });

    for (const fmt of ['bo1', 'bo3', 'bo5'] as const) {
      it(`${fmt} ends with a 'decider' action`, () => {
        const flow = cs2.vetoFlows![fmt]!;
        expect(flow.length).toBeGreaterThan(0);
        expect(flow[flow.length - 1].action).toBe('decider');
      });
    }
  });

  describe('OVERWATCH specifics', () => {
    const ow = getGame('overwatch') as GameDef;

    it('exposes the 5 canonical map mode types', () => {
      const types = new Set(ow.mapPool.map((m) => m.type));
      expect(types.has('control')).toBe(true);
      expect(types.has('escort')).toBe(true);
      expect(types.has('hybrid')).toBe(true);
      expect(types.has('push')).toBe(true);
      expect(types.has('flashpoint')).toBe(true);
    });

    it('every map type belongs to the 5 known modes', () => {
      const validTypes = ['control', 'escort', 'hybrid', 'push', 'flashpoint'];
      for (const map of ow.mapPool) {
        expect(validTypes).toContain(map.type);
      }
    });
  });
});
