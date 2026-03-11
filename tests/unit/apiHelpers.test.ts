import { describe, it, expect } from 'vitest';
import { parsePagination, sanitizeSearch } from '../../utils/apiHelpers';
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
