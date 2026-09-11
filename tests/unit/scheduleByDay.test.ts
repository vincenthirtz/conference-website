import { describe, it, expect } from 'vitest';
import {
  buildPhasedSchedule,
  dayKeyInTz,
  daysBetweenYmd,
  deriveDayStates,
  formatTimeInTz,
  formatYmd,
  groupByDayInTz,
  groupDaysByWeek,
  resolveTournamentTz,
  UNSCHEDULED_KEY,
} from '../../utils/scheduleByDay';
import { groupMatchesByTzDay } from '../../utils/matches/adminMatchesTz';
import { getWallClockParts } from '../../utils/timezone';

type M = {
  id: string;
  scheduled_at: string | null;
  status: string;
  round_name: string | null;
  stage: string | null;
};

const REGULAR = 'Saison régulière';

function match(
  id: string,
  scheduled_at: string | null,
  round_name: string | null,
  extra: Partial<M> = {}
): M {
  return {
    id,
    scheduled_at,
    status: 'pending',
    round_name,
    stage: REGULAR,
    ...extra,
  };
}

// Extrait du vrai calendrier 2026 (heures UTC, soirées 19:00/20:30/22:00 Paris).
const FRI_18_09 = [
  match('a1', '2026-09-18T17:00:00+00:00', 'J1'),
  match('a2', '2026-09-18T18:30:00+00:00', 'J1'),
  match('a3', '2026-09-18T20:00:00+00:00', 'J1'),
];
const WED_23_09 = [
  match('b1', '2026-09-23T17:00:00+00:00', 'J3'),
  match('b2', '2026-09-23T18:30:00+00:00', 'J2'),
  match('b3', '2026-09-23T20:00:00+00:00', 'J1'),
];
const FINALS = [
  match('f1', '2026-10-23T17:00:00+00:00', 'Petite finale', { stage: null }),
  match('f2', '2026-10-23T18:30:00+00:00', 'Grande finale', { stage: null }),
];

describe('dayKeyInTz', () => {
  it('rend le jour calendaire à Paris', () => {
    expect(dayKeyInTz('2026-09-18T20:00:00Z')).toBe('2026-09-18');
  });

  it('range un match de 00:30 à Paris le lendemain, pas le jour UTC', () => {
    // 22:30 UTC le 18 = 00:30 le 19 à Paris (UTC+2).
    expect(dayKeyInTz('2026-09-18T22:30:00Z')).toBe('2026-09-19');
    expect('2026-09-18T22:30:00Z'.slice(0, 10)).toBe('2026-09-18');
  });

  it("suit le passage à l'heure d'hiver du 25/10", () => {
    // Avant la bascule (UTC+2) : 22:30 UTC = 00:30 le lendemain.
    expect(dayKeyInTz('2026-10-24T22:30:00Z')).toBe('2026-10-25');
    // Après (UTC+1) : la même heure UTC reste le même jour (23:30)…
    expect(dayKeyInTz('2026-10-25T22:30:00Z')).toBe('2026-10-25');
    // … et il faut 23:30 UTC pour atteindre minuit et demi.
    expect(dayKeyInTz('2026-10-25T23:30:00Z')).toBe('2026-10-26');
  });

  it('rend null pour une date absente ou illisible', () => {
    expect(dayKeyInTz(null)).toBeNull();
    expect(dayKeyInTz('pas-une-date')).toBeNull();
  });
});

describe('alignement avec la référence admin', () => {
  // Un match doit tomber le MÊME soir sur la timeline publique, l'embed et
  // le diagnostic de planning admin (getWallClockParts dans le fuseau du
  // tournoi) — ici via groupMatchesByTzDay, qui en est le pendant liste admin.
  const instants = [
    '2026-09-18T17:00:00+00:00',
    '2026-09-18T22:30:00Z',
    '2026-10-24T22:30:00Z',
    '2026-10-25T22:30:00Z',
    '2026-10-25T23:30:00Z',
  ];

  it.each(['Europe/Paris', 'America/New_York', 'Asia/Tokyo'])(
    'produit les mêmes clés de jour en %s',
    (tz) => {
      const items = instants.map((iso, i) => match(`m${i}`, iso, 'J1'));
      expect(groupByDayInTz(items, tz).map((d) => d.key)).toEqual(
        groupMatchesByTzDay(items, tz).days.map((d) => d.key)
      );
      for (const iso of instants) {
        expect(dayKeyInTz(iso, tz)).toBe(
          getWallClockParts(new Date(iso), tz).date
        );
      }
    }
  );

  it('retombe sur Europe/Paris pour un fuseau absent ou invalide', () => {
    expect(resolveTournamentTz(null)).toBe('Europe/Paris');
    expect(resolveTournamentTz('Mars/Olympus')).toBe('Europe/Paris');
    expect(resolveTournamentTz('Asia/Tokyo')).toBe('Asia/Tokyo');
  });
});

describe('groupByDayInTz', () => {
  it('garde dans une même soirée des matchs de journées différentes', () => {
    const days = groupByDayInTz([...WED_23_09].reverse());
    expect(days).toHaveLength(1);
    expect(days[0].key).toBe('2026-09-23');
    // Triés par horaire, étiquettes de journée intactes.
    expect(days[0].items.map((m) => m.round_name)).toEqual(['J3', 'J2', 'J1']);
    expect(days[0].firstAt).toBe('2026-09-23T17:00:00+00:00');
    expect(days[0].lastAt).toBe('2026-09-23T20:00:00+00:00');
  });

  it('place un match de 00:30 dans le jour de Paris', () => {
    const days = groupByDayInTz([
      match('late', '2026-09-18T22:30:00Z', 'J1'),
      ...FRI_18_09,
    ]);
    expect(days.map((d) => d.key)).toEqual(['2026-09-18', '2026-09-19']);
    expect(days[0].items.map((m) => m.id)).toEqual(['a1', 'a2', 'a3']);
    expect(days[1].items.map((m) => m.id)).toEqual(['late']);
  });

  it('met les matchs non datés (ou illisibles) dans un dernier groupe', () => {
    const days = groupByDayInTz([
      match('x', null, 'J1'),
      match('y', 'n/a', 'J1'),
      ...FRI_18_09,
    ]);
    expect(days.map((d) => d.key)).toEqual(['2026-09-18', UNSCHEDULED_KEY]);
    expect(days[1].ymd).toBeNull();
    expect(days[1].items.map((m) => m.id)).toEqual(['x', 'y']);
    expect(days[1].firstAt).toBeNull();
  });
});

describe('groupDaysByWeek', () => {
  const days = groupByDayInTz([
    ...FRI_18_09,
    ...WED_23_09,
    match('c1', '2026-09-25T20:00:00Z', 'J3'),
    match('d1', '2026-09-30T17:00:00Z', 'J3'),
    match('e1', '2026-10-02T18:30:00Z', 'J4'),
  ]);

  it('regroupe les soirées par semaine ISO, numérotées depuis la première', () => {
    const weeks = groupDaysByWeek(days);
    expect(
      weeks.map((w) => [
        w.index,
        w.days.map((d) => d.ymd),
        w.firstYmd,
        w.lastYmd,
      ])
    ).toEqual([
      [1, ['2026-09-18'], '2026-09-18', '2026-09-18'],
      [2, ['2026-09-23', '2026-09-25'], '2026-09-23', '2026-09-25'],
      // Lundi 28/09 → le vendredi 02/10 est dans la même semaine.
      [3, ['2026-09-30', '2026-10-02'], '2026-09-30', '2026-10-02'],
    ]);
  });

  it('numérote depuis une origine commune (semaine des finales)', () => {
    const weeks = groupDaysByWeek(groupByDayInTz(FINALS), '2026-09-18');
    expect(weeks).toHaveLength(1);
    expect(weeks[0].index).toBe(6);
    expect(weeks[0].monday).toBe('2026-10-19');
  });

  it('isole les jours non datés dans une semaine sans numéro', () => {
    const weeks = groupDaysByWeek(
      groupByDayInTz([...FRI_18_09, match('x', null, 'J2')])
    );
    expect(weeks.map((w) => w.index)).toEqual([1, null]);
    expect(weeks[1].key).toBe(UNSCHEDULED_KEY);
  });
});

describe('deriveDayStates', () => {
  it('marque la première soirée non terminée comme prochaine', () => {
    const days = groupByDayInTz([...FRI_18_09, ...WED_23_09]);
    const { next, states } = deriveDayStates(days);
    expect(next).toBe(days[0]);
    expect(days.map((d) => states.get(d))).toEqual(['next', 'upcoming']);
  });

  it('passe une soirée terminée (finished/completed/finalized)', () => {
    const played = FRI_18_09.map((m, i) => ({
      ...m,
      status: ['finished', 'completed', 'finalized'][i],
    }));
    const partial = [
      { ...WED_23_09[0], status: 'finished' },
      ...WED_23_09.slice(1),
    ];
    const days = groupByDayInTz([...played, ...partial, ...FINALS]);
    const { next, states } = deriveDayStates(days);
    expect(next?.ymd).toBe('2026-09-23');
    expect(days.map((d) => states.get(d))).toEqual([
      'done',
      'next',
      'upcoming',
    ]);
  });

  it('donne la priorité à une soirée en direct, sans autre « prochaine »', () => {
    const live = [
      { ...WED_23_09[0], status: 'ongoing' },
      ...WED_23_09.slice(1),
    ];
    const days = groupByDayInTz([...FRI_18_09, ...live]);
    const { next, states } = deriveDayStates(days);
    expect(next?.ymd).toBe('2026-09-23');
    expect(states.get(days[1])).toBe('live');
    expect([...states.values()]).not.toContain('next');
  });

  it("n'a pas de prochaine soirée quand tout est joué ou vide", () => {
    expect(deriveDayStates([]).next).toBeNull();
    const done = groupByDayInTz(
      FRI_18_09.map((m) => ({ ...m, status: 'finished' }))
    );
    expect(deriveDayStates(done).next).toBeNull();
  });
});

describe('buildPhasedSchedule', () => {
  const phaseOf = (m: M) => m.stage;

  it('range les finales sans étape dans la phase de repli, après la saison', () => {
    const s = buildPhasedSchedule([...FINALS, ...WED_23_09, ...FRI_18_09], {
      phaseOf,
      fallbackPhase: 'Finales',
    });
    expect(s.phases.map((p) => p.key)).toEqual([REGULAR, 'Finales']);
    expect(s.phases[1].items.map((m) => m.round_name)).toEqual([
      'Petite finale',
      'Grande finale',
    ]);
    // Numérotation des semaines commune aux deux phases.
    expect(s.phases[0].weeks.map((w) => w.index)).toEqual([1, 2]);
    expect(s.phases[1].weeks.map((w) => w.index)).toEqual([6]);
    expect(s.dayCount).toBe(3);
    expect(s.firstAt).toBe('2026-09-18T17:00:00+00:00');
    expect(s.lastAt).toBe('2026-10-23T18:30:00+00:00');
    expect(s.next?.ymd).toBe('2026-09-18');
    expect(s.phases[1].firstAt).toBe('2026-10-23T17:00:00+00:00');
  });

  it('traite une étape vide comme sans étape', () => {
    const s = buildPhasedSchedule(
      [match('z', '2026-10-23T17:00:00Z', 'Grande finale', { stage: '  ' })],
      { phaseOf, fallbackPhase: 'Finales' }
    );
    expect(s.phases.map((p) => p.key)).toEqual(['Finales']);
  });

  it('compte une fois une soirée partagée par deux phases', () => {
    const s = buildPhasedSchedule(
      [match('r', '2026-10-23T17:00:00Z', 'J7'), ...FINALS.slice(1)],
      { phaseOf, fallbackPhase: 'Finales' }
    );
    expect(s.phases).toHaveLength(2);
    expect(s.days).toHaveLength(2);
    expect(s.dayCount).toBe(1);
  });
});

describe('daysBetweenYmd', () => {
  it('compte des jours calendaires, y compris à la bascule du 25/10', () => {
    expect(daysBetweenYmd('2026-09-11', '2026-09-18')).toBe(7);
    expect(daysBetweenYmd('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetweenYmd('2026-09-18', '2026-09-18')).toBe(0);
    expect(daysBetweenYmd('2026-09-18', '2026-09-11')).toBe(-7);
  });
});

describe('formatYmd / formatTimeInTz', () => {
  it('formate un jour calendaire tel quel', () => {
    expect(
      formatYmd('2026-09-18', 'fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    ).toBe('ven. 18 sept.');
  });

  it("rend l'heure de Paris, en heure d'été comme d'hiver", () => {
    expect(formatTimeInTz('2026-10-23T17:00:00Z', 'fr-FR')).toBe('19:00'); // CEST
    expect(formatTimeInTz('2026-10-28T18:00:00Z', 'fr-FR')).toBe('19:00'); // CET
    expect(formatTimeInTz('2026-09-18T22:30:00Z', 'fr-FR')).toBe('00:30');
  });

  it('rend null pour une date absente ou illisible', () => {
    expect(formatTimeInTz(null, 'fr-FR')).toBeNull();
    expect(formatTimeInTz('n/a', 'fr-FR')).toBeNull();
  });
});
