import { describe, it, expect } from 'vitest';
import {
  MIN_VOTES_FOR_AWARD,
  buildMatchdayAwards,
  buildTournamentMvpRanking,
  resolveMatchMvp,
  resolvePublicMvp,
  tallySource,
  type MvpMatchAward,
  type MvpVote,
} from '@/utils/mvp/awards';

const vote = (
  memberId: string,
  voterKey: string,
  source: MvpVote['source'] = 'discord'
): MvpVote => ({ memberId, voterKey, source });

/** n voix pour `memberId`, votants distincts. */
const votes = (
  memberId: string,
  n: number,
  source: MvpVote['source'] = 'discord',
  prefix = memberId
): MvpVote[] =>
  Array.from({ length: n }, (_, i) => vote(memberId, `${prefix}-${i}`, source));

const award = (
  matchId: string,
  roundName: string | null,
  memberId: string,
  winnerVotes: number,
  totalVotes: number,
  source: MvpVote['source'] = 'discord'
): MvpMatchAward => ({
  matchId,
  roundName,
  memberId,
  source,
  winnerVotes,
  totalVotes,
});

describe('tallySource', () => {
  it('compte une voix par votant, la dernière gagne', () => {
    const t = tallySource(
      [vote('a', 'u1'), vote('b', 'u1'), vote('a', 'u2')],
      'discord'
    );
    expect(t.total).toBe(2);
    expect(t.rows).toEqual([
      { memberId: 'a', votes: 1, share: 0.5 },
      { memberId: 'b', votes: 1, share: 0.5 },
    ]);
  });

  it('ignore les voix des autres sources', () => {
    const t = tallySource(
      [...votes('a', 3, 'discord'), ...votes('b', 5, 'twitch')],
      'discord'
    );
    expect(t.total).toBe(3);
    expect(t.rows).toHaveLength(1);
  });

  it('rend un ordre total (tri par memberId à égalité de voix)', () => {
    const t = tallySource(
      [vote('z', 'u1'), vote('a', 'u2'), vote('m', 'u3')],
      'discord'
    );
    expect(t.rows.map((r) => r.memberId)).toEqual(['a', 'm', 'z']);
  });
});

describe('resolveMatchMvp', () => {
  it('désigne la joueuse en tête', () => {
    const out = resolveMatchMvp({ matchId: 'm1', roundName: 'J1' }, [
      ...votes('a', 5),
      ...votes('b', 2),
    ]);
    expect(out.award).toMatchObject({
      matchId: 'm1',
      roundName: 'J1',
      memberId: 'a',
      source: 'discord',
      winnerVotes: 5,
      totalVotes: 7,
    });
  });

  it('ne désigne personne sans voix', () => {
    expect(resolveMatchMvp({ matchId: 'm1' }, [])).toEqual({
      award: null,
      reason: 'no_votes',
    });
  });

  it('ne désigne personne sous le seuil de voix', () => {
    const out = resolveMatchMvp({ matchId: 'm1' }, votes('a', 2));
    expect(out).toEqual({ award: null, reason: 'too_few_votes' });
    expect(MIN_VOTES_FOR_AWARD).toBe(3);
  });

  it('ne départage PAS une égalité en tête (pas de vainqueur par ordre de liste)', () => {
    const out = resolveMatchMvp({ matchId: 'm1' }, [
      ...votes('a', 2),
      ...votes('b', 2),
    ]);
    expect(out).toEqual({ award: null, reason: 'tie' });
  });

  it('fait passer Twitch devant Discord quand le chat a voté', () => {
    const out = resolveMatchMvp({ matchId: 'm1' }, [
      ...votes('a', 20, 'discord'),
      ...votes('b', 4, 'twitch'),
    ]);
    expect(out.award).toMatchObject({
      memberId: 'b',
      source: 'twitch',
      winnerVotes: 4,
      totalVotes: 4,
    });
  });

  it('retombe sur Discord quand le vote Twitch est vide', () => {
    const out = resolveMatchMvp({ matchId: 'm1' }, votes('a', 20, 'discord'));
    expect(out.award).toMatchObject({ memberId: 'a', source: 'discord' });
  });
});

describe('buildMatchdayAwards', () => {
  it('promeut la meilleure PART de voix, pas le plus gros nombre', () => {
    // b gagne son match 30/100 (le match diffusé) ; a gagne le sien 8/10.
    const [j1] = buildMatchdayAwards([
      award('m1', 'J1', 'a', 8, 10),
      award('m2', 'J1', 'b', 30, 100, 'twitch'),
    ]);
    expect(j1.award).toMatchObject({
      roundName: 'J1',
      memberId: 'a',
      share: 0.8,
      awardedMatches: 2,
    });
  });

  it('départage une part identique par les voix brutes', () => {
    const [j1] = buildMatchdayAwards([
      award('m1', 'J1', 'a', 4, 8),
      award('m2', 'J1', 'b', 20, 40),
    ]);
    expect(j1.award?.memberId).toBe('b');
  });

  it('ne promeut personne sur une égalité parfaite', () => {
    const [j1] = buildMatchdayAwards([
      award('m1', 'J1', 'a', 5, 10),
      award('m2', 'J1', 'b', 5, 10),
    ]);
    expect(j1).toEqual({ roundName: 'J1', award: null, reason: 'tie' });
  });

  it('ignore les matchs hors journée (finales)', () => {
    const out = buildMatchdayAwards([
      award('m1', 'J1', 'a', 5, 10),
      award('m2', null, 'b', 9, 10),
      award('m3', '   ', 'c', 9, 10),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].award?.roundName).toBe('J1');
  });

  it('ordonne les journées naturellement (J2 avant J10)', () => {
    const out = buildMatchdayAwards([
      award('m10', 'J10', 'x', 5, 10),
      award('m2', 'J2', 'y', 5, 10),
      award('m1', 'J1', 'z', 5, 10),
    ]);
    expect(out.map((o) => o.roundName)).toEqual(['J1', 'J2', 'J10']);
  });
});

describe('buildTournamentMvpRanking', () => {
  it('classe par journées gagnées, puis titres de match, puis voix', () => {
    const matchAwards = [
      award('m1', 'J1', 'a', 5, 10),
      award('m2', 'J2', 'a', 6, 10),
      award('m3', 'J1', 'b', 9, 10),
      award('m4', 'J2', 'b', 4, 10),
      award('m5', 'J3', 'c', 7, 10),
    ];
    const matchdays = buildMatchdayAwards(matchAwards);
    const ranking = buildTournamentMvpRanking(matchAwards, matchdays);

    // b gagne J1 (0.9 > 0.5), a gagne J2 (0.6 > 0.4), c gagne J3 : une
    // journée chacune. a et b ont 2 titres de match contre 1 à c, donc c
    // ferme la marche ; entre a (11 voix cumulées) et b (13), les voix
    // départagent.
    expect(ranking.map((r) => r.memberId)).toEqual(['b', 'a', 'c']);
    expect(ranking[0]).toMatchObject({
      memberId: 'b',
      matchdayTitles: 1,
      matchTitles: 2,
      totalVotes: 13,
      rounds: ['J1'],
    });
  });

  it("compte les MVP de match d'une joueuse jamais élue sur une journée", () => {
    const matchAwards = [award('m1', 'J1', 'solo', 4, 10)];
    const ranking = buildTournamentMvpRanking(matchAwards, []);
    expect(ranking).toEqual([
      {
        memberId: 'solo',
        matchdayTitles: 0,
        matchTitles: 1,
        totalVotes: 4,
        rounds: [],
      },
    ]);
  });

  it('rend une liste vide sans aucun titre', () => {
    expect(buildTournamentMvpRanking([], [])).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * MVP DU PUBLIC (2026-09-23) — viewers Twitch + supporters Discord.
 *
 * La différence de fond avec `resolveMatchMvp` : PAS de précédence. Là-bas,
 * deux sources s'arbitrent pour le titre des équipes ; ici elles forment un
 * seul électorat réparti sur deux plateformes. Ces tests tiennent surtout ça.
 * -------------------------------------------------------------------------*/

describe('resolvePublicMvp', () => {
  const M = { matchId: 'm1', roundName: 'J1' };
  const v = (
    source: 'twitch' | 'discord',
    voterKey: string,
    memberId: string
  ) => ({ matchId: 'm1', memberId, source, voterKey }) as const;

  it('ADDITIONNE les deux plateformes au lieu de les arbitrer', () => {
    // Une seule voix Twitch, trois Discord. `resolveMatchMvp` donnerait le
    // titre à la voix Twitch seule ; ici tout se cumule.
    const votes = [
      v('twitch', 'viewer1', 'bea'),
      v('discord', 'd1', 'alice'),
      v('discord', 'd2', 'alice'),
      v('discord', 'd3', 'alice'),
    ];
    const out = resolvePublicMvp(M, votes);
    expect(out.award?.memberId).toBe('alice');
    expect(out.award?.winnerVotes).toBe(3);
    expect(out.award?.totalVotes).toBe(4);
    expect(out.award?.bySource).toEqual({ twitch: 1, discord: 3 });
  });

  it('cumule les voix d’une même joueuse venues des deux côtés', () => {
    const votes = [
      v('twitch', 'viewer1', 'alice'),
      v('twitch', 'viewer2', 'alice'),
      v('discord', 'd1', 'alice'),
      v('discord', 'd2', 'bea'),
    ];
    const out = resolvePublicMvp(M, votes);
    expect(out.award?.memberId).toBe('alice');
    expect(out.award?.winnerVotes).toBe(3);
    expect(out.award?.totalVotes).toBe(4);
  });

  it('laisse une personne peser deux fois si elle est des deux côtés', () => {
    // Compromis assumé : rapprocher les identités exigerait une inscription.
    const votes = [
      v('twitch', 'machine', 'alice'),
      v('discord', 'machine', 'alice'),
      v('discord', 'd2', 'bea'),
    ];
    const out = resolvePublicMvp(M, votes);
    expect(out.award?.winnerVotes).toBe(2);
    expect(out.award?.totalVotes).toBe(3);
  });

  it('une voix par personne et par plateforme, la dernière compte', () => {
    const votes = [
      v('twitch', 'viewer1', 'alice'),
      v('twitch', 'viewer1', 'bea'),
      v('twitch', 'viewer2', 'bea'),
      v('twitch', 'viewer3', 'bea'),
    ];
    const out = resolvePublicMvp(M, votes);
    expect(out.award?.memberId).toBe('bea');
    expect(out.award?.totalVotes).toBe(3);
  });

  it('ne décerne rien sans voix, sous le seuil, ou à égalité', () => {
    expect(resolvePublicMvp(M, []).reason).toBe('no_votes');
    expect(
      resolvePublicMvp(M, [
        v('twitch', 'a', 'alice'),
        v('twitch', 'b', 'alice'),
      ]).reason
    ).toBe('too_few_votes');
    expect(
      resolvePublicMvp(M, [
        v('twitch', 'a', 'alice'),
        v('discord', 'b', 'alice'),
        v('twitch', 'c', 'bea'),
        v('discord', 'd', 'bea'),
      ]).reason
    ).toBe('tie');
  });

  it('départage à memberId égal de voix : ordre total, donc stable', () => {
    const votes = [
      v('twitch', 'a', 'zoe'),
      v('twitch', 'b', 'zoe'),
      v('twitch', 'c', 'anna'),
    ];
    const out = resolvePublicMvp(M, votes);
    expect(out.award?.memberId).toBe('zoe');
    // Et l'inverse ne dépend pas de l'ordre d'insertion.
    const meme = resolvePublicMvp(M, [...votes].reverse());
    expect(meme.award?.memberId).toBe('zoe');
  });
});
