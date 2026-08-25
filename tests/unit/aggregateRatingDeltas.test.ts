import { describe, it, expect } from 'vitest';
import {
  aggregateRatingDeltas,
  type RatingHistoryRow,
} from '@/utils/rating/aggregateRatingDeltas';

const row = (
  user_id: string,
  before: number,
  after: number,
  result: RatingHistoryRow['result'] = 'win'
): RatingHistoryRow => ({
  user_id,
  rating_before: before,
  rating_after: after,
  result,
});

describe('aggregateRatingDeltas', () => {
  it('renvoie une liste vide sans lignes', () => {
    expect(aggregateRatingDeltas([])).toEqual([]);
  });

  it('somme les variations et compte les résultats par joueuse', () => {
    const out = aggregateRatingDeltas([
      row('a', 1500, 1520, 'win'),
      row('a', 1520, 1510, 'loss'),
      row('a', 1510, 1510, 'draw'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      userId: 'a',
      delta: 10,
      matches: 3,
      wins: 1,
      losses: 1,
      draws: 1,
    });
  });

  it('trie par progression décroissante', () => {
    const out = aggregateRatingDeltas([
      row('a', 1500, 1505),
      row('b', 1500, 1560),
      row('c', 1500, 1470, 'loss'),
    ]);
    expect(out.map((r) => r.userId)).toEqual(['b', 'a', 'c']);
  });

  it('départage à progression égale par nombre de matchs puis par id', () => {
    const out = aggregateRatingDeltas([
      row('zoe', 1500, 1510),
      row('amy', 1500, 1505),
      row('amy', 1505, 1510),
    ]);
    // amy : +10 en 2 matchs, zoe : +10 en 1 match → amy devant.
    expect(out.map((r) => r.userId)).toEqual(['amy', 'zoe']);

    const tie = aggregateRatingDeltas([
      row('zoe', 1500, 1510),
      row('amy', 1500, 1510),
    ]);
    expect(tie.map((r) => r.userId)).toEqual(['amy', 'zoe']);
  });

  it('ignore les lignes au delta non fini plutôt que de propager NaN', () => {
    const out = aggregateRatingDeltas([
      row('a', 1500, 1520),
      { user_id: 'a', rating_before: NaN, rating_after: 1500, result: 'win' },
    ]);
    expect(out[0].delta).toBe(20);
    expect(out[0].matches).toBe(1);
  });
});
