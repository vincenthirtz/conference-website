import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/supabase', () => ({
  supabaseAdmin: {},
  getServerClient: () => ({}),
  supabaseClient: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

import {
  STAFF_CACHE_KEY,
  STAFF_CACHE_TTL,
  isCacheFresh,
  isStaffRole,
  parseStaffCache,
  type StaffCache,
} from '../../hooks/useStaffSession';

describe('STAFF_CACHE_TTL', () => {
  it('is set to 2 minutes', () => {
    expect(STAFF_CACHE_TTL).toBe(2 * 60 * 1000);
  });
});

describe('STAFF_CACHE_KEY', () => {
  it('uses a stable sessionStorage key', () => {
    // Bumpé de 'staff_cache' → 'staff_cache_v2' lors de l'ajout d'activeTenantKind
    // au cache : invalide les anciens caches dépourvus du champ.
    expect(STAFF_CACHE_KEY).toBe('staff_cache_v2');
  });
});

describe('parseStaffCache', () => {
  it('returns null when raw is null', () => {
    expect(parseStaffCache(null)).toBeNull();
  });

  it('returns null when raw is empty string', () => {
    expect(parseStaffCache('')).toBeNull();
  });

  it('returns null when raw is invalid JSON', () => {
    expect(parseStaffCache('{not valid}')).toBeNull();
    expect(parseStaffCache('undefined')).toBeNull();
  });

  it('returns null when JSON parses to a non-object value', () => {
    expect(parseStaffCache('null')).toBeNull();
    expect(parseStaffCache('"string"')).toBeNull();
    expect(parseStaffCache('123')).toBeNull();
    expect(parseStaffCache('true')).toBeNull();
  });

  it('parses a well-formed cache entry', () => {
    const value: StaffCache = {
      isStaff: true,
      staffName: 'Vincent',
      staffRole: 'admin',
      activeTenantKind: 'organizer',
      ts: 1_700_000_000_000,
    };
    expect(parseStaffCache(JSON.stringify(value))).toEqual(value);
  });

  it('passes through partial objects without crashing (validation lives elsewhere)', () => {
    // The hook tolerates partial cache shapes — tests document this behavior
    expect(parseStaffCache('{}')).toEqual({});
    expect(parseStaffCache('{"isStaff":true}')).toEqual({ isStaff: true });
  });
});

describe('isCacheFresh', () => {
  const now = 10_000_000;

  it('returns false for null / undefined caches', () => {
    expect(isCacheFresh(null, now)).toBe(false);
    expect(isCacheFresh(undefined, now)).toBe(false);
  });

  it('returns false when ts is missing or wrong type', () => {
    expect(isCacheFresh({ ts: undefined as unknown as number }, now)).toBe(
      false
    );
    expect(isCacheFresh({ ts: 'oops' as unknown as number }, now)).toBe(false);
  });

  it('returns true when the cache was just written', () => {
    expect(isCacheFresh({ ts: now }, now)).toBe(true);
  });

  it('returns true when cache is younger than TTL', () => {
    expect(isCacheFresh({ ts: now - (STAFF_CACHE_TTL - 1) }, now)).toBe(true);
  });

  it('returns false right at the TTL boundary', () => {
    // strict < TTL means the boundary itself is stale
    expect(isCacheFresh({ ts: now - STAFF_CACHE_TTL }, now)).toBe(false);
  });

  it('returns false past the TTL', () => {
    expect(isCacheFresh({ ts: now - STAFF_CACHE_TTL - 1 }, now)).toBe(false);
  });

  it('honours a custom TTL when provided', () => {
    expect(isCacheFresh({ ts: now - 500 }, now, 1000)).toBe(true);
    expect(isCacheFresh({ ts: now - 1500 }, now, 1000)).toBe(false);
  });

  it('treats future timestamps as fresh (clock skew tolerance)', () => {
    expect(isCacheFresh({ ts: now + 5000 }, now)).toBe(true);
  });
});

describe('isStaffRole', () => {
  it('accepts the three staff roles', () => {
    expect(isStaffRole('owner')).toBe(true);
    expect(isStaffRole('admin')).toBe(true);
    expect(isStaffRole('caster')).toBe(true);
  });

  it('rejects "captain" — /api/admin/me répond 200 pour une capitaine', () => {
    // Régression : une capitaine d'équipe (repli `teams.captain_id` du
    // handler) était prise pour du staff → nav publique masquée, PlayerTopBar
    // bloquée et top-bar admin sans le moindre lien.
    expect(isStaffRole('captain')).toBe(false);
  });

  it('rejects team roles and junk values', () => {
    expect(isStaffRole('manager')).toBe(false);
    expect(isStaffRole('player')).toBe(false);
    expect(isStaffRole('member')).toBe(false);
    expect(isStaffRole('')).toBe(false);
    expect(isStaffRole(null)).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
    expect(isStaffRole(1)).toBe(false);
  });
});
