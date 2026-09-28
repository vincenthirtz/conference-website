// tests/unit/apiAdminFreePlayers.test.ts — /api/admin/free-players, premier
// module migré sur `defineAdminRoute` (pilote L2/L3). Le contrat de réponse
// est celui d'avant la migration : l'écran staff n'a pas bougé.

import { describe, it, expect, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import handler from '../../pages/api/admin/free-players';
import { listFreePlayers } from '../../features/admin/free-players/service';
import { logger } from '../../utils/logger';

const OTHER_TENANT = '99999999-9999-4999-8999-999999999999';

function staffRow(role: StaffMember['role']): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let n = 0;
function req(over: Record<string, unknown> = {}): any {
  n += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-fp-${n}` },
    cookies: {},
    query: {},
    body: {},
    ...over,
  };
}

function res(): any {
  return {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, unknown>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
  };
}

function fp(over: Record<string, unknown>) {
  return {
    tenant_id: DEFAULT_TENANT_ID,
    source: 'web',
    discord_user_id: null,
    discord_username: null,
    auth_user_id: null,
    display_name: null,
    roles: ['tank'],
    availability: null,
    level: null,
    note: null,
    contact_email: null,
    contact_discord: null,
    marked_at: '2026-09-01T00:00:00.000Z',
    expires_at: null,
    share_across_tenants: false,
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateTenantAccessCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [staffRow('admin')] as any;
  (store as any).staff_logs = [];
  (store as any).free_players = [
    fp({
      id: 'fp-web',
      display_name: 'Alice',
      contact_email: 'alice@example.org',
      marked_at: '2026-09-02T00:00:00.000Z',
    }),
    fp({ id: 'fp-discord', source: 'discord', discord_username: 'bob#1' }),
    fp({ id: 'fp-other', tenant_id: OTHER_TENANT, display_name: 'Zoé' }),
  ];
});

describe('GET /api/admin/free-players', () => {
  it('liste les fiches du tenant, coordonnées comprises, plus récentes d’abord', async () => {
    const r = res();
    await handler(req(), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.items.map((i: any) => i.id)).toEqual([
      'fp-web',
      'fp-discord',
    ]);
    expect(r.body.items[0]).toMatchObject({
      source: 'web',
      name: 'Alice',
      contactEmail: 'alice@example.org',
    });
    expect(r.body.items[1]).toMatchObject({ source: 'discord', name: 'bob#1' });
  });

  it('403 pour un rôle sans manage_teams', async () => {
    store.staff = [staffRow('referee')] as any;
    const r = res();
    await handler(req(), r);
    expect(r.statusCode).toBe(403);
  });

  it('le service se teste sans HTTP', async () => {
    const out = await listFreePlayers({
      db: (await import('../../utils/supabase')).supabaseAdmin,
      tenantId: OTHER_TENANT,
      actor: { kind: 'system' },
      logger,
    });
    expect(out.items.map((i) => i.id)).toEqual(['fp-other']);
  });
});

describe('DELETE /api/admin/free-players', () => {
  it('retire une fiche web, journalise, willReturn=false', async () => {
    const r = res();
    await handler(req({ method: 'DELETE', query: { id: 'fp-web' } }), r);
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ success: true, willReturn: false });
    expect((store as any).free_players.map((x: any) => x.id)).not.toContain(
      'fp-web'
    );
    expect((store as any).staff_logs[0]).toMatchObject({
      action: 'delete_free_player',
      entity_type: 'free_player',
      entity_id: 'fp-web',
      payload: { source: 'web', name: 'Alice' },
    });
  });

  it('prévient qu’une fiche Discord reviendra', async () => {
    const r = res();
    await handler(req({ method: 'DELETE', query: { id: 'fp-discord' } }), r);
    expect(r.body.willReturn).toBe(true);
  });

  it('400 sans id, 404 hors tenant — et rien n’est journalisé', async () => {
    const noId = res();
    await handler(req({ method: 'DELETE' }), noId);
    expect(noId.statusCode).toBe(400);
    expect(noId.body.error).toBe('id manquant.');

    const other = res();
    await handler(req({ method: 'DELETE', query: { id: 'fp-other' } }), other);
    expect(other.statusCode).toBe(404);
    expect(other.body.error).toBe('Fiche introuvable.');
    expect((store as any).free_players).toHaveLength(3);
    expect((store as any).staff_logs).toHaveLength(0);
  });

  it('405 + Allow sur une méthode non gérée', async () => {
    const r = res();
    await handler(req({ method: 'POST' }), r);
    expect(r.statusCode).toBe(405);
    expect(r.headers.Allow).toBe('GET,DELETE');
  });
});
