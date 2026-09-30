import { describe, it, expect } from 'vitest';
import {
  groupMatchNights,
  weeklyDates,
} from '../../features/admin/staff-planning/service';
import {
  countByPerson,
  discordRecap,
  matchNightEvents,
  monthStats,
  roleCoverage,
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

const LABELS = {
  matchesOne: '{count} match',
  matchesMany: '{count} matchs',
  nobody: 'personne de dispo',
};

describe('planning du staff — soirs de match et couverture', () => {
  it('regroupe les matchs par soir, à l’heure de Paris', () => {
    expect(
      groupMatchNights(
        [
          { scheduled_at: '2026-10-07T18:30:00Z', status: 'pending' },
          { scheduled_at: '2026-10-07T17:00:00Z', status: 'finished' },
          // 00:30 à Paris : le lendemain.
          { scheduled_at: '2026-10-07T22:30:00Z', status: 'pending' },
          { scheduled_at: '2026-10-09T17:00:00Z', status: 'cancelled' },
        ],
        '2026-10-01',
        '2026-10-31'
      )
    ).toEqual([
      { date: '2026-10-07', count: 2, first: '19:00' },
      { date: '2026-10-08', count: 1, first: '00:30' },
    ]);
  });

  it('répétition hebdomadaire bornée', () => {
    expect(weeklyDates('2026-10-07', '2026-10-21')).toEqual([
      '2026-10-07',
      '2026-10-14',
      '2026-10-21',
    ]);
    expect(weeklyDates('2026-01-07', '2027-12-31')).toHaveLength(26);
  });

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
