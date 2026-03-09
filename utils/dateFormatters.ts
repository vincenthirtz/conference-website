// utils/dateFormatters.ts
// Shared date/time formatting helpers for admin pages

/**
 * Format an ISO date string as a French long date header.
 * e.g. "lundi 15 mars 2026"
 */
export function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Format an ISO date string as HH:MM (French locale).
 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Convert an ISO string to a datetime-local input value (YYYY-MM-DDTHH:MM).
 */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

/**
 * Convert a datetime-local input value back to an ISO string.
 */
export function localInputToIso(value: string): string {
  if (!value) return '';
  try {
    return new Date(value).toISOString();
  } catch {
    return '';
  }
}
