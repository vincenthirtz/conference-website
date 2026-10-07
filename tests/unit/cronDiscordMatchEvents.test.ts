// Unit tests for the Discord match-events catch-up cron.
// Target: pages/api/cron/discord-match-events.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

vi.mock('@/utils/botEvents', () => ({
  pushBotEventDirect: vi.fn(async () => ({ delivered: true, attempts: 1 })),
}));
vi.mock('@/utils/matches/botEventEnrich', () => ({
  enrichMatchEvent: vi.fn(async () => null),
}));

import { pushBotEventDirect } from '@/utils/botEvents';
import { runDiscordMatchEvents } from '../../pages/api/cron/discord-match-events';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NOW = new Date('2026-10-08T10:00:00Z');

function match(over: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    tenant_id: TENANT,
    tournament_id: 't-1',
    scrim_id: null,
    status: 'pending',
    deleted_at: null,
    discord_scheduled_event_id: null,
    scheduled_at: '2026-10-09T17:00:00+00:00',
    ...over,
  };
}

const push = vi.mocked(pushBotEventDirect);

beforeEach(() => {
  resetSupabaseMock();
  push.mockClear();
  push.mockResolvedValue({ delivered: true, attempts: 1 });
});

describe('runDiscordMatchEvents', () => {
  it('signale au bot un match du lendemain sans event Discord', async () => {
    store.matches = [match()];
    const r = await runDiscordMatchEvents(NOW);
    expect(r).toMatchObject({ candidates: 1, delivered: 1, failed: 0 });
    expect(push).toHaveBeenCalledWith(
      'match.scheduled',
      expect.objectContaining({
        matchId: 'm-1',
        tournamentId: 't-1',
        scheduledAt: '2026-10-09T17:00:00+00:00',
      }),
      TENANT
    );
  });

  it('ignore les matchs déjà pourvus, finis, supprimés, passés ou hors horizon', async () => {
    store.matches = [
      match({ id: 'has-event', discord_scheduled_event_id: '123' }),
      match({ id: 'finished', status: 'finished' }),
      match({ id: 'deleted', deleted_at: '2026-10-01T00:00:00Z' }),
      match({ id: 'past', scheduled_at: '2026-10-08T09:00:00+00:00' }),
      match({ id: 'far', scheduled_at: '2026-10-10T00:00:00+00:00' }),
    ];
    const r = await runDiscordMatchEvents(NOW);
    expect(r.candidates).toBe(0);
    expect(push).not.toHaveBeenCalled();
  });

  it('compte une livraison échouée sans interrompre le lot', async () => {
    store.matches = [
      match({ id: 'a', scheduled_at: '2026-10-09T17:00:00+00:00' }),
      match({ id: 'b', scheduled_at: '2026-10-09T18:30:00+00:00' }),
    ];
    push.mockResolvedValueOnce({
      delivered: false,
      error: 'HTTP 502',
      attempts: 3,
    });
    const r = await runDiscordMatchEvents(NOW);
    expect(r).toMatchObject({ candidates: 2, delivered: 1, failed: 1 });
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('dry_run liste sans livrer', async () => {
    store.matches = [match()];
    const r = await runDiscordMatchEvents(NOW, true);
    expect(r).toMatchObject({ candidates: 1, dryRun: true });
    expect(push).not.toHaveBeenCalled();
  });
});
