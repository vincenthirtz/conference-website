import { describe, it, expect } from 'vitest';
import {
  parsePagination,
  sanitizeSearch,
  isValidUUID,
  escapePostgrestValue,
  validateRole,
  sanitizeUrl,
} from '../../utils/apiHelpers';
import type { NextApiRequest } from 'next';

/** Helper to build a minimal NextApiRequest with query params */
function fakeReq(query: Record<string, string | string[] | undefined> = {}) {
  return { query } as unknown as NextApiRequest;
}

describe('parsePagination', () => {
  it('returns defaults when no query params', () => {
    const result = parsePagination(fakeReq());
    expect(result).toEqual({ limit: 50, offset: 0 });
  });

  it('parses limit and offset from query', () => {
    const result = parsePagination(fakeReq({ limit: '20', offset: '10' }));
    expect(result).toEqual({ limit: 20, offset: 10 });
  });

  it('uses custom defaults', () => {
    const result = parsePagination(fakeReq(), { limit: 25, offset: 5 });
    expect(result).toEqual({ limit: 25, offset: 5 });
  });

  it('clamps limit to maxLimit', () => {
    const result = parsePagination(fakeReq({ limit: '9999' }), {
      maxLimit: 100,
    });
    expect(result.limit).toBe(100);
  });

  it('treats zero limit as default (falsy fallback)', () => {
    // parseInt('0') is 0, which is falsy → falls back to defaultLimit
    const result = parsePagination(fakeReq({ limit: '0' }));
    expect(result.limit).toBe(50);
  });

  it('clamps negative limit to 1', () => {
    const result = parsePagination(fakeReq({ limit: '-10' }));
    expect(result.limit).toBeGreaterThanOrEqual(1);
  });

  it('clamps offset minimum to 0', () => {
    const result = parsePagination(fakeReq({ offset: '-5' }));
    expect(result.offset).toBe(0);
  });

  it('handles array query params (takes first element)', () => {
    const result = parsePagination(fakeReq({ limit: ['10', '20'] }));
    expect(result.limit).toBe(10);
  });

  it('falls back to default on non-numeric input', () => {
    const result = parsePagination(fakeReq({ limit: 'abc', offset: 'xyz' }));
    expect(result).toEqual({ limit: 50, offset: 0 });
  });
});

describe('sanitizeSearch', () => {
  it('returns empty string for undefined', () => {
    expect(sanitizeSearch(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(sanitizeSearch('')).toBe('');
  });

  it('trims whitespace', () => {
    expect(sanitizeSearch('  hello  ')).toBe('hello');
  });

  it('caps length to maxLength', () => {
    const long = 'a'.repeat(600);
    expect(sanitizeSearch(long, 500)).toHaveLength(500);
  });

  it('handles array input (takes first element)', () => {
    expect(sanitizeSearch(['first', 'second'])).toBe('first');
  });

  it('handles empty array', () => {
    expect(sanitizeSearch([])).toBe('');
  });

  it('uses default maxLength of 500', () => {
    const long = 'b'.repeat(1000);
    expect(sanitizeSearch(long)).toHaveLength(500);
  });
});

describe('isValidUUID', () => {
  it('accepts a canonical lowercase v4 UUID', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('accepts uppercase UUIDs (case-insensitive)', () => {
    expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidUUID('')).toBe(false);
  });

  it('rejects a string with the wrong segment lengths', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-44665544')).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000Z')).toBe(false);
  });

  it('rejects strings with surrounding whitespace', () => {
    expect(isValidUUID(' 550e8400-e29b-41d4-a716-446655440000 ')).toBe(false);
  });
});

describe('escapePostgrestValue', () => {
  it('strips PostgREST operator characters', () => {
    expect(escapePostgrestValue('foo,bar.baz(x)*y\\z')).toBe('foobarbazxyz');
  });

  it('leaves regular alphanumerics untouched', () => {
    expect(escapePostgrestValue('Hello World 123')).toBe('Hello World 123');
  });

  it('returns an empty string for empty input', () => {
    expect(escapePostgrestValue('')).toBe('');
  });
});

describe('validateRole', () => {
  it.each(['player', 'coach', 'substitute', 'manager'])(
    'accepts the allowed role %s',
    (role) => {
      expect(validateRole(role)).toBe(role);
    }
  );

  it('lowercases and trims before checking', () => {
    expect(validateRole('  COACH ')).toBe('coach');
  });

  it('falls back to player for an unknown role', () => {
    expect(validateRole('admin')).toBe('player');
  });

  it('falls back to player for null/undefined/empty', () => {
    expect(validateRole(null)).toBe('player');
    expect(validateRole(undefined)).toBe('player');
    expect(validateRole('')).toBe('player');
  });
});

describe('sanitizeUrl', () => {
  it('accepts an https URL', () => {
    expect(sanitizeUrl('https://example.com/path')).toBe(
      'https://example.com/path'
    );
  });

  it('accepts an http URL', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('trims surrounding whitespace before validating', () => {
    expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com');
  });

  it('rejects javascript: URLs', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects data: URLs', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects malformed URLs', () => {
    expect(sanitizeUrl('not a url')).toBeNull();
  });

  it('returns null for null/undefined/empty/whitespace', () => {
    expect(sanitizeUrl(null)).toBeNull();
    expect(sanitizeUrl(undefined)).toBeNull();
    expect(sanitizeUrl('')).toBeNull();
    expect(sanitizeUrl('   ')).toBeNull();
  });
});
