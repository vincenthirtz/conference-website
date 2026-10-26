// Tests de features/admin/tournaments/poolOverview.ts — l'aperçu des
// inscrites d'un tournoi regroupé (onglet Phases › Inscrites).

import { describe, it, expect } from 'vitest';
import { buildPoolOverview } from '../../features/admin/tournaments/poolOverview';
import type {
  AdminPoolEntry,
  AdminPoolView,
} from '../../features/admin/tournaments/model';

const entry = (
  id: string,
  originTeamId: string | null = null,
  originTeamName: string | null = null
): AdminPoolEntry => ({
  id,
  displayName: `J-${id}`,
  battleTag: `${id}#1`,
  originTeamId,
  originTeamName,
  createdAt: '2026-10-01T00:00:00Z',
});

function view(over: Partial<AdminPoolView> = {}): AdminPoolView {
  return {
    teamSize: 5,
    squads: [],
    waitlist: [],
    proposal: { squads: [], leftoverIds: [] },
    ...over,
  };
}

describe('buildPoolOverview', () => {
  it('shows the real roster of a directly entered team, substitutes apart', () => {
    const o = buildPoolOverview(
      view({
        squads: [
          {
            teamId: 'T1',
            teamName: 'La dreamteam',
            mixed: false,
            members: [],
            roster: [
              {
                id: 'r1',
                displayName: 'Tank',
                battleTag: 'Tank#1',
                isSubstitute: false,
              },
              {
                id: 'r2',
                displayName: 'Remp',
                battleTag: null,
                isSubstitute: true,
              },
            ],
          },
        ],
      })
    );
    expect(o.teams[0].source).toBe('roster');
    expect(o.teams[0].starters).toBe(1);
    expect(o.teams[0].players.map((p) => [p.name, p.substitute])).toEqual([
      ['Tank', false],
      ['Remp', true],
    ]);
  });

  it('prefers the pooled line-up and names players from another team', () => {
    const o = buildPoolOverview(
      view({
        squads: [
          {
            teamId: 'T1',
            teamName: 'Alpha',
            mixed: false,
            members: [
              entry('a', 'T1', 'Alpha'),
              entry('b', 'T2', 'Beta'),
              entry('c'),
            ],
            roster: [
              {
                id: 'r1',
                displayName: 'Hors soirée',
                battleTag: null,
                isSubstitute: false,
              },
            ],
          },
        ],
      })
    );
    const t = o.teams[0];
    expect(t.source).toBe('pool');
    expect(t.players.map((p) => p.fromTeam)).toEqual([null, 'Beta', null]);
    expect(o.counts.playersInTeams).toBe(3);
  });

  it('marks a team with nobody to show', () => {
    const squad = {
      teamId: 'M',
      teamName: 'Mixte',
      mixed: true,
      members: [],
      roster: [],
    };
    expect(buildPoolOverview(view({ squads: [squad] })).teams[0].source).toBe(
      'none'
    );
    // Réponse d'une API pas encore à jour : pas de `roster` du tout.
    const { roster: _omit, ...legacy } = squad;
    expect(
      buildPoolOverview(view({ squads: [legacy as never] })).teams[0].source
    ).toBe('none');
  });

  it('groups the waitlist by origin team, biggest core first, solos apart', () => {
    const o = buildPoolOverview(
      view({
        waitlist: [
          entry('s1'),
          entry('c1', 'C', 'Chocomates'),
          entry('b1', 'B', 'Bravo'),
          entry('c2', 'C', 'Chocomates'),
          entry('s2'),
          entry('a1', 'A', 'Alpha'),
        ],
      })
    );
    expect(
      o.waitingByTeam.map((g) => [g.teamName, g.entries.map((e) => e.id)])
    ).toEqual([
      ['Chocomates', ['c1', 'c2']],
      ['Alpha', ['a1']],
      ['Bravo', ['b1']],
    ]);
    expect(o.solos.map((e) => e.id)).toEqual(['s1', 's2']);
    expect(o.counts).toEqual({
      teams: 0,
      playersInTeams: 0,
      waiting: 6,
      solos: 2,
    });
  });
});
