import { describe, it, expect } from 'vitest';
import {
  buildMatchesCalendar,
  icsDate,
  escapeIcs,
  foldIcsLine,
  type CalendarMatch,
} from '@/utils/tournamentCalendar';

const NOW = '2026-01-01T00:00:00.000Z';

function baseMatch(over: Partial<CalendarMatch> = {}): CalendarMatch {
  return {
    id: 'm1',
    scheduledAt: '2026-09-18T17:00:00.000Z',
    team1Name: 'Alpha',
    team2Name: 'Beta',
    stageName: 'Bracket',
    roundName: 'Finale',
    matchFormat: 'bo3',
    status: 'pending',
    isBye: false,
    url: 'https://owwomenscup.fr/match/m1',
    ...over,
  };
}

describe('icsDate', () => {
  it('formats an ISO instant as UTC basic date-time with Z', () => {
    expect(icsDate('2026-09-18T17:05:09.000Z')).toBe('20260918T170509Z');
  });
});

describe('escapeIcs', () => {
  it('escapes commas, semicolons, backslashes and newlines', () => {
    expect(escapeIcs('A, B; C\\D\nE')).toBe('A\\, B\\; C\\\\D\\nE');
  });
});

describe('foldIcsLine', () => {
  it('leaves short lines untouched', () => {
    expect(foldIcsLine('SUMMARY:hi')).toBe('SUMMARY:hi');
  });
  it('folds long lines with CRLF + space and keeps segments <= 75 bytes', () => {
    const line = 'SUMMARY:' + 'x'.repeat(200);
    const folded = foldIcsLine(line);
    expect(folded).toContain('\r\n ');
    for (const seg of folded.split('\r\n')) {
      expect(Buffer.from(seg, 'utf8').length).toBeLessThanOrEqual(75);
    }
    // Unfolding (remove CRLF+space) restores the original content.
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
});

describe('buildMatchesCalendar', () => {
  it('wraps events in a VCALENDAR with the calendar name', () => {
    const ics = buildMatchesCalendar([baseMatch()], {
      calendarName: 'OWWC — matchs',
      nowIso: NOW,
    });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('X-WR-CALNAME:OWWC — matchs');
    expect(ics).toContain('X-WR-TIMEZONE:Europe/Paris');
  });

  it('emits one VEVENT per dated match with UTC start/end and metadata', () => {
    const ics = buildMatchesCalendar([baseMatch()], {
      calendarName: 'c',
      nowIso: NOW,
    });
    expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(1);
    expect(ics).toContain('UID:match-m1@owwomenscup.fr');
    expect(ics).toContain('DTSTAMP:20260101T000000Z');
    expect(ics).toContain('DTSTART:20260918T170000Z');
    // bo3 → 90 min → 18:30Z
    expect(ics).toContain('DTEND:20260918T183000Z');
    expect(ics).toContain('SUMMARY:Alpha vs Beta');
    expect(ics).toContain('DESCRIPTION:Bracket · Finale · BO3');
    expect(ics).toContain('URL:https://owwomenscup.fr/match/m1');
    // pending → TENTATIVE
    expect(ics).toContain('STATUS:TENTATIVE');
  });

  it('maps format to duration (bo5 → 150 min)', () => {
    const ics = buildMatchesCalendar([baseMatch({ matchFormat: 'bo5' })], {
      calendarName: 'c',
      nowIso: NOW,
    });
    expect(ics).toContain('DTEND:20260918T193000Z'); // 17:00 + 150 min
  });

  it('marks finished/ongoing matches as CONFIRMED', () => {
    const ics = buildMatchesCalendar([baseMatch({ status: 'finished' })], {
      calendarName: 'c',
      nowIso: NOW,
    });
    expect(ics).toContain('STATUS:CONFIRMED');
  });

  it('skips unscheduled, bye, cancelled and invalid-date matches', () => {
    const ics = buildMatchesCalendar(
      [
        baseMatch({ id: 'ok' }),
        baseMatch({ id: 'nodate', scheduledAt: null }),
        baseMatch({ id: 'bye', isBye: true }),
        baseMatch({ id: 'cancel', status: 'cancelled' }),
        baseMatch({ id: 'bad', scheduledAt: 'not-a-date' }),
      ],
      { calendarName: 'c', nowIso: NOW }
    );
    expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(1);
    expect(ics).toContain('UID:match-ok@owwomenscup.fr');
    expect(ics).not.toContain('match-nodate');
    expect(ics).not.toContain('match-bye');
    expect(ics).not.toContain('match-cancel');
    expect(ics).not.toContain('match-bad');
  });

  it('escapes special characters in team names and omits empty description', () => {
    const ics = buildMatchesCalendar(
      [
        baseMatch({
          team1Name: 'A, Inc;',
          team2Name: 'B',
          stageName: null,
          roundName: null,
          matchFormat: null,
        }),
      ],
      { calendarName: 'c', nowIso: NOW }
    );
    expect(ics).toContain('SUMMARY:A\\, Inc\\; vs B');
    expect(ics).not.toContain('DESCRIPTION:');
  });

  it('uses CRLF line endings (RFC 5545)', () => {
    const ics = buildMatchesCalendar([baseMatch()], {
      calendarName: 'c',
      nowIso: NOW,
    });
    expect(ics.includes('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '').includes('\n')).toBe(false);
  });
});
