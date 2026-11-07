// @vitest-environment happy-dom
//
// Fil du match (lot 1), côté écran : un match annulé ne montre plus le
// check-in, la feuille ni le score ; un forfait dit qui l'a déclaré (et le
// motif) au lieu de « Le score n'a pas encore été rapporté ». La puce d'état
// a un libellé pour chacun.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import nsPlayerMatch from '@/lib/i18n/locales/fr/playerMatch';
import nsPlayerMatchEn from '@/lib/i18n/locales/en/playerMatch';
import { format } from '@/lib/i18n/useT';
import { matchThreadState } from '@/features/player/matches/threadState';
import type { PlayerMatchDetail } from '@/features/player/matches/schemas';

// Les cartes qui se chargent elles-mêmes (réseau) sont hors sujet ici.
vi.mock('@/components/player/MatchLineupCard', () => ({
  default: () => <div data-testid="lineup-card" />,
  MATCH_CHECKIN_ANCHOR: 'checkin',
}));
vi.mock('@/components/player/MatchPrepCard', () => ({
  default: () => <div data-testid="prep-card" />,
}));
vi.mock('@/features/player/matches/ui/MatchEvidenceUpload', () => ({
  default: () => null,
}));
vi.mock('@/features/player/matches/ui/MatchDisputePanel', () => ({
  default: () => null,
}));

import MatchThreadSteps, {
  forfeitReasonLabel,
} from '@/features/player/matches/ui/MatchThreadSteps';
import MatchStatusChip, {
  matchStatusLabel,
} from '@/features/player/matches/ui/MatchStatusChip';

const t = nsPlayerMatch.fr;
const KICKOFF = Date.parse('2026-11-10T19:00:00Z');

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

function renderSteps(data: PlayerMatchDetail, now = KICKOFF - 10 * 60_000) {
  const view = matchThreadState(data, now, true);
  return render(
    <MatchThreadSteps
      data={data}
      view={view}
      t={t}
      canAct
      formatDate={(iso) => iso ?? ''}
      checkinBusy={false}
      onCheckin={() => {}}
      onReport={() => {}}
    />
  );
}

afterEach(cleanup);

describe('MatchThreadSteps — match annulé', () => {
  it('une seule carte « Match annulé », sans check-in, feuille ni score', () => {
    renderSteps(detail('cancelled'));
    expect(screen.getByText(t.stepCancelled)).toBeTruthy();
    expect(screen.getByText(t.cancelledBody)).toBeTruthy();
    expect(screen.queryByText(t.stepCheckin)).toBeNull();
    expect(screen.queryByText(t.stepLineup)).toBeNull();
    expect(screen.queryByText(t.stepScore)).toBeNull();
    expect(screen.queryByText(t.checkinCta)).toBeNull();
    expect(screen.queryByTestId('lineup-card')).toBeNull();
  });

  it('les deux équipes absentes au check-in : le motif est dit', () => {
    renderSteps(
      detail('cancelled', {}, { no_show_reason: 'auto_forfeit_no_checkin' })
    );
    expect(screen.getByText(t.cancelledNoCheckin)).toBeTruthy();
  });
});

describe('MatchThreadSteps — forfait', () => {
  it('l’adversaire forfait : nommé, avec le motif, sans « score non rapporté »', () => {
    renderSteps(
      detail(
        'walkover',
        { result: 'win', score: { mine: 0, opponent: 0 } },
        { forfeit_team_id: 'opp', no_show_reason: 'auto_forfeit_no_checkin' }
      )
    );
    expect(
      screen.getByText(format(t.walkoverOpponent, { team: 'Les Autres' }))
    ).toBeTruthy();
    expect(
      screen.getByText(format(t.forfeitReason, { reason: t.reasonNoCheckin }))
    ).toBeTruthy();
    expect(screen.queryByText(t.scoreNone)).toBeNull();
    // 0–0 sur un forfait n'est pas un score.
    expect(
      screen.queryByText(format(t.scoreFinal, { mine: 0, opponent: 0 }))
    ).toBeNull();
  });

  it('mon équipe forfait', () => {
    renderSteps(detail('walkover', {}, { forfeit_team_id: 'mine' }));
    expect(screen.getByText(t.walkoverMine)).toBeTruthy();
  });

  it('réponse sans colonne ni vainqueur : forfait sans nom', () => {
    renderSteps(detail('walkover'));
    expect(screen.getByText(t.walkoverUnknown)).toBeTruthy();
    expect(screen.queryByText(t.scoreNone)).toBeNull();
  });

  it('un forfait avec un vrai score garde le score', () => {
    renderSteps(
      detail('walkover', { result: 'win', score: { mine: 2, opponent: 0 } })
    );
    expect(
      screen.getByText(format(t.scoreFinal, { mine: 2, opponent: 0 }))
    ).toBeTruthy();
  });
});

describe('motif de forfait', () => {
  it('codes connus traduits, texte libre gardé, code inconnu générique', () => {
    expect(forfeitReasonLabel('auto_forfeit_no_checkin', t)).toBe(
      t.reasonNoCheckin
    );
    expect(forfeitReasonLabel('manual_dq', t)).toBe(t.reasonManualDq);
    expect(forfeitReasonLabel('Équipe incomplète', t)).toBe(
      'Équipe incomplète'
    );
    expect(forfeitReasonLabel('some_code', t)).toBe(t.reasonOther);
  });
});

describe('MatchStatusChip', () => {
  it('un libellé par état, en français et en anglais', () => {
    const en = nsPlayerMatchEn as unknown as typeof t;
    expect(matchStatusLabel('cancelled', t)).toBe('Annulé');
    expect(matchStatusLabel('walkover', t)).toBe('Forfait');
    expect(matchStatusLabel('cancelled', en)).toBe('Cancelled');
    expect(matchStatusLabel('walkover', en)).toBe('Forfeit');
    render(<MatchStatusChip status="cancelled" t={t} />);
    expect(screen.getByText('Annulé')).toBeTruthy();
  });
});
