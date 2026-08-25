import { describe, it, expect } from 'vitest';
import {
  buildHallOfFame,
  type HallOfFamePlacementRow,
} from '@/utils/profile/buildHallOfFame';

const row = (
  userId: string,
  tournamentId: string,
  rank: number,
  date: string | null = '2026-01-01'
): HallOfFamePlacementRow => ({
  userId,
  tournamentId,
  tournamentName: `Tournoi ${tournamentId}`,
  tournamentSlug: tournamentId,
  teamId: 'team',
  teamName: 'Team',
  rank,
  date,
});

describe('buildHallOfFame', () => {
  it('renvoie une liste vide sans participation', () => {
    expect(buildHallOfFame([])).toEqual([]);
  });

  it('compte titres, finales, podiums et meilleur rang', () => {
    const [entry] = buildHallOfFame([
      row('a', 't1', 1),
      row('a', 't2', 2),
      row('a', 't3', 5),
    ]);
    expect(entry).toMatchObject({
      userId: 'a',
      titles: 1,
      finals: 1,
      podiums: 2,
      tournaments: 3,
      bestRank: 1,
    });
  });

  it('classe par titres, puis finales, puis podiums', () => {
    const out = buildHallOfFame([
      row('deux-finales', 't1', 2),
      row('deux-finales', 't2', 2),
      row('un-titre', 't1', 1),
      row('un-podium', 't3', 3),
    ]);
    expect(out.map((e) => e.userId)).toEqual([
      'un-titre',
      'deux-finales',
      'un-podium',
    ]);
  });

  it('départage par MVP puis par id', () => {
    const mvps = new Map([['b', 2]]);
    const out = buildHallOfFame([row('a', 't1', 4), row('b', 't1', 4)], mvps);
    expect(out.map((e) => e.userId)).toEqual(['b', 'a']);
    expect(out[0].mvps).toBe(2);

    const tie = buildHallOfFame([row('zoe', 't1', 4), row('amy', 't1', 4)]);
    expect(tie.map((e) => e.userId)).toEqual(['amy', 'zoe']);
  });

  it('ne compte qu’une fois une joueuse dupliquée sur un même tournoi', () => {
    const [entry] = buildHallOfFame([row('a', 't1', 1), row('a', 't1', 1)]);
    expect(entry.tournaments).toBe(1);
    expect(entry.titles).toBe(1);
    expect(entry.placements).toHaveLength(1);
  });

  it('ordonne le détail par rang puis par date décroissante', () => {
    const [entry] = buildHallOfFame([
      row('a', 'ancien', 1, '2024-01-01'),
      row('a', 'recent', 1, '2026-01-01'),
      row('a', 'huitieme', 8, '2025-01-01'),
    ]);
    expect(entry.placements.map((p) => p.tournamentId)).toEqual([
      'recent',
      'ancien',
      'huitieme',
    ]);
  });

  it('ignore les rangs non numériques', () => {
    const out = buildHallOfFame([
      row('a', 't1', 1),
      { ...row('a', 't2', 0), rank: Number.NaN },
    ]);
    expect(out[0].tournaments).toBe(1);
  });
});
