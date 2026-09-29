// features/admin/pilotage/build.ts — la file d'attente du pilotage du jour
// est triée par URGENCE, pas par heure (planche « Admin », Le Ruban).

import { describe, it, expect } from 'vitest';
import {
  buildPilotage,
  buildPilotageQueue,
} from '../../features/admin/pilotage/build';
import type { DashboardData } from '../../utils/dashboard/buildTournamentDashboard';

const NOW = new Date('2026-09-25T20:00:00Z');
const at = (min: number) =>
  new Date(NOW.getTime() + min * 60_000).toISOString();

function data(): DashboardData {
  return {
    tournament: {
      id: 't1',
      name: 'OW Women’s Cup 2026',
      status: 'ongoing',
      start_date: null,
      end_date: null,
      timezone: null,
      format: null,
      min_players: null,
      max_teams: null,
      roster_locked_at: null,
      roster_unlocked_until: null,
    },
    summary: {
      totalTeams: 8,
      totalMatches: 28,
      finishedMatches: 4,
      pendingMatches: 22,
      ongoingMatches: 1,
      completionPercent: 14,
      eliminatedTeams: 0,
      activeTeams: 8,
    },
    stages: [],
    upcomingMatches: [
      {
        id: 'planned',
        stage_id: null,
        stage_name: 'Journée 3',
        round_number: null,
        round_name: 'J3-M1',
        scheduled_at: at(60 * 24),
        team1_name: 'A',
        team2_name: 'B',
        stream_url: null,
      },
      {
        id: 'soon',
        stage_id: null,
        stage_name: null,
        round_number: null,
        round_name: 'J2-M3',
        scheduled_at: at(90),
        team1_name: 'C',
        team2_name: 'D',
        stream_url: null,
      },
      {
        id: 'late',
        stage_id: null,
        stage_name: null,
        round_number: null,
        round_name: 'J2-M2',
        scheduled_at: at(-24),
        team1_name: 'E',
        team2_name: 'F',
        stream_url: null,
      },
      // Déjà en direct : il ne doit apparaître QU'UNE fois, sous « en direct ».
      {
        id: 'live',
        stage_id: null,
        stage_name: null,
        round_number: null,
        round_name: 'J2-M1',
        scheduled_at: at(-40),
        team1_name: 'G',
        team2_name: 'H',
        stream_url: null,
      },
    ],
    alerts: [],
    signals: {
      disputesOpen: {
        count: 1,
        matches: [
          {
            id: 'dispute',
            team1Name: 'I',
            team2Name: 'J',
            reason: 'Scores contradictoires',
            openedAt: at(-12),
          },
        ],
      },
      liveMatches: [
        {
          id: 'live',
          team1Name: 'G',
          team2Name: 'H',
          team1Score: 1,
          team2Score: 0,
          streamUrl: null,
          scheduledAt: at(-40),
          roundName: 'J2-M1',
          stageName: null,
          matchFormat: null,
          currentMap: { name: 'Ilios', type: null, index: 1 },
        },
      ],
      checkinNext24h: {
        upcoming: 8,
        bothCheckedIn: 6,
        oneSide: 1,
        missing: 1,
        forfeited: 0,
      },
      recentActivity: Array.from({ length: 9 }, (_, i) => ({
        id: `a${i}`,
        staffName: 'Vincent',
        action: 'update_team',
        readableAction: 'a modifié une équipe',
        entityType: 'team',
        entityId: null,
        createdAt: at(-i),
      })),
    } as unknown as DashboardData['signals'],
    guards: { current_status: 'ongoing', guards: [] },
    generatedAt: NOW.toISOString(),
  };
}

describe('file d’attente du pilotage', () => {
  it('litige, direct, retard, imminent, planifié — dans cet ordre', () => {
    const q = buildPilotageQueue(data(), NOW);
    expect(q.map((i) => `${i.matchId}:${i.state}`)).toEqual([
      'dispute:dispute',
      'live:live',
      'late:late',
      'soon:soon',
      'planned:planned',
    ]);
  });

  it('un match en direct n’apparaît qu’une fois, avec son score et sa carte', () => {
    const live = buildPilotageQueue(data(), NOW).filter(
      (i) => i.matchId === 'live'
    );
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ score: '1-0', detail: 'Ilios' });
  });

  it('à état égal, l’heure prévue départage', () => {
    const d = data();
    d.upcomingMatches.push({
      ...d.upcomingMatches[0],
      id: 'planned-early',
      scheduled_at: at(60 * 5),
    });
    const planned = buildPilotageQueue(d, NOW).filter(
      (i) => i.state === 'planned'
    );
    expect(planned.map((i) => i.matchId)).toEqual(['planned-early', 'planned']);
  });
});

describe('buildPilotage', () => {
  it('tuiles : check-in incomplet = un côté + aucun ; journal limité à 6', () => {
    const p = buildPilotage(data(), NOW);
    expect(p.tiles).toMatchObject({
      checkin: { checkedIn: 6, upcoming: 8, missing: 2 },
      ongoing: 1,
      disputes: 1,
      finished: 4,
      total: 28,
    });
    expect(p.activity).toHaveLength(6);
    expect(p.tournament?.id).toBe('t1');
  });
});
