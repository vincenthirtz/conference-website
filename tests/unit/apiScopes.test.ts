// tests/unit/apiScopes.test.ts
//
// Unit tests for `utils/apiScopes.ts` — the applicative source of truth for the
// scopes carried by public API tokens (`tenant_api_tokens.scopes`). Pure logic,
// no I/O: covers isValidScope, parseScopes (normalize + dedup + sort, unknown
// scope rejection, non-array input) and hasScope (exact match, no implication,
// empty/null).

import { describe, it, expect } from 'vitest';
import {
  isValidScope,
  parseScopes,
  hasScope,
  ALL_SCOPES,
} from '../../utils/apiScopes';

describe('isValidScope', () => {
  it('accepts every canonical resource:action scope', () => {
    for (const s of ALL_SCOPES) {
      expect(isValidScope(s)).toBe(true);
    }
    // spot-check a couple explicitly so the assertion is meaningful even if
    // ALL_SCOPES were ever empty.
    expect(isValidScope('matches:write')).toBe(true);
    expect(isValidScope('tournaments:read')).toBe(true);
  });

  it('rejects unknown resources, unknown actions and malformed strings', () => {
    expect(isValidScope('matches:delete')).toBe(false);
    expect(isValidScope('unknown:read')).toBe(false);
    expect(isValidScope('matches')).toBe(false);
    expect(isValidScope('matches:')).toBe(false);
    expect(isValidScope(':read')).toBe(false);
    expect(isValidScope('MATCHES:WRITE')).toBe(false); // case-sensitive
    expect(isValidScope(' matches:write')).toBe(false); // not trimmed here
  });

  it('rejects non-string values', () => {
    expect(isValidScope(null)).toBe(false);
    expect(isValidScope(undefined)).toBe(false);
    expect(isValidScope(42)).toBe(false);
    expect(isValidScope(['matches:write'])).toBe(false);
    expect(isValidScope({})).toBe(false);
  });
});

describe('parseScopes', () => {
  it('normalizes (trim), dedups and sorts a valid list', () => {
    const result = parseScopes([
      ' matches:write ',
      'matches:write',
      'tournaments:read',
      'matches:read',
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scopes).toEqual([
        'matches:read',
        'matches:write',
        'tournaments:read',
      ]);
    }
  });

  it('returns { ok: true, scopes: [] } for an empty array', () => {
    const result = parseScopes([]);
    expect(result).toEqual({ ok: true, scopes: [] });
  });

  it('rejects the whole list when any scope is unknown, listing the invalids', () => {
    const result = parseScopes(['matches:write', 'bogus:read', 'teams:delete']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.invalid).toEqual(['bogus:read', 'teams:delete']);
    }
  });

  it('coerces non-string entries into the invalid list', () => {
    const result = parseScopes(['matches:write', 42, null]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.invalid).toEqual(['42', 'null']);
    }
  });

  it('rejects non-array input with a sentinel invalid marker', () => {
    for (const bad of [null, undefined, 'matches:write', {}, 123]) {
      const result = parseScopes(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.invalid).toEqual(['<not-an-array>']);
      }
    }
  });
});

describe('hasScope', () => {
  it('matches exactly', () => {
    expect(hasScope(['matches:write'], 'matches:write')).toBe(true);
    expect(hasScope(['tournaments:read', 'matches:write'], 'matches:write')).toBe(
      true
    );
  });

  it('does NOT imply read from write (no hierarchy)', () => {
    expect(hasScope(['matches:write'], 'matches:read')).toBe(false);
    expect(hasScope(['matches:read'], 'matches:write')).toBe(false);
  });

  it('returns false for empty / null / undefined token scopes', () => {
    expect(hasScope([], 'matches:write')).toBe(false);
    expect(hasScope(null, 'matches:write')).toBe(false);
    expect(hasScope(undefined, 'matches:write')).toBe(false);
  });
});
