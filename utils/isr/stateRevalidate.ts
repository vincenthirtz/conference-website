// utils/isr/stateRevalidate.ts
//
// FENÊTRES ISR SELON L'ÉTAT de ce que la page montre : courtes tant que ça
// bouge (tournoi en cours, match à jouer, journée de matchs), longues une fois
// que c'est figé.
//
// POURQUOI. Les logs Supabase sont facturés à la requête, et chaque
// régénération d'une page publique en coûte de 3 (onglet Matchs) à une
// trentaine (accueil). Une `revalidate: 60` uniforme régénérait toutes les
// minutes la fiche d'un tournoi terminé depuis des mois, aussi souvent que
// celle du tournoi qui se joue ce soir.
//
// CE QUI RESTE FRAIS SANS ATTENDRE LA FENÊTRE : un score saisi régénère à la
// demande `/`, `/match/:id` et les onglets tournoi, matchs, classement, stats
// et bracket (conference-api, utils/matches/revalidateMatchPages.ts →
// pages/api/internal/revalidate.ts). Tout le reste (programmation, tirage
// d'une ronde, disqualification, visibilité…) attend la fenêtre ci-dessous —
// d'où des fenêtres longues SEULEMENT pour ce qui ne se joue plus.
//
// Netlify repart d'un cache ISR vide à chaque déploiement : une fenêtre d'un
// jour est un plafond, pas une promesse de fraîcheur différée d'autant.
//
// Fonctions PURES, `now` injecté : testables sans base ni horloge.

import { getWallClockParts, SITE_TIMEZONE } from '@/utils/timezone';
import { addDaysYmd } from '@/utils/teams/scrimCalendar';

/** Tournoi en cours (ou dans ses dates) : la règle « ≤ 60 s » du direct. */
export const ISR_LIVE_S = 60;
/** Tournoi publié, pas commencé : inscriptions, pool de maps, programme. */
export const ISR_UPCOMING_S = 300;
/** Tournoi fini depuis moins d'une semaine : podium, MVP, corrections. */
export const ISR_RECENTLY_DONE_S = 3600;
/** Tournoi fini depuis plus d'une semaine : archive. */
export const ISR_ARCHIVED_S = 86_400;

/** Jours pendant lesquels un tournoi terminé reste « récent ». */
export const RECENTLY_DONE_DAYS = 7;

/** Match à jouer, en cours, reporté ou contesté : inchangé (30 s). */
export const ISR_MATCH_OPEN_S = 30;
/** Match tranché depuis moins de 24 h : MVP du public, saisie des maps. */
export const ISR_MATCH_SETTLING_S = 300;
/** Au-delà de 24 h, un match tranché ne bouge plus que par un score corrigé
 * (régénéré à la demande). */
export const MATCH_SETTLING_MS = 24 * 3600 * 1000;

/** Accueil un jour de matchs (≥ 2 h avant le premier coup d'envoi). */
export const ISR_HOME_MATCHDAY_S = 900;
/** Accueil hors journée de matchs. */
export const ISR_HOME_QUIET_S = 3600;
/**
 * Avance prise sur le premier coup d'envoi. DOIT rester ≥ ISR_HOME_QUIET_S :
 * un rendu fait juste avant l'entrée dans la fenêtre repasse au plus une
 * heure plus tard, donc encore avant le coup d'envoi.
 */
export const HOME_MATCHDAY_LEAD_MS = 2 * 3600 * 1000;

const LIVE_STATUSES = new Set(['running', 'ongoing', 'live']);
const DONE_STATUSES = new Set([
  'completed',
  'archived',
  'finished',
  'cancelled',
]);
const SETTLED_MATCH_STATUSES = new Set(['finished', 'walkover', 'cancelled']);

export type TournamentIsrState =
  | 'live'
  | 'upcoming'
  | 'recentlyDone'
  | 'archived';

export type TournamentDates = {
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

/**
 * Jour calendaire (YYYY-MM-DD, heure de Paris) d'une borne de tournoi. Les
 * colonnes sont des `date` : « 2026-09-18 » désigne une journée, pas minuit
 * UTC.
 */
function dayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (iso) return iso[1];
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return getWallClockParts(parsed, SITE_TIMEZONE).date;
}

/**
 * L'état qui gouverne la fenêtre d'un tournoi.
 *
 * Un tournoi `published` DANS SES DATES compte comme en cours : le statut
 * `running` n'est posé qu'à la main par le staff (cf. pickFeaturedTournament),
 * et un oubli ne doit pas laisser le classement d'un soir de match figé cinq
 * minutes. Un statut inconnu est traité en direct : dans le doute, frais.
 */
export function tournamentIsrState(
  t: TournamentDates,
  now: Date = new Date()
): TournamentIsrState {
  const status = (t.status ?? '').toLowerCase();
  const today = getWallClockParts(now, SITE_TIMEZONE).date;

  if (LIVE_STATUSES.has(status)) return 'live';

  if (DONE_STATUSES.has(status)) {
    const end = dayOf(t.end_date) ?? dayOf(t.start_date);
    // Sans date : on ne sait pas depuis quand, on reste sur la fenêtre courte.
    if (!end) return 'recentlyDone';
    return addDaysYmd(end, RECENTLY_DONE_DAYS) >= today
      ? 'recentlyDone'
      : 'archived';
  }

  const start = dayOf(t.start_date);
  if (start && start <= today) {
    // Sans date de fin, l'événement tient sur sa journée de départ ; un jour
    // de marge couvre une soirée qui déborde après minuit.
    const last = dayOf(t.end_date) ?? start;
    if (addDaysYmd(last, 1) >= today) return 'live';
  }

  if (status === 'published' || status === 'draft') return 'upcoming';
  return 'live';
}

const WINDOW_BY_STATE: Record<TournamentIsrState, number> = {
  live: ISR_LIVE_S,
  upcoming: ISR_UPCOMING_S,
  recentlyDone: ISR_RECENTLY_DONE_S,
  archived: ISR_ARCHIVED_S,
};

/**
 * `revalidate` d'une page /tournament/[id]/* (ou fenêtre CDN d'un embed).
 *
 * `degraded` : une lecture de la page a échoué. On ne fige pas une page
 * partiellement vide pour une journée — fenêtre du direct, pour se rattraper.
 */
export function tournamentRevalidateSeconds(
  t: TournamentDates,
  now: Date = new Date(),
  opts: { degraded?: boolean } = {}
): number {
  const window = WINDOW_BY_STATE[tournamentIsrState(t, now)];
  return opts.degraded ? Math.min(window, ISR_LIVE_S) : window;
}

/**
 * `revalidate` de /match/[id]. Un match encore ouvert garde ses 30 s ; un
 * match tranché passe à 5 min pendant 24 h (vote MVP du public, clos au plus
 * 4 h après ; MVP importé par le staff ; maps saisies), puis à un jour.
 */
export function matchRevalidateSeconds(
  m: {
    status?: string | null;
    completed_at?: string | null;
    scheduled_at?: string | null;
  },
  now: Date = new Date()
): number {
  if (!SETTLED_MATCH_STATUSES.has((m.status ?? '').toLowerCase())) {
    return ISR_MATCH_OPEN_S;
  }
  const settledAt = Date.parse(m.completed_at ?? m.scheduled_at ?? '');
  if (Number.isNaN(settledAt)) return ISR_MATCH_SETTLING_S;
  return now.getTime() - settledAt < MATCH_SETTLING_MS
    ? ISR_MATCH_SETTLING_S
    : ISR_ARCHIVED_S;
}

/**
 * `revalidate` de l'accueil. `nextKickoff` = premier coup d'envoi de la
 * prochaine journée annoncée (déjà passé si la journée est entamée — elle
 * reste annoncée tant qu'un de ses matchs n'est pas terminé).
 *
 * Un jour de matchs : 15 min, comme avant. Sinon une heure : les scores et
 * les actualités régénèrent l'accueil à la demande, le reste (mur des
 * réseaux, clips, compteur d'inscrites, vitrine TCG) supporte l'heure.
 * `degraded` (lecture du contenu en échec) : jamais plus que 15 min.
 */
export function homeRevalidateSeconds(
  nextKickoff: string | null | undefined,
  now: Date = new Date(),
  opts: { degraded?: boolean } = {}
): number {
  if (opts.degraded) return ISR_HOME_MATCHDAY_S;
  const kickoff = Date.parse(nextKickoff ?? '');
  if (
    !Number.isNaN(kickoff) &&
    kickoff - now.getTime() <= HOME_MATCHDAY_LEAD_MS
  ) {
    return ISR_HOME_MATCHDAY_S;
  }
  return ISR_HOME_QUIET_S;
}

/**
 * En-tête CDN d'une page SSR publique, identique pour toutes les visiteuses
 * (embeds). Âge maximal servi = `windowSeconds` : moitié fraîche, moitié
 * servie périmée pendant la régénération en arrière-plan. Le runtime Netlify
 * reporte `s-maxage` sur `Netlify-CDN-Cache-Control` et rend `max-age=0` au
 * navigateur.
 *
 * JAMAIS sur une réponse qui dépend de la visiteuse (cookie, session) : le
 * CDN la servirait à tout le monde.
 */
export function publicCdnCacheControl(windowSeconds: number): string {
  const fresh = Math.max(1, Math.floor(windowSeconds / 2));
  const stale = Math.max(1, windowSeconds - fresh);
  return `public, s-maxage=${fresh}, stale-while-revalidate=${stale}`;
}
