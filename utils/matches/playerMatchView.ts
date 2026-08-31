// utils/matches/playerMatchView.ts
//
// « Ce match, vu par une joueuse de l'une des deux équipes. »
//
// Trois routes répondent à cette question — `/api/player/next-match` (le
// prochain), `/api/player/matches` (tous), et `/api/player/matches/[matchId]`
// (celui-ci, pour le fil du match, cf. docs/PLAN-espace-joueur.md § J1). Elles
// dérivaient CHACUNE, à la main, les mêmes choses : de quel côté je joue, qui
// est l'adversaire, mon jeton de check-in, ma fenêtre, mon score.
//
// Reproduire une dérivation à la main = dérive garantie (c'est exactement le
// constat qui a fondé docs/PLAN-espace-unifie.md). Ce module la porte une fois,
// et chaque route se contente de choisir ce qu'elle expose.
//
// Il ne lit RIEN : il transforme une ligne `matches` déjà chargée. Les routes
// gardent leur propre requête, leur propre garde d'accès et leur propre forme
// de réponse.

import { CHECKIN_OPEN_MINUTES } from '@/utils/checkin';

/**
 * Colonnes nécessaires à toutes les vues joueuse. Surensemble volontaire : une
 * route qui n'expose pas les scores paie une colonne de plus, mais aucune ne
 * peut plus oublier `team1_checked_in_at` et conclure « pas encore checké ».
 */
export const PLAYER_MATCH_SELECT = `
  id, status, scheduled_at, match_format, round_name, stream_url,
  team1_id, team2_id,
  team1_score, team2_score, winner_team_id,
  team1_checkin_token, team2_checkin_token,
  team1_checked_in_at, team2_checked_in_at,
  team1:team1_id(id, name, slug),
  team2:team2_id(id, name, slug),
  tournament:tournament_id(id, name, slug, min_players)
`;

export type TeamRef = { id: string; name: string; slug?: string | null } | null;

export type TournamentRef = {
  id: string;
  name: string;
  slug: string | null;
} | null;

export type PlayerCheckin = {
  token: string | null;
  alreadyCheckedIn: boolean;
  checkedInAt: string | null;
  /** Ouvre à `scheduled_at - CHECKIN_OPEN_MINUTES`, ferme à `scheduled_at`. */
  opensAt: string | null;
  closesAt: string | null;
  isOpen: boolean;
  isPassed: boolean;
};

export type PlayerSide = {
  isTeam1: boolean;
  slot: 1 | 2;
  myTeam: TeamRef;
  opponent: TeamRef;
  tournament: TournamentRef;
  minPlayers: number | null;
};

/** Les embeds PostgREST arrivent objet|tableau selon la cardinalité de la FK. */
export function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** « bo3 » → 3. `null` si le format n'est pas renseigné ou pas numérique. */
export function inferBestOf(format: string | null | undefined): number | null {
  if (!format) return null;
  return Number.parseInt(String(format).replace(/[^\d]/g, ''), 10) || null;
}

/**
 * De quel côté joue `teamId`, et qui est en face.
 *
 * Le `slot` n'est pas cosmétique : c'est lui qui décide quel jeton de check-in,
 * quel score et quelle case de report appartiennent à l'équipe — s'en tromper
 * fait rapporter le score de l'adversaire.
 */
export function resolvePlayerSide(
  row: Record<string, unknown>,
  teamId: string
): PlayerSide {
  const isTeam1 = row.team1_id === teamId;
  const t1 = unwrap(row.team1 as TeamRef | TeamRef[]);
  const t2 = unwrap(row.team2 as TeamRef | TeamRef[]);
  const tn = unwrap(
    row.tournament as
      | (TournamentRef & { min_players?: number | null })
      | (TournamentRef & { min_players?: number | null })[]
  ) as (NonNullable<TournamentRef> & { min_players?: number | null }) | null;

  return {
    isTeam1,
    slot: isTeam1 ? 1 : 2,
    myTeam: isTeam1 ? t1 : t2,
    opponent: isTeam1 ? t2 : t1,
    tournament: tn ? { id: tn.id, name: tn.name, slug: tn.slug ?? null } : null,
    minPlayers: typeof tn?.min_players === 'number' ? tn.min_players : null,
  };
}

/**
 * Bloc check-in du côté demandé.
 *
 * `now` est injectable pour que les tests n'aient pas à déplacer l'horloge —
 * et parce qu'une route qui calcule `isOpen` deux fois dans la même réponse
 * doit le faire au même instant.
 */
export function buildCheckin(
  row: Record<string, unknown>,
  isTeam1: boolean,
  now: number = Date.now()
): PlayerCheckin {
  const scheduledAt = (row.scheduled_at as string | null) ?? null;
  const token =
    ((isTeam1 ? row.team1_checkin_token : row.team2_checkin_token) as
      | string
      | null) ?? null;
  const checkedInAt =
    ((isTeam1 ? row.team1_checked_in_at : row.team2_checked_in_at) as
      | string
      | null) ?? null;

  const opensAt = scheduledAt
    ? new Date(
        new Date(scheduledAt).getTime() - CHECKIN_OPEN_MINUTES * 60_000
      ).toISOString()
    : null;
  const closesAt = scheduledAt;

  const isOpen =
    !!opensAt &&
    !!closesAt &&
    now >= new Date(opensAt).getTime() &&
    now <= new Date(closesAt).getTime();
  const isPassed = !!closesAt && now > new Date(closesAt).getTime();

  return {
    token,
    alreadyCheckedIn: !!checkedInAt,
    checkedInAt,
    opensAt,
    closesAt,
    isOpen,
    isPassed,
  };
}

/**
 * Score du point de vue de l'équipe, et issue dérivée.
 *
 * `result` suit `winner_team_id` quand il existe — c'est la vérité posée par
 * `applyMatchScore` — et ne retombe sur l'égalité des scores que pour un match
 * terminé sans vainqueur désigné.
 */
export function derivePlayerScore(
  row: Record<string, unknown>,
  isTeam1: boolean,
  teamId: string
): {
  score: { mine: number | null; opponent: number | null } | null;
  result: 'win' | 'loss' | 'draw' | null;
} {
  const team1Score = (row.team1_score as number | null) ?? null;
  const team2Score = (row.team2_score as number | null) ?? null;
  const mine = isTeam1 ? team1Score : team2Score;
  const opponent = isTeam1 ? team2Score : team1Score;
  const score = mine === null && opponent === null ? null : { mine, opponent };

  const winnerTeamId = (row.winner_team_id as string | null) ?? null;
  const status = row.status as string;

  let result: 'win' | 'loss' | 'draw' | null = null;
  if (winnerTeamId) {
    result = winnerTeamId === teamId ? 'win' : 'loss';
  } else if (
    status === 'completed' &&
    mine !== null &&
    opponent !== null &&
    mine === opponent
  ) {
    result = 'draw';
  }

  return { score, result };
}
