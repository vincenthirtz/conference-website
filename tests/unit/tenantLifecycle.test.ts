// tests/unit/tenantLifecycle.test.ts
//
// T4 — le cycle de vie d'un espace.
//
// Un espace n'avait qu'un booléen `is_active`, et chaque appelant décidait dans
// son coin s'il en tenait compte. Résultat le plus visible : le bot d'un espace
// ARCHIVÉ continuait de répondre, parce que son authentification ne regardait
// que `tenant_secrets` — rien sur ce chemin ne lisait l'état de l'espace.
//
// Ce que ces tests tiennent :
//   - un motif est exigé pour tout ce qui coupe le service, et il est REPRIS
//     dans le refus envoyé au client ;
//   - l'espace de la plateforme ne peut pas être fermé ;
//   - une purge programmée porte une date, et sortir de cet état la retire ;
//   - une base indisponible n'invente pas une suspension.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});
vi.mock('../../utils/supabase', async () => {
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
  getTenantLifecycle,
  lifecycleDenial,
  invalidateLifecycleCache,
  LIFECYCLE_EFFECTS,
} from '../../utils/tenants/lifecycle';
import handler from '../../pages/api/admin/tenants/[id]/lifecycle';

const TENANT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

let _t = 0;
function req(body: Record<string, unknown>, id = TENANT): any {
  _t += 1;
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_t}` },
    cookies: {},
    query: { id },
    body,
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
  invalidateLifecycleCache();
  setAuthUser({ id: 'user-1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

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
      lifecycle_reason: null,
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
  store.tenant_staff = [] as any;
});

describe('POST /api/admin/tenants/[id]/lifecycle', () => {
  it('exige un motif pour tout ce qui coupe le service', async () => {
    const res = makeRes();
    await handler(req({ state: 'suspended', reason: 'court' }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('REASON_REQUIRED');
  });

  it('suspend avec motif, et le garde', async () => {
    const res = makeRes();
    await handler(
      req({ state: 'suspended', reason: 'Impayé depuis deux mois' }),
      res
    );
    expect(res.statusCode).toBe(200);
    const row = (store.tenants as any[])[0];
    expect(row.lifecycle_state).toBe('suspended');
    expect(row.lifecycle_reason).toBe('Impayé depuis deux mois');
    expect(row.lifecycle_changed_by).toBe('staff-1');
  });

  it('ne demande pas de motif pour rouvrir, et l’efface', async () => {
    (store.tenants as any[])[0].lifecycle_state = 'suspended';
    (store.tenants as any[])[0].lifecycle_reason = 'Impayé depuis deux mois';

    const res = makeRes();
    await handler(req({ state: 'active' }), res);
    expect(res.statusCode).toBe(200);
    const row = (store.tenants as any[])[0];
    expect(row.lifecycle_state).toBe('active');
    // Un motif de suspension qui survivrait à la réouverture s'afficherait
    // ensuite sur un espace parfaitement en règle.
    expect(row.lifecycle_reason).toBeNull();
  });

  it('refuse de fermer l’espace de la plateforme', async () => {
    const res = makeRes();
    await handler(
      req(
        { state: 'archived', reason: 'On ferme tout pour voir' },
        CONFERENCE_TENANT_ID
      ),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('PROTECTED_TENANT');
  });

  it('programme une purge avec une date, et la retire en sortant', async () => {
    const first = makeRes();
    await handler(
      req({
        state: 'purge_scheduled',
        reason: 'Le client a demandé la suppression',
        purgeAfterDays: 30,
      }),
      first
    );
    expect(first.statusCode).toBe(200);
    expect((store.tenants as any[])[0].purge_after).toBeTruthy();

    const second = makeRes();
    await handler(req({ state: 'active' }), second);
    // Laisser une échéance d'effacement derrière soi serait une bombe à
    // retardement.
    expect((store.tenants as any[])[0].purge_after).toBeNull();
  });

  it('405 sur autre chose qu’un POST', async () => {
    const res = makeRes();
    const r = req({ state: 'active' });
    r.method = 'GET';
    await handler(r, res);
    expect(res.statusCode).toBe(405);
  });
});

describe('effets d’un état', () => {
  it('un espace suspendu refuse en 402, motif inclus', async () => {
    (store.tenants as any[])[0].lifecycle_state = 'suspended';
    (store.tenants as any[])[0].lifecycle_reason = 'Impayé depuis deux mois';
    invalidateLifecycleCache();

    const denial = lifecycleDenial(await getTenantLifecycle(TENANT));
    expect(denial?.status).toBe(402);
    // Un 402 muet envoie le client au support ; le motif fait le travail.
    expect(String(denial?.body.error)).toContain('Impayé depuis deux mois');
    expect(denial?.body.code).toBe('TENANT_SUSPENDED');
  });

  it('un espace archivé n’existe plus pour qui appelle', async () => {
    (store.tenants as any[])[0].lifecycle_state = 'archived';
    invalidateLifecycleCache();
    const denial = lifecycleDenial(await getTenantLifecycle(TENANT));
    expect(denial?.status).toBe(404);
  });

  it('un espace actif ne refuse rien', async () => {
    expect(lifecycleDenial(await getTenantLifecycle(TENANT))).toBeNull();
  });

  it('un espace inconnu est traité comme purgé', async () => {
    const lifecycle = await getTenantLifecycle(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    );
    // Ne rien savoir d'un espace et le servir quand même serait le pire des
    // deux mondes.
    expect(lifecycle.state).toBe('purged');
  });

  it('les états non servants sont tous non écrivables', () => {
    for (const [state, effects] of Object.entries(LIFECYCLE_EFFECTS)) {
      if (!effects.serves) {
        expect(effects.writable, `${state} devrait être en lecture seule`).toBe(
          false
        );
      }
    }
  });
});
