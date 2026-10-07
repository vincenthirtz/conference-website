// tests/unit/webhookDispatcherProbe.test.ts
//
// Dispatcher des webhooks sortants : sans AUCUN abonnement actif, le tick ne
// relit plus 24 h d'outbox (1 440 lectures/jour pour rien). La question
// « quelqu'un est-il abonné ? » est posée d'abord, et mémorisée 5 min.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  store,
  resetSupabaseMock,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import {
  runWebhookDispatcher,
  invalidateWebhookAnySubCache,
} from '../../pages/api/cron/webhook-dispatch';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const NOW = '2026-10-06T12:00:00.000Z';

function reads(spy: ReturnType<typeof vi.spyOn>, table: string): number {
  return spy.mock.calls.filter((c: unknown[]) => c[0] === table).length;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  resetSupabaseMock();
  invalidateWebhookAnySubCache();
  store.webhook_subscriptions = [];
  store.webhook_deliveries = [];
  store.bot_event_outbox = [
    {
      id: 1,
      event_id: 'evt-1',
      // Hors liste blanche : la lecture de l'outbox a lieu (c'est ce qu'on
      // compte) mais aucun envoi réseau ne part pendant le test.
      event_name: 'zz.not.whitelisted',
      tenant_id: TENANT,
      payload: {},
      created_at: NOW,
      status: 'pending',
    },
  ] as any;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('webhook-dispatch — sonde « au moins un abonnement »', () => {
  it('sans abonnement, l’outbox n’est pas lue', async () => {
    const spy = vi.spyOn(supabaseAdmin as any, 'from');
    const counters = await runWebhookDispatcher();
    expect(reads(spy, 'bot_event_outbox')).toBe(0);
    expect(counters.events_examined).toBe(0);
  });

  it('la réponse négative est mémorisée 5 min', async () => {
    const spy = vi.spyOn(supabaseAdmin as any, 'from');
    await runWebhookDispatcher();
    await runWebhookDispatcher();
    await runWebhookDispatcher();
    expect(reads(spy, 'webhook_subscriptions')).toBe(1);

    vi.setSystemTime(new Date(Date.parse(NOW) + 5 * 60_000 + 1));
    await runWebhookDispatcher();
    expect(reads(spy, 'webhook_subscriptions')).toBe(2);
  });

  it('avec un abonnement actif, le tick complet tourne', async () => {
    store.webhook_subscriptions = [
      {
        id: 'sub-1',
        tenant_id: TENANT,
        url: 'https://example.invalid/hook',
        secret: 's',
        event_types: ['*'],
        consecutive_failures: 0,
        enabled: true,
      },
    ] as any;
    const spy = vi.spyOn(supabaseAdmin as any, 'from');
    await runWebhookDispatcher();
    expect(reads(spy, 'bot_event_outbox')).toBe(1);
  });

  it('un abonnement désactivé ne compte pas', async () => {
    store.webhook_subscriptions = [
      {
        id: 'sub-off',
        tenant_id: TENANT,
        url: 'https://example.invalid/hook',
        secret: 's',
        event_types: ['*'],
        consecutive_failures: 0,
        enabled: false,
      },
    ] as any;
    const spy = vi.spyOn(supabaseAdmin as any, 'from');
    await runWebhookDispatcher();
    expect(reads(spy, 'bot_event_outbox')).toBe(0);
  });
});
