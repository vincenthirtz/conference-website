import { describe, it, expect } from 'vitest';
import {
  countByPerson,
  endsNextDay,
  PERSON_COLORS,
  personColor,
  rangeLabel,
  slotsToEvents,
} from '../../features/admin/staff-planning/view';
import type { StaffPlanningSlotRow } from '../../features/admin/staff-planning/client';

const slot = (over: Partial<StaffPlanningSlotRow>): StaffPlanningSlotRow => ({
  id: 'x',
  person_name: 'Pomme',
  slot_date: '2026-09-23',
  start_time: '20:30',
  end_time: '00:00',
  role: null,
  note: null,
  source: 'csv',
  created_at: '',
  ...over,
});

describe('planning du staff — affichage', () => {
  it('écrit les plages comme le tableur', () => {
    expect(rangeLabel('20:30', '00:00')).toBe('20h30–00h');
    expect(rangeLabel('19:00', '22:00')).toBe('19h–22h');
  });

  it('repère un créneau qui finit le lendemain', () => {
    expect(endsNextDay('22:00', '00:00')).toBe(true);
    expect(endsNextDay('19:00', '22:00')).toBe(false);
  });

  it('une couleur distincte par personne tant que la palette suffit', () => {
    const people = Array.from(
      { length: PERSON_COLORS.length },
      (_, i) => `P${i}`
    );
    const colors = new Set(people.map((p) => personColor(p, people).bg));
    expect(colors.size).toBe(PERSON_COLORS.length);
    // L'équipe du tableur (13 personnes) tient dans la palette.
    expect(PERSON_COLORS.length).toBeGreaterThanOrEqual(13);
  });

  it('événements de l’agenda : minute de début, couleur de la personne, filtre', () => {
    const slots = [
      slot({ id: 'a', person_name: 'Pomme', start_time: '22:00' }),
      slot({
        id: 'b',
        person_name: 'Anrataria',
        start_time: '19:00',
        end_time: '22:00',
      }),
    ];
    const people = ['Anrataria', 'Pomme'];
    const all = slotsToEvents(slots, people, null);
    expect(all.map((e) => e.minute)).toEqual([22 * 60, 19 * 60]);
    expect(all[0].chipStyle).toEqual({
      backgroundColor: personColor('Pomme', people).bg,
      color: personColor('Pomme', people).fg,
    });
    expect(slotsToEvents(slots, people, 'Anrataria').map((e) => e.key)).toEqual(
      ['b']
    );
  });

  it('compte les créneaux du mois par personne', () => {
    const slots = [
      slot({ id: 'a' }),
      slot({ id: 'b', slot_date: '2026-09-30' }),
      slot({ id: 'c', slot_date: '2026-10-07' }),
    ];
    expect(countByPerson(slots, '2026-09')).toEqual({ Pomme: 2 });
  });
});
