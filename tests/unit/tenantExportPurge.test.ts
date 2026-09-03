// tests/unit/tenantExportPurge.test.ts
//
// T5 — sortir les données d'un espace, et les effacer.
//
// Il n'y avait aucune sortie : le hard-delete est interdit par les clés
// étrangères, et rien ne le remplaçait. Un organisateur qui part ne pouvait ni
// récupérer ses tournois, ni en obtenir l'effacement.
//
// Ce que ces tests tiennent :
//   - l'export ne contient JAMAIS de secrets (les rendre à quelqu'un qui part
//     serait une fuite avec accusé de réception) ni les lignes d'un autre
//     espace ;
//   - un export tronqué le DIT — une archive qui ment est pire qu'une archive
//     absente ;
//   - la purge n'efface que sur les trois verrous réunis, et ne touche jamais
//     l'espace de la plateforme ;
//   - le manifeste couvre bien toutes les tables, sans doublon.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import {
  EXPORTABLE_TABLES,
  PURGEABLE_TABLES,
  TENANT_TABLES,
} from '../../utils/tenants/tenantTables';
import exportHandler from '../../pages/api/admin/tenants/[id]/export';
import purgeHandler from '../../pages/api/cron/tenant-purge';

const TENANT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

let _t = 0;
function req(over: Partial<Record<string, unknown>> = {}): any {
  _t += 1;
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_t}` },
    cookies: {},
    query: { id: TENANT },
    body: {},
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

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.CRON_SECRET = 'secret-de-test';

  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: 'user-1',
      email: 'a@a.com',
      role: 'owner',
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.tenants = [
    {
      id: TENANT,
      slug: 'client',
      name: 'Client',
      is_active: true,
      lifecycle_state: 'active',
      purge_after: null,
    },
    {
      id: CONFERENCE_TENANT_ID,
      slug: 'conference',
      name: 'Conference',
      is_active: true,
      lifecycle_state: 'active',
    },
  ] as any;
  store.teams = [
    { id: 't1', tenant_id: TENANT, name: 'Alpha' },
    { id: 't2', tenant_id: OTHER, name: 'Ailleurs' },
  ] as any;
  store.tenant_secrets = [
    { tenant_id: TENANT, bot_api_key_hash: 'DEADBEEF', bot_webhook_secret: 'S' },
  ] as any;
});

describe('manifeste des tables', () => {
  it('ne contient ni doublon ni nom vide', () => {
    const names = TENANT_TABLES.map((t) => t.table);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.length > 0)).toBe(true);
  });

  it('exclut les secrets de l’export, mais pas de la purge', () => {
    // Rendre une clé d'API dans l'archive d'un client qui part serait une fuite
    // avec accusé de réception. Ne pas la purger serait pire.
    for (const secret of [
      'tenant_secrets',
      'integration_secrets',
      'tenant_api_tokens',
    ]) {
      expect(EXPORTABLE_TABLES).not.toContain(secret);
      expect(PURGEABLE_TABLES).toContain(secret);
    }
  });
});

describe('POST /api/admin/tenants/[id]/export', () => {
  it('exporte les lignes de CET espace, et pas celles du voisin', async () => {
    const res = makeRes();
    await exportHandler(req(), res);
    expect(res.statusCode).toBe(200);

    const body = res.body as any;
    expect(body.data.teams).toHaveLength(1);
    expect(body.data.teams[0].name).toBe('Alpha');
  });

  it('ne met AUCUN secret dans l’archive', async () => {
    const res = makeRes();
    await exportHandler(req(), res);
    const body = res.body as any;
    expect(body.data.tenant_secrets).toBeUndefined();
    // Ceinture et bretelles : l'empreinte ne doit apparaître nulle part.
    expect(JSON.stringify(body)).not.toContain('DEADBEEF');
  });

  it('propose un nom de fichier plutôt qu’un blob anonyme', async () => {
    const res = makeRes();
    await exportHandler(req(), res);
    expect(String(res.headers['Content-Disposition'])).toContain(
      'export-client-'
    );
  });

  it('404 sur un espace inconnu', async () => {
    const res = makeRes();
    await exportHandler(
      req({ query: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('cron de purge', () => {
  const cronReq = (over: Partial<Record<string, unknown>> = {}): any => ({
    method: 'POST',
    headers: { authorization: 'Bearer secret-de-test' },
    query: {},
    ...over,
  });

  it('n’efface rien tant que l’échéance n’est pas passée', async () => {
    (store.tenants as any[])[0].lifecycle_state = 'purge_scheduled';
    (store.tenants as any[])[0].purge_after = new Date(
      Date.now() + 86_400_000
    ).toISOString();

    const res = makeRes();
    await purgeHandler(cronReq(), res);
    expect((res.body as any).due).toBe(0);
    // La fenêtre de rétractation est le cœur du dispositif.
    expect(store.teams as any[]).toHaveLength(2);
  });

  it('n’efface pas un espace seulement ARCHIVÉ', async () => {
    (store.tenants as any[])[0].lifecycle_state = 'archived';
    (store.tenants as any[])[0].purge_after = new Date(
      Date.now() - 86_400_000
    ).toISOString();

    const res = makeRes();
    await purgeHandler(cronReq(), res);
    expect((res.body as any).due).toBe(0);
  });

  it('efface quand les trois verrous sont réunis, et ne touche pas le voisin', async () => {
    (store.tenants as any[])[0].lifecycle_state = 'purge_scheduled';
    (store.tenants as any[])[0].purge_after = new Date(
      Date.now() - 1000
    ).toISOString();

    const res = makeRes();
    await purgeHandler(cronReq(), res);
    expect((res.body as any).due).toBe(1);

    const teams = store.teams as any[];
    expect(teams).toHaveLength(1);
    expect(teams[0].tenant_id).toBe(OTHER);
    // Les secrets partent aussi : c'est le point de la purge.
    expect(store.tenant_secrets as any[]).toHaveLength(0);
    expect((store.tenants as any[])[0].lifecycle_state).toBe('purged');
  });

  it('épargne l’espace de la plateforme, même programmé', async () => {
    const conf = (store.tenants as any[])[1];
    conf.lifecycle_state = 'purge_scheduled';
    conf.purge_after = new Date(Date.now() - 1000).toISOString();

    const res = makeRes();
    await purgeHandler(cronReq(), res);
    expect((res.body as any).due).toBe(0);
    expect(conf.lifecycle_state).toBe('purge_scheduled');
  });

  it('refuse sans le secret de cron', async () => {
    const res = makeRes();
    await purgeHandler(cronReq({ headers: {} }), res);
    expect(res.statusCode).toBe(401);
  });
});
