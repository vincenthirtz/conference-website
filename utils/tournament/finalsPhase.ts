// utils/tournament/finalsPhase.ts
//
// Vue « Phase finale » d'un tournoi en championnat : les matchs de finale
// (hors phase, créés à part) et la course à la qualification.
//
// RÈGLE DE QUALIFICATION. Les finales sont appariées par rang, de la plus
// prestigieuse à la moins : la finale au `round_number` le plus élevé oppose le
// 1er au 2e, la suivante le 3e au 4e, etc. C'est la règle de la Cup 2026
// (grande finale 1–2, petite finale 3–4, confirmée par l'organisation) ;
// rien en base ne la décrit, d'où sa présence ici, écrite une fois.
//
// QUALIFIÉE / ÉLIMINÉE. Calculé sur les POINTS seuls, prudemment :
//   - éliminée si, même en gagnant tout ce qui reste, elle ne peut pas
//     atteindre les points ACTUELS de l'équipe au dernier rang qualificatif
//     (les points ne baissent jamais : au moins N équipes finiront au-dessus) ;
//   - qualifiée si moins de N autres équipes peuvent encore atteindre ses
//     points actuels (égalité comprise — un départage pourrait la sortir).
// Tout le reste est « en course ». Aucun pronostic sur les départages.
//
// Logique PURE : aucun accès base.

import type { PublicStandingRow } from '../stages/publicStandings';
import type { HubTeam } from './liveHub';

export type FinalsMatch = {
  id: string;
  round_number: number | null;
  round_name: string | null;
  scheduled_at: string | null;
  status: string;
  match_format: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  team1: HubTeam | null;
  team2: HubTeam | null;
};

/** Un match de la phase de classement, réduit à ce que la course demande. */
export type RaceMatch = {
  team1_id: string | null;
  team2_id: string | null;
  status: string;
  is_bye: boolean | null;
};

export type FinalsSlot = {
  /** Rang qualificatif (1, 2, …). */
  seed: number;
  /** Équipe réellement placée sur le match, sinon celle du rang actuel. */
  team: HubTeam | null;
  /** Vrai si l'équipe vient du classement actuel et non du match. */
  projected: boolean;
};

export type FinalsCard = {
  match: FinalsMatch;
  slots: [FinalsSlot, FinalsSlot];
};

export type RaceStatus = 'qualified' | 'eliminated' | 'contention';

export type RaceRow = PublicStandingRow & {
  /** Finale visée au rang actuel (index dans `cards`), null hors qualification. */
  zone: number | null;
  remaining: number;
  maxPoints: number;
  status: RaceStatus;
};

export type FinalsPhase = {
  cards: FinalsCard[];
  race: RaceRow[];
  qualifiers: number;
  /** Plus aucun match de classement à jouer : les affiches sont définitives. */
  seasonOver: boolean;
  /** Au moins un match de classement joué. */
  seasonStarted: boolean;
};

const OPEN_STATUSES = new Set([
  'pending',
  'scheduled',
  'upcoming',
  'ongoing',
  'postponed',
  'disputed',
]);

function toTeam(row: PublicStandingRow | undefined): HubTeam | null {
  if (!row) return null;
  return {
    id: row.teamId,
    slug: row.slug,
    name: row.teamName,
    short_name: row.shortName,
    logo_url: row.logoUrl,
  };
}

/** Points par victoire, déduits du classement (3 par défaut). */
function pointsPerWin(rows: PublicStandingRow[]): number {
  for (const r of rows) {
    if (r.wins > 0 && r.draws === 0) return r.points / r.wins;
  }
  return 3;
}

export function buildFinalsPhase(input: {
  standings: PublicStandingRow[];
  finals: FinalsMatch[];
  raceMatches: RaceMatch[];
}): FinalsPhase {
  const rows = [...input.standings].sort((a, b) => a.rank - b.rank);
  const finals = [...input.finals].sort(
    (a, b) => (b.round_number ?? 0) - (a.round_number ?? 0)
  );
  const qualifiers = Math.min(finals.length * 2, rows.length);

  const open = input.raceMatches.filter(
    (m) => !m.is_bye && OPEN_STATUSES.has(m.status)
  );
  const remainingOf = (teamId: string) =>
    open.filter((m) => m.team1_id === teamId || m.team2_id === teamId).length;
  const seasonOver = open.length === 0;
  const seasonStarted = rows.some((r) => r.played > 0);

  const cards: FinalsCard[] = finals.map((match, i) => {
    const seeds: [number, number] = [i * 2 + 1, i * 2 + 2];
    const slot = (seed: number, placed: HubTeam | null): FinalsSlot =>
      placed
        ? { seed, team: placed, projected: false }
        : {
            seed,
            // Avant le premier match, le classement n'est qu'un ordre
            // d'inscription : aucune projection.
            team: seasonStarted ? toTeam(rows[seed - 1]) : null,
            projected: true,
          };
    return {
      match,
      slots: [slot(seeds[0], match.team1), slot(seeds[1], match.team2)],
    };
  });

  const ppw = pointsPerWin(rows);
  const withMax = rows.map((r) => {
    const remaining = remainingOf(r.teamId);
    return { row: r, remaining, maxPoints: r.points + remaining * ppw };
  });
  const cutPoints =
    qualifiers > 0 && rows.length >= qualifiers
      ? rows[qualifiers - 1].points
      : null;

  const race: RaceRow[] = withMax.map(({ row, remaining, maxPoints }, idx) => {
    let status: RaceStatus = 'contention';
    if (qualifiers > 0 && cutPoints !== null) {
      const rivals = withMax.filter(
        (o) => o.row.teamId !== row.teamId && o.maxPoints >= row.points
      ).length;
      if (seasonOver) {
        status = idx < qualifiers ? 'qualified' : 'eliminated';
      } else if (rivals < qualifiers) {
        status = 'qualified';
      } else if (maxPoints < cutPoints) {
        status = 'eliminated';
      }
    }
    return {
      ...row,
      zone: idx < qualifiers ? Math.floor(idx / 2) : null,
      remaining,
      maxPoints,
      status,
    };
  });

  return { cards, race, qualifiers, seasonOver, seasonStarted };
}
