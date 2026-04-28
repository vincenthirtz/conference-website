// utils/timezone.ts
// Utilitaires pour le support des fuseaux horaires.
// Les dates sont stockées en UTC dans la base. Ce module
// permet de les afficher dans le fuseau horaire du tournoi.

/**
 * Liste des fuseaux horaires courants pour les tournois.
 * Utilisé dans les formulaires admin.
 */
export const TOURNAMENT_TIMEZONES = [
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/London', label: 'Londres (GMT/BST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Europe/Madrid', label: 'Madrid (CET/CEST)' },
  { value: 'Europe/Rome', label: 'Rome (CET/CEST)' },
  { value: 'Europe/Brussels', label: 'Bruxelles (CET/CEST)' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (CET/CEST)' },
  { value: 'Europe/Zurich', label: 'Zurich (CET/CEST)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Chicago', label: 'Chicago (CST/CDT)' },
  { value: 'America/Denver', label: 'Denver (MST/MDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
  { value: 'America/Toronto', label: 'Toronto (EST/EDT)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Seoul', label: 'Seoul (KST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Asia/Singapore', label: 'Singapour (SGT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'UTC', label: 'UTC' },
] as const;

export type TournamentTimezone =
  | (typeof TOURNAMENT_TIMEZONES)[number]['value']
  | string;

/**
 * Formate une date ISO en tenant compte du fuseau horaire du tournoi.
 *
 * @param iso Date ISO (UTC)
 * @param timezone IANA timezone (ex: 'Europe/Paris'). Si null/undefined, utilise le fuseau local.
 * @param options Options Intl.DateTimeFormat additionnelles
 */
export function formatDateTimeTz(
  iso: string | null | undefined,
  timezone?: string | null,
  options?: Partial<Intl.DateTimeFormatOptions>
): string {
  if (!iso) return '—';
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;

    const formatOpts: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...options,
      ...(timezone ? { timeZone: timezone } : {}),
    };

    const formatted = date.toLocaleDateString('fr-FR', formatOpts);

    // Ajouter l'abréviation du fuseau si un timezone est spécifié
    if (timezone) {
      const tzAbbr = getTimezoneAbbr(date, timezone);
      return `${formatted} (${tzAbbr})`;
    }

    return formatted;
  } catch {
    return iso;
  }
}

/**
 * Formate juste l'heure dans le fuseau donné.
 */
export function formatTimeTz(
  iso: string | null | undefined,
  timezone?: string | null
): string {
  if (!iso) return '—';
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;

    const formatOpts: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      ...(timezone ? { timeZone: timezone } : {}),
    };

    return date.toLocaleTimeString('fr-FR', formatOpts);
  } catch {
    return iso;
  }
}

/**
 * Obtient l'abréviation du fuseau horaire pour une date donnée.
 * Ex: 'CET', 'CEST', 'PST', 'PDT'
 */
function getTimezoneAbbr(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(date);

    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart?.value ?? timezone;
  } catch {
    return timezone;
  }
}

/**
 * Convertit une valeur datetime-local (sans timezone) en ISO UTC,
 * en interpretant la saisie comme étant dans le fuseau du tournoi.
 *
 * @param localValue Valeur d'un input datetime-local (ex: '2026-03-15T14:00')
 * @param timezone IANA timezone. Si null, interprète comme heure locale du navigateur.
 */
export function localInputToUTC(
  localValue: string,
  timezone?: string | null
): string | null {
  if (!localValue) return null;

  if (!timezone) {
    // Comportement par défaut : interpréter comme heure locale
    return new Date(localValue).toISOString();
  }

  try {
    // Créer un formatteur pour le timezone cible afin de calculer l'offset
    // On parse la date comme si c'était dans le timezone donné
    const parts = localValue.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!parts) return new Date(localValue).toISOString();

    const [, year, month, day, hour, minute] = parts;

    // Utiliser Intl pour trouver l'offset UTC du timezone cible à cette date
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Approche itérative : créer une date UTC initiale, puis ajuster
    const utcGuess = new Date(
      Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute)
      )
    );

    // Voir quelle heure ce UTC donne dans le timezone cible
    const inTz = new Date(
      utcGuess.toLocaleString('en-US', { timeZone: timezone })
    );
    const offsetMs = inTz.getTime() - utcGuess.getTime();

    // Ajuster : si dans le TZ c'est +2h par rapport à UTC, soustraire 2h
    const corrected = new Date(utcGuess.getTime() - offsetMs);
    return corrected.toISOString();
  } catch {
    return new Date(localValue).toISOString();
  }
}
