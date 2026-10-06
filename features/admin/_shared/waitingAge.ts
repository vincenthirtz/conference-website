// features/admin/_shared/waitingAge.ts — ancienneté d'un élément EN ATTENTE
// dans une file de traitement (demandes, tickets support).
//
// Une date brute (« 03/10 14:22 ») oblige à calculer de tête depuis quand une
// personne attend. La puce dit directement « en attente depuis 3 j », et sa
// couleur passe à l'orange puis au rouge : ce qui traîne se voit sans lire.
//
// Pur, sans React : la puce (`queue/WaitingChip.tsx`) et les tests s'en servent.

/** Au-delà : la puce passe à l'orange (une journée sans réponse). */
export const WAITING_WARN_HOURS = 24;
/** Au-delà : la puce passe au rouge (trois jours sans réponse). */
export const WAITING_ERR_HOURS = 72;

export type WaitingTone = 'ok' | 'warn' | 'err';

export type WaitingAge = {
  /** Heures pleines écoulées (jamais négatif : une horloge en avance → 0). */
  hours: number;
  /** Jours pleins écoulés. */
  days: number;
  tone: WaitingTone;
};

export type WaitingLabels = {
  /** Moins d'une heure. */
  lessThanHour: string;
  /** `{count}` = heures. */
  hours: string;
  /** `{count}` = jours. */
  days: string;
};

const HOUR_MS = 3_600_000;

/** Ancienneté de `since` (ISO) à l'instant `now` ; `null` si date illisible. */
export function waitingAge(
  since: string | null | undefined,
  now: number
): WaitingAge | null {
  if (!since) return null;
  const t = Date.parse(since);
  if (!Number.isFinite(t)) return null;
  const hours = Math.max(0, Math.floor((now - t) / HOUR_MS));
  const days = Math.floor(hours / 24);
  const tone: WaitingTone =
    hours >= WAITING_ERR_HOURS
      ? 'err'
      : hours >= WAITING_WARN_HOURS
        ? 'warn'
        : 'ok';
  return { hours, days, tone };
}

/** Libellé : heures sous 24 h, jours au-delà. */
export function formatWaitingAge(
  age: WaitingAge,
  labels: WaitingLabels
): string {
  if (age.hours < 1) return labels.lessThanHour;
  if (age.hours < 24) {
    return labels.hours.replace('{count}', String(age.hours));
  }
  return labels.days.replace('{count}', String(age.days));
}
