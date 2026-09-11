// Droits du visiteur sur la fiche équipe publique. Le hook n'est pas rendu
// (pas de jsdom dans le harnais) : on verrouille les deux fonctions pures qui
// décident (1) si l'appel à /api/admin/teams/my part, (2) ce qu'on en tire.
import { describe, it, expect } from 'vitest';
import {
  NO_TEAM_PAGE_ACCESS,
  resolveTeamPageAccess,
  shouldCheckTeamPageAccess,
} from '@/components/Team/useTeamPageAccess';

describe('shouldCheckTeamPageAccess', () => {
  it("n'appelle pas pour un visiteur anonyme", () => {
    expect(shouldCheckTeamPageAccess({ loading: false, userId: null })).toBe(
      false
    );
  });

  it("n'appelle pas tant que la session se résout", () => {
    expect(shouldCheckTeamPageAccess({ loading: true, userId: null })).toBe(
      false
    );
    expect(shouldCheckTeamPageAccess({ loading: true, userId: 'u1' })).toBe(
      false
    );
  });

  it('appelle pour une session ouverte', () => {
    expect(shouldCheckTeamPageAccess({ loading: false, userId: 'u1' })).toBe(
      true
    );
  });
});

describe('resolveTeamPageAccess', () => {
  it('capitaine de cette équipe → édition, pas de scrim connecté', () => {
    expect(
      resolveTeamPageAccess({ team: { id: 't1' }, isCaptain: true }, 't1')
    ).toEqual({ canEdit: true, canProposeScrim: false });
  });

  it("manager d'une autre équipe → scrim connecté, pas d'édition", () => {
    expect(
      resolveTeamPageAccess({ team: { id: 't2' }, isManager: true }, 't1')
    ).toEqual({ canEdit: false, canProposeScrim: true });
  });

  it('simple membre (ni capitaine ni manager) → rien', () => {
    expect(resolveTeamPageAccess({ team: { id: 't1' } }, 't1')).toEqual(
      NO_TEAM_PAGE_ACCESS
    );
  });

  it('aucune équipe gérée → rien, même avec un drapeau', () => {
    expect(resolveTeamPageAccess({ team: null, isCaptain: true }, 't1')).toEqual(
      NO_TEAM_PAGE_ACCESS
    );
    expect(resolveTeamPageAccess(null, 't1')).toEqual(NO_TEAM_PAGE_ACCESS);
  });
});
