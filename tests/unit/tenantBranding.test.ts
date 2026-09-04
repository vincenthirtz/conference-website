// tests/unit/tenantBranding.test.ts
//
// WHITELABEL (S8) — résolution custom-domain + lecture du branding tenant.
//
// Couvre `resolveTenantIdByHost` (normalisation host, hosts plateforme,
// lookup + cache) et `readTenantBranding` (sanitization couleurs/logo, règle
// « aucun override → null », cache). Réutilise le mock partagé `supabaseAdmin`.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  resetSupabaseMock,
  store,
  fromCalls,
} from './__helpers__/supabaseMock';
import {
  DEFAULT_TENANT_ID,
  __resetTenantSlugCacheForTests,
  resolveTenantIdByHost,
  readTenantBranding,
} from '../../utils/tenant';

const CONFERENCE_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const CLUB_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PLAIN_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const ARCHIVED_ID = '99999999-9999-4999-8999-999999999999';
const DISCOVERY_ID = 'cccccccc-dddd-4eee-8fff-000000000000';
const EXPIRED_ID = 'dddddddd-eeee-4fff-8000-111111111111';

function seedTenants() {
  store['tenants'] = [
    {
      id: CONFERENCE_ID,
      slug: 'conference',
      name: 'Conference',
      is_active: true,
      custom_domain: null,
    },
    {
      id: CLUB_ID,
      slug: 'esport-club',
      name: 'Esport Club',
      is_active: true,
      custom_domain: 'Club.Example.com',
      // Depuis T7, seul un domaine VÉRIFIÉ est routé.
      custom_domain_state: 'verified', // casse mixte volontaire
      logo_url: 'https://cdn.supabase.co/logos/club.png',
      primary_color: '#123abc',
      accent_color: '#ff00aa',
      // plan payant actif → white-label accordé
      plan: 'regie',
      plan_status: 'active',
      plan_expires_at: '2099-01-01T00:00:00.000Z',
    },
    {
      // Custom branding MAIS palier gratuit discovery → white-label gaté → null
      id: DISCOVERY_ID,
      slug: 'discovery-club',
      name: 'Discovery Club',
      is_active: true,
      custom_domain: 'discovery.example.com',
      // Depuis T7, seul un domaine VÉRIFIÉ est routé.
      custom_domain_state: 'verified',
      logo_url: 'https://cdn.supabase.co/logos/discovery.png',
      primary_color: '#abcdef',
      accent_color: '#123456',
      plan: 'discovery',
      plan_status: 'active',
      plan_expires_at: null,
    },
    {
      // Plan payant mais EXPIRÉ → downgrade discovery → white-label gaté → null
      id: EXPIRED_ID,
      slug: 'expired-club',
      name: 'Expired Club',
      is_active: true,
      logo_url: 'https://cdn.supabase.co/logos/expired.png',
      primary_color: '#abcdef',
      plan: 'regie',
      plan_status: 'active',
      plan_expires_at: '2020-01-01T00:00:00.000Z',
    },
    {
      id: PLAIN_ID,
      slug: 'plain-club',
      name: 'Plain Club',
      is_active: true,
      custom_domain: 'plain.example.com',
      // Depuis T7, seul un domaine VÉRIFIÉ est routé.
      custom_domain_state: 'verified',
      // aucun champ de branding visuel → readTenantBranding doit renvoyer null
      logo_url: null,
      primary_color: null,
      accent_color: null,
    },
    {
      id: ARCHIVED_ID,
      slug: 'archived',
      name: 'Archived',
      is_active: false,
      custom_domain: 'archived.example.com',
      // Depuis T7, seul un domaine VÉRIFIÉ est routé.
      custom_domain_state: 'verified',
      primary_color: '#000000',
    },
  ];
}

beforeEach(() => {
  resetSupabaseMock();
  __resetTenantSlugCacheForTests();
  seedTenants();
});

/* ------------------------------------------------------------------------- */
describe('resolveTenantIdByHost()', () => {
  it('resolves a custom domain (case-insensitive, strips port)', async () => {
    expect(await resolveTenantIdByHost('club.example.com')).toBe(CLUB_ID);
    __resetTenantSlugCacheForTests();
    expect(await resolveTenantIdByHost('CLUB.EXAMPLE.COM:443')).toBe(CLUB_ID);
  });

  it('returns null for the platform default hosts (no DB lookup)', async () => {
    for (const h of [
      'owwomenscup.fr',
      'www.owwomenscup.fr',
      'localhost',
      '127.0.0.1',
      'deploy-preview-42.netlify.app',
    ]) {
      expect(await resolveTenantIdByHost(h), h).toBeNull();
    }
    expect(fromCalls.filter((t) => t === 'tenants').length).toBe(0);
  });

  it('returns null for null/empty host', async () => {
    expect(await resolveTenantIdByHost(null)).toBeNull();
    expect(await resolveTenantIdByHost('')).toBeNull();
  });

  it('returns null for an unknown custom domain', async () => {
    expect(await resolveTenantIdByHost('nope.example.com')).toBeNull();
  });

  it('returns null for a custom domain of an inactive tenant', async () => {
    expect(await resolveTenantIdByHost('archived.example.com')).toBeNull();
  });

  it('caches hits and misses (one DB lookup per host)', async () => {
    await resolveTenantIdByHost('club.example.com');
    await resolveTenantIdByHost('club.example.com');
    await resolveTenantIdByHost('nope.example.com');
    await resolveTenantIdByHost('nope.example.com');
    // 1 lookup for the hit host + 1 for the miss host = 2 total.
    expect(fromCalls.filter((t) => t === 'tenants').length).toBe(2);
  });
});

/* ------------------------------------------------------------------------- */
describe('readTenantBranding()', () => {
  it('returns null for the default tenant (defaults apply)', async () => {
    expect(await readTenantBranding(DEFAULT_TENANT_ID)).toBeNull();
  });

  it('returns full branding for a tenant with visual overrides', async () => {
    const b = await readTenantBranding(CLUB_ID);
    expect(b).toEqual({
      name: 'Esport Club',
      slug: 'esport-club',
      logoUrl: 'https://cdn.supabase.co/logos/club.png',
      primaryColor: '#123abc',
      accentColor: '#ff00aa',
    });
  });

  it('returns null when no visual branding field is set', async () => {
    expect(await readTenantBranding(PLAIN_ID)).toBeNull();
  });

  it('gate white-label : renvoie null pour un tenant discovery malgré un branding custom', async () => {
    expect(await readTenantBranding(DISCOVERY_ID)).toBeNull();
  });

  it('gate white-label : renvoie null pour un plan payant expiré (downgrade)', async () => {
    expect(await readTenantBranding(EXPIRED_ID)).toBeNull();
  });

  it('returns null for an inactive tenant even with a color set', async () => {
    expect(await readTenantBranding(ARCHIVED_ID)).toBeNull();
  });

  it('sanitizes invalid colors / logo url to null (anti-injection)', async () => {
    store['tenants'] = [
      {
        id: CLUB_ID,
        slug: 'esport-club',
        name: 'Esport Club',
        is_active: true,
        logo_url: 'javascript:alert(1)',
        primary_color: '#123abc',
        accent_color: 'red; } body { display:none }',
        plan: 'regie',
        plan_status: 'active',
        plan_expires_at: '2099-01-01T00:00:00.000Z',
      },
    ];
    __resetTenantSlugCacheForTests();
    const b = await readTenantBranding(CLUB_ID);
    // primary is a valid hex → kept; accent + logo are rejected → null.
    expect(b).toEqual({
      name: 'Esport Club',
      slug: 'esport-club',
      logoUrl: null,
      primaryColor: '#123abc',
      accentColor: null,
    });
  });

  it('caches branding (one DB lookup per tenant)', async () => {
    await readTenantBranding(CLUB_ID);
    await readTenantBranding(CLUB_ID);
    expect(fromCalls.filter((t) => t === 'tenants').length).toBe(1);
  });
});
