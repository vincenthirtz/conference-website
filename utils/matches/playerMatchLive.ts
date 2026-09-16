// utils/matches/playerMatchLive.ts
//
// Règles de TEMPS de l'espace joueur, le soir d'un match — côté client.
//
// Pur et sans import serveur (contrairement à playerMatchView.ts, qui tire
// utils/checkin → supabaseAdmin) : ces fonctions tournent dans le navigateur,
// à chaque tick d'horloge. Elles sont testées sans DOM
// (tests/unit/playerMatchLive.test.ts).

/** Statuts après lesquels plus rien ne bouge côté joueuse. */
const TERMINAL_STATUSES = new Set([
  'finished',
  'walkover',
  'cancelled',
  // Libellés hérités, jamais écrits en base aujourd'hui (cf. utils/matches/lineup.ts).
  'completed',
  'finalized',
]);

/** Même liste que report-score.ts : le serveur répond 409 MATCH_FINALIZED. */
const REPORT_CLOSED_STATUSES = new Set(['finished', 'walkover', 'cancelled']);

export function isTerminalMatchStatus(status: string | null | undefined) {
  return TERMINAL_STATUSES.has((status ?? '').trim().toLowerCase());
}

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Le bouton « Rapporter le score » a-t-il un sens MAINTENANT ?
 *
 * Deux refus que le serveur oppose, et qu'on ne doit pas laisser découvrir
 * après avoir rempli la modale :
 *   - le droit : `teams.captain_id` au sens strict (`canReport`, calculé par
 *     l'API avec la règle de report-score.ts) — une joueuse du roster
 *     recevait « Vous n'êtes pas le capitaine » ;
 *   - le moment : pas avant le coup d'envoi (409 MATCH_NOT_STARTED). Un match
 *     `ongoing` ou `disputed` est rapportable même si son horaire est dans le
 *     futur (l'horaire a pu être avancé, le litige se corrige).
 *
 * Sans horaire et sans statut qui atteste du début : on s'abstient. Mieux vaut
 * un bouton absent (le bot Discord reste là) qu'un refus serveur.
 */
export function canOfferScoreReport(
  match: {
    status: string;
    scheduledAt: string | null;
    canReport: boolean;
    hasOpponent: boolean;
  },
  now: number = Date.now()
): boolean {
  if (!match.canReport || !match.hasOpponent) return false;
  const status = (match.status ?? '').trim().toLowerCase();
  if (REPORT_CLOSED_STATUSES.has(status)) return false;
  if (status === 'ongoing' || status === 'disputed') return true;
  const kickoff = toMs(match.scheduledAt);
  return kickoff !== null && now >= kickoff;
}

/**
 * La fenêtre de check-in est-elle ouverte, vue d'ici ?
 *
 * `serverIsOpen` a été calculé À LA REQUÊTE. On ne fait que le RESTREINDRE
 * avec l'horloge locale : passé l'heure de fermeture, le bouton disparaît
 * sans attendre le prochain rafraîchissement. On ne l'ÉLARGIT jamais — le
 * forfait tombe au premier passage du cron après le coup d'envoi, un bouton
 * resté ouvert proposerait de pointer sur un match déjà perdu.
 */
export function isCheckinStillOpen(
  checkin: { isOpen: boolean; closesAt: string | null },
  now: number = Date.now()
): boolean {
  if (!checkin.isOpen) return false;
  const closes = toMs(checkin.closesAt);
  return closes === null || now <= closes;
}

/** Avance du rafraîchissement rapproché sur l'ouverture du check-in. */
export const CHECKIN_WATCH_LEAD_MS = 10 * 60_000;
/** Queue après le coup d'envoi : le temps que le cron pose le forfait. */
export const CHECKIN_WATCH_TAIL_MS = 10 * 60_000;
export const FAST_REFRESH_MS = 30_000;
export const LIVE_REFRESH_MS = 60_000;
/** Au-delà, un `pending` passé est un oubli de saisie, pas une soirée en retard. */
export const STALE_PENDING_WATCH_MS = 4 * 60 * 60_000;

/**
 * Cadence de rafraîchissement réseau du fil du match. `null` = aucun
 * intervalle (le retour sur l'onglet suffit).
 *
 * Le fil était chargé UNE fois : une capitaine qui l'ouvrait à T-65 lisait
 * « le check-in ouvre à 19:00 » indéfiniment. Mais un refetch permanent sur
 * un match de la semaine prochaine ne sert à rien. Donc :
 *   - 30 s autour de la fenêtre de check-in (10 min avant l'ouverture →
 *     10 min après le coup d'envoi) : le jeton apparaît, la fenêtre s'ouvre,
 *     l'adversaire pointe, le forfait tombe ;
 *   - 60 s pendant un match `ongoing`/`disputed` : report adverse, litige ;
 *   - rien sur un match terminé ou lointain.
 */
export function matchThreadRefreshMs(
  match: {
    status: string;
    checkinOpensAt: string | null;
    checkinClosesAt: string | null;
  },
  now: number = Date.now()
): number | null {
  const status = (match.status ?? '').trim().toLowerCase();
  if (isTerminalMatchStatus(status)) return null;

  const opens = toMs(match.checkinOpensAt);
  const closes = toMs(match.checkinClosesAt);
  if (
    status === 'pending' &&
    opens !== null &&
    closes !== null &&
    now >= opens - CHECKIN_WATCH_LEAD_MS &&
    now <= closes + CHECKIN_WATCH_TAIL_MS
  ) {
    return FAST_REFRESH_MS;
  }

  if (status === 'ongoing' || status === 'disputed') return LIVE_REFRESH_MS;
  // Un `pending` dont le coup d'envoi est passé attend que le staff le lance :
  // l'écran doit basculer « en cours » sans qu'on recharge. Borné : un
  // `pending` oublié depuis la semaine dernière ne doit pas interroger
  // l'API toutes les minutes tant que l'onglet reste ouvert.
  if (
    status === 'pending' &&
    closes !== null &&
    now > closes &&
    now <= closes + STALE_PENDING_WATCH_MS
  ) {
    return LIVE_REFRESH_MS;
  }
  return null;
}
