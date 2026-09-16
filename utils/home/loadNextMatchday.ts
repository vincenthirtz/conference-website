// utils/home/loadNextMatchday.ts
//
// LA PROCHAINE JOURNÉE DE MATCHS, telle que la page d'accueil l'annonce.
//
// La carte « Le prochain rendez-vous » montrait la liste des équipes engagées :
// vrai, mais statique — on y lisait la même chose en août et la veille d'une
// finale. Ce qu'une visiteuse vient chercher un vendredi soir, c'est QUI JOUE
// CONTRE QUI, et à quelle heure. D'où cette lecture.
//
// D'OÙ VIENNENT LES DONNÉES. De `readPublicTournamentMatches`, la lecture déjà
// utilisée par l'API publique `/api/public/v1/tournaments/{id}/matches` — donc
// exactement ce qu'un client anonyme peut déjà obtenir : pas de PII, jamais un
// match `cancelled`. Aucune nouvelle requête inventée : la home tourne en ISR
// (`revalidate: 900`), cette lecture s'exécute au plus toutes les 15 minutes.
//
// CE QU'ON NE MONTRE PAS :
//   - un match sans `scheduled_at` : sans heure, ce n'est pas une affiche ;
//   - un match dont un côté n'est pas connu (`team1_id`/`team2_id` nuls) :
//     demi-finale à pourvoir, exempt (bye)… « À déterminer » contre une équipe
//     réelle n'annonce rien, et un bye n'est pas un match.
// Ces matchs ne DISQUALIFIENT PAS leur journée pour autant : on choisit d'abord
// le jour, on liste ensuite ce qui s'y joue vraiment.

import type { HomeTeam } from '@/utils/home/loadHomeData';
import { logger } from '@/utils/logger';
import {
  readPublicTournamentMatches,
  type PublicMatch,
} from '@/utils/public/readMatches';
import { getWallClockParts, SITE_TIMEZONE } from '@/utils/timezone';

/**
 * Nombre d'affiches sérialisées dans la page. Une journée de poules peut en
 * compter une vingtaine ; au-delà de six la bande devient un calendrier, ce
 * que la page tournoi fait déjà mieux. Le reste est annoncé en une ligne.
 */
export const HOME_MATCHDAY_MAX = 6;

/** Une affiche : deux équipes connues, une heure, un état. */
export type HomeMatchdayMatch = {
  id: string;
  /** ISO, jamais nul — un match sans horaire n'entre pas ici. */
  scheduledAt: string;
  /** `pending` | `ongoing` | `finished` (cf. PUBLIC_MATCH_STATUSES). */
  status: string;
  team1: HomeTeam;
  team2: HomeTeam;
  team1Score: number | null;
  team2Score: number | null;
  winnerTeamId: string | null;
};

export type HomeMatchday = {
  /** Jour calendaire à Paris (YYYY-MM-DD) de la journée annoncée. */
  date: string;
  /** Les affiches, dans l'ordre des coups d'envoi, écrêtées à HOME_MATCHDAY_MAX. */
  matches: HomeMatchdayMatch[];
  /** Total des affiches de la journée, avant écrêtage. */
  totalCount: number;
};

/**
 * Choisit la journée à annoncer.
 *
 * Règle : le premier jour (heure de Paris) dont il reste quelque chose à voir.
 * Un jour déjà entièrement joué est passé — sinon, le samedi matin, « le
 * prochain rendez-vous » aurait annoncé les matchs de la veille. Le jour même
 * est gardé tant qu'un match n'est pas terminé : à 18 h un vendredi, la journée
 * du soir est bien le prochain rendez-vous, même si l'après-midi est jouée.
 *
 * Fonction PURE (donc testable sans base) : `now` est injecté.
 */
export function selectNextMatchday(
  matches: PublicMatch[],
  now: Date
): { date: string; matches: PublicMatch[] } | null {
  const today = getWallClockParts(now, SITE_TIMEZONE).date;
  const byDate = new Map<string, PublicMatch[]>();

  for (const m of matches) {
    if (!m.scheduled_at) continue;
    if (!m.team1_id || !m.team2_id) continue;
    const at = new Date(m.scheduled_at);
    if (Number.isNaN(at.getTime())) continue;
    const date = getWallClockParts(at, SITE_TIMEZONE).date;
    if (date < today) continue;
    const bucket = byDate.get(date);
    if (bucket) bucket.push(m);
    else byDate.set(date, [m]);
  }

  for (const date of [...byDate.keys()].sort()) {
    const day = byDate.get(date) as PublicMatch[];
    if (date === today && day.every((m) => m.status === 'finished')) continue;
    return {
      date,
      matches: day
        .slice()
        .sort((a, b) =>
          (a.scheduled_at as string).localeCompare(b.scheduled_at as string)
        ),
    };
  }
  return null;
}

/**
 * Complète une équipe de match avec ce que la home connaît déjà d'elle.
 *
 * `readPublicTournamentMatches` ne rend que l'id, le nom et le logo ; les
 * équipes engagées (`loadContendingTeams`, déjà chargées) apportent le nom
 * court — donc un monogramme correct quand le logo manque — et le slug, donc
 * un lien vers la fiche. Aucune requête supplémentaire pour autant.
 */
function toHomeTeam(
  id: string,
  name: string | null,
  logoUrl: string | null,
  known: Map<string, HomeTeam>
): HomeTeam | null {
  const ref = known.get(id);
  const label = (name ?? ref?.name ?? '').trim();
  if (!label) return null; // sans nom, l'affiche ne dit rien : on l'écarte
  return {
    id,
    name: label,
    shortName: ref?.shortName ?? null,
    slug: ref?.slug ?? null,
    logoUrl: logoUrl ?? ref?.logoUrl ?? null,
  };
}

/** Met une affiche en forme, ou `null` si une équipe reste sans nom. */
export function shapeMatchdayMatch(
  m: PublicMatch,
  known: Map<string, HomeTeam>
): HomeMatchdayMatch | null {
  if (!m.team1_id || !m.team2_id || !m.scheduled_at) return null;
  const team1 = toHomeTeam(m.team1_id, m.team1_name, m.team1_logo_url, known);
  const team2 = toHomeTeam(m.team2_id, m.team2_name, m.team2_logo_url, known);
  if (!team1 || !team2) return null;
  return {
    id: m.id,
    scheduledAt: m.scheduled_at,
    status: m.status,
    team1,
    team2,
    team1Score: m.team1_score,
    team2Score: m.team2_score,
    winnerTeamId: m.winner_team_id,
  };
}

/**
 * Charge la prochaine journée du tournoi mis en avant.
 *
 * Renvoie `null` quand il n'y a rien de vrai à annoncer (pas de tournoi, pas de
 * calendrier publié, saison terminée, lecture en échec). L'appelant retombe
 * alors sur la bande des équipes engagées — cf. `HomeSpotlight`.
 */
export async function loadNextMatchday(
  tenantId: string,
  tournamentId: string | null,
  teams: HomeTeam[],
  now: Date = new Date()
): Promise<HomeMatchday | null> {
  if (!tournamentId) return null;

  let all: PublicMatch[];
  try {
    all = await readPublicTournamentMatches(tournamentId, tenantId, {});
  } catch (error) {
    // Une panne de calendrier ne doit pas emporter la home : on log, on
    // retombe sur les équipes engagées.
    logger.error('[loadNextMatchday] matches error', error);
    return null;
  }

  const picked = selectNextMatchday(all, now);
  if (!picked) return null;

  const known = new Map(teams.map((t) => [t.id, t]));
  const shaped = picked.matches
    .map((m) => shapeMatchdayMatch(m, known))
    .filter((m): m is HomeMatchdayMatch => m !== null);
  if (!shaped.length) return null;

  return {
    date: picked.date,
    totalCount: shaped.length,
    matches: shaped.slice(0, HOME_MATCHDAY_MAX),
  };
}
