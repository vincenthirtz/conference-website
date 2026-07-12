// tests/unit/embedChrome.test.ts
//
// Coverage for utils/embed — the shared embed chrome resolver:
//   - parseEmbedTheme : ?theme=light → light, else dark
//   - parseEmbedAccentParam : hex sanitization (with/without #), injection reject
//   - resolveEmbedTenantId : ?tenant=<slug> → id, unknown/absent → default
//   - resolveEmbedChrome : explicit ?accent wins; default tenant → no branding

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID, __resetTenantSlugCacheForTests } from '../../utils/tenant';
import {
  parseEmbedTheme,
  parseEmbedAccentParam,
  resolveEmbedTenantId,
  resolveEmbedChrome,
} from '../../utils/embed';

beforeEach(() => {
  resetSupabaseMock();
  __resetTenantSlugCacheForTests();
});

describe('parseEmbedTheme', () => {
  it('light only when ?theme=light', () => {
    expect(parseEmbedTheme({ theme: 'light' })).toBe('light');
    expect(parseEmbedTheme({ theme: 'dark' })).toBe('dark');
    expect(parseEmbedTheme({})).toBe('dark');
    expect(parseEmbedTheme({ theme: 'neon' })).toBe('dark');
    // array param → first value
    expect(parseEmbedTheme({ theme: ['light', 'dark'] })).toBe('light');
  });
});

describe('parseEmbedAccentParam', () => {
  it('accepts hex with or without leading #', () => {
    expect(parseEmbedAccentParam({ accent: 'ff0000' })).toBe('#ff0000');
    expect(parseEmbedAccentParam({ accent: '#00ff00' })).toBe('#00ff00');
    expect(parseEmbedAccentParam({ accent: '3ab' })).toBe('#3ab');
    expect(parseEmbedAccentParam({ accent: '11223344' })).toBe('#11223344');
  });

  it('rejects non-hex and CSS-injection attempts', () => {
    expect(parseEmbedAccentParam({ accent: 'red' })).toBeNull();
    expect(parseEmbedAccentParam({ accent: 'ff0000;}body{x:1' })).toBeNull();
    expect(parseEmbedAccentParam({ accent: 'url(x)' })).toBeNull();
    expect(parseEmbedAccentParam({})).toBeNull();
  });
});

describe('resolveEmbedTenantId', () => {
  it('resolves a known ?tenant slug to its id', async () => {
    store.tenants = [
      { id: 'tid-alpha', slug: 'alpha', is_active: true },
    ] as any;
    expect(await resolveEmbedTenantId({ tenant: 'alpha' })).toBe('tid-alpha');
  });

  it('falls back to the default tenant for unknown / absent slug', async () => {
    store.tenants = [] as any;
    expect(await resolveEmbedTenantId({ tenant: 'ghost' })).toBe(DEFAULT_TENANT_ID);
    expect(await resolveEmbedTenantId({})).toBe(DEFAULT_TENANT_ID);
  });
});

describe('resolveEmbedChrome', () => {
  it('an explicit ?accent wins and short-circuits branding', async () => {
    store.tenants = [
      { id: 'tid-alpha', slug: 'alpha', is_active: true },
    ] as any;
    const chrome = await resolveEmbedChrome({
      tenant: 'alpha',
      theme: 'light',
      accent: 'aa00ff',
    });
    expect(chrome).toEqual({
      tenantId: 'tid-alpha',
      theme: 'light',
      accent: '#aa00ff',
    });
  });

  it('default tenant with no ?accent → no accent (no custom branding)', async () => {
    const chrome = await resolveEmbedChrome({});
    expect(chrome.tenantId).toBe(DEFAULT_TENANT_ID);
    expect(chrome.theme).toBe('dark');
    expect(chrome.accent).toBeNull();
  });
});
