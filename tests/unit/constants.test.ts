import { describe, it, expect } from 'vitest';
import {
  VALID_TOURNAMENT_STATUSES,
  VALID_MATCH_STATUSES,
  VALID_BRACKET_SIDES,
  VALID_STAGE_TYPES,
  VALID_PARTNERSHIP_STATUSES,
} from '../../utils/constants';

describe('VALID_TOURNAMENT_STATUSES', () => {
  it('contains the expected statuses', () => {
    expect(VALID_TOURNAMENT_STATUSES).toContain('draft');
    expect(VALID_TOURNAMENT_STATUSES).toContain('published');
    expect(VALID_TOURNAMENT_STATUSES).toContain('running');
    expect(VALID_TOURNAMENT_STATUSES).toContain('completed');
    expect(VALID_TOURNAMENT_STATUSES).toContain('archived');
  });

  it('has no duplicates', () => {
    expect(new Set(VALID_TOURNAMENT_STATUSES).size).toBe(
      VALID_TOURNAMENT_STATUSES.length
    );
  });

  it('has at least 4 statuses', () => {
    expect(VALID_TOURNAMENT_STATUSES.length).toBeGreaterThanOrEqual(4);
  });
});

describe('VALID_MATCH_STATUSES', () => {
  it('contains the expected statuses', () => {
    expect(VALID_MATCH_STATUSES).toContain('pending');
    expect(VALID_MATCH_STATUSES).toContain('ongoing');
    expect(VALID_MATCH_STATUSES).toContain('finished');
    expect(VALID_MATCH_STATUSES).toContain('cancelled');
  });

  it('has no duplicates', () => {
    expect(new Set(VALID_MATCH_STATUSES).size).toBe(
      VALID_MATCH_STATUSES.length
    );
  });
});

describe('VALID_BRACKET_SIDES', () => {
  it('contains the expected sides', () => {
    expect(VALID_BRACKET_SIDES).toContain('wb');
    expect(VALID_BRACKET_SIDES).toContain('lb');
    expect(VALID_BRACKET_SIDES).toContain('final');
    expect(VALID_BRACKET_SIDES).toContain('none');
  });

  it('has no duplicates', () => {
    expect(new Set(VALID_BRACKET_SIDES).size).toBe(VALID_BRACKET_SIDES.length);
  });
});

describe('VALID_STAGE_TYPES', () => {
  it('contains the expected stage types', () => {
    expect(VALID_STAGE_TYPES).toContain('group');
    expect(VALID_STAGE_TYPES).toContain('bracket');
    expect(VALID_STAGE_TYPES).toContain('swiss');
    expect(VALID_STAGE_TYPES).toContain('round_robin');
    expect(VALID_STAGE_TYPES).toContain('showmatch');
  });

  it('has no duplicates', () => {
    expect(new Set(VALID_STAGE_TYPES).size).toBe(VALID_STAGE_TYPES.length);
  });
});

describe('VALID_PARTNERSHIP_STATUSES', () => {
  it('contains common workflow statuses', () => {
    expect(VALID_PARTNERSHIP_STATUSES).toContain('new');
    expect(VALID_PARTNERSHIP_STATUSES).toContain('accepted');
    expect(VALID_PARTNERSHIP_STATUSES).toContain('declined');
    expect(VALID_PARTNERSHIP_STATUSES).toContain('archived');
  });

  it('has no duplicates', () => {
    expect(new Set(VALID_PARTNERSHIP_STATUSES).size).toBe(
      VALID_PARTNERSHIP_STATUSES.length
    );
  });

  it('starts with new and ends with archived', () => {
    expect(VALID_PARTNERSHIP_STATUSES[0]).toBe('new');
    expect(
      VALID_PARTNERSHIP_STATUSES[VALID_PARTNERSHIP_STATUSES.length - 1]
    ).toBe('archived');
  });
});
