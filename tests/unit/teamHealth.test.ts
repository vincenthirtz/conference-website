// Unit tests — santé d'équipe (N3), cœur pur.
//
// Un diagnostic se juge moins sur ce qu'il signale que sur ce qu'il REFUSE de
// signaler. Ces tests verrouillent donc surtout les silences :
//
//   - rien quand tout va bien (une carte qui dit toujours « 0 problème »
//     entraîne à ne plus la lire) ;
//   - pas de rythme réclamé à une équipe d'une seule personne ;
//   - pas de double comptage d'une même personne dans deux constats ;
//   - un ordre stable, du bloquant à l'accessoire.

import { describe, it, expect } from 'vitest';

import {
  computeTeamHealth,
  countBlocking,
  UNREVIEWED_THRESHOLD,
  type TeamHealthFacts,
} from '../../utils/teams/teamHealth';

/** Équipe en parfait état — la base dont on dévie cas par cas. */
function healthy(over: Partial<TeamHealthFacts> = {}): TeamHealthFacts {
  return {
    memberCount: 5,
    starters: 5,
    requiredStarters: 5,
    hasCaptain: true,
    missingBattleTags: 0,
    unverifiedBattleTags: 0,
    discordUnlinked: 0,
    neverLoggedIn: 0,
    rhythmDeclared: 5,
    hasLiveScrimSearch: true,
    hasRhythmCore: true,
    unreviewedEncounters: 0,
    ...over,
  };
}

const codes = (facts: TeamHealthFacts) =>
  computeTeamHealth(facts).map((i) => i.code);

describe('silences', () => {
  it('ne signale rien à une équipe en règle', () => {
    expect(computeTeamHealth(healthy())).toEqual([]);
  });

  it('ne réclame pas de rythme à une équipe d’une seule personne', () => {
    // Un « noyau » à une joueuse n'a pas de sens : ce serait du bruit.
    const solo = healthy({
      memberCount: 1,
      starters: 1,
      requiredStarters: 1,
      rhythmDeclared: 0,
    });
    expect(codes(solo)).not.toContain('no_rhythm');
  });

  it('ne signale pas un roster en excédent comme un manque', () => {
    const large = healthy({ memberCount: 8, starters: 7, rhythmDeclared: 8 });
    expect(codes(large)).not.toContain('roster_shortfall');
  });

  it('tolère quelques débriefs en retard avant d’en parler', () => {
    const few = healthy({ unreviewedEncounters: UNREVIEWED_THRESHOLD - 1 });
    expect(codes(few)).not.toContain('unreviewed_encounters');
    const many = healthy({ unreviewedEncounters: UNREVIEWED_THRESHOLD });
    expect(codes(many)).toContain('unreviewed_encounters');
  });
});

describe('constats bloquants', () => {
  it('signale un capitanat vacant', () => {
    const issues = computeTeamHealth(healthy({ hasCaptain: false }));
    expect(issues[0]).toEqual({
      code: 'no_captain',
      severity: 'blocking',
      count: 0,
    });
  });

  it('compte les titulaires qui manquent, pas l’effectif présent', () => {
    const issues = computeTeamHealth(
      healthy({ starters: 3, requiredStarters: 5 })
    );
    const shortfall = issues.find((i) => i.code === 'roster_shortfall');
    expect(shortfall).toEqual({
      code: 'roster_shortfall',
      severity: 'blocking',
      count: 2,
    });
  });

  it('traite un BattleTag absent comme bloquant, un non vérifié comme un avertissement', () => {
    const issues = computeTeamHealth(
      healthy({ missingBattleTags: 1, unverifiedBattleTags: 2 })
    );
    expect(issues.find((i) => i.code === 'missing_battle_tag')?.severity).toBe(
      'blocking'
    );
    expect(
      issues.find((i) => i.code === 'unverified_battle_tag')?.severity
    ).toBe('warning');
  });
});

describe('réseau', () => {
  it('signale l’invisibilité quand il n’y a ni annonce ni noyau', () => {
    const issues = computeTeamHealth(
      healthy({ hasLiveScrimSearch: false, hasRhythmCore: false })
    );
    expect(issues.map((i) => i.code)).toContain('invisible_for_scrims');
  });

  it('ne signale rien tant qu’un seul des deux canaux vit', () => {
    expect(
      codes(healthy({ hasLiveScrimSearch: false, hasRhythmCore: true }))
    ).not.toContain('invisible_for_scrims');
    expect(
      codes(healthy({ hasLiveScrimSearch: true, hasRhythmCore: false }))
    ).not.toContain('invisible_for_scrims');
  });

  it('compte les membres qui n’ont PAS déclaré, pas ceux qui l’ont fait', () => {
    const issues = computeTeamHealth(
      healthy({ memberCount: 6, rhythmDeclared: 2 })
    );
    expect(issues.find((i) => i.code === 'no_rhythm')?.count).toBe(4);
  });
});

describe('ordre et synthèse', () => {
  it('remonte le bloquant avant l’avertissement, et l’avertissement avant l’accessoire', () => {
    const issues = computeTeamHealth(
      healthy({
        hasCaptain: false,
        discordUnlinked: 2,
        unreviewedEncounters: 5,
        hasLiveScrimSearch: false,
        hasRhythmCore: false,
      })
    );
    const severities = issues.map((i) => i.severity);
    const rank = { blocking: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < severities.length; i += 1) {
      expect(rank[severities[i]]).toBeGreaterThanOrEqual(
        rank[severities[i - 1]]
      );
    }
  });

  it('classe le plus nombreux devant à gravité égale', () => {
    const issues = computeTeamHealth(
      healthy({ discordUnlinked: 1, neverLoggedIn: 4 })
    );
    const warnings = issues.filter((i) => i.severity === 'warning');
    expect(warnings[0].code).toBe('never_logged_in');
  });

  it('ne compte comme bloquant que ce qui l’est', () => {
    const issues = computeTeamHealth(
      healthy({
        hasCaptain: false,
        starters: 4,
        discordUnlinked: 3,
        unreviewedEncounters: 9,
      })
    );
    expect(countBlocking(issues)).toBe(2);
  });
});
