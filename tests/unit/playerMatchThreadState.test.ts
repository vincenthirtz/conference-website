// Fil du match (lot 1) : un match annulé a son propre état — ni « À venir »,
// ni check-in, ni score — et un forfait dit qui l'a déclaré, avec le motif
// quand l'API le renvoie (colonnes brutes `forfeit_team_id` / `no_show_reason`,
// contrat C7 ; absentes d'une réponse plus ancienne).

import { describe, expect, it } from 'vitest';
import {
  matchThreadState,
  readForfeit,
} from '@/features/player/matches/threadState';
import type { PlayerMatchDetail } from '@/features/player/matches/schemas';

const KICKOFF = Date.parse('2026-11-10T19:00:00Z');
const NOW = KICKOFF - 15 * 60_000; // fenêtre de check-in ouverte

function detail(
  status: string,
  over: Partial<PlayerMatchDetail> = {},
  extra: Record<string, unknown> = {}
): PlayerMatchDetail {
  return {
    match: {
      id: 'm1',
      scheduledAt: new Date(KICKOFF).toISOString(),
      status,
      format: 'bo3',
      bestOf: 3,
      roundName: null,
      streamUrl: null,
      ...extra,
    } as PlayerMatchDetail['match'],
    team: { id: 'mine', name: 'Les Miennes', slot: 1 },
    opponent: { id: 'opp', name: 'Les Autres', slug: 'les-autres' },
    tournament: null,
    checkin: {
      token: 'tok',
      canCheckIn: true,
      alreadyCheckedIn: false,
      checkedInAt: null,
      opensAt: new Date(KICKOFF - 30 * 60_000).toISOString(),
      closesAt: new Date(KICKOFF).toISOString(),
      isOpen: true,
      isPassed: false,
    },
    readiness: null,
    score: null,
    result: null,
    report: { state: 'none', mine: null, dispute: null },
    permissions: { validateLineup: true, reportScore: true },
    ...over,
  } as PlayerMatchDetail;
}

describe('matchThreadState — match annulé', () => {
  it('a son propre état, sans check-in ni score, même fenêtre ouverte', () => {
    const view = matchThreadState(detail('cancelled'), NOW, true);
    expect(view.status).toBe('cancelled');
    expect(view.isCancelled).toBe(true);
    expect(view.checkinOpen).toBe(false);
    expect(view.showCheckinCta).toBe(false);
    expect(view.showReportCta).toBe(false);
    expect(view.primary).toBeNull();
    expect(view.scoreState).toBe('idle');
    expect(view.checkinState).toBe('idle');
  });

  it('un match à venir garde son check-in (non-régression)', () => {
    const view = matchThreadState(detail('pending'), NOW, true);
    expect(view.status).toBe('upcoming');
    expect(view.showCheckinCta).toBe(true);
    expect(view.primary).toBe('checkin');
  });
});

describe('matchThreadState — forfait', () => {
  it('statut « walkover », terminé, sans bouton de check-in', () => {
    const view = matchThreadState(detail('walkover'), NOW, true);
    expect(view.status).toBe('walkover');
    expect(view.isWalkover).toBe(true);
    expect(view.isFinished).toBe(true);
    expect(view.showCheckinCta).toBe(false);
    expect(view.scoreState).toBe('done');
  });

  it('dit que l’adversaire a déclaré forfait, avec le motif', () => {
    const data = detail(
      'walkover',
      {},
      { forfeit_team_id: 'opp', no_show_reason: 'auto_forfeit_no_checkin' }
    );
    expect(readForfeit(data)).toEqual({
      side: 'opponent',
      reason: 'auto_forfeit_no_checkin',
    });
  });

  it('dit que mon équipe a déclaré forfait', () => {
    const data = detail('walkover', {}, { forfeit_team_id: 'mine' });
    expect(readForfeit(data)).toEqual({ side: 'mine', reason: null });
  });

  it('sans la colonne : le vainqueur désigné dit qui est resté', () => {
    expect(readForfeit(detail('walkover', { result: 'win' })).side).toBe(
      'opponent'
    );
    expect(readForfeit(detail('walkover', { result: 'loss' })).side).toBe(
      'mine'
    );
    expect(readForfeit(detail('walkover')).side).toBeNull();
  });

  it('un match terminé normalement ne devine aucun forfait', () => {
    expect(readForfeit(detail('finished', { result: 'win' })).side).toBeNull();
  });
});
