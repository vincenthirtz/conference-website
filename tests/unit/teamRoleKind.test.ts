// utils/teams/roleKind — nature d'un rôle d'équipe.
//
// Ce prédicat est partagé par la règle BattleTag côté API et par TOUS les
// écrans qui affichent un effectif (cockpit staff, espace capitaine, page
// publique, roster de tournoi, panneaux régie). S'il dérive, un coach ou une
// manager redevient une joueuse quelque part.

import { describe, it, expect } from 'vitest';
import {
  isNonPlayingTeamRole,
  roleRequiresBattleTag,
  splitTeamMembers,
  countPlayingMembers,
  NON_PLAYING_TEAM_ROLES,
} from '../../utils/teams/roleKind';

describe('isNonPlayingTeamRole', () => {
  it('couvre coach ET manager', () => {
    expect(NON_PLAYING_TEAM_ROLES).toEqual(['coach', 'manager']);
    expect(isNonPlayingTeamRole('coach')).toBe(true);
    expect(isNonPlayingTeamRole('manager')).toBe(true);
  });

  it('tolère la casse et les espaces', () => {
    expect(isNonPlayingTeamRole('  Manager ')).toBe(true);
    expect(isNonPlayingTeamRole('COACH')).toBe(true);
  });

  it('laisse les rôles jouants (et l’inconnu) du côté joueuses', () => {
    for (const role of ['player', 'substitute', 'captain', 'dps', '', null]) {
      expect(isNonPlayingTeamRole(role)).toBe(false);
      expect(roleRequiresBattleTag(role)).toBe(true);
    }
  });

  it('n’exige pas de BattleTag de l’encadrement', () => {
    expect(roleRequiresBattleTag('coach')).toBe(false);
    expect(roleRequiresBattleTag('manager')).toBe(false);
  });
});

describe('splitTeamMembers', () => {
  const members = [
    { id: 'p1', role: 'player', is_substitute: false },
    { id: 's1', role: 'substitute', is_substitute: true },
    { id: 'c1', role: 'coach', is_substitute: false },
    { id: 'm1', role: 'manager', is_substitute: false },
    { id: 'p2', role: null, is_substitute: false },
  ];

  it('sort l’encadrement du roster jouant', () => {
    const { roster, subs, staff } = splitTeamMembers(members);
    expect(roster.map((m) => m.id)).toEqual(['p1', 'p2']);
    expect(subs.map((m) => m.id)).toEqual(['s1']);
    expect(staff.map((m) => m.id)).toEqual(['c1', 'm1']);
  });

  it('classe l’encadrement en staff même marqué remplaçant', () => {
    // Le rôle prime : un coach coché « remplaçant » reste de l'encadrement,
    // sinon il serait compté deux fois (staff ET banc).
    const { subs, staff } = splitTeamMembers([
      { id: 'c2', role: 'coach', is_substitute: true },
    ]);
    expect(subs).toEqual([]);
    expect(staff.map((m) => m.id)).toEqual(['c2']);
  });

  it('ne perd aucun membre', () => {
    const { roster, subs, staff } = splitTeamMembers(members);
    expect(roster.length + subs.length + staff.length).toBe(members.length);
  });

  it('accepte une liste vide', () => {
    expect(splitTeamMembers([])).toEqual({ roster: [], subs: [], staff: [] });
  });
});

describe('countPlayingMembers', () => {
  // Ce compteur pilote « équipe pleine » (MAX_TEAM_PLAYERS), l'éligibilité
  // `min_players` et le plafond du formulaire de création. Règle produit :
  // l'encadrement ne consomme JAMAIS de place, quoi qu'il arrive.
  it('ne compte que les joueuses', () => {
    expect(
      countPlayingMembers([
        { role: 'player' },
        { role: 'substitute' },
        { role: 'coach' },
        { role: 'manager' },
      ])
    ).toBe(2);
  });

  it('compte les rôles inconnus ou vides comme jouants', () => {
    expect(countPlayingMembers([{ role: null }, {}])).toBe(2);
  });

  it('tolère un embed absent', () => {
    expect(countPlayingMembers(undefined)).toBe(0);
    expect(countPlayingMembers(null)).toBe(0);
    expect(countPlayingMembers([])).toBe(0);
  });
});
