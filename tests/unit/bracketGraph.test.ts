import { describe, it, expect } from 'vitest';
import {
  buildBracketGraph,
  buildColumnsBySideAndGroup,
  makeSideGroupKey,
  parseSideGroupKey,
  listSideGroupKeys,
  getColumnMatches,
} from '../../utils/bracket/buildGraph';
import type { MatchForGraph } from '../../utils/bracket/buildGraph';

function makeMatch(
  id: string,
  overrides: Partial<MatchForGraph> = {}
): MatchForGraph {
  return {
    id,
    tournament_id: 't1',
    bracket_side: 'wb',
    round_number: 1,
    group_key: null,
    next_match_win_id: null,
    next_match_lose_id: null,
    ...overrides,
  };
}

describe('makeSideGroupKey / parseSideGroupKey', () => {
  it('creates key from side and group', () => {
    expect(makeSideGroupKey('wb', 'A')).toBe('wb::A');
    expect(makeSideGroupKey('lb', null)).toBe('lb::');
    expect(makeSideGroupKey('final', '')).toBe('final::');
  });

  it('parses key back to side and group', () => {
    expect(parseSideGroupKey('wb::A')).toEqual({ side: 'wb', groupKey: 'A' });
    expect(parseSideGroupKey('lb::')).toEqual({ side: 'lb', groupKey: null });
    expect(parseSideGroupKey('final::')).toEqual({
      side: 'final',
      groupKey: null,
    });
  });
});

describe('buildBracketGraph', () => {
  it('returns empty graph for no matches', () => {
    const graph = buildBracketGraph([]);
    expect(Object.keys(graph.nodes)).toHaveLength(0);
  });

  it('builds nodes with correct properties', () => {
    const matches = [makeMatch('m1', { bracket_side: 'wb', round_number: 1 })];
    const graph = buildBracketGraph(matches);

    expect(graph.nodes['m1']).toBeDefined();
    expect(graph.nodes['m1'].side).toBe('wb');
    expect(graph.nodes['m1'].roundNumber).toBe(1);
  });

  it('builds edges from next_match_win_id', () => {
    const matches = [
      makeMatch('m1', { next_match_win_id: 'm3', round_number: 1 }),
      makeMatch('m2', { next_match_win_id: 'm3', round_number: 1 }),
      makeMatch('m3', { round_number: 2 }),
    ];

    const graph = buildBracketGraph(matches);

    // m1 and m2 feed into m3
    expect(graph.nodes['m3'].incomingFrom).toContain('m1');
    expect(graph.nodes['m3'].incomingFrom).toContain('m2');

    // m1 goes out to m3
    expect(graph.nodes['m1'].outgoingTo).toContain('m3');
    expect(graph.nodes['m2'].outgoingTo).toContain('m3');
  });

  it('builds edges from next_match_lose_id', () => {
    const matches = [
      makeMatch('m1', { bracket_side: 'wb', next_match_lose_id: 'lb1' }),
      makeMatch('lb1', { bracket_side: 'lb' }),
    ];

    const graph = buildBracketGraph(matches);
    expect(graph.nodes['lb1'].incomingFrom).toContain('m1');
    expect(graph.nodes['m1'].outgoingTo).toContain('lb1');
  });

  it('identifies roots correctly (no incoming edges)', () => {
    const matches = [
      makeMatch('m1', { next_match_win_id: 'm3', round_number: 1 }),
      makeMatch('m2', { next_match_win_id: 'm3', round_number: 1 }),
      makeMatch('m3', { round_number: 2 }),
    ];

    const graph = buildBracketGraph(matches);
    const key = makeSideGroupKey('wb', null);

    expect(graph.rootsBySideAndGroup[key]).toContain('m1');
    expect(graph.rootsBySideAndGroup[key]).toContain('m2');
    expect(graph.rootsBySideAndGroup[key]).not.toContain('m3');
  });

  it('identifies leaves correctly (no outgoing edges)', () => {
    const matches = [
      makeMatch('m1', { next_match_win_id: 'm3' }),
      makeMatch('m2', { next_match_win_id: 'm3' }),
      makeMatch('m3'),
    ];

    const graph = buildBracketGraph(matches);
    const key = makeSideGroupKey('wb', null);

    expect(graph.leavesBySideAndGroup[key]).toContain('m3');
    expect(graph.leavesBySideAndGroup[key]).not.toContain('m1');
  });
});

describe('buildColumnsBySideAndGroup', () => {
  it('creates BFS layers from roots', () => {
    // 4 quarterfinals → 2 semifinals → 1 final
    const matches = [
      makeMatch('qf1', { next_match_win_id: 'sf1', round_number: 1 }),
      makeMatch('qf2', { next_match_win_id: 'sf1', round_number: 1 }),
      makeMatch('qf3', { next_match_win_id: 'sf2', round_number: 1 }),
      makeMatch('qf4', { next_match_win_id: 'sf2', round_number: 1 }),
      makeMatch('sf1', { next_match_win_id: 'f1', round_number: 2 }),
      makeMatch('sf2', { next_match_win_id: 'f1', round_number: 2 }),
      makeMatch('f1', { round_number: 3 }),
    ];

    const graph = buildBracketGraph(matches);
    const columns = buildColumnsBySideAndGroup(graph);
    const key = makeSideGroupKey('wb', null);

    expect(columns[key]).toHaveLength(3); // [qf1-4], [sf1-2], [f1]
    expect(columns[key][0].matchIds).toHaveLength(4);
    expect(columns[key][1].matchIds).toHaveLength(2);
    expect(columns[key][2].matchIds).toEqual(['f1']);
  });
});

describe('listSideGroupKeys', () => {
  it('returns sorted keys with wb before lb before final', () => {
    const matches = [
      makeMatch('final1', { bracket_side: 'final' }),
      makeMatch('lb1', { bracket_side: 'lb' }),
      makeMatch('wb1', { bracket_side: 'wb' }),
    ];

    const graph = buildBracketGraph(matches);
    const keys = listSideGroupKeys(graph);

    expect(keys[0]).toBe('wb::');
    expect(keys[1]).toBe('lb::');
    expect(keys[2]).toBe('final::');
  });
});

describe('getColumnMatches', () => {
  it('returns node objects for column match ids', () => {
    const matches = [makeMatch('m1'), makeMatch('m2')];
    const graph = buildBracketGraph(matches);

    const nodes = getColumnMatches(graph, { matchIds: ['m1', 'm2'] });
    expect(nodes).toHaveLength(2);
    expect(nodes[0].id).toBe('m1');
    expect(nodes[1].id).toBe('m2');
  });
});
