// utils/tournamentCalendar.ts
// Construit un flux iCalendar (.ics, RFC 5545) pour l'agenda des matchs d'un
// tournoi : un VEVENT par match programmé. Logique PURE (aucun accès DB/réseau)
// pour être testable ; l'endpoint public la nourrit avec les données Supabase.
// Les dates sortent en UTC (suffixe Z) — non ambiguës quel que soit le fuseau
// du client, donc pas de VTIMEZONE nécessaire.

export type CalendarMatch = {
  id: string;
  /** ISO datetime (UTC). Un match sans date est ignoré. */
  scheduledAt: string | null;
  team1Name: string;
  team2Name: string;
  stageName?: string | null;
  roundName?: string | null;
  /** Ex. "bo3" — pilote la durée par défaut de l'événement. */
  matchFormat?: string | null;
  status?: string | null;
  isBye?: boolean | null;
  /** URL absolue de la page du match (VEVENT URL). */
  url?: string | null;
};

export type BuildCalendarOptions = {
  /** Nom du calendrier (X-WR-CALNAME). */
  calendarName: string;
  /** Domaine utilisé dans les UID (défaut owwomenscup.fr). */
  domain?: string;
  /** DTSTAMP ; défaut = maintenant. Injectable pour les tests. */
  nowIso?: string;
  /** Durée de repli si le format ne mappe pas (défaut 90 min). */
  defaultDurationMinutes?: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** ISO → "YYYYMMDDTHHMMSSZ" (UTC). */
export function icsDate(iso: string): string {
  const d = new Date(iso);
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(
      d.getUTCSeconds()
    )}Z`
  );
}

/** Échappe les caractères spéciaux iCalendar (RFC 5545 §3.3.11). */
export function escapeIcs(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Repli de ligne RFC 5545 §3.1 : une ligne de contenu > 75 octets est coupée et
 * poursuivie par CRLF + une espace. On coupe par octets (UTF-8) pour ne jamais
 * dépasser la limite avec des caractères multi-octets.
 */
export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Ne pas couper au milieu d'un caractère UTF-8 multi-octets.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    out.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74; // les lignes de continuation portent une espace en tête → 74 utiles
  }
  return out.join('\r\n ');
}

/** Durée par défaut (minutes) selon le format de match. */
function durationForFormat(
  format: string | null | undefined,
  fallback: number
): number {
  switch ((format || '').toLowerCase()) {
    case 'bo1':
      return 45;
    case 'bo2':
      return 60;
    case 'bo3':
      return 90;
    case 'bo5':
      return 150;
    case 'bo7':
      return 210;
    default:
      return fallback;
  }
}

/** VEVENT STATUS (RFC 5545) à partir du statut applicatif d'un match. */
function icsStatus(status: string | null | undefined): string | null {
  switch (status) {
    case 'pending':
      return 'TENTATIVE';
    case 'ongoing':
    case 'finished':
    case 'completed':
      return 'CONFIRMED';
    default:
      return null;
  }
}

/** Construit le contenu texte d'un fichier .ics (CRLF, RFC 5545). */
export function buildMatchesCalendar(
  matches: CalendarMatch[],
  opts: BuildCalendarOptions
): string {
  const domain = opts.domain ?? 'owwomenscup.fr';
  const stamp = icsDate(opts.nowIso ?? new Date().toISOString());
  const fallback = opts.defaultDurationMinutes ?? 90;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${domain}//tournament-matches//FR`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(opts.calendarName)}`,
    'X-WR-TIMEZONE:Europe/Paris',
  ];

  for (const m of matches) {
    // Un match non daté, un bye ou un match annulé n'a pas sa place dans l'agenda.
    if (!m.scheduledAt) continue;
    if (m.isBye) continue;
    if (m.status === 'cancelled') continue;
    const start = new Date(m.scheduledAt);
    if (isNaN(start.getTime())) continue;

    const durationMin = durationForFormat(m.matchFormat, fallback);
    const endIso = new Date(
      start.getTime() + durationMin * 60_000
    ).toISOString();

    const summary = `${m.team1Name} vs ${m.team2Name}`;
    const descParts = [m.stageName, m.roundName, m.matchFormat?.toUpperCase()]
      .filter(Boolean)
      .join(' · ');
    const status = icsStatus(m.status);

    lines.push('BEGIN:VEVENT');
    lines.push(foldIcsLine(`UID:match-${escapeIcs(m.id)}@${domain}`));
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${icsDate(m.scheduledAt)}`);
    lines.push(`DTEND:${icsDate(endIso)}`);
    lines.push(foldIcsLine(`SUMMARY:${escapeIcs(summary)}`));
    if (descParts)
      lines.push(foldIcsLine(`DESCRIPTION:${escapeIcs(descParts)}`));
    if (m.url) lines.push(foldIcsLine(`URL:${escapeIcs(m.url)}`));
    if (status) lines.push(`STATUS:${status}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
