// tests/unit/useAdminResourceUrl.test.ts
//
// Tests for buildAdminResourceUrl — the pure URL builder extracted from
// useAdminResource. The resolved URL is what the hook's fetch effect keys on:
// when SSR-hydrated (initialData), the mount fetch is skipped, and a fetch only
// fires when this resolved URL changes (filter / search / page) or refresh() is
// called. So a stable, correct URL contract is the backbone of the hydration
// skip logic.
//
// The hook's React effect itself (mount-skip / refetch-on-change) can't be unit
// tested in this harness: there is no jsdom / @testing-library/react, which the
// zero-dependency policy forbids (see vitest.config coverage note). The skip
// mechanism is a one-shot ref validated via tsc + code review; here we lock down
// the URL contract that decides whether "the resolved URL still matches the
// initial SSR state".

import { describe, it, expect } from 'vitest';
import { buildAdminResourceUrl } from '@/hooks/useAdminResource';

describe('buildAdminResourceUrl', () => {
  it('emits limit, offset and includeTotal in a stable order', () => {
    const url = buildAdminResourceUrl('/api/admin/demandes', {
      limit: 50,
      offset: 0,
      includeTotal: true,
    });
    expect(url).toBe('/api/admin/demandes?limit=50&offset=0&includeTotal=1');
  });

  it('omits includeTotal when false', () => {
    const url = buildAdminResourceUrl('/api/admin/teams', {
      limit: 25,
      offset: 25,
      includeTotal: false,
    });
    expect(url).toBe('/api/admin/teams?limit=25&offset=25');
  });

  it('adds a trimmed search term under the default param name', () => {
    const url = buildAdminResourceUrl('/api/admin/teams', {
      limit: 25,
      offset: 0,
      includeTotal: true,
      search: '  Fnatic  ',
    });
    expect(url).toBe(
      '/api/admin/teams?limit=25&offset=0&includeTotal=1&search=Fnatic'
    );
  });

  it('omits the search param when the term is empty or whitespace', () => {
    const url = buildAdminResourceUrl('/api/admin/teams', {
      limit: 25,
      offset: 0,
      includeTotal: true,
      search: '   ',
    });
    expect(url).toBe('/api/admin/teams?limit=25&offset=0&includeTotal=1');
  });

  it('honours a custom search param name', () => {
    const url = buildAdminResourceUrl('/api/admin/comments', {
      limit: 30,
      offset: 0,
      includeTotal: true,
      search: 'spam',
      searchParam: 'q',
    });
    expect(url).toBe(
      '/api/admin/comments?limit=30&offset=0&includeTotal=1&q=spam'
    );
  });

  it('merges static params and skips null / undefined / empty values', () => {
    const url = buildAdminResourceUrl('/api/admin/demandes', {
      limit: 50,
      offset: 0,
      includeTotal: true,
      params: {
        status: 'pending',
        type: '',
        tournamentId: null,
        from: undefined,
        includeUser: 1,
        flagged: true,
      },
    });
    expect(url).toBe(
      '/api/admin/demandes?limit=50&offset=0&includeTotal=1&status=pending&includeUser=1&flagged=true'
    );
  });

  it('is deterministic: same inputs -> identical URL (drives the mount-skip decision)', () => {
    const opts = {
      limit: 50,
      offset: 0,
      includeTotal: true,
      search: 'abc',
      params: { status: 'pending' },
    };
    const a = buildAdminResourceUrl('/api/admin/demandes', opts);
    const b = buildAdminResourceUrl('/api/admin/demandes', { ...opts });
    expect(a).toBe(b);
  });

  it('changes when a filter / page changes (drives the refetch decision)', () => {
    const base = buildAdminResourceUrl('/api/admin/teams', {
      limit: 25,
      offset: 0,
      includeTotal: true,
      params: { isActive: 'true' },
    });
    const nextPage = buildAdminResourceUrl('/api/admin/teams', {
      limit: 25,
      offset: 25,
      includeTotal: true,
      params: { isActive: 'true' },
    });
    const filterChanged = buildAdminResourceUrl('/api/admin/teams', {
      limit: 25,
      offset: 0,
      includeTotal: true,
      params: { isActive: 'false' },
    });
    expect(nextPage).not.toBe(base);
    expect(filterChanged).not.toBe(base);
  });

  it('returns the bare url when there is no query string', () => {
    const url = buildAdminResourceUrl('/api/admin/x', {
      limit: 0,
      offset: 0,
      includeTotal: false,
    });
    // limit=0 & offset=0 are still emitted (numbers stringify to "0")
    expect(url).toBe('/api/admin/x?limit=0&offset=0');
  });
});
