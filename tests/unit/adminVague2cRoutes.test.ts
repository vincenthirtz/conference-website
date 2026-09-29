// tests/unit/adminVague2cRoutes.test.ts
//
// Filet minimal des routes admin migrées en modules (vague serveur 2 / C) qui
// n'avaient aucun test : lobbies FFA, identifiants Instagram / TikTok,
// permissions et actions d'un compte, catalogue / engagement / cadeau
// d'accueil / lien d'overlay du TCG. Contrat HTTP d'origine : statuts,
// messages `error`, codes métier, slug de journal.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

const h = vi.hoisted(() => ({
  logStaffAction: vi.fn(async () => undefined),
  encryptionReady: true,
  readTcgEngagement: vi.fn(async (_t: string, _w: number) => ({
    ok: true as const,
    value: { players: [], weekly: [], totals: {} },
  })),
  resolveCurrentTournamentId: vi.fn(async () => null as string | null),
  getActiveOverlayToken: vi.fn(async () => null),
  revokeOverlayToken: vi.fn(async () => undefined),
}));

vi.mock('@/utils/staffLogs', () => ({ logStaffAction: h.logStaffAction }));
vi.mock('@/utils/integrationSecrets', () => ({
  hasIntegrationSecret: vi.fn(async () => false),
  isSecretEncryptionConfigured: () => h.encryptionReady,
  setIntegrationSecret: vi.fn(async () => undefined),
}));
vi.mock('@/utils/tcg/readEngagement', () => ({
  readTcgEngagement: h.readTcgEngagement,
}));
vi.mock('@/utils/currentTournament', () => ({
  resolveCurrentTournamentId: h.resolveCurrentTournamentId,
}));
vi.mock('@/utils/tcg/overlayToken', () => ({
  getActiveOverlayToken: h.getActiveOverlayToken,
  revokeOverlayToken: h.revokeOverlayToken,
  rotateOverlayToken: vi.fn(async () => null),
}));

import {
  resetSupabaseMock,
  setAuthUser,
  store,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import lobbyHandler from '../../pages/api/admin/lobbies/[lobbyId]';
import placementsHandler from '../../pages/api/admin/lobbies/[lobbyId]/placements';
import instagramSecretHandler from '../../pages/api/admin/instagram/secret';
import tiktokCredentialsHandler from '../../pages/api/admin/tiktok/credentials';
import permissionsHandler from '../../pages/api/admin/users/[userId]/permissions';
import actionsHandler from '../../pages/api/admin/users/[userId]/actions';
import catalogueHandler from '../../pages/api/admin/tcg/catalogue';
import engagementHandler from '../../pages/api/admin/tcg/engagement';
import welcomeGiftHandler from '../../pages/api/admin/tcg/welcome-gift';
import overlayTokenHandler from '../../pages/api/admin/tcg/overlay-token';

const LOBBY_ID = '3f0e8a52-5a8f-4c1e-9d2b-7a6c5e4d3b21';
const USER_ID = '6b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';

function staffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'o@o.com',
    role: 'owner',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let ip = 0;
function req(over: Record<string, unknown> = {}): any {
  ip += 1;
  return {
    method: 'GET',
    headers: {
      host: 'h',
      authorization: 'Bearer t-1',
      'x-forwarded-for': `203.0.113.${(ip % 250) + 1}`,
    },
    socket: { remoteAddress: '127.0.0.1' },
    cookies: {},
    query: {},
    body: {},
    ...over,
  };
}

function res(): any {
  const r: any = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c: number) => ((r.statusCode = c), r);
  r.json = (b: unknown) => ((r.body = b), r);
  r.end = () => r;
  r.setHeader = (k: string, v: unknown) => {
    r.headers[k] = v;
  };
  return r;
}

async function call(handler: any, over: Record<string, unknown>) {
  const r = res();
  await handler(req(over), r);
  return r;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  h.logStaffAction.mockClear();
  h.encryptionReady = true;
  setAuthUser({ id: 'user-1' });
  store.staff = [staffRow()] as any;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('lobbies FFA', () => {
  it('DELETE : lobbyId invalide → 400 « Invalid lobbyId »', async () => {
    const r = await call(lobbyHandler, {
      method: 'DELETE',
      query: { lobbyId: 'nope' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toBe('Invalid lobbyId');
  });

  it('DELETE : lobby inconnu → 404', async () => {
    const r = await call(lobbyHandler, {
      method: 'DELETE',
      query: { lobbyId: LOBBY_ID },
    });
    expect(r.statusCode).toBe(404);
    expect(r.body.error).toBe('Lobby not found');
  });

  it('DELETE : supprime et journalise sous `update_stage` / delete_lobby', async () => {
    store.lobbies = [
      { id: LOBBY_ID, tournament_id: 't-1', stage_id: 's-1' },
    ] as any;
    const r = await call(lobbyHandler, {
      method: 'DELETE',
      query: { lobbyId: LOBBY_ID },
    });
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ success: true });
    expect(h.logStaffAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update_stage',
        entity_type: 'lobby',
        entity_id: LOBBY_ID,
        tournament_id: 't-1',
        payload: { action: 'delete_lobby', stageId: 's-1' },
      })
    );
  });

  it('PUT placements : `entries` absent → 400 avec le message d’origine', async () => {
    const r = await call(placementsHandler, {
      method: 'PUT',
      query: { lobbyId: LOBBY_ID },
      body: {},
    });
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toBe('entries must be an array');
  });
});

describe('identifiants des réseaux sociaux', () => {
  it('Instagram PUT : chiffrement absent → 503', async () => {
    h.encryptionReady = false;
    const r = await call(instagramSecretHandler, {
      method: 'PUT',
      body: { appSecret: 'a'.repeat(32) },
    });
    expect(r.statusCode).toBe(503);
  });

  it('Instagram PUT : forme invalide → 400, rien de journalisé', async () => {
    const r = await call(instagramSecretHandler, {
      method: 'PUT',
      body: { appSecret: 'pas-un-secret' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toMatch(/32 caractères hexadécimaux/);
    expect(h.logStaffAction).not.toHaveBeenCalled();
  });

  it('Instagram PUT : enregistre et journalise SANS la valeur', async () => {
    const r = await call(instagramSecretHandler, {
      method: 'PUT',
      body: { appSecret: 'a'.repeat(32) },
    });
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ ok: true, secretSet: true });
    const entry = (h.logStaffAction.mock.calls[0] as any[])[0];
    expect(entry.action).toBe('store_social_credentials');
    expect(JSON.stringify(entry)).not.toContain('a'.repeat(32));
  });

  it('TikTok PUT : paire incomplète → 400', async () => {
    const r = await call(tiktokCredentialsHandler, {
      method: 'PUT',
      body: { clientKey: 'abc' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toMatch(/^Client key et client secret sont requis/);
  });
});

describe('comptes', () => {
  it('permissions GET : compte non staff → 404', async () => {
    const r = await call(permissionsHandler, {
      method: 'GET',
      query: { userId: USER_ID },
    });
    expect(r.statusCode).toBe(404);
    expect(r.body.error).toBe('Ce compte n’est pas membre du staff.');
  });

  it('actions POST : action inconnue → 400 « Unsupported action »', async () => {
    const r = await call(actionsHandler, {
      method: 'POST',
      query: { userId: USER_ID },
      body: { action: 'nope' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toBe('Unsupported action');
  });

  it('actions POST : userId invalide → 400 « Invalid userId »', async () => {
    const r = await call(actionsHandler, {
      method: 'POST',
      query: { userId: 'x' },
      body: { action: 'assign_captain' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toBe('Invalid userId');
  });
});

describe('TCG', () => {
  it('catalogue : userId mal formé → 400 INVALID_USER_ID', async () => {
    const r = await call(catalogueHandler, { query: { userId: 'x' } });
    expect(r.statusCode).toBe(400);
    expect(r.body.code).toBe('INVALID_USER_ID');
  });

  it('engagement : `weeks` borné à 26', async () => {
    const r = await call(engagementHandler, { query: { weeks: '99' } });
    expect(r.statusCode).toBe(200);
    expect(h.readTcgEngagement).toHaveBeenCalledWith(expect.any(String), 26);
  });

  it('cadeau d’accueil : aucune édition en cours → 200, rien distribué ni journalisé', async () => {
    const r = await call(welcomeGiftHandler, { method: 'POST' });
    expect(r.statusCode).toBe(200);
    expect(r.body.tournamentId).toBeNull();
    expect(r.body.granted).toBe(0);
    expect(h.logStaffAction).not.toHaveBeenCalled();
  });

  it('lien d’overlay : GET sans lien actif, DELETE journalisé sans jeton', async () => {
    const got = await call(overlayTokenHandler, { method: 'GET' });
    expect(got.body).toEqual({ url: null, createdAt: null, lastUsedAt: null });

    const del = await call(overlayTokenHandler, { method: 'DELETE' });
    expect(del.statusCode).toBe(200);
    expect(h.revokeOverlayToken).toHaveBeenCalled();
    expect(h.logStaffAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tcg_overlay_token_revoke',
        entity_type: 'broadcast',
        payload: { mode: 'tcg-overlay-token-revoked' },
      })
    );
  });
});
