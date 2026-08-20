// utils/registrationDeadline.ts
//
// Date butoir des inscriptions au tournoi 2026.
//
// Le rappel affiché aux joueuses, capitaines, coachs et managers a besoin de
// répondre à trois questions — « est-ce encore d'actualité ? », « combien de
// jours reste-t-il ? », « faut-il alarmer ? » — et ces trois réponses tiennent
// à un calcul de jours calendaires, pas d'heures. D'où ce module PUR, sans
// React ni Supabase : la règle est écrite une fois et testée
// (tests/unit/registrationDeadline.test.ts).
//
// Pourquoi des jours CALENDAIRES et pas une division de millisecondes : à
// 23 h 30 le 30 août, « il reste 0,02 jour » est vrai et inutile. Ce que la
// personne veut savoir, c'est qu'il lui reste *demain*. On compare donc deux
// dates murales à Paris, ce qui a le bon goût d'être insensible aux
// changements d'heure (le 26 octobre 2026 fait 25 h, pas 24).

/**
 * Dernier jour INCLUS pour s'inscrire, en heure de Paris. Une inscription
 * déposée le 31 août à 23 h 59 est dans les temps ; le rappel disparaît le
 * 1er septembre.
 */
export const TOURNAMENT_2026_REGISTRATION_DEADLINE = '2026-08-31';

/** Le tournoi est français : la date butoir se lit à Paris, pas en UTC. */
export const REGISTRATION_DEADLINE_TZ = 'Europe/Paris';

/** En dessous de ce seuil, le rappel passe du ton « note » au ton « urgence ». */
const URGENT_THRESHOLD_DAYS = 7;

export type RegistrationDeadlineState = {
  /** Jours calendaires restants. 0 = c'est aujourd'hui, le dernier jour. */
  daysLeft: number;
  /** La date est passée — il n'y a plus rien à rappeler. */
  isPast: boolean;
  /** Dernier jour : le compte à rebours cède la place à « c'est aujourd'hui ». */
  isLastDay: boolean;
  /** J-7 ou moins : bascule visuelle vers l'alerte. */
  isUrgent: boolean;
};

/** Date calendaire ('YYYY-MM-DD') d'un instant, lue dans un fuseau. */
function ymdInTz(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Une date murale 'YYYY-MM-DD' projetée sur minuit UTC. On ne s'en sert QUE
 * pour soustraire deux de ces valeurs entre elles : le fuseau s'annule, et la
 * différence est un nombre exact de jours quoi qu'il arrive aux horloges.
 */
function ymdToUtcMs(ymd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const MS_PER_DAY = 86_400_000;

/**
 * L'état du compte à rebours à l'instant `now`.
 *
 * `now` est un paramètre (et pas un `new Date()` planqué dedans) pour que le
 * test puisse se placer la veille, le jour même et le lendemain sans jouer
 * avec l'horloge du runtime.
 *
 * Une date butoir illisible rend `isPast` — l'appelant masque alors le rappel
 * plutôt que d'afficher « plus que NaN jours ». C'est une faute de code, pas
 * un cas de production : le test la couvre.
 */
export function getRegistrationDeadlineState(
  now: Date = new Date(),
  deadlineYmd: string = TOURNAMENT_2026_REGISTRATION_DEADLINE,
  timeZone: string = REGISTRATION_DEADLINE_TZ
): RegistrationDeadlineState {
  const deadlineMs = ymdToUtcMs(deadlineYmd);
  const todayMs = ymdToUtcMs(ymdInTz(now, timeZone));

  if (Number.isNaN(deadlineMs) || Number.isNaN(todayMs)) {
    return { daysLeft: 0, isPast: true, isLastDay: false, isUrgent: false };
  }

  const daysLeft = Math.round((deadlineMs - todayMs) / MS_PER_DAY);
  const isPast = daysLeft < 0;

  return {
    daysLeft,
    isPast,
    isLastDay: daysLeft === 0,
    isUrgent: !isPast && daysLeft <= URGENT_THRESHOLD_DAYS,
  };
}

/**
 * La date butoir formatée pour l'affichage ('31 août 2026' / '31 August
 * 2026'). Le fuseau est forcé : sans lui, un navigateur à Los Angeles lirait
 * minuit UTC comme la veille et afficherait le 30.
 */
export function formatRegistrationDeadline(
  locale: string,
  deadlineYmd: string = TOURNAMENT_2026_REGISTRATION_DEADLINE,
  timeZone: string = REGISTRATION_DEADLINE_TZ
): string {
  const ms = ymdToUtcMs(deadlineYmd);
  if (Number.isNaN(ms)) return deadlineYmd;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(new Date(ms + 12 * 3_600_000));
}
