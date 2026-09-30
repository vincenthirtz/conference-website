import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  cleanPersonName,
  parseCsvRows,
  parseMonthLabel,
  parseStaffPlanningCsv,
  parseTimeRange,
} from '../../utils/staffPlanningCsv';

const FIXTURE = readFileSync(
  resolve(__dirname, '__fixtures__/staff-planning-2026.csv'),
  'utf8'
);

describe('parseTimeRange', () => {
  it('lit les formats du tableur', () => {
    expect(parseTimeRange('19h-22h')).toEqual({ start: '19:00', end: '22:00' });
    expect(parseTimeRange('20h30-00')).toEqual({
      start: '20:30',
      end: '00:00',
    });
    expect(parseTimeRange('22h-00')).toEqual({ start: '22:00', end: '00:00' });
    expect(parseTimeRange(' 18h - 24h ')).toEqual({
      start: '18:00',
      end: '00:00',
    });
  });

  it('refuse ce qui n’est pas une plage', () => {
    expect(parseTimeRange('dispo')).toBeNull();
    expect(parseTimeRange('25h-26h')).toBeNull();
  });
});

describe('petites briques', () => {
  it('mois en toutes lettres, accents ou non', () => {
    expect(parseMonthLabel('décembre 2026')).toEqual({ year: 2026, month: 12 });
    expect(parseMonthLabel('Aout 2027')).toEqual({ year: 2027, month: 8 });
    expect(parseMonthLabel('Anrataria')).toBeNull();
  });

  it('noms nettoyés', () => {
    expect(cleanPersonName('P1xel ( Orange Ribbit )')).toBe(
      'P1xel (Orange Ribbit)'
    );
  });

  it('CSV : guillemets et virgules dans un champ', () => {
    expect(parseCsvRows('a,"b, c","d ""e"""\n')).toEqual([
      ['a', 'b, c', 'd "e"'],
    ]);
  });
});

describe('parseStaffPlanningCsv — fichier réel', () => {
  const r = parseStaffPlanningCsv(FIXTURE);

  it('les dates viennent des numéros de jour, pas de la ligne de semaine décalée', () => {
    expect(r.entries).toEqual([
      { person: 'Pomme', date: '2026-09-23', start: '20:30', end: '00:00' },
      { person: 'Anrataria', date: '2026-09-25', start: '19:00', end: '22:00' },
      { person: 'Pomme', date: '2026-09-30', start: '22:00', end: '00:00' },
      { person: 'Pomme', date: '2026-10-07', start: '22:00', end: '00:00' },
      {
        person: 'P1xel (Orange Ribbit)',
        date: '2026-10-16',
        start: '19:00',
        end: '22:00',
      },
      { person: 'Pomme', date: '2026-10-16', start: '22:00', end: '00:00' },
      {
        person: 'P1xel (Orange Ribbit)',
        date: '2026-10-21',
        start: '19:00',
        end: '22:00',
      },
    ]);
  });

  it('tous les créneaux tombent un soir de match (mercredi ou vendredi)', () => {
    for (const e of r.entries) {
      const day = new Date(`${e.date}T12:00:00Z`).getUTCDay();
      expect([3, 5]).toContain(day);
    }
  });

  it('liste toute l’équipe et les mois couverts, sans alerte', () => {
    expect(r.people).toHaveLength(13);
    expect(r.people).toContain('POG Ullis');
    expect(r.months).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
    expect(r.warnings).toEqual([]);
  });

  it('signale une cellule incomprise au lieu de l’ignorer', () => {
    const bad = FIXTURE.replace(',Kotarah,,,,', ',Kotarah,,,?,');
    expect(parseStaffPlanningCsv(bad).warnings).toHaveLength(1);
  });
});
