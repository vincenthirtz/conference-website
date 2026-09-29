// @vitest-environment happy-dom
//
// Panneaux du module scrims (lot P13) : le report « nous / eux » sur schéma
// (aucun envoi sans deux scores valides) et « Nos scrims » en inspection
// (lecture seule : aucun geste).

import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import ScrimReportForm from '../../features/player/scrims/ui/ScrimReportForm';
import MyScrimsPanel from '../../features/player/scrims/ui/MyScrimsPanel';
import type { PlayerScrim } from '../../features/player/scrims/schemas';

afterEach(cleanup);

const T = {
  usLabel: 'Nous',
  themLabel: 'Eux',
  submitCta: 'Envoyer',
  reportHint: 'indice',
  errorScores: 'Saisis deux scores valides.',
  errorReport: 'échec',
};

const SCRIM: PlayerScrim = {
  id: '11111111-1111-4111-8111-111111111111',
  name: null,
  scheduledDate: null,
  status: 'scheduled',
  ranked: true,
  isTeam1: true,
  opponentName: 'Nova',
  team1Score: null,
  team2Score: null,
  winnerTeamId: null,
  disputeReason: null,
  myReport: null,
};

describe('ScrimReportForm', () => {
  it('refuse un score vide ou non entier, sans rien envoyer', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ScrimReportForm scrimId="s1" t={T} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/Nous/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() =>
      expect(screen.getByText('Saisis deux scores valides.')).toBeTruthy()
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envoie deux entiers', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ScrimReportForm scrimId="s1" t={T} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/Nous/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Eux/), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ mine: 2, theirs: 1 })
    );
  });
});

describe('MyScrimsPanel', () => {
  const texts = {
    ...T,
    title: 'Nos scrims',
    toReportLabel: 'À rapporter',
    upcomingLabel: 'À venir',
    recentLabel: 'Récents',
    unknownOpponent: '?',
    noScore: '—',
    unranked: 'hors classement',
    reportCta: 'Rapporter le score',
    correctCta: 'Corriger',
    awaitingOpponent: 'attente',
    disputed: 'litige',
  };

  it('en inspection (lecture seule), aucun geste de report', () => {
    render(
      <MyScrimsPanel
        t={texts}
        toReport={[SCRIM]}
        upcoming={[]}
        recent={[]}
        readOnly
        openReportId={SCRIM.id}
        onToggleReport={() => {}}
        onReport={async () => {}}
        fmtDate={() => 'demain'}
      />
    );
    expect(screen.getByText('Nova')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Rapporter le score' })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Envoyer' })).toBeNull();
  });
});
