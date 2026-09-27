// Tests pour utils/tournaments/poolDistribution.ts — la proposition de
// répartition de la liste d'attente en équipes de 5.

import { describe, it, expect } from 'vitest';
import {
  type PoolWaitingEntry,
  proposePoolSquads,
} from '../../utils/tournaments/poolDistribution';

let clock = 0;
function entry(id: string, team: string | null): PoolWaitingEntry {
  clock += 1;
  return {
    id,
    originTeamId: team,
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, clock)).toISOString(),
  };
}

const opts = { teamSize: 5, registeredTeamIds: [] as string[] };

describe('proposePoolSquads', () => {
  it('fills a core of 3 with 2 players without a team', () => {
    const w = [
      entry('a1', 'A'),
      entry('a2', 'A'),
      entry('a3', 'A'),
      entry('s1', null),
      entry('s2', null),
    ];
    expect(proposePoolSquads(w, opts)).toEqual({
      squads: [
        { kind: 'core', teamId: 'A', entryIds: ['a1', 'a2', 'a3', 's1', 's2'] },
      ],
      leftoverIds: [],
    });
  });

  it('takes from another core (the smallest) when there are not enough solos', () => {
    const w = [
      entry('a1', 'A'),
      entry('a2', 'A'),
      entry('a3', 'A'),
      entry('b1', 'B'),
      entry('b2', 'B'),
      entry('c1', 'C'),
    ];
    const p = proposePoolSquads(w, opts);
    // A (3) est complété par C (le plus petit, 1), puis par B.
    expect(p.squads).toEqual([
      { kind: 'core', teamId: 'A', entryIds: ['a1', 'a2', 'a3', 'c1', 'b1'] },
    ]);
    expect(p.leftoverIds).toEqual(['b2']);
  });

  it('serves the biggest core first', () => {
    const w = [
      entry('b1', 'B'),
      entry('b2', 'B'),
      entry('a1', 'A'),
      entry('a2', 'A'),
      entry('a3', 'A'),
      entry('a4', 'A'),
      entry('s1', null),
    ];
    const p = proposePoolSquads(w, opts);
    expect(p.squads[0]).toEqual({
      kind: 'core',
      teamId: 'A',
      entryIds: ['a1', 'a2', 'a3', 'a4', 's1'],
    });
    expect(p.leftoverIds.sort()).toEqual(['b1', 'b2']);
  });

  it('groups remaining solos in mixed teams of 5 and leaves the rest waiting', () => {
    const w = Array.from({ length: 12 }, (_, i) => entry(`s${i}`, null));
    const p = proposePoolSquads(w, opts);
    expect(p.squads.map((s) => s.kind)).toEqual(['mixed', 'mixed']);
    expect(p.squads.flatMap((s) => s.entryIds)).toHaveLength(10);
    expect(p.leftoverIds).toEqual(['s10', 's11']);
  });

  it('never forms an incomplete team', () => {
    const w = [entry('a1', 'A'), entry('a2', 'A'), entry('s1', null)];
    const p = proposePoolSquads(w, opts);
    expect(p.squads).toEqual([]);
    expect(p.leftoverIds.sort()).toEqual(['a1', 'a2', 's1']);
  });

  it('leftovers of an already registered team count as players without a team', () => {
    const w = [
      entry('a6', 'A'),
      entry('a7', 'A'),
      entry('b1', 'B'),
      entry('b2', 'B'),
      entry('b3', 'B'),
    ];
    const p = proposePoolSquads(w, { teamSize: 5, registeredTeamIds: ['A'] });
    expect(p.squads).toEqual([
      { kind: 'core', teamId: 'B', entryIds: ['b1', 'b2', 'b3', 'a6', 'a7'] },
    ]);
  });

  it('uses every player exactly once', () => {
    const w = [
      ...['A', 'A', 'A', 'B', 'B', 'C', 'C', 'C', 'C', 'D'].map((t, i) =>
        entry(`p${i}`, t)
      ),
      ...Array.from({ length: 7 }, (_, i) => entry(`s${i}`, null)),
    ];
    const p = proposePoolSquads(w, opts);
    const used = [...p.squads.flatMap((s) => s.entryIds), ...p.leftoverIds];
    expect(used.sort()).toEqual(w.map((e) => e.id).sort());
    for (const s of p.squads) expect(s.entryIds).toHaveLength(5);
  });

  it('is deterministic whatever the input order', () => {
    const w = [
      entry('a1', 'A'),
      entry('a2', 'A'),
      entry('b1', 'B'),
      entry('s1', null),
      entry('s2', null),
      entry('s3', null),
    ];
    const reversed = [...w].reverse();
    expect(proposePoolSquads(reversed, opts)).toEqual(
      proposePoolSquads(w, opts)
    );
  });
});
