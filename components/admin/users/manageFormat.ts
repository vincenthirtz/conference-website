// components/admin/users/manageFormat.ts
//
// Mise en forme de la liste des comptes : suspension, dates, date relative,
// échappement CSV. Extrait de `pages/admin/users/manage.tsx` — lot A7 : tout
// lot qui touche un god-component en sort un morceau. Le lot « permissions
// accordées à l'unité » y ajoutait une action de ligne, et le garde-fou de
// taille l'a refusé.
//
// Fonctions PURES : aucune ne connaît React ni la page.

export function isSuspended(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false;
  const t = Date.parse(bannedUntil);
  return Number.isFinite(t) && t > Date.now();
}

export function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

export function formatDateTime(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

export function formatRelative(d: string | null, lang: string): string | null {
  if (!d) return null;
  const then = new Date(d).getTime();
  if (Number.isNaN(then)) return null;
  const diff = then - Date.now(); // négatif = passé
  const abs = Math.abs(diff);
  const MIN = 60_000,
    H = 3_600_000,
    DAY = 86_400_000,
    MO = 2_592_000_000,
    YR = 31_536_000_000;
  let value: number;
  let unit: Intl.RelativeTimeFormatUnit;
  if (abs < H) {
    value = Math.round(diff / MIN);
    unit = 'minute';
  } else if (abs < DAY) {
    value = Math.round(diff / H);
    unit = 'hour';
  } else if (abs < MO) {
    value = Math.round(diff / DAY);
    unit = 'day';
  } else if (abs < YR) {
    value = Math.round(diff / MO);
    unit = 'month';
  } else {
    value = Math.round(diff / YR);
    unit = 'year';
  }
  try {
    return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(
      value,
      unit
    );
  } catch {
    return formatDate(d);
  }
}

const CSV_SPECIALS = ['"', ',', '\r', '\n'];

export function csvCell(v: string): string {
  if (CSV_SPECIALS.some((ch) => v.includes(ch))) {
    return `"${v.split('"').join('""')}"`;
  }
  return v;
}
