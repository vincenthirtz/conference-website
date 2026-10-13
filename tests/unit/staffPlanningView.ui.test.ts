import { describe, it, expect } from 'vitest';
import {
  countByPerson,
  discordRecap,
  endsNextDay,
  matchNightEvents,
  monthStats,
  PERSON_COLORS,
  personColor,
  rangeLabel,
  roleCoverage,
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

// Le regroupement des matchs par soir (`groupMatchNights`, heure de Paris) et
// la répétition hebdomadaire vivent dans le service, côté API (conference-api,
// tests/unit/staffPlanningService.test.ts). Ici, les soirs arrivent EN FIXTURE.
const LABELS = {
  matchesOne: '{count} match',
  matchesMany: '{count} matchs',
  nobody: 'personne de dispo',
};

describe('planning du staff — soirs de match et couverture', () => {
  it('un soir de match sans personne passe en alerte', () => {
    const nights = [
      { date: '2026-09-23', count: 2, first: '19:00' },
      { date: '2026-10-07', count: 1, first: '20:00' },
    ];
    const events = matchNightEvents(
      nights,
      [slot({ slot_date: '2026-09-23' })],
      LABELS
    );
    expect(events[0].label).toBe('⚔ 2 matchs');
    expect(events[1].label).toBe('⚠ 1 match · personne de dispo');
    expect(events.every((e) => e.minute === -1)).toBe(true);
  });

  it('rôles couverts, manquants et sans rôle', () => {
    const cov = roleCoverage([
      slot({ id: 'a', role: 'cast' }),
      slot({ id: 'b', role: null }),
    ]);
    expect(cov.covered).toEqual(['cast']);
    expect(cov.missing).toEqual(['moderation', 'prod_obs', 'live_prod']);
    expect(cov.unassigned).toBe(1);
  });

  it('stats du mois : soirs couverts et soirs à découvert', () => {
    const stats = monthStats(
      [slot({ slot_date: '2026-09-23' })],
      [
        { date: '2026-09-23', count: 2, first: '19:00' },
        { date: '2026-09-30', count: 1, first: '19:00' },
        { date: '2026-10-07', count: 1, first: '19:00' },
      ],
      '2026-09'
    );
    expect(stats).toEqual({
      slots: 1,
      people: 1,
      nights: 2,
      coveredNights: 1,
      uncovered: ['2026-09-30'],
    });
  });

  it('récap Discord : soir de match, puis créneaux triés, rôle entre crochets', () => {
    const text = discordRecap({
      dayLabel: 'mercredi 23 septembre',
      night: { date: '2026-09-23', count: 2, first: '19:00' },
      slots: [
        slot({
          id: 'a',
          person_name: 'Pomme',
          start_time: '22:00',
          role: 'cast',
        }),
        slot({
          id: 'b',
          person_name: 'Anrataria',
          start_time: '19:00',
          end_time: '22:00',
        }),
      ],
      roleLabel: (r) => (r === 'cast' ? 'Cast' : r),
      labels: LABELS,
    });
    expect(text).toBe(
      [
        '**📅 mercredi 23 septembre**',
        '⚔ 2 matchs — 19h',
        '• Anrataria 19h–22h',
        '• Pomme 22h–00h [Cast]',
      ].join('\n')
    );
  });
});
