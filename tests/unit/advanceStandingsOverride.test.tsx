// @vitest-environment happy-dom
//
// « Forcer l'ordre » dans la table d'avancement : motif obligatoire,
// validation locale avant tout appel, affichage / retrait des dérogations.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AdvanceStandingsTable from '@/components/admin/stages/[stageId]/AdvanceStandingsTable';
import nsAdminStageDetail from '@/lib/i18n/locales/admin-fr/adminStageDetail';

const t = nsAdminStageDetail.fr;

const standings = [
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
    wins: 2,
    losses: 0,
    draws: 0,
    score: 6,
  },
];

function renderTable(
  extra: Partial<Parameters<typeof AdvanceStandingsTable>[0]> = {}
) {
  return render(
    <AdvanceStandingsTable
      standings={standings}
      selectedIds={new Set()}
      allSelected={false}
      onToggleTeam={() => {}}
      onToggleAll={() => {}}
      t={t}
      {...extra}
    />
  );
}

afterEach(cleanup);

describe('AdvanceStandingsTable — dérogations de départage', () => {
  it('sans onAddOverride : aucune barre « Forcer l’ordre »', () => {
    renderTable();
    expect(screen.queryByText(t.ovForce)).toBeNull();
  });

  it('motif obligatoire : rien n’est envoyé sans motif', async () => {
    const onAdd = vi.fn(async () => true);
    renderTable({ onAddOverride: onAdd });
    fireEvent.click(screen.getByText(t.ovForce));
    fireEvent.change(screen.getByLabelText(t.ovWinnerLabel), {
      target: { value: 'b' },
    });
    fireEvent.change(screen.getByLabelText(t.ovLoserLabel), {
      target: { value: 'a' },
    });
    fireEvent.click(screen.getByText(t.ovSubmit));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      t.ovErrReason
    );
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(t.ovReasonLabel), {
      target: { value: 'décision arbitrale' },
    });
    fireEvent.click(screen.getByText(t.ovSubmit));
    await vi.waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        winnerTeamId: 'b',
        loserTeamId: 'a',
        reason: 'décision arbitrale',
      })
    );
  });

  it('affiche la dérogation active, la marque et permet de la retirer', () => {
    const onRemove = vi.fn();
    const ov = {
      id: 7,
      winner_team_id: 'b',
      loser_team_id: 'a',
      reason: 'revue vidéo',
      set_by_staff_id: null,
      set_at: '2026-10-01T10:00:00Z',
      winner: { id: 'b', name: 'Bravo' },
      loser: { id: 'a', name: 'Alpha' },
    };
    renderTable({
      onAddOverride: async () => true,
      onRemoveOverride: onRemove,
      overrides: [ov],
    });
    expect(screen.getByTestId('tiebreaker-override-row').textContent).toContain(
      'Bravo passe devant Alpha'
    );
    expect(screen.getByText(t.tbOverride)).toBeTruthy();
    fireEvent.click(screen.getByText(t.ovRemove));
    expect(onRemove).toHaveBeenCalledWith(ov);
  });
});
