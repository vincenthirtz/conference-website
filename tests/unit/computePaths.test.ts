import { describe, it, expect } from 'vitest';
import {
  buildBracketGraph,
  makeSideGroupKey,
} from '../../utils/bracket/buildGraph';
import type { MatchForGraph } from '../../utils/bracket/buildGraph';
import {
  computeBracketLayout,
  sliceLayoutForSideGroup,
  computeLayoutBySideGroup,
} from '../../utils/bracket/computePaths';

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

/**
 * Helper: build a standard 4-match single-elim bracket (QF → SF → F).
 *
 *   qf1 ─┐
 *         ├─ sf1 ─┐
 *   qf2 ─┘       │
 *                 ├─ f1
 *   qf3 ─┐       │
 *         ├─ sf2 ─┘
 *   qf4 ─┘
 */
function makeStandardBracket() {
  return [
    makeMatch('qf1', { next_match_win_id: 'sf1', round_number: 1 }),
    makeMatch('qf2', { next_match_win_id: 'sf1', round_number: 1 }),
    makeMatch('qf3', { next_match_win_id: 'sf2', round_number: 1 }),
    makeMatch('qf4', { next_match_win_id: 'sf2', round_number: 1 }),
    makeMatch('sf1', { next_match_win_id: 'f1', round_number: 2 }),
    makeMatch('sf2', { next_match_win_id: 'f1', round_number: 2 }),
    makeMatch('f1', { round_number: 3 }),
  ];
}

describe('computeBracketLayout', () => {
  it('returns empty layout for empty graph', () => {
    const graph = buildBracketGraph([]);
    const layout = computeBracketLayout(graph);

    expect(Object.keys(layout.positions)).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
    expect(Object.keys(layout.columnsByKey)).toHaveLength(0);
  });

  it('assigns positions to every match', () => {
    const graph = buildBracketGraph(makeStandardBracket());
    const layout = computeBracketLayout(graph);

    expect(Object.keys(layout.positions)).toHaveLength(7);
    for (const matchId of ['qf1', 'qf2', 'qf3', 'qf4', 'sf1', 'sf2', 'f1']) {
      expect(layout.positions[matchId]).toBeDefined();
    }
  });

  it('assigns correct column indices per round', () => {
    const graph = buildBracketGraph(makeStandardBracket());
    const layout = computeBracketLayout(graph);

    // QFs in column 0, SFs in column 1, Final in column 2
    expect(layout.positions['qf1'].columnIndex).toBe(0);
    expect(layout.positions['qf2'].columnIndex).toBe(0);
    expect(layout.positions['sf1'].columnIndex).toBe(1);
    expect(layout.positions['f1'].columnIndex).toBe(2);
  });

  it('assigns row indices within columns', () => {
    const graph = buildBracketGraph(makeStandardBracket());
    const layout = computeBracketLayout(graph);

    // QFs should have row indices 0-3
    const qfRows = ['qf1', 'qf2', 'qf3', 'qf4'].map(
      (id) => layout.positions[id].rowIndex
    );
    expect(new Set(qfRows).size).toBe(4); // all unique

    // SFs should have row indices 0-1
    const sfRows = ['sf1', 'sf2'].map(
      (id) => layout.positions[id].rowIndex
    );
    expect(new Set(sfRows).size).toBe(2);
  });

  it('creates edges between connected matches', () => {
    const graph = buildBracketGraph(makeStandardBracket());
    const layout = computeBracketLayout(graph);

    // Should have edges: qf1→sf1, qf2→sf1, qf3→sf2, qf4→sf2, sf1→f1, sf2→f1
    expect(layout.edges).toHaveLength(6);

    const edgeKeys = layout.edges.map(
      (e) => `${e.fromMatchId}->${e.toMatchId}`
    );
    expect(edgeKeys).toContain('qf1->sf1');
    expect(edgeKeys).toContain('qf2->sf1');
    expect(edgeKeys).toContain('sf1->f1');
    expect(edgeKeys).toContain('sf2->f1');
  });

  it('does not create duplicate edges', () => {
    const graph = buildBracketGraph(makeStandardBracket());
    const layout = computeBracketLayout(graph);

    const edgeKeys = layout.edges.map(
      (e) => `${e.fromMatchId}->${e.toMatchId}`
    );
    expect(edgeKeys.length).toBe(new Set(edgeKeys).size);
  });

  it('edges have consistent from/to position references', () => {
    const graph = buildBracketGraph(makeStandardBracket());
    const layout = computeBracketLayout(graph);

    for (const edge of layout.edges) {
      expect(edge.from).toEqual(layout.positions[edge.fromMatchId]);
      expect(edge.to).toEqual(layout.positions[edge.toMatchId]);
    }
  });

  it('does not create cross-side edges', () => {
    const matches = [
      makeMatch('wb1', { bracket_side: 'wb', next_match_lose_id: 'lb1' }),
      makeMatch('lb1', { bracket_side: 'lb' }),
    ];

    const graph = buildBracketGraph(matches);
    const layout = computeBracketLayout(graph);

    // Edge wb1→lb1 should NOT exist (different sideGroupKey)
    const crossEdges = layout.edges.filter(
      (e) =>
        e.from.sideGroupKey !== e.to.sideGroupKey
    );
    expect(crossEdges).toHaveLength(0);
  });
});

describe('sliceLayoutForSideGroup', () => {
  it('returns only data for the requested side+group', () => {
    const matches = [
      makeMatch('wb1', { bracket_side: 'wb', next_match_win_id: 'wb2' }),
      makeMatch('wb2', { bracket_side: 'wb', round_number: 2 }),
      makeMatch('lb1', { bracket_side: 'lb' }),
    ];

    const graph = buildBracketGraph(matches);
    const layout = computeBracketLayout(graph);

    const wbKey = makeSideGroupKey('wb', null);
    const sliced = sliceLayoutForSideGroup(layout, wbKey);

    expect(Object.keys(sliced.positions)).toHaveLength(2);
    expect(sliced.positions['wb1']).toBeDefined();
    expect(sliced.positions['wb2']).toBeDefined();
    expect(sliced.positions['lb1']).toBeUndefined();
  });

  it('returns empty data for non-existent key', () => {
    const graph = buildBracketGraph([makeMatch('m1')]);
    const layout = computeBracketLayout(graph);

    const sliced = sliceLayoutForSideGroup(layout, 'nonexistent::');
    expect(sliced.columns).toHaveLength(0);
    expect(Object.keys(sliced.positions)).toHaveLength(0);
    expect(sliced.edges).toHaveLength(0);
  });

  it('includes only edges within the side', () => {
    const graph = buildBracketGraph(makeStandardBracket());
    const layout = computeBracketLayout(graph);

    const wbKey = makeSideGroupKey('wb', null);
    const sliced = sliceLayoutForSideGroup(layout, wbKey);

    for (const edge of sliced.edges) {
      expect(edge.from.sideGroupKey).toBe(wbKey);
      expect(edge.to.sideGroupKey).toBe(wbKey);
    }
  });
});

describe('computeLayoutBySideGroup', () => {
  it('returns layout grouped by side+group keys', () => {
    const matches = [
      makeMatch('wb1', { bracket_side: 'wb' }),
      makeMatch('lb1', { bracket_side: 'lb' }),
      makeMatch('f1', { bracket_side: 'final' }),
    ];

    const graph = buildBracketGraph(matches);
    const grouped = computeLayoutBySideGroup(graph);

    const wbKey = makeSideGroupKey('wb', null);
    const lbKey = makeSideGroupKey('lb', null);
    const finalKey = makeSideGroupKey('final', null);

    expect(grouped[wbKey]).toBeDefined();
    expect(grouped[lbKey]).toBeDefined();
    expect(grouped[finalKey]).toBeDefined();
  });

  it('each group has isolated positions and edges', () => {
    const matches = [
      makeMatch('wb1', { bracket_side: 'wb', next_match_win_id: 'wb2' }),
      makeMatch('wb2', { bracket_side: 'wb', round_number: 2 }),
      makeMatch('lb1', { bracket_side: 'lb' }),
    ];

    const graph = buildBracketGraph(matches);
    const grouped = computeLayoutBySideGroup(graph);

    const wbKey = makeSideGroupKey('wb', null);
    const lbKey = makeSideGroupKey('lb', null);

    // wb group should have 2 matches, lb group 1
    expect(Object.keys(grouped[wbKey].positions)).toHaveLength(2);
    expect(Object.keys(grouped[lbKey].positions)).toHaveLength(1);

    // wb should have 1 edge (wb1→wb2), lb should have 0
    expect(grouped[wbKey].edges).toHaveLength(1);
    expect(grouped[lbKey].edges).toHaveLength(0);
  });
});
