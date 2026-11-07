// @vitest-environment happy-dom
//
// Fiche publique d'équipe, derniers matchs (lot 1) : un match annulé n'est
// pas un nul, un forfait se dit et un 0 - 0 de forfait n'est pas un score.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import nsTeamDetail from '@/lib/i18n/locales/fr/teamDetail';
import { MatchCard } from '@/components/Team/TeamPageParts';

const t = nsTeamDetail.fr;

type Card = Parameters<typeof MatchCard>[0]['match'];

function match(over: Partial<Card>): Card {
  return {
    id: 'm1',
    scheduled_at: '2026-11-03T19:00:00Z',
    status: 'finished',
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    round_name: null,
    opponent: { id: 'opp', name: 'Les Autres' },
    tournament: null,
    isTeam1: true,
    ...over,
  } as Card;
}

afterEach(cleanup);

describe('MatchCard — statuts clos', () => {
  it('annulé : libellé, ni résultat ni score (même à 0 - 0)', () => {
    render(
      <MatchCard
        teamId="mine"
        match={match({ status: 'cancelled', team1_score: 0, team2_score: 0 })}
      />
    );
    expect(screen.getByText(t.matchCancelled)).toBeTruthy();
    expect(screen.queryByText(t.resultDraw)).toBeNull();
    expect(screen.queryByText('0 - 0')).toBeNull();
  });

  it('forfait gagné à 0 - 0 : libellé et victoire, sans score', () => {
    render(
      <MatchCard
        teamId="mine"
        match={match({
          status: 'walkover',
          team1_score: 0,
          team2_score: 0,
          winner_team_id: 'mine',
        })}
      />
    );
    expect(screen.getByText(t.matchWalkover)).toBeTruthy();
    expect(screen.getByText(t.resultWin)).toBeTruthy();
    expect(screen.queryByText('0 - 0')).toBeNull();
  });

  it('match terminé : score affiché (non-régression)', () => {
    render(
      <MatchCard
        teamId="mine"
        match={match({
          team1_score: 2,
          team2_score: 1,
          winner_team_id: 'mine',
        })}
      />
    );
    expect(screen.getByText('2 - 1')).toBeTruthy();
    expect(screen.queryByText(t.matchWalkover)).toBeNull();
  });
});
