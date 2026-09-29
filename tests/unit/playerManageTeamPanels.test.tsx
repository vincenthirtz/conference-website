// @vitest-environment happy-dom
//
// « Gérer mon équipe » découpé (lot P10) : les panneaux de
// features/player/team/ui ne montrent un levier qu'à qui a la permission,
// l'invitation passe par useSchemaForm (aucun état de champ), et un champ de
// ligne enregistré au blur retombe sur la valeur serveur.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import nsManageTeam from '../../lib/i18n/locales/fr/manageTeam';
import nsOverwatchRank from '../../lib/i18n/locales/fr/overwatchRank';
import RosterPanel from '../../features/player/team/ui/RosterPanel';
import InviteByEmailPanel from '../../features/player/team/ui/InviteByEmailPanel';
import InlineCommitInput from '../../features/player/team/ui/InlineCommitInput';
import type { ManagedTeamMemberDto } from '../../features/player/team/schemas';
import { renderPlayer } from './__helpers__/playerHarness';

afterEach(cleanup);

const t = nsManageTeam.fr;
const tRank = nsOverwatchRank.fr;
const TEAM = {
  id: '7e1d0000-0000-4000-8000-000000000001',
  slug: 'alpha',
  name: 'Alpha',
  short_name: 'ALP',
  logo_url: null,
  country: null,
  description: null,
};
const MEMBERS: ManagedTeamMemberDto[] = [
  {
    id: 'm1',
    user_id: 'u1',
    role: 'player',
    battle_tag: 'Cap#1111',
    is_substitute: false,
    is_captain: true,
  },
  {
    id: 'm2',
    user_id: 'u2',
    role: 'player',
    battle_tag: 'Mate#2222',
    is_substitute: false,
  },
];

function roster(canEditRoster: boolean, onAskRemoval = vi.fn()) {
  return renderPlayer(
    <RosterPanel
      t={t}
      tRank={tRank}
      locale="fr"
      team={TEAM}
      members={MEMBERS}
      hasCaptain
      canEditRoster={canEditRoster}
      canEditTeamInfo={false}
      actionLoading={null}
      memberLabel={(m) => m.battle_tag ?? '?'}
      roleLabel={() => t.optionPlayer}
      onCommitTeamSkillRating={async () => 'reset'}
      onCommitTeamIdentity={async () => 'reset'}
      rightsPanel={() => null}
      rowHandlers={() => ({
        confirmingRemoval: false,
        roleLocked: false,
        rightsOpen: false,
        onCommitBattleTag: async () => 'reset',
        onCommitSkillRating: async () => 'reset',
        onSpecialty: vi.fn(),
        onRole: vi.fn(),
        onToggleRights: vi.fn(),
        onPromote: vi.fn(),
        onAskRemoval,
        onCancelRemoval: vi.fn(),
        onRemove: vi.fn(),
      })}
    />
  );
}

describe('RosterPanel', () => {
  it('une membre sans manage_roster voit le roster, sans aucun levier', () => {
    roster(false);
    expect(screen.getByText('Mate#2222')).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.removeTitle })).toBeNull();
  });

  it('avec manage_roster : exclure est proposé, jamais sur la capitaine', () => {
    const ask = vi.fn();
    roster(true, ask);
    const buttons = screen.getAllByRole('button', { name: t.removeTitle });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(ask).toHaveBeenCalledTimes(1);
  });
});

describe('InviteByEmailPanel', () => {
  it('envoie { email, role } et vide l’adresse après succès', async () => {
    const onInvite = vi.fn(async () => true);
    renderPlayer(
      <InviteByEmailPanel
        t={t}
        hasCaptain
        busy={false}
        result={null}
        onInvite={onInvite}
        copyButton={() => null}
      />
    );
    // Capitaine en poste : on ne propose pas d'en désigner une.
    expect(screen.queryByRole('option', { name: t.captain })).toBeNull();
    const email = screen.getByLabelText(new RegExp(t.inviteEmailLabel));
    await act(async () => {
      fireEvent.change(email, { target: { value: ' new@example.com ' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.inviteCta }));
    });
    expect(onInvite).toHaveBeenCalledWith({
      email: 'new@example.com',
      role: 'player',
    });
    expect((email as HTMLInputElement).value).toBe('');
  });
});

describe('InlineCommitInput', () => {
  it('au blur : `reset` rend la valeur serveur, `kept` garde la saisie', async () => {
    let answer: 'reset' | 'kept' = 'kept';
    const onCommit = vi.fn(async () => answer);
    renderPlayer(
      <InlineCommitInput
        aria-label="SR"
        serverValue="2500"
        onCommit={onCommit}
      />
    );
    const input = screen.getByLabelText('SR') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'abc' } });
      fireEvent.blur(input);
    });
    expect(onCommit).toHaveBeenCalledWith('abc');
    expect(input.value).toBe('abc');

    answer = 'reset';
    await act(async () => {
      fireEvent.blur(input);
    });
    expect(input.value).toBe('2500');
  });
});
