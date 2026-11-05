// tests/unit/leaderboardTournaments.test.ts
//
// Les onglets des tournois phares de la page Classement (config/leaderboardTournaments.ts,
// demande de la propriétaire du 2026-11-05) : OWWC 2026 et OWWC 2025 en tête de la barre,
// la page ouverte sur OWWC 2026, chaque joueuse classée par le rating gagné pendant ce seul
// tournoi.
//
// Rendu SSR via react-dom/server : on voit ce que reçoit le navigateur avant hydratation.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { readTournamentMovers } from '../../utils/rating/readLeaderboardAxes';
import { LEADERBOARD_TOURNAMENTS } from '../../config/leaderboardTournaments';
import LeaderboardPage, { getStaticProps } from '../../pages/leaderboard';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const [OWWC_2026, OWWC_2025] = LEADERBOARD_TOURNAMENTS;

function history(
  userId: string,
  tournamentId: string,
  before: number,
  after: number,
  result: 'win' | 'loss'
) {
  return {
    tenant_id: TENANT,
    user_id: userId,
    tournament_id: tournamentId,
    rating_before: before,
    rating_after: after,
    result,
    occurred_at: '2026-10-01T20:00:00Z',
  };
}

function rated(userId: string, name: string) {
  return {
    tenant_id: TENANT,
    user_id: userId,
    rating: 1600,
    rd: 60,
    games_played: 5,
    display_name: name,
    battle_tag: null,
    avatar_url: null,
  };
}

async function props() {
  const res = await getStaticProps({});
  if (!('props' in res)) throw new Error('attendu : props');
  return res.props;
}

beforeEach(() => {
  resetSupabaseMock();
  store.player_ratings = [rated('u1', 'Alice'), rated('u2', 'Bea')] as never;
});

describe('readTournamentMovers', () => {
  it('additionne le rating gagné sur CE tournoi seulement, la meilleure d’abord', async () => {
    store.player_rating_history = [
      history('u1', OWWC_2026!.id, 1500, 1520, 'win'),
      history('u1', OWWC_2026!.id, 1520, 1510, 'loss'),
      history('u2', OWWC_2026!.id, 1500, 1540, 'win'),
      // Un autre tournoi ne compte pas.
      history('u1', OWWC_2025!.id, 1400, 1500, 'win'),
    ] as never;
    const movers = await readTournamentMovers(TENANT, OWWC_2026!.id, 64);
    expect(
      movers.map((m) => [m.rank, m.displayName, m.delta, m.wins, m.losses])
    ).toEqual([
      [1, 'Bea', 40, 1, 0],
      [2, 'Alice', 10, 1, 1],
    ]);
  });
});

describe('page Classement — onglets des tournois', () => {
  it('OWWC 2026 et OWWC 2025 en tête, la page ouverte sur OWWC 2026', async () => {
    store.player_rating_history = [
      history('u1', OWWC_2026!.id, 1500, 1520, 'win'),
      history('u2', OWWC_2025!.id, 1500, 1530, 'win'),
    ] as never;
    const html = renderToString(createElement(LeaderboardPage, await props()));
    const tabs = [...html.matchAll(/role="tab"[^>]*>([^<]*)</g)].map(
      (m) => m[1]
    );
    expect(tabs.slice(0, 3)).toEqual(['OWWC 2026', 'OWWC 2025', 'Rating']);
    expect(html).toMatch(/aria-selected="true"[^>]*>OWWC 2026</);
    expect(html).toContain('OW Women&#x27;s Cup 2026');
    expect(html).toContain(`href="/tournament/${OWWC_2026!.slug}"`);
  });

  it('un tournoi sans match noté n’a pas d’onglet ; sans aucun, la page s’ouvre sur Rating', async () => {
    store.player_rating_history = [] as never;
    const html = renderToString(createElement(LeaderboardPage, await props()));
    expect(html).not.toContain('OWWC 2026');
    expect(html).not.toContain('OWWC 2025');
    expect(html).toMatch(/aria-selected="true"[^>]*>Rating</);
  });
});
