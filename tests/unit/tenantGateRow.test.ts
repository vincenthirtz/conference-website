// tests/unit/tenantGateRow.test.ts
//
// Une seule lecture `tenants` pour les trois contrôles du chemin bot :
// existence (`isActiveTenantId`), cycle de vie (`getTenantLifecycle`) et plan
// (`loadTenantPlanStateForBot`). Avant, chacun relisait la même ligne avec son
// propre cache de 60 s — jusqu'à trois GET par appel bot sur un cache froid
// (4 326 GET `tenants`/jour mesurés).
//
// Contrat :
//   - trois contrôles enchaînés → UNE requête ;
//   - appels concurrents → une requête partagée ;
//   - erreur de lecture → jamais mise en cache, chaque appelant garde son repli ;
//   - ligne absente → jamais mise en cache (un tenant créé est vu tout de suite) ;
//   - TTL 120 s, puis relecture ; invalidation explicite → relecture immédiate.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  error: null as { message: string } | null,
  calls: 0,
}));

function buildClient() {
  const chain = (table: string) => {
    const api: any = {
      select: () => api,
      eq: () => api,
      maybeSingle: async () => {
        if (table === 'tenants') db.calls += 1;
        return { data: db.error ? null : db.row, error: db.error };
      },
    };
    return api;
  };
  return { supabaseAdmin: { from: chain }, getServerClient: () => ({}) };
}

vi.mock('@/utils/supabase', () => buildClient());
vi.mock('../../utils/supabase', () => buildClient());

import {
  loadTenantGateRow,
  invalidateTenantGateRow,
  TENANT_GATE_ROW_TTL_MS,
} from '../../utils/tenants/gateRow';
import {
  getTenantLifecycle,
  invalidateLifecycleCache,
} from '../../utils/tenants/lifecycle';
import { loadTenantPlanStateForBot } from '../../utils/billing/botPlanGate';
import {
  isActiveTenantId,
  __resetTenantLookupCachesForTests,
} from '../../utils/tenant';
import { logger } from '../../utils/logger';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const ROW = {
  id: TENANT,
  is_active: true,
  lifecycle_state: 'active',
  lifecycle_reason: null,
  purge_after: null,
  plan: 'regie',
  plan_status: 'active',
  plan_expires_at: null,
};

beforeEach(() => {
  db.row = { ...ROW };
  db.error = null;
  db.calls = 0;
  __resetTenantLookupCachesForTests();
  vi.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('gateRow — une lecture pour trois contrôles', () => {
  it('existence + cycle de vie + plan ne coûtent qu’une requête', async () => {
    expect(await isActiveTenantId(TENANT)).toBe(true);
    expect((await getTenantLifecycle(TENANT)).state).toBe('active');
    expect((await loadTenantPlanStateForBot(TENANT)).plan).toBe('regie');
    expect(db.calls).toBe(1);
  });

  it('des appels concurrents partagent la requête en vol', async () => {
    await Promise.all([
      loadTenantGateRow(TENANT),
      loadTenantGateRow(TENANT),
      getTenantLifecycle(TENANT),
    ]);
    expect(db.calls).toBe(1);
  });

  it('relit passé le TTL (120 s)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
    await loadTenantGateRow(TENANT);
    vi.setSystemTime(Date.now() + TENANT_GATE_ROW_TTL_MS - 1);
    await loadTenantGateRow(TENANT);
    expect(db.calls).toBe(1);
    vi.setSystemTime(Date.now() + 2);
    await loadTenantGateRow(TENANT);
    expect(db.calls).toBe(2);
  });

  it('un changement d’état invalidé est vu immédiatement', async () => {
    await getTenantLifecycle(TENANT);
    db.row = { ...ROW, lifecycle_state: 'suspended', lifecycle_reason: 'x' };
    invalidateLifecycleCache(TENANT);
    expect((await getTenantLifecycle(TENANT)).state).toBe('suspended');
    expect(db.calls).toBe(2);
  });

  it('une erreur n’est pas mise en cache, et chaque repli est conservé', async () => {
    db.error = { message: 'statement timeout' };
    expect(await isActiveTenantId(TENANT)).toBe(false);
    expect((await getTenantLifecycle(TENANT)).state).toBe('active');
    expect((await loadTenantPlanStateForBot(TENANT)).plan).toBe('discovery');
    expect(db.calls).toBe(3);

    db.error = null;
    expect((await loadTenantPlanStateForBot(TENANT)).plan).toBe('regie');
  });

  it('une ligne absente n’est pas gardée : le tenant créé ensuite est vu', async () => {
    db.row = null;
    expect((await getTenantLifecycle(TENANT)).state).toBe('purged');
    db.row = { ...ROW };
    expect((await getTenantLifecycle(TENANT)).state).toBe('active');
  });

  it('invalidateTenantGateRow() sans argument vide tout', async () => {
    await loadTenantGateRow(TENANT);
    invalidateTenantGateRow();
    await loadTenantGateRow(TENANT);
    expect(db.calls).toBe(2);
  });
});
