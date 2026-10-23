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
//   - un EXEMPT (bye) : ce n'est pas un match.
// Un côté pas encore connu, lui, S'AFFICHE « À déterminer » (2026-10-18) : la
// petite finale du 23/10 attendait son second finaliste, et la home annonçait
// « 1 match au programme » un soir de deux finales. Le drapeau `is_bye` et le
// nom de la manche (« Petite finale », « Grande finale ») ne sont pas rendus
// par la lecture publique : ils sont lus à part (`readMatchMeta`). Sans eux,
// on retombe sur la règle d'avant — pas d'affiche à un côté inconnu.
// Ces matchs ne DISQUALIFIENT PAS leur journée : on choisit d'abord le jour,
// on liste ensuite ce qui s'y joue vraiment.

import type { HomeTeam } from '@/utils/home/loadHomeData';
import { logger } from '@/utils/logger';
import { supabaseAdmin } from '@/utils/supabase';
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

/** Une affiche : deux côtés, une heure, un état. */
export type HomeMatchdayMatch = {
  id: string;
  /** ISO, jamais nul — un match sans horaire n'entre pas ici. */
  scheduledAt: string;
  /** `pending` | `ongoing` | `finished` (cf. PUBLIC_MATCH_STATUSES). */
  status: string;
  /** `null` = pas encore connue (« À déterminer »), jamais un exempt. */
  team1: HomeTeam | null;
  team2: HomeTeam | null;
  team1Score: number | null;
  team2Score: number | null;
  winnerTeamId: string | null;
  /** « Petite finale », « J7 »… ; null si inconnu. */
  roundName: string | null;
  /** Hors phase (finales) : la manche se nomme toujours sur l'affiche. */
  outOfStage: boolean;
};

/** Ce que la lecture publique ne rend pas d'un match. */
export type MatchMeta = { roundName: string | null; isBye: boolean };

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
  return selectNextMatchdays(matches, now, 1)[0] ?? null;
}

/**
 * Les `limit` PROCHAINES journées, dans l'ordre.
 *
 * Une seule ne suffit pas : à la Cup 2026 les journées tombent le mercredi et
 * le vendredi, et savoir « ce soir » sans savoir « et après » oblige à ouvrir
 * le calendrier. Même règle de sélection que ci-dessus, appliquée jour après
 * jour.
 */
export function selectNextMatchdays(
  matches: PublicMatch[],
  now: Date,
  limit = 2,
  /**
   * Garde un match à un côté inconnu (cf. l'en-tête). Absent = jamais : sans
   * savoir qu'un match n'est pas un exempt, on ne l'annonce pas.
   */
  allowUnknownSide: (m: PublicMatch) => boolean = () => false
): { date: string; matches: PublicMatch[] }[] {
  const today = getWallClockParts(now, SITE_TIMEZONE).date;
  const byDate = new Map<string, PublicMatch[]>();

  for (const m of matches) {
    if (!m.scheduled_at) continue;
    if ((!m.team1_id || !m.team2_id) && !allowUnknownSide(m)) continue;
    const at = new Date(m.scheduled_at);
    if (Number.isNaN(at.getTime())) continue;
    const date = getWallClockParts(at, SITE_TIMEZONE).date;
    if (date < today) continue;
    const bucket = byDate.get(date);
    if (bucket) bucket.push(m);
    else byDate.set(date, [m]);
  }

  const picked: { date: string; matches: PublicMatch[] }[] = [];
  for (const date of [...byDate.keys()].sort()) {
    if (picked.length >= limit) break;
    const day = byDate.get(date) as PublicMatch[];
    if (date === today && day.every((m) => m.status === 'finished')) continue;
    picked.push({
      date,
      matches: day
        .slice()
        .sort((a, b) =>
          (a.scheduled_at as string).localeCompare(b.scheduled_at as string)
        ),
    });
  }
  return picked;
}

/**
 * La journée annoncée, si elle se joue AUJOURD'HUI (heure de Paris) ; `null`
 * sinon. Un jour de match, l'accueil le dit avant tout le reste : les affiches
 * passent devant l'encart d'événement, le hero vise le prochain coup d'envoi.
 * Dès que la journée est jouée, `selectNextMatchdays` ne l'annonce plus et
 * l'accueil reprend son ordre habituel, sans qu'il faille y penser. PURE.
 */
export function matchdayToday(
  matchdays: HomeMatchday[],
  now: Date
): HomeMatchday | null {
  const day = matchdays[0];
  if (!day) return null;
  return day.date === getWallClockParts(now, SITE_TIMEZONE).date ? day : null;
}

/** Journée de finales : toutes ses affiches sont hors phase. PURE. */
export function isFinalsDay(day: HomeMatchday): boolean {
  return day.matches.length > 0 && day.matches.every((m) => m.outOfStage);
}

/**
 * Le prochain coup d'envoi encore à venir de la journée (ISO), ou `null` quand
 * tout a commencé. Un match en retard sur son horaire ne compte plus : le
 * décompte viserait une heure passée. PURE.
 */
export function nextKickoff(day: HomeMatchday, now: Date): string | null {
  const at = now.getTime();
  return (
    day.matches.find(
      (m) => m.status === 'pending' && new Date(m.scheduledAt).getTime() > at
    )?.scheduledAt ?? null
  );
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

/**
 * Met une affiche en forme, ou `null` si elle n'annonce rien : pas d'heure,
 * une équipe connue mais sans nom, ou un côté inconnu sans `meta` qui prouve
 * que ce n'est pas un exempt.
 */
export function shapeMatchdayMatch(
  m: PublicMatch,
  known: Map<string, HomeTeam>,
  meta?: MatchMeta
): HomeMatchdayMatch | null {
  if (!m.scheduled_at) return null;
  const unknownAllowed = meta !== undefined && !meta.isBye;
  const side = (
    id: string | null,
    name: string | null,
    logoUrl: string | null
  ): HomeTeam | null | undefined => {
    if (!id) return unknownAllowed ? null : undefined;
    return toHomeTeam(id, name, logoUrl, known) ?? undefined;
  };
  const team1 = side(m.team1_id, m.team1_name, m.team1_logo_url);
  const team2 = side(m.team2_id, m.team2_name, m.team2_logo_url);
  if (team1 === undefined || team2 === undefined) return null;
  return {
    id: m.id,
    scheduledAt: m.scheduled_at,
    status: m.status,
    team1,
    team2,
    team1Score: m.team1_score,
    team2Score: m.team2_score,
    winnerTeamId: m.winner_team_id,
    roundName: meta?.roundName ?? null,
    outOfStage: m.stage_id == null,
  };
}

/**
 * Nom de manche et drapeau d'exempt des matchs du tournoi, que la lecture
 * publique ne rend pas. UNE requête par régénération de la home (ISR 15 min).
 * Lecture en échec → carte vide : la home garde la règle d'avant (pas de côté
 * inconnu, pas de nom de manche), elle ne tombe pas.
 */
async function readMatchMeta(
  tenantId: string,
  tournamentId: string
): Promise<Map<string, MatchMeta>> {
  const meta = new Map<string, MatchMeta>();
  if (!supabaseAdmin) return meta;
  try {
    const { data, error } = await supabaseAdmin
      .from('matches')
      .select('id, round_name, is_bye')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .is('deleted_at', null)
      .limit(500);
    if (error) {
      logger.error('[loadNextMatchday] meta error', error);
      return meta;
    }
    for (const row of (data ?? []) as Array<{
      id: string;
      round_name: string | null;
      is_bye: boolean | null;
    }>) {
      meta.set(row.id, {
        roundName: row.round_name?.trim() || null,
        isBye: row.is_bye === true,
      });
    }
  } catch (err) {
    logger.error('[loadNextMatchday] meta exception', err);
  }
  return meta;
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
  return (
    (await loadNextMatchdays(tenantId, tournamentId, teams, now, 1))[0] ?? null
  );
}

/** Les prochaines journées (par défaut deux : celle qui vient et la suivante). */
export async function loadNextMatchdays(
  tenantId: string,
  tournamentId: string | null,
  teams: HomeTeam[],
  now: Date = new Date(),
  limit = 2
): Promise<HomeMatchday[]> {
  if (!tournamentId) return [];

  let all: PublicMatch[];
  try {
    all = await readPublicTournamentMatches(tournamentId, tenantId, {});
  } catch (error) {
    // Une panne de calendrier ne doit pas emporter la home : on log, on
    // retombe sur les équipes engagées.
    logger.error('[loadNextMatchday] matches error', error);
    return [];
  }

  const known = new Map(teams.map((t) => [t.id, t]));
  const meta = await readMatchMeta(tenantId, tournamentId);
  const notBye = (m: PublicMatch) => meta.get(m.id)?.isBye === false;
  const days: HomeMatchday[] = [];

  for (const picked of selectNextMatchdays(all, now, limit, notBye)) {
    const shaped = picked.matches
      .map((m) => shapeMatchdayMatch(m, known, meta.get(m.id)))
      .filter((m): m is HomeMatchdayMatch => m !== null);
    // Une journée dont aucune affiche n'est complète ne s'affiche pas — mais
    // elle ne doit pas non plus masquer la suivante.
    if (!shaped.length) continue;
    days.push({
      date: picked.date,
      totalCount: shaped.length,
      matches: shaped.slice(0, HOME_MATCHDAY_MAX),
    });
  }

  return days;
}
