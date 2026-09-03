// tests/unit/apiAdminTenantAttachGuild.test.ts
//
// POST /api/admin/tenants/[id]/guilds — rattacher un serveur Discord à un
// espace, en partant de l'espace.
//
// Le seul chemin existant partait du SERVEUR (`pending-guild-links/:id/claim`)
// et exigeait une ligne d'attente. Vu depuis l'espace — « cet espace n'a aucun
// serveur » — il n'y avait rien : le manque était signalé sans moyen de le
// régler.
//
// Ce que ces tests verrouillent :
//   - la PORTÉE (owner de la plateforme, pas propriétaire d'un espace) ;
//   - le refus d'un serveur déjà pris par un AUTRE espace — le déplacer
//     silencieusement couperait le bot de l'espace d'origine ;
//   - l'idempotence sur un serveur déjà rattaché ici (double-clic, retry) ;
//   - `is_primary` sur le premier serveur seulement ;
//   - la purge de la ligne d'attente, sinon un serveur rattaché continuerait
//     de s'afficher « en attente ».

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';
import handler from '../../pages/api/admin/tenants/[id]/guilds';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAFF_ID = 'staff-1';
const GUILD_NEW = '111111111111111111';
const GUILD_TAKEN = '222222222222222222';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: 'Bearer t' },
    cookies: {},
    query: { id: TENANT_A },
    body: { guild_id: GUILD_NEW },
    ...over,
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function seedStaff(role: string, tenantRole: string | null = null) {
  store.staff = [
    {
      id: STAFF_ID,
      auth_user_id: 'user-1',
      email: 'a@a.com',
      role,
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: 'staff-hist', role: 'admin' },
    ...(tenantRole
      ? [{ tenant_id: TENANT_A, staff_id: STAFF_ID, role: tenantRole }]
      : []),
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateTenantAccessCache();
  setAuthUser({ id: 'user-1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  store.tenants = [
    { id: TENANT_A, slug: 'alpha', name: 'Alpha', is_active: true },
    { id: TENANT_B, slug: 'beta', name: 'Beta', is_active: true },
  ] as any;
  store.discord_guilds = [
    { guild_id: GUILD_TAKEN, tenant_id: TENANT_B, is_primary: true },
  ] as any;
  store.tenant_discord_config = [] as any;
  store.pending_guild_links = [
    { guild_id: GUILD_NEW, guild_name: 'Nouveau', owner_discord_id: null },
  ] as any;
  seedStaff('owner');
});

describe('portée', () => {
  it('refuse un propriétaire d’espace (owner chez lui, pas sur la plateforme)', async () => {
    seedStaff('caster', 'owner');
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(403);
    // Rien n'a été rattaché.
    expect((store.discord_guilds as any[]).length).toBe(1);
  });

  it('refuse un admin global (rattacher, c’est de l’onboarding)', async () => {
    seedStaff('admin');
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(403);
  });
});

describe('validation', () => {
  it('405 sur une autre méthode', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 sur un identifiant de serveur qui n’en est pas un', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { guild_id: 'pas-un-snowflake' } }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_GUILD_ID');
  });

  it('400 sur un id d’espace mal formé', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_TENANT_ID');
  });

  it('404 sur un espace inconnu', async () => {
    const res = makeRes();
    await handler(
      makeReq({ query: { id: '99999999-9999-4999-8999-999999999999' } }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('UNKNOWN_TENANT');
  });
});

describe('rattachement', () => {
  it('rattache le premier serveur en principal, et purge l’attente', async () => {
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(201);
    expect((res.body as any).status).toBe('linked');
    expect((res.body as any).is_primary).toBe(true);

    const link = (store.discord_guilds as any[]).find(
      (g) => g.guild_id === GUILD_NEW
    );
    expect(link.tenant_id).toBe(TENANT_A);
    expect(link.is_primary).toBe(true);

    // La ligne de config existe : c'est la cible du formulaire de réglages.
    expect(
      (store.tenant_discord_config as any[]).some(
        (c) => c.guild_id === GUILD_NEW
      )
    ).toBe(true);

    // L'attente est traitée : la laisser afficherait « en attente » un serveur
    // déjà rattaché.
    expect((store.pending_guild_links as any[]).length).toBe(0);
  });

  it('un second serveur n’est PAS principal', async () => {
    (store.discord_guilds as any[]).push({
      guild_id: '333333333333333333',
      tenant_id: TENANT_A,
      is_primary: true,
    });
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(201);
    // Deux serveurs « principaux » pour un même espace n'ont pas de sens : les
    // résolveurs du bot en choisiraient un au hasard.
    expect((res.body as any).is_primary).toBe(false);
  });

  it('déjà rattaché ICI → 200 idempotent, pas de doublon', async () => {
    (store.discord_guilds as any[]).push({
      guild_id: GUILD_NEW,
      tenant_id: TENANT_A,
      is_primary: true,
    });
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).status).toBe('already_linked');
    expect(
      (store.discord_guilds as any[]).filter((g) => g.guild_id === GUILD_NEW)
        .length
    ).toBe(1);
  });

  it('déjà rattaché AILLEURS → 409, sans rien déplacer', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { guild_id: GUILD_TAKEN } }), res);

    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('GUILD_TAKEN');
    // Le serveur reste chez son espace : le déplacer couperait le bot de
    // l'espace d'origine, sans que personne l'ait demandé.
    const link = (store.discord_guilds as any[]).find(
      (g) => g.guild_id === GUILD_TAKEN
    );
    expect(link.tenant_id).toBe(TENANT_B);
  });
});
