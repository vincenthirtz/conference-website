// tests/unit/cronHeartbeat.test.ts
//
// Heartbeat des crons throttlé à 15 min : `draft-auto-pick` (chaque minute) et
// `checkin-process` (5 min) réécrivaient `site_settings` à chaque passage.
// Contrat :
//   - premier passage d'une instance → écrit ;
//   - passages suivants < 15 min → n'écrivent pas ;
//   - ≥ 15 min → réécrit ;
//   - `force` (passage qui a agi) → écrit toujours ;
//   - 15 min reste sous le seuil d'alerte du dashboard (60 min).

import { describe, it, expect, beforeEach } from 'vitest';
import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  writeCronHeartbeat,
  CRON_HEARTBEAT_MIN_INTERVAL_MS,
  __resetCronHeartbeatsForTests,
} from '../../utils/cronHeartbeat';

const KEY = 'last_cron_test_at';
const T0 = Date.parse('2026-10-06T12:00:00Z');

function heartbeat(): string | undefined {
  return (store.site_settings as any[] | undefined)?.find((r) => r.key === KEY)
    ?.value;
}

beforeEach(() => {
  resetSupabaseMock();
  store.site_settings = [];
  __resetCronHeartbeatsForTests();
});

describe('writeCronHeartbeat()', () => {
  it('écrit au premier passage', async () => {
    expect(await writeCronHeartbeat(KEY, 'd', { nowMs: T0 })).toBe(true);
    expect(heartbeat()).toBe(new Date(T0).toISOString());
  });

  it("n'écrit pas de nouveau avant 15 min", async () => {
    await writeCronHeartbeat(KEY, 'd', { nowMs: T0 });
    const wrote = await writeCronHeartbeat(KEY, 'd', {
      nowMs: T0 + CRON_HEARTBEAT_MIN_INTERVAL_MS - 1,
    });
    expect(wrote).toBe(false);
    expect(heartbeat()).toBe(new Date(T0).toISOString());
  });

  it('réécrit passé 15 min', async () => {
    await writeCronHeartbeat(KEY, 'd', { nowMs: T0 });
    const later = T0 + CRON_HEARTBEAT_MIN_INTERVAL_MS;
    expect(await writeCronHeartbeat(KEY, 'd', { nowMs: later })).toBe(true);
    expect(heartbeat()).toBe(new Date(later).toISOString());
  });

  it('force écrit même dans la fenêtre (passage qui a agi)', async () => {
    await writeCronHeartbeat(KEY, 'd', { nowMs: T0 });
    const soon = T0 + 60_000;
    expect(
      await writeCronHeartbeat(KEY, 'd', { nowMs: soon, force: true })
    ).toBe(true);
    expect(heartbeat()).toBe(new Date(soon).toISOString());
  });

  it('les clés sont throttlées indépendamment', async () => {
    await writeCronHeartbeat(KEY, 'd', { nowMs: T0 });
    expect(
      await writeCronHeartbeat('last_cron_other_at', 'd', { nowMs: T0 + 1 })
    ).toBe(true);
  });

  it('le pas reste sous le seuil d’alerte du dashboard (60 min)', () => {
    expect(CRON_HEARTBEAT_MIN_INTERVAL_MS).toBeLessThan(60 * 60_000);
  });

  it('écrit scopé au tenant par défaut', async () => {
    await writeCronHeartbeat(KEY, 'd', { nowMs: T0 });
    const row = (store.site_settings as any[]).find((r) => r.key === KEY);
    expect(typeof row.tenant_id).toBe('string');
    expect(row.tenant_id.length).toBeGreaterThan(0);
  });
});
