// @vitest-environment happy-dom
//
// « Pris en compte » (statut `acknowledged`) dans l'admin des demandes :
// l'action n'apparaît QUE pour une demande de scrim en attente (ligne, lot,
// fiche), la confirmation dit ce qui va se passer (rien sur Discord, l'équipe
// demandeuse prévenue sur le site), l'appel envoyé est le bon, et le statut a
// son badge, sa tuile et son filtre.
//
// Côté API (conference-api) : tests/unit/apiAdminDemandesScrimAcknowledged.test.ts
// prouve l'absence de tout trafic bot. Ici, fixtures seulement.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

const addToast = vi.fn();
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ addToast }),
}));

const updateStatus = vi.fn();
vi.mock('@/features/admin/demandes/client', () => ({
  demandesClient: {
    updateStatus: (...args: unknown[]) => updateStatus(...args),
  },
}));

import DemandesListTable, {
  type DemandeRowActions,
} from '@/features/admin/demandes/ui/DemandesListTable';
import DemandesListStats from '@/features/admin/demandes/ui/DemandesListStats';
import DemandesListFilters from '@/features/admin/demandes/ui/DemandesListFilters';
import { DemandesListBulkBar } from '@/features/admin/demandes/ui/DemandesListBars';
import {
  acknowledgeConfirmText,
  useScrimAcknowledge,
  type AcknowledgeTarget,
} from '@/features/admin/demandes/ui/ScrimAcknowledge';
import {
  canAcknowledgeScrim,
  type Demande,
  type StatusCounts,
} from '@/features/admin/demandes/listModel';
import { statusChipTone } from '@/features/admin/demandes/ui/DemandeDetailBlocks';
import nsAdminDemandesList from '@/lib/i18n/locales/admin-fr/adminDemandesList';

const t = nsAdminDemandesList.fr;

// Le texte exact demandé par la propriétaire.
const CONFIRM_BODY =
  "Le scrim sera classé comme géré entre les équipes. Aucun message ne sera envoyé sur Discord. L'équipe demandeuse sera prévenue sur le site.";

const FROM_TEAM = '22222222-2222-4222-8222-22222222aaaa';

function demande(over: Partial<Demande> = {}): Demande {
  return {
    id: 'd-scrim',
    type: 'scrim',
    status: 'pending',
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: null,
    tournament_id: null,
    team_id: 'team-target',
    user_id: 'u1',
    comment: null,
    staff_note: null,
    source: 'website',
    payload: {
      from_team_id: FROM_TEAM,
      from_team_name: 'Les Demandeuses',
      target_team_name: 'Les Invitées',
    },
    processed_at: null,
    processed_by_staff_id: null,
    user: null,
    team: null,
    tournament: null,
    processed_by: null,
    ...over,
  };
}

function actions(over: Partial<DemandeRowActions> = {}): DemandeRowActions {
  return {
    onToggle: vi.fn(),
    onRequestInfo: vi.fn(),
    onNotifyCaptains: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onAcknowledge: vi.fn(),
    ...over,
  };
}

function renderTable(demandes: Demande[], acts = actions()) {
  return render(
    <DemandesListTable
      demandes={demandes}
      selected={new Set()}
      processingId={null}
      batchProcessing={false}
      hasActiveFilters={false}
      onToggleSelectAll={() => {}}
      onResetFilters={() => {}}
      actions={acts}
    />
  );
}

/** Harnais du hook : un bouton qui déclenche le geste sur `targets`. */
function Harness({
  targets,
  staffComment,
  onDone,
}: {
  targets: AcknowledgeTarget[];
  staffComment?: string | null;
  onDone?: (ok: boolean) => void;
}) {
  const { acknowledge, dialog } = useScrimAcknowledge();
  return (
    <>
      {dialog}
      <button
        type="button"
        onClick={async () => {
          const ok = await acknowledge(targets, undefined, staffComment);
          onDone?.(ok);
        }}
      >
        go
      </button>
    </>
  );
}

beforeEach(() => {
  addToast.mockReset();
  updateStatus.mockReset();
  updateStatus.mockResolvedValue({ updatedCount: 1 });
});

afterEach(cleanup);

describe('canAcknowledgeScrim', () => {
  it('vrai pour un scrim en attente, et seulement lui', () => {
    expect(canAcknowledgeScrim({ type: 'scrim', status: 'pending' })).toBe(
      true
    );
    expect(canAcknowledgeScrim({ type: 'join', status: 'pending' })).toBe(
      false
    );
    expect(canAcknowledgeScrim({ type: 'other', status: 'pending' })).toBe(
      false
    );
    for (const status of [
      'approved',
      'rejected',
      'cancelled',
      'acknowledged',
    ]) {
      expect(canAcknowledgeScrim({ type: 'scrim', status }), status).toBe(
        false
      );
    }
  });
});

describe('liste — action par ligne', () => {
  it('n’apparaît que sur la demande de scrim en attente', () => {
    renderTable([
      demande({ id: 'scrim-pending' }),
      demande({ id: 'join-pending', type: 'join' }),
      demande({ id: 'other-pending', type: 'other', payload: null }),
    ]);
    const buttons = screen.getAllByTestId('acknowledge-scrim');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe(t.acknowledge);
  });

  it('absente d’un scrim déjà traité (y compris déjà pris en compte)', () => {
    renderTable([
      demande({ id: 'a', status: 'approved' }),
      demande({ id: 'b', status: 'acknowledged' }),
      demande({ id: 'c', status: 'rejected' }),
    ]);
    expect(screen.queryByTestId('acknowledge-scrim')).toBeNull();
  });

  it('absente quand la page ne fournit pas le geste', () => {
    renderTable([demande()], actions({ onAcknowledge: undefined }));
    expect(screen.queryByTestId('acknowledge-scrim')).toBeNull();
  });

  it('remonte la demande à la page au clic', () => {
    const acts = actions();
    const d = demande();
    renderTable([d], acts);
    fireEvent.click(screen.getByTestId('acknowledge-scrim'));
    expect(acts.onAcknowledge).toHaveBeenCalledWith(d);
    expect(acts.onApprove).not.toHaveBeenCalled();
  });

  it('affiche le badge « Pris en compte » d’un scrim pris en compte', () => {
    renderTable([demande({ status: 'acknowledged' })]);
    expect(screen.getByText(t.statusAcknowledged)).toBeTruthy();
    expect(statusChipTone('acknowledged')).toBe('brand');
  });

  it('notification « Pris en compte » : affiche la vraie équipe cible (rangée chez la demandeuse)', () => {
    renderTable([
      demande({
        id: 'notif',
        type: 'other',
        user_id: null,
        team_id: FROM_TEAM,
        team: {
          id: FROM_TEAM,
          name: 'Les Demandeuses',
          short_name: null,
          logo_url: null,
        },
        payload: {
          notification_type: 'scrim_acknowledged',
          from_team_name: 'Les Demandeuses',
          target_team_name: 'Les Invitées',
        } as Demande['payload'],
      }),
    ]);
    expect(screen.getByText('Les Invitées')).toBeTruthy();
  });
});

describe('liste — action par lot', () => {
  it('le bouton n’existe que si la page le fournit', () => {
    const onAcknowledge = vi.fn();
    const { rerender } = render(
      <DemandesListBulkBar
        count={2}
        processing={false}
        onApprove={() => {}}
        onReject={() => {}}
        onClear={() => {}}
      />
    );
    expect(screen.queryByTestId('acknowledge-scrim')).toBeNull();
    rerender(
      <DemandesListBulkBar
        count={2}
        processing={false}
        onApprove={() => {}}
        onReject={() => {}}
        onAcknowledge={onAcknowledge}
        onClear={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('acknowledge-scrim'));
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });
});

describe('confirmation et appel', () => {
  it('confirme avec le texte demandé, puis envoie newStatus = acknowledged', async () => {
    const onDone = vi.fn();
    render(<Harness targets={[demande()]} onDone={onDone} />);
    fireEvent.click(screen.getByText('go'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(t.ackConfirmTitle_one)).toBeTruthy();
    expect(within(dialog).getByText(CONFIRM_BODY)).toBeTruthy();
    // Rien ne part avant la confirmation.
    expect(updateStatus).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByText(t.ackConfirmYes));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
    expect(updateStatus).toHaveBeenCalledTimes(1);
    expect(updateStatus).toHaveBeenCalledWith({
      ids: ['d-scrim'],
      newStatus: 'acknowledged',
    });
    expect(addToast).toHaveBeenCalledWith(t.toastAcknowledged, 'success');
  });

  it('transmet la note staff de la fiche', async () => {
    const onDone = vi.fn();
    render(
      <Harness
        targets={[demande()]}
        staffComment="Elles s’organisent."
        onDone={onDone}
      />
    );
    fireEvent.click(screen.getByText('go'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText(t.ackConfirmYes));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
    expect(updateStatus).toHaveBeenCalledWith({
      ids: ['d-scrim'],
      newStatus: 'acknowledged',
      staffComment: 'Elles s’organisent.',
    });
  });

  it('annuler n’envoie rien', async () => {
    const onDone = vi.fn();
    render(<Harness targets={[demande()]} onDone={onDone} />);
    fireEvent.click(screen.getByText('go'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText(t.cancel));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(false));
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('refuse sans rien demander pour une demande qui n’est pas un scrim en attente', async () => {
    const onDone = vi.fn();
    render(<Harness targets={[demande({ type: 'join' })]} onDone={onDone} />);
    fireEvent.click(screen.getByText('go'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(false));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('affiche l’erreur de l’API (ex. 400 « réservé aux scrims ») en toast', async () => {
    updateStatus.mockRejectedValueOnce(
      new Error('« Pris en compte » est réservé aux demandes de scrim.')
    );
    const onDone = vi.fn();
    render(<Harness targets={[demande()]} onDone={onDone} />);
    fireEvent.click(screen.getByText('go'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText(t.ackConfirmYes));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(false));
    expect(addToast).toHaveBeenCalledWith(
      '« Pris en compte » est réservé aux demandes de scrim.',
      'error'
    );
  });

  it('demande externe : ne promet pas de prévenir une équipe du site', () => {
    const external = acknowledgeConfirmText(
      [demande({ source: 'public', payload: { from_team_name: 'Ext' } })],
      t
    );
    expect(external.body).toBe(t.ackConfirmBodyExternal);
    expect(external.body).not.toContain('prévenue sur le site');
    expect(acknowledgeConfirmText([demande()], t).body).toBe(CONFIRM_BODY);
  });

  it('lot : titre au pluriel, un seul appel pour toutes les demandes', async () => {
    updateStatus.mockResolvedValueOnce({ updatedCount: 2 });
    const onDone = vi.fn();
    render(
      <Harness
        targets={[demande({ id: 'a' }), demande({ id: 'b' })]}
        onDone={onDone}
      />
    );
    fireEvent.click(screen.getByText('go'));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Classer ces 2 scrims « Pris en compte » ?')
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByText(t.ackConfirmYes));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
    expect(updateStatus).toHaveBeenCalledWith({
      ids: ['a', 'b'],
      newStatus: 'acknowledged',
    });
    expect(addToast).toHaveBeenCalledWith(
      '2 scrim(s) classé(s) « Pris en compte ».',
      'success'
    );
  });
});

describe('tuile et filtre du statut', () => {
  const counts: StatusCounts = {
    pending: 3,
    approved: 2,
    rejected: 1,
    cancelled: 0,
    acknowledged: 4,
    total: 10,
  };

  it('une tuile « Pris en compte » qui filtre sur acknowledged', () => {
    const onSelect = vi.fn();
    render(
      <DemandesListStats
        counts={counts}
        statusFilter="pending"
        onSelect={onSelect}
      />
    );
    const tile = screen.getByText(t.statAcknowledged).closest('button');
    expect(tile).toBeTruthy();
    expect(within(tile as HTMLElement).getByText('4')).toBeTruthy();
    expect(tile?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(tile as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith('acknowledged');
  });

  it('la tuile est active quand le filtre est acknowledged', () => {
    render(
      <DemandesListStats
        counts={counts}
        statusFilter="acknowledged"
        onSelect={() => {}}
      />
    );
    const tile = screen.getByText(t.statAcknowledged).closest('button');
    expect(tile?.getAttribute('aria-pressed')).toBe('true');
  });

  it('le filtre de statut propose « Pris en compte »', () => {
    const onFilterChange = vi.fn();
    render(
      <DemandesListFilters
        typeFilter=""
        statusFilter="pending"
        tournamentFilter=""
        tournaments={[]}
        searchInput=""
        onSearchInputChange={() => {}}
        dateFrom=""
        dateTo=""
        assignedFilter={null}
        sortValue="created_at:desc"
        hasActiveFilters={false}
        onFilterChange={onFilterChange}
        onSortChange={() => {}}
        onSubmit={(e) => e.preventDefault()}
        onReset={() => {}}
      />
    );
    const option = screen.getByRole('option', {
      name: t.statusAcknowledged,
    }) as HTMLOptionElement;
    expect(option.value).toBe('acknowledged');
  });
});
