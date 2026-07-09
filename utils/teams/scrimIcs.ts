// utils/teams/scrimIcs.ts
// Génère un fichier iCalendar (.ics) pour « Ajouter à mon agenda » un scrim
// planifié. Pur / sans dépendance : le contenu est construit côté client puis
// téléchargé via un Blob (aucun endpoint serveur requis).

export type ScrimIcsInput = {
  /** Identifiant stable de l'événement (planningId ou scrimId). */
  uid: string;
  /** Titre affiché dans l'agenda (ex. « Scrim : A vs B »). */
  title: string;
  /** Début du scrim, ISO datetime (UTC). */
  startIso: string;
  /** Durée en minutes (défaut 120). */
  durationMinutes?: number;
  description?: string;
  url?: string;
  /** Horodatage DTSTAMP ; défaut = maintenant. Injectable pour les tests. */
  nowIso?: string;
};

function icsDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/** Échappe les caractères spéciaux iCalendar (RFC 5545). */
function escapeIcs(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Construit le contenu texte d'un fichier .ics (CRLF, RFC 5545). */
export function buildScrimIcs(input: ScrimIcsInput): string {
  const {
    uid,
    title,
    startIso,
    durationMinutes = 120,
    description,
    url,
    nowIso,
  } = input;
  const start = new Date(startIso);
  const endIso = new Date(
    start.getTime() + durationMinutes * 60_000
  ).toISOString();

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//owwomenscup//scrim-planning//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(uid)}`,
    `DTSTAMP:${icsDate(nowIso ?? new Date().toISOString())}`,
    `DTSTART:${icsDate(startIso)}`,
    `DTEND:${icsDate(endIso)}`,
    `SUMMARY:${escapeIcs(title)}`,
    ...(description ? [`DESCRIPTION:${escapeIcs(description)}`] : []),
    ...(url ? [`URL:${escapeIcs(url)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

/** Déclenche le téléchargement d'un .ics dans le navigateur. */
export function downloadIcs(filename: string, ics: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
