// @vitest-environment happy-dom
//
// Gestion à la main de la répartition (pages/admin/tournament/[id]/pool) :
// en-tête d'équipe (renommer une équipe formée par le staff seulement,
// suppression bloquée dès qu'il y a des matchs) et ligne d'une joueuse
// (correction, retrait, pastille « ajoutée à la main »).

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import PoolEntryLine from '@/features/admin/tournaments/ui/pool/PoolEntryLine';
import PoolSquadHeader from '@/features/admin/tournaments/ui/pool/PoolSquadHeader';
import type {
  AdminPoolEntry,
  AdminPoolView,
} from '@/features/admin/tournaments/model';
import nsAdminTournamentPool from '@/lib/i18n/locales/admin-fr/adminTournamentPool';

const t = nsAdminTournamentPool.fr;

afterEach(cleanup);

const entry = (over: Partial<AdminPoolEntry> = {}): AdminPoolEntry => ({
  id: 'e1',
  displayName: 'Mira',
  battleTag: 'Mira#1234',
  originTeamId: null,
  originTeamName: null,
  createdAt: '2026-10-29T10:00:00Z',
  manual: false,
  ...over,
});

const squad = (
  over: Partial<AdminPoolView['squads'][number]> = {}
): AdminPoolView['squads'][number] => ({
  teamId: 't1',
  teamName: 'Citrouilles',
  mixed: true,
  members: [],
  roster: [],
  hasMatches: false,
  ...over,
});

describe('PoolSquadHeader', () => {
  it('renomme une équipe formée par le staff', async () => {
    const onRename = vi.fn(async () => true);
    render(
      <PoolSquadHeader
        squad={squad()}
        size={5}
        busy={false}
        onRename={onRename}
        onDissolve={() => {}}
      />
    );
    fireEvent.click(screen.getByText(t.rename));
    const field = screen.getByLabelText(t.teamNameLabel);
    fireEvent.change(field, { target: { value: '  Fantômes  ' } });
    fireEvent.click(screen.getByText(t.save));
    expect(onRename).toHaveBeenCalledWith('Fantômes');
  });

  it('ne propose pas de renommer une vraie équipe du site', () => {
    render(
      <PoolSquadHeader
        squad={squad({ mixed: false })}
        size={5}
        busy={false}
        onRename={async () => true}
        onDissolve={() => {}}
      />
    );
    expect(screen.queryByText(t.rename)).toBeNull();
    expect(screen.getByText(t.dissolve)).toBeTruthy();
  });

  it('bloque la suppression d’une équipe qui a des matchs', () => {
    const onDissolve = vi.fn();
    render(
      <PoolSquadHeader
        squad={squad({ hasMatches: true })}
        size={5}
        busy={false}
        onRename={async () => true}
        onDissolve={onDissolve}
      />
    );
    const button = screen.getByText(t.dissolve) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe(t.dissolveLocked);
    fireEvent.click(button);
    expect(onDissolve).not.toHaveBeenCalled();
  });
});

describe('PoolEntryLine', () => {
  function renderLine(
    e: AdminPoolEntry,
    handlers: Partial<{
      onSave: (draft: {
        displayName: string;
        battleTag: string;
      }) => Promise<boolean>;
      onWithdraw: (entry: AdminPoolEntry) => void;
    }> = {}
  ) {
    return render(
      <PoolEntryLine
        entry={e}
        detail={e.battleTag}
        busy={false}
        onSave={handlers.onSave ?? (async () => true)}
        onWithdraw={handlers.onWithdraw ?? (() => {})}
      />
    );
  }

  it('signale une joueuse ajoutée à la main', () => {
    renderLine(entry({ manual: true }));
    expect(screen.getByText(t.manualChip)).toBeTruthy();
  });

  it('corrige pseudo et BattleTag (valeurs nettoyées), puis referme', async () => {
    const onSave = vi.fn(async () => true);
    renderLine(entry(), { onSave });
    expect(screen.queryByText(t.manualChip)).toBeNull();
    fireEvent.click(screen.getByText(t.edit));
    const name = screen.getByLabelText(t.fieldName) as HTMLInputElement;
    expect(name.value).toBe('Mira');
    fireEvent.change(name, { target: { value: ' Mirabelle ' } });
    fireEvent.click(screen.getByText(t.save));
    expect(onSave).toHaveBeenCalledWith({
      displayName: 'Mirabelle',
      battleTag: 'Mira#1234',
    });
    await waitFor(() => expect(screen.queryByText(t.save)).toBeNull());
  });

  it('refuse d’enregistrer un BattleTag trop court', () => {
    const onSave = vi.fn(async () => true);
    renderLine(entry(), { onSave });
    fireEvent.click(screen.getByText(t.edit));
    fireEvent.change(screen.getByLabelText(t.fieldBattleTag), {
      target: { value: 'M#' },
    });
    const save = screen.getByText(t.save) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('retire la joueuse', () => {
    const onWithdraw = vi.fn();
    const e = entry();
    renderLine(e, { onWithdraw });
    fireEvent.click(screen.getByText(t.withdraw));
    expect(onWithdraw).toHaveBeenCalledWith(e);
  });
});
