import { describe, it, expect } from 'vitest';
import { validateStageSettings } from '../../utils/stageSettings';

describe('validateStageSettings', () => {
  it('accepts null settings for any stage type', () => {
    const result = validateStageSettings('bracket', null);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data).toEqual({});
  });

  it('accepts undefined settings for any stage type', () => {
    const result = validateStageSettings('swiss', undefined);
    expect(result.valid).toBe(true);
  });

  it('rejects non-object settings (array)', () => {
    const result = validateStageSettings('bracket', [1, 2, 3]);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('must be a JSON object');
  });

  it('rejects non-object settings (string)', () => {
    const result = validateStageSettings('bracket', 'invalid');
    expect(result.valid).toBe(false);
  });

  it('falls back to "other" schema for null stage type', () => {
    const result = validateStageSettings(null, { foo: 'bar' });
    expect(result.valid).toBe(true);
  });

  it('falls back to "other" schema for undefined stage type', () => {
    const result = validateStageSettings(undefined, { anything: 123 });
    expect(result.valid).toBe(true);
  });

  // Bracket settings
  describe('bracket', () => {
    it('accepts valid bracket settings', () => {
      const result = validateStageSettings('bracket', {
        bracket_size: 16,
        bracket_type: 'single_elim',
        third_place_match: true,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects invalid bracket_size', () => {
      const result = validateStageSettings('bracket', { bracket_size: 12 });
      expect(result.valid).toBe(false);
    });

    it('rejects non-integer bracket_size', () => {
      const result = validateStageSettings('bracket', { bracket_size: 8.5 });
      expect(result.valid).toBe(false);
    });

    it('rejects invalid bracket_type', () => {
      const result = validateStageSettings('bracket', {
        bracket_type: 'triple_elim',
      });
      expect(result.valid).toBe(false);
    });

    it('rejects invalid seeding_method', () => {
      const result = validateStageSettings('bracket', {
        seeding_method: 'alphabetical',
      });
      expect(result.valid).toBe(false);
    });

    it('accepts all valid bracket_size values', () => {
      for (const size of [4, 8, 16, 32, 64]) {
        const result = validateStageSettings('bracket', { bracket_size: size });
        expect(result.valid).toBe(true);
      }
    });

    it('passes through unknown fields', () => {
      const result = validateStageSettings('bracket', {
        bracket_size: 8,
        custom_field: 'hello',
      });
      expect(result.valid).toBe(true);
      if (result.valid)
        expect(result.data).toHaveProperty('custom_field', 'hello');
    });
  });

  // Swiss settings
  describe('swiss', () => {
    it('accepts valid swiss settings', () => {
      const result = validateStageSettings('swiss', {
        total_rounds: 5,
        win_points: 3,
        draw_points: 1,
        loss_points: 0,
        bye_points: 3,
        allow_rematches: false,
        use_buchholz: true,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects total_rounds > 20', () => {
      const result = validateStageSettings('swiss', { total_rounds: 25 });
      expect(result.valid).toBe(false);
    });

    it('rejects total_rounds < 1', () => {
      const result = validateStageSettings('swiss', { total_rounds: 0 });
      expect(result.valid).toBe(false);
    });

    it('rejects non-integer total_rounds', () => {
      const result = validateStageSettings('swiss', { total_rounds: 3.5 });
      expect(result.valid).toBe(false);
    });

    it('rejects negative points', () => {
      const result = validateStageSettings('swiss', { win_points: -1 });
      expect(result.valid).toBe(false);
    });

    it('accepts empty object', () => {
      const result = validateStageSettings('swiss', {});
      expect(result.valid).toBe(true);
    });
  });

  // Round Robin settings
  describe('round_robin', () => {
    it('accepts valid round_robin settings', () => {
      const result = validateStageSettings('round_robin', {
        rounds: 2,
        win_points: 3,
        home_away: true,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects rounds > 10', () => {
      const result = validateStageSettings('round_robin', { rounds: 15 });
      expect(result.valid).toBe(false);
    });

    it('rejects rounds < 1', () => {
      const result = validateStageSettings('round_robin', { rounds: 0 });
      expect(result.valid).toBe(false);
    });
  });

  // Group settings
  describe('group', () => {
    it('accepts valid group settings', () => {
      const result = validateStageSettings('group', {
        num_groups: 4,
        teams_per_group: 4,
        advance_per_group: 2,
        group_format: 'round_robin',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects num_groups > 32', () => {
      const result = validateStageSettings('group', { num_groups: 33 });
      expect(result.valid).toBe(false);
    });

    it('rejects invalid group_format', () => {
      const result = validateStageSettings('group', {
        group_format: 'battle_royale',
      });
      expect(result.valid).toBe(false);
    });

    it('rejects teams_per_group < 2', () => {
      const result = validateStageSettings('group', { teams_per_group: 1 });
      expect(result.valid).toBe(false);
    });
  });

  // Showmatch settings
  describe('showmatch', () => {
    it('accepts valid showmatch settings', () => {
      const result = validateStageSettings('showmatch', {
        best_of: 5,
        description: 'Grand Finals showmatch',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects best_of > 15', () => {
      const result = validateStageSettings('showmatch', { best_of: 17 });
      expect(result.valid).toBe(false);
    });

    it('rejects best_of < 1', () => {
      const result = validateStageSettings('showmatch', { best_of: 0 });
      expect(result.valid).toBe(false);
    });

    it('rejects description > 1000 chars', () => {
      const result = validateStageSettings('showmatch', {
        description: 'x'.repeat(1001),
      });
      expect(result.valid).toBe(false);
    });
  });

  // FFA settings
  describe('ffa', () => {
    it('accepts a valid FFA settings object', () => {
      const result = validateStageSettings('ffa', {
        lobby_size: 16,
        points_table: { '1': 100, '2': 80, '3': 60 },
        tiebreak: 'most_firsts',
      });
      expect(result.valid).toBe(true);
    });

    it('applies defaults for lobby_size, points_table and tiebreak', () => {
      const result = validateStageSettings('ffa', {});
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.lobby_size).toBe(8);
        expect(result.data.tiebreak).toBe('best_placement');
        expect(result.data.points_table).toMatchObject({
          '1': 100,
          '8': 10,
        });
      }
    });

    it('rejects a non-numeric points_table value', () => {
      const result = validateStageSettings('ffa', {
        points_table: { '1': 'lots' },
      });
      expect(result.valid).toBe(false);
    });

    it('rejects lobby_size out of range', () => {
      expect(validateStageSettings('ffa', { lobby_size: 1 }).valid).toBe(false);
      expect(validateStageSettings('ffa', { lobby_size: 65 }).valid).toBe(
        false
      );
      expect(validateStageSettings('ffa', { lobby_size: 8.5 }).valid).toBe(
        false
      );
    });

    it('rejects an invalid tiebreak', () => {
      const result = validateStageSettings('ffa', { tiebreak: 'coin_flip' });
      expect(result.valid).toBe(false);
    });
  });

  // Error message format
  describe('error messages', () => {
    it('includes field path in error message', () => {
      const result = validateStageSettings('bracket', { bracket_size: 12 });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('settings.bracket_size');
      }
    });
  });
});
