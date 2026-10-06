// Compteur « check-in en attente » de la cloche (lot P3).
// Target: features/player/notifications/service/counters.ts —
// `computeCheckinPending`.
//
// Depuis la règle du 2026-09-17, seules la capitaine, le coach et la manager
// pointent (utils/teams/canCheckIn.ts). Le compteur comptait 1 pour TOUTE
// membre : une joueuse simple voyait une pastille pour un geste qu'elle ne
// peut pas faire. Même filtre désormais que le bandeau « à faire ».

import { beforeEach, describe, expect, it } from 'vitest';

import {
  store,
  resetSupabaseMock,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { computeCheckinPending } from '../../features/player/notifications/service/counters';
import type { NotificationsCtx } from '../../features/player/notifications/service/context';
import { logger } from '../../utils/logger';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TEAM = 'team-a';
const CAPTAIN = 'user-captain';
const COACH = 'user-coach';
const PLAYER = 'user-player';

const inMinutes = (n: number) =>
  new Date(Date.now() + n * 60_000).toISOString();

function ctx(userId: string): NotificationsCtx {
  return {
    db: supabaseAdmin as unknown as NotificationsCtx['db'],
    tenantId: TENANT,
    logger,
    userId,
  };
}

function seed(match: Record<string, unknown> = {}) {
  store.teams = [
    { id: TEAM, tenant_id: TENANT, name: 'Alpha', captain_id: CAPTAIN },
  ] as never;
  store.team_members = [
    { tenant_id: TENANT, team_id: TEAM, user_id: CAPTAIN, role: 'player' },
    { tenant_id: TENANT, team_id: TEAM, user_id: COACH, role: ' Coach ' },
    { tenant_id: TENANT, team_id: TEAM, user_id: PLAYER, role: 'player' },
  ] as never;
  store.matches = [
    {
      id: 'match-1',
      tenant_id: TENANT,
      status: 'pending',
      scheduled_at: inMinutes(30),
      team1_id: TEAM,
      team2_id: 'team-b',
      team1_checked_in_at: null,
      team2_checked_in_at: null,
      ...match,
    },
  ] as never;
}

beforeEach(() => {
  resetSupabaseMock();
});

describe('computeCheckinPending', () => {
  it('compte 1 pour la capitaine et pour un coach, fenêtre ouverte', async () => {
    seed();
    expect(await computeCheckinPending(ctx(CAPTAIN), TEAM)).toBe(1);
    expect(await computeCheckinPending(ctx(COACH), TEAM)).toBe(1);
  });

  it('compte 0 pour une joueuse simple, fenêtre ouverte', async () => {
    seed();
    expect(await computeCheckinPending(ctx(PLAYER), TEAM)).toBe(0);
  });

  it('compte 0 quand l’équipe a déjà pointé', async () => {
    seed({ team1_checked_in_at: inMinutes(-5) });
    expect(await computeCheckinPending(ctx(CAPTAIN), TEAM)).toBe(0);
  });

  it('compte 0 hors fenêtre (pas encore ouverte)', async () => {
    seed({ scheduled_at: inMinutes(120) });
    expect(await computeCheckinPending(ctx(CAPTAIN), TEAM)).toBe(0);
  });
});
