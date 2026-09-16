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

/** Rattrapage : un match `pending` reste « le prochain » 1 h après son horaire. */
export const NEXT_MATCH_PENDING_GRACE_MINUTES = 60;

/**
 * Choisit « le prochain match » parmi des candidats `pending`/`ongoing`.
 *
 * Ce que ça répare : la route filtrait `scheduled_at >= now - 1 h` pour TOUS
 * les statuts. Une soirée en retard (match de 19:00 encore `ongoing` à 20:05)
 * faisait disparaître le match EN COURS du dashboard et du check-in.
 *
 * Mais « ne jamais exclure un match en cours » ne suffit pas : trié par
 * horaire, ce match de 19:00 masquerait alors celui de 20:30 pendant toute sa
 * fenêtre de check-in — et /player/checkin s'appuie sur cette route. Un
 * check-in manqué, c'est un forfait. D'où l'ordre :
 *
 *   1. un match dont MON check-in est ouvert et pas encore fait — le seul
 *      geste de la soirée qui a une échéance dure ;
 *   2. sinon le plus tôt programmé, `ongoing` compris quel que soit son âge,
 *      `pending` seulement dans la fenêtre de rattrapage.
 *
 * Pur (horloge injectée) : la route se contente de charger les candidats.
 */
export function pickNextMatch<T extends Record<string, unknown>>(
  rows: readonly T[],
  teamId: string,
  now: number = Date.now()
): T | null {
  const cutoff = now - NEXT_MATCH_PENDING_GRACE_MINUTES * 60_000;
  const seen = new Set<unknown>();
  const time = (r: T) => {
    const ms = r.scheduled_at
      ? new Date(r.scheduled_at as string).getTime()
      : Number.NaN;
    return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
  };

  const candidates = rows
    .filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      if (r.status === 'ongoing') return true;
      if (r.status !== 'pending') return false;
      const ms = time(r);
      return Number.isFinite(ms) && ms >= cutoff;
    })
    .sort((a, b) => time(a) - time(b));

  const awaitingMyCheckin = candidates.find((r) => {
    if (r.status !== 'pending') return false;
    const c = buildCheckin(r, r.team1_id === teamId, now);
    return c.isOpen && !c.alreadyCheckedIn;
  });

  return awaitingMyCheckin ?? candidates[0] ?? null;
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
