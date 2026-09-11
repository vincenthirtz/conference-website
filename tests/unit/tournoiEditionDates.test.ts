// L'édition 2025 est figée dans config/results.json. Ses horaires y sont
// écrits en dur (ISO + offset) : ils ne doivent dépendre ni de l'année
// courante, ni du fuseau de la machine qui rend la page.
import { describe, it, expect } from 'vitest';
import results from '@/config/results.json';
import { formatSiteDate } from '@/utils/timezone';

const EXPECTED: Record<string, string> = {
  'R1-M1': '17/11/2025 21:00',
  'R1-M2': '17/11/2025 22:30',
  'R2-M1': '17/11/2025 23:30',
  'R2-M2': '24/11/2025 21:00',
  'R3-M1': '24/11/2025 22:00',
  'R3-M2': '24/11/2025 23:30',
  FINAL: '10/12/2025 21:00',
};

const entries = results as Record<
  string,
  { home: number; away: number; date?: string }
>;

describe('config/results.json — édition 2025', () => {
  it('chaque match a une date ISO avec offset explicite', () => {
    for (const id of Object.keys(EXPECTED)) {
      const date = entries[id]?.date;
      expect(date, id).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/
      );
      expect(Number.isNaN(new Date(date as string).getTime()), id).toBe(false);
    }
  });

  it('les horaires tombent à la bonne heure de Paris, en 2025', () => {
    for (const [id, expected] of Object.entries(EXPECTED)) {
      expect(
        formatSiteDate(entries[id].date, 'fr', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        id
      ).toBe(expected);
    }
  });
});
