// tests/unit/adminWave4IsolatedRoutes.test.ts
//
// Vague serveur 4 : tests minimaux des routes isolées migrées sur
// `defineAdminRoute` qui n'en avaient aucun — garde, 405, validation
// historique (messages / codes lus par les écrans), chemin nominal.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const { secrets, loadRoster, spec } = vi.hoisted(() => ({
  secrets: {
    getIntegrationSecret: vi.fn(async () => null as string | null),
    hasIntegrationSecret: vi.fn(async () => false),
    isSecretEncryptionConfigured: vi.fn(() => true),
    setIntegrationSecret: vi.fn(async () => undefined),
    deleteIntegrationSecret: vi.fn(async () => undefined),
  },
  loadRoster: vi.fn(async () => null),
  spec: vi.fn(() => ({ openapi: '3.1.0', paths: {} })),
}));

vi.mock('@/utils/integrationSecrets', () => secrets);
vi.mock('@/utils/openapi/loadSpec', () => ({ loadFullSpec: spec }));
vi.mock('@/utils/teamMessages', async (orig) => ({
  ...(await orig<typeof import('../../utils/teamMessages')>()),
  loadTeamRosterStates: loadRoster,
}));

import {
  resetSupabaseMock,
  setAuthUser,
  store,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import emailCredentials from '../../pages/api/admin/email/credentials';
import blueskyCredentials from '../../pages/api/admin/bluesky/credentials';
import socialPosts from '../../pages/api/admin/social-posts/index';
import disputes from '../../pages/api/admin/disputes/index';
import teamMessages from '../../pages/api/admin/team-messages';
import openapiSpec from '../../pages/api/admin/docs/openapi';

function staffRow(role: 'owner' | 'admin' | 'caster'): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'staff@x.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let n = 0;
function req(method: string, over: Record<string, unknown> = {}): any {
  n += 1;
  return {
    method,
    headers: { host: 'h', authorization: `Bearer tok-w4-${Date.now()}-${n}` },
    query: {},
    body: {},
    cookies: {},
    ...over,
  };
}

function res() {
  const r: any = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c: number) => ((r.statusCode = c), r);
  r.json = (b: unknown) => ((r.body = b), r);
  r.send = (b: unknown) => ((r.body = b), r);
  r.end = () => r;
  r.setHeader = (k: string, v: unknown) => {
    r.headers[k] = v;
  };
  r.getHeader = (k: string) => r.headers[k];
  return r;
}

async function call(
  handler: (q: any, s: any) => Promise<void>,
  method: string,
  over: Record<string, unknown> = {}
) {
  const r = res();
  await handler(req(method, over), r);
  return r;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [staffRow('owner')] as any;
  vi.clearAllMocks();
});

describe('/api/admin/email/credentials', () => {
  it('GET : l’espace historique envoie via le compte de la plateforme', async () => {
    const r = await call(emailCredentials, 'GET');
    expect(r.statusCode).toBe(200);
    expect(r.body.usesPlatformAccount).toBe(true);
  });

  it('PUT : refusé sur l’espace historique (PLATFORM_ACCOUNT)', async () => {
    const r = await call(emailCredentials, 'PUT', {
      body: { apiKey: 'k', fromEmail: 'a@b.fr' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body.code).toBe('PLATFORM_ACCOUNT');
    expect(secrets.setIntegrationSecret).not.toHaveBeenCalled();
  });

  it('405 + Allow sur POST', async () => {
    const r = await call(emailCredentials, 'POST');
    expect(r.statusCode).toBe(405);
    expect(r.headers.Allow).toBe('GET,PUT,DELETE');
  });

  it('réservé à manage_settings : une casteuse est refusée', async () => {
    store.staff = [staffRow('caster')] as any;
    const r = await call(emailCredentials, 'GET');
    expect(r.statusCode).toBe(403);
  });
});

describe('/api/admin/bluesky/credentials', () => {
  it('GET : jamais le mot de passe, seulement l’état', async () => {
    const r = await call(blueskyCredentials, 'GET');
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({
      configured: false,
      handle: null,
      encryptionReady: true,
    });
  });

  it('PUT : un handle sans domaine est refusé avant tout appel', async () => {
    const r = await call(blueskyCredentials, 'PUT', {
      body: { handle: 'womenscup', appPassword: 'abcd-efgh-ijkl-mnop' },
    });
    expect(r.statusCode).toBe(400);
    expect(secrets.setIntegrationSecret).not.toHaveBeenCalled();
  });

  it('PUT : le mot de passe DU COMPTE (hors format) est refusé', async () => {
    const r = await call(blueskyCredentials, 'PUT', {
      body: { handle: 'womenscup.bsky.social', appPassword: 'hunter2' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toMatch(/mot de passe d’application/);
  });
});

describe('/api/admin/social-posts', () => {
  it('POST : corps invalide → 400 avec `details`', async () => {
    const r = await call(socialPosts, 'POST', { body: { text: '' } });
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toBe('Requête invalide.');
    expect(Array.isArray(r.body.details)).toBe(true);
  });

  it('POST : sans `dryRun: false`, un aperçu — rien n’est publié', async () => {
    const r = await call(socialPosts, 'POST', {
      body: { text: 'Bonjour', targets: [{ platform: 'site_news' }] },
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.dryRun).toBe(true);
    expect(store.social_posts ?? []).toHaveLength(0);
  });

  it('405 sur DELETE', async () => {
    const r = await call(socialPosts, 'DELETE');
    expect(r.statusCode).toBe(405);
  });
});

describe('GET /api/admin/disputes', () => {
  it('400 sur un tournament_id mal formé', async () => {
    const r = await call(disputes, 'GET', {
      query: { tournament_id: 'nope' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toBe('Invalid tournament_id');
  });

  it('400 sur une classification inconnue', async () => {
    const r = await call(disputes, 'GET', { query: { status: 'late' } });
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toBe('Invalid status');
  });

  it('405 sur POST', async () => {
    const r = await call(disputes, 'POST');
    expect(r.statusCode).toBe(405);
  });
});

describe('/api/admin/team-messages', () => {
  it('GET : sans tournoi en cours, liste vide et variables du gabarit', async () => {
    const r = await call(teamMessages, 'GET');
    expect(r.statusCode).toBe(200);
    expect(r.body.tournament).toBeNull();
    expect(r.body.teams).toEqual([]);
  });

  it('POST : gabarit personnalisé vide → 400', async () => {
    const r = await call(teamMessages, 'POST', {
      body: { preset: 'custom', template: '   ' },
    });
    expect(r.statusCode).toBe(400);
    expect(loadRoster).not.toHaveBeenCalled();
  });

  it('POST : sans tournoi en cours → 409', async () => {
    const r = await call(teamMessages, 'POST', { body: {} });
    expect(r.statusCode).toBe(409);
  });
});

describe('GET /api/admin/docs/openapi', () => {
  it('YAML par défaut', async () => {
    const r = await call(openapiSpec, 'GET');
    expect(r.statusCode).toBe(200);
    expect(r.headers['Content-Type']).toMatch(/text\/yaml/);
    expect(String(r.body)).toContain('openapi');
  });

  it('JSON sur `?format=json`', async () => {
    const r = await call(openapiSpec, 'GET', { query: { format: 'json' } });
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ openapi: '3.1.0', paths: {} });
  });

  it('spec illisible → 500 historique', async () => {
    spec.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const r = await call(openapiSpec, 'GET', { query: { format: 'json' } });
    expect(r.statusCode).toBe(500);
    expect(r.body.error).toBe('Failed to read OpenAPI spec');
  });
});
