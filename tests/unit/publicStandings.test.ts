// Onglet « Classement » d'un tournoi.
// Target : utils/stages/publicStandings.ts (enrichStandings, pur).
//
// CE QUE CES CAS PROTÈGENT :
//   1. LE RANG OFFICIEL N'EST PAS RETRIÉ. L'ordre et les points viennent du
//      calcul admin (confrontation directe comprise) ; l'affichage n'ajoute que
//      des compteurs.
//   2. Maps et forme se lisent du point de vue de l'équipe, qu'elle soit
//      team1 ou team2.
//   3. La forme suit l'ordre chronologique et se limite aux derniers matchs.

import { describe, it, expect } from 'vitest';
import {
  FORM_LENGTH,
  enrichStandings,
  type StandingsMatch,
} from '../../utils/stages/publicStandings';
import type { StageStanding } from '../../utils/stages/standings';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const C = 'cccccccc-0000-4000-8000-000000000003';

function standing(teamId: string, rank: number, extra = {}): StageStanding {
  return {
    teamId,
    teamName: teamId.slice(0, 1),
    rank,
    wins: 0,
    losses: 0,
    draws: 0,
    score: 0,
    seed: null,
    ...extra,
  };
}

function match(
  t1: string,
  t2: string,
  s1: number,
  s2: number,
  round: number,
  at: string | null = null
): StandingsMatch {
  return {
    team1_id: t1,
    team2_id: t2,
    team1_score: s1,
    team2_score: s2,
    winner_team_id: s1 > s2 ? t1 : s2 > s1 ? t2 : null,
    round_number: round,
    scheduled_at: at,
  };
}

const teams = new Map([
  [A, { name: 'Alpha', slug: 'alpha', short_name: 'ALP', logo_url: null }],
  [B, { name: 'Bravo', slug: null, short_name: null, logo_url: '/b.png' }],
]);

describe('enrichStandings', () => {
  it('garde l’ordre, les points et le départage du classement officiel', () => {
    const rows = enrichStandings(
      [
        standing(B, 1, { score: 3, wins: 1, tiebrokenBy: 'head_to_head' }),
        standing(A, 2, { score: 3, wins: 1 }),
      ],
      [],
      teams
    );
    expect(rows.map((r) => [r.teamId, r.rank, r.points])).toEqual([
      [B, 1, 3],
      [A, 2, 3],
    ]);
    expect(rows[0].tiebrokenBy).toBe('head_to_head');
    expect(rows[1].tiebrokenBy).toBeNull();
  });

  it('compte maps et forme du point de vue de chaque équipe', () => {
    const rows = enrichStandings(
      [standing(A, 1), standing(B, 2), standing(C, 3)],
      [match(A, B, 2, 1, 1), match(C, A, 2, 0, 2)],
      teams
    );
    const a = rows.find((r) => r.teamId === A)!;
    expect(a).toMatchObject({ played: 2, mapsWon: 2, mapsLost: 3 });
    expect(a.form).toEqual(['W', 'L']);
    const b = rows.find((r) => r.teamId === B)!;
    expect(b).toMatchObject({ played: 1, mapsWon: 1, mapsLost: 2 });
    expect(b.form).toEqual(['L']);
  });

  it('range la forme par date, et ne garde que les derniers résultats', () => {
    const played = Array.from({ length: FORM_LENGTH + 2 }, (_, i) =>
      match(A, B, i === 0 ? 0 : 2, i === 0 ? 2 : 0, i + 1)
    );
    // Le match perdu (manche 1) est daté APRÈS tous les autres.
    played[0].scheduled_at = '2026-10-30T19:00:00Z';
    for (let i = 1; i < played.length; i++) {
      played[i].scheduled_at = `2026-10-0${i}T19:00:00Z`;
    }
    const [a] = enrichStandings([standing(A, 1)], played, teams);
    expect(a.form).toHaveLength(FORM_LENGTH);
    expect(a.form[FORM_LENGTH - 1]).toBe('L');
  });

  it('prend nom, sigle, slug et logo de l’équipe', () => {
    const [a, b] = enrichStandings([standing(A, 1), standing(B, 2)], [], teams);
    expect(a).toMatchObject({
      teamName: 'Alpha',
      shortName: 'ALP',
      slug: 'alpha',
    });
    expect(b).toMatchObject({ slug: null, logoUrl: '/b.png' });
  });
});
