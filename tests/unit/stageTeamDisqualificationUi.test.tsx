// @vitest-environment happy-dom
//
// Disqualification d'une équipe de phase — côté écran : la modale n'envoie
// rien tant que le mode ET le motif ne sont pas valides, le corps du POST est
// celui du contrat, le bandeau liste les matchs à traiter à la main, et les
// classements (admin et public) portent le badge « Disqualifiée ».

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import nsAdminStageTeams from '@/lib/i18n/locales/admin-fr/adminStageTeams';
import nsAdminStageDetail from '@/lib/i18n/locales/admin-fr/adminStageDetail';
import nsTournamentStandings from '@/lib/i18n/locales/fr/tournamentStandings';
import type { DisqualifyTeamResponse } from '@/features/admin/stages/client';

const { mutateJson, addToast } = vi.hoisted(() => ({
  mutateJson: vi.fn(),
  addToast: vi.fn(),
}));

vi.mock('@/hooks/useIdempotentMutation', () => ({
  useIdempotentMutation: () => ({ mutateJson }),
}));
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ addToast }),
}));

import DisqualifyTeamModal from '@/features/admin/stages/ui/DisqualifyTeamModal';
import DisqualificationReport from '@/features/admin/stages/ui/DisqualificationReport';
import { DisqualificationNote } from '@/features/admin/stages/ui/DisqualifiedBadge';
import { useStageTeamDisqualification } from '@/features/admin/stages/hooks/useStageTeamDisqualification';
import AdvanceStandingsTable from '@/components/admin/stages/[stageId]/AdvanceStandingsTable';
import PublicDisqualifiedBadge from '@/components/tournament/DisqualifiedBadge';

const t = nsAdminStageTeams.fr;

afterEach(() => {
  cleanup();
  mutateJson.mockReset();
  addToast.mockReset();
});

const confirmButton = () =>
  screen.getByText(t.dqConfirm).closest('button') as HTMLButtonElement;

function fillReason(value: string) {
  fireEvent.change(screen.getByLabelText(t.dqReasonLabel), {
    target: { value },
  });
}

describe('DisqualifyTeamModal', () => {
  it('confirmation bloquée tant que mode et motif ne sont pas valides', () => {
    const onConfirm = vi.fn();
    render(
      <DisqualifyTeamModal
        teamName="Alpha"
        submitting={false}
        onClose={() => {}}
        onConfirm={onConfirm}
      />
    );

    // Aucun mode présélectionné.
    const forfeit = screen.getByRole('radio', { name: t.dqModeForfeitTitle });
    const annul = screen.getByRole('radio', { name: t.dqModeAnnulTitle });
    expect((forfeit as HTMLInputElement).checked).toBe(false);
    expect((annul as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId('dq-summary').textContent).toContain(
      t.dqSummaryPick
    );
    expect(confirmButton().disabled).toBe(true);

    // Motif valide mais pas de mode.
    fillReason('triche avérée');
    expect(confirmButton().disabled).toBe(true);

    // Mode choisi, motif trop court (après trim).
    fireEvent.click(annul);
    fillReason('  ab  ');
    expect(confirmButton().disabled).toBe(true);
    expect(screen.getByTestId('dq-reason-count').textContent).toBe('2/500');
    fireEvent.click(confirmButton());
    expect(onConfirm).not.toHaveBeenCalled();

    // Valide : le résumé suit le mode, le motif part trimé.
    fillReason('  abandon annoncé  ');
    expect(screen.getByTestId('dq-summary').textContent).toContain(
      'Alpha sera classée dernière ; ses matchs restants seront annulés'
    );
    expect(confirmButton().disabled).toBe(false);
    fireEvent.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledWith({
      mode: 'annul',
      reason: 'abandon annoncé',
    });
  });
});

function Harness() {
  const dq = useStageTeamDisqualification('stage-1');
  const row = { team_id: 'team-a', team: { name: 'Alpha' } };
  return (
    <>
      <button type="button" onClick={() => dq.openDisqualify(row)}>
        open
      </button>
      <button type="button" onClick={() => dq.reinstate(row)}>
        reinstate
      </button>
      {dq.ui}
    </>
  );
}

function renderHarness() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>
  );
}

const baseResponse: DisqualifyTeamResponse = {
  mode: 'forfeit',
  teamId: 'team-a',
  teamName: 'Alpha',
  disqualifiedAt: '2026-10-08T12:00:00Z',
  forfeited: ['m1', 'm2'],
  cancelled: [],
  skipped: [],
  failed: null,
  notProcessed: [],
  complete: true,
};

describe('useStageTeamDisqualification', () => {
  it('envoie le POST du contrat et résume le résultat', async () => {
    mutateJson.mockResolvedValue(baseResponse);
    renderHarness();
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(screen.getByRole('radio', { name: t.dqModeForfeitTitle }));
    fillReason('  joueuse non éligible ');
    await act(async () => {
      fireEvent.click(confirmButton());
    });

    expect(mutateJson).toHaveBeenCalledTimes(1);
    const [url, init] = mutateJson.mock.calls[0];
    expect(url).toBe('/api/admin/stages/stage-1/disqualify');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      team_id: 'team-a',
      mode: 'forfeit',
      reason: 'joueuse non éligible',
    });
    expect(addToast).toHaveBeenCalledWith(
      'Alpha disqualifiée : 2 matchs perdus par forfait.',
      'success'
    );
    // Modale refermée, rien à traiter à la main.
    expect(screen.queryByTestId('disqualify-team-modal')).toBeNull();
    expect(screen.queryByTestId('disqualification-report')).toBeNull();
  });

  it('erreur 409 : message localisé, la modale reste ouverte', async () => {
    mutateJson.mockRejectedValue(
      Object.assign(new Error('déjà'), {
        status: 409,
        payload: { code: 'ALREADY_DISQUALIFIED' },
      })
    );
    renderHarness();
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(screen.getByRole('radio', { name: t.dqModeAnnulTitle }));
    fillReason('motif valable');
    await act(async () => {
      fireEvent.click(confirmButton());
    });
    expect(addToast).toHaveBeenCalledWith(t.dqErrAlready, 'error');
    expect(screen.getByTestId('disqualify-team-modal')).toBeTruthy();
  });

  it('réintégration : confirmation puis DELETE ?team_id=', async () => {
    mutateJson.mockResolvedValue({
      teamId: 'team-a',
      reinstated: true,
      matchesNotRestored: 3,
    });
    renderHarness();
    await act(async () => {
      fireEvent.click(screen.getByText('reinstate'));
    });
    expect(screen.getByText(t.rsConfirmSubtitle)).toBeTruthy();
    expect(mutateJson).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.reinstate }));
    });
    const [url, init] = mutateJson.mock.calls[0];
    expect(url).toBe('/api/admin/stages/stage-1/disqualify?team_id=team-a');
    expect(init.method).toBe('DELETE');
    expect(addToast).toHaveBeenCalledWith(
      'Alpha réintégrée. 3 matchs restent en forfait ou annulés : à corriger à la main si besoin.',
      'warning'
    );
  });
});

describe('DisqualificationReport', () => {
  it('liste les matchs à traiter à la main, avec lien vers chacun', () => {
    render(
      <DisqualificationReport
        result={{
          ...baseResponse,
          complete: false,
          skipped: [{ id: 'skip-1111', reason: 'disputed' }],
          failed: { id: 'fail-2222', error: 'boom' },
          notProcessed: ['todo-3333'],
        }}
        onDismiss={() => {}}
      />
    );
    const report = screen.getByTestId('disqualification-report');
    expect(report.textContent).toContain(t.dqReportIncomplete);
    expect(report.textContent).toContain(t.dqSkipDisputed);
    expect(report.textContent).toContain('échec : boom');
    expect(report.textContent).toContain(t.dqNotProcessed);
    const hrefs = Array.from(report.querySelectorAll('a')).map((a) =>
      a.getAttribute('href')
    );
    expect(hrefs).toEqual([
      '/admin/matches/skip-1111/edit',
      '/admin/matches/fail-2222/edit',
      '/admin/matches/todo-3333/edit',
    ]);
  });
});

describe('badge « Disqualifiée »', () => {
  it('ligne d’équipe : badge + mode + motif, rien si non disqualifiée', () => {
    const { rerender } = render(
      <DisqualificationNote at={null} mode={null} reason={null} />
    );
    expect(screen.queryByTestId('disqualified-badge')).toBeNull();
    rerender(
      <DisqualificationNote
        at="2026-10-08T12:00:00Z"
        mode="annul"
        reason="triche"
      />
    );
    const badge = screen.getByTestId('disqualified-badge');
    expect(badge.textContent).toBe(t.dqBadge);
    expect(badge.getAttribute('title')).toBe(
      `Disqualifiée — ${t.dqModeAnnulShort}. Motif : triche`
    );
    expect(screen.getByText(`${t.dqModeAnnulShort} · triche`)).toBeTruthy();
  });

  it('classement admin : seules les lignes disqualifiées sont badgées', () => {
    render(
      <AdvanceStandingsTable
        standings={[
          {
            teamId: 'a',
            teamName: 'Alpha',
            rank: 1,
            wins: 2,
            losses: 0,
            draws: 0,
            score: 6,
          },
          {
            teamId: 'b',
            teamName: 'Bravo',
            rank: 2,
            wins: 1,
            losses: 1,
            draws: 0,
            score: 3,
            disqualified: true,
            disqualificationMode: 'forfeit',
          },
        ]}
        selectedIds={new Set()}
        allSelected={false}
        onToggleTeam={() => {}}
        onToggleAll={() => {}}
        t={nsAdminStageDetail.fr}
      />
    );
    const badges = screen.getAllByTestId('disqualified-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0].closest('tr')?.textContent).toContain('Bravo');
  });

  it('classement public : badge et info-bulle selon le mode', () => {
    const pub = nsTournamentStandings.fr;
    render(<PublicDisqualifiedBadge mode="annul" />);
    const badge = screen.getByTestId('public-disqualified-badge');
    expect(badge.textContent).toBe(pub.disqualified);
    expect(badge.getAttribute('title')).toBe(pub.disqualifiedAnnulTitle);
  });
});
