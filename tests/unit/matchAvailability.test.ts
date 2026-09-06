import { describe, it, expect } from 'vitest';
import {
  blackoutDaysByTeam,
  checkConstraint,
  isoWeekdayOfYmd,
  constraintApplies,
  findAvailabilityViolations,
  groupConstraintsByTeam,
  isSlotAllowed,
  parseTimeOfDay,
  type AvailabilityConstraint,
  type SchedulableMatch,
} from '../../utils/matches/availability';

// Le cas réel qui a motivé le lot : Hinode Sparkles, Cup 2026.
// « Aucun match avant 21 h, et indisponible du 18 au 20 et du 25 au 27 septembre. »
const HIN = 'team-hinode';
const SHU = 'team-shujaa';
const TOURNOI = 'cup-2026';

function makeMatch(over: Partial<SchedulableMatch> = {}): SchedulableMatch {
  return {
    id: 'm1',
    tournamentId: TOURNOI,
    scheduledAt: '2026-09-18T18:30:00.000Z', // 20 h 30 à Paris
    team1Id: HIN,
    team2Id: SHU,
    ...over,
  };
}

function makeConstraint(
  over: Partial<AvailabilityConstraint> = {}
): AvailabilityConstraint {
  return {
    id: 'c1',
    teamId: HIN,
    tournamentId: null,
    kind: 'earliest',
    timeOfDay: '21:00',
    timezone: 'Europe/Paris',
    ...over,
  };
}

describe('parseTimeOfDay', () => {
  it('accepte HH:MM et HH:MM:SS', () => {
    expect(parseTimeOfDay('21:00')).toBe(1260);
    expect(parseTimeOfDay('21:00:00')).toBe(1260);
    expect(parseTimeOfDay('9:05')).toBe(545);
    expect(parseTimeOfDay('00:00')).toBe(0);
    expect(parseTimeOfDay('23:59')).toBe(1439);
  });

  it('rejette ce qui n’est pas une heure', () => {
    expect(parseTimeOfDay(null)).toBeNull();
    expect(parseTimeOfDay('')).toBeNull();
    expect(parseTimeOfDay('24:00')).toBeNull();
    expect(parseTimeOfDay('21:60')).toBeNull();
    expect(parseTimeOfDay('21h00')).toBeNull();
  });
});

describe('constraintApplies', () => {
  it('ne retient que les matchs de l’équipe', () => {
    const c = makeConstraint();
    expect(constraintApplies(c, makeMatch())).toBe(true);
    expect(
      constraintApplies(c, makeMatch({ team1Id: 'autre', team2Id: 'encore' }))
    ).toBe(false);
  });

  it('vaut partout quand tournamentId est null, et seulement là quand il est posé', () => {
    const globale = makeConstraint({ tournamentId: null });
    const ciblee = makeConstraint({ tournamentId: TOURNOI });
    const autreTournoi = makeMatch({ tournamentId: 'autre-tournoi' });

    expect(constraintApplies(globale, autreTournoi)).toBe(true);
    expect(constraintApplies(ciblee, autreTournoi)).toBe(false);
    expect(constraintApplies(ciblee, makeMatch())).toBe(true);
  });

  it('ignore les byes — un bye n’oppose personne', () => {
    expect(constraintApplies(makeConstraint(), makeMatch({ isBye: true }))).toBe(
      false
    );
  });
});

describe('checkConstraint · earliest', () => {
  it('signale un match qui commence avant l’heure plancher', () => {
    const v = checkConstraint(makeMatch(), makeConstraint());
    expect(v).not.toBeNull();
    expect(v?.kind).toBe('earliest');
    expect(v?.teamId).toBe(HIN);
    expect(v?.wallClock).toEqual({
      date: '2026-09-18',
      time: '20:30',
      timezone: 'Europe/Paris',
    });
    expect(v?.reason).toBe('commence à 20:30, pas de match avant 21:00');
  });

  it('laisse passer un match qui commence PILE à l’heure plancher', () => {
    // 21 h 00 Paris = 19 h 00 UTC en septembre (CEST, UTC+2).
    const m = makeMatch({ scheduledAt: '2026-09-23T19:00:00.000Z' });
    expect(checkConstraint(m, makeConstraint())).toBeNull();
  });

  it('date le match sur son COUP D’ENVOI, pas sur sa fin', () => {
    // 21 h 00 pile : le match finira à 22 h 30, et c'est autorisé.
    const m = makeMatch({ scheduledAt: '2026-09-23T19:00:00.000Z' });
    expect(checkConstraint(m, makeConstraint({ timeOfDay: '21:00' }))).toBeNull();
  });
});

describe('checkConstraint · latest', () => {
  it('signale un match qui commence après l’heure plafond', () => {
    const m = makeMatch({ scheduledAt: '2026-09-23T20:00:00.000Z' }); // 22 h Paris
    const v = checkConstraint(m, makeConstraint({ kind: 'latest', timeOfDay: '21:00' }));
    expect(v?.reason).toBe('commence à 22:00, pas de match après 21:00');
  });

  it('laisse passer un match qui commence PILE à l’heure plafond', () => {
    const m = makeMatch({ scheduledAt: '2026-09-23T19:00:00.000Z' }); // 21 h Paris
    expect(
      checkConstraint(m, makeConstraint({ kind: 'latest', timeOfDay: '21:00' }))
    ).toBeNull();
  });
});

describe('checkConstraint · blackout', () => {
  const blackout = makeConstraint({
    id: 'c-blackout',
    kind: 'blackout',
    timeOfDay: null,
    startsOn: '2026-09-18',
    endsOn: '2026-09-20',
  });

  it('couvre les deux bornes, inclusives', () => {
    for (const jour of ['2026-09-18', '2026-09-19', '2026-09-20']) {
      const m = makeMatch({ scheduledAt: `${jour}T18:30:00.000Z` });
      expect(checkConstraint(m, blackout)?.kind).toBe('blackout');
    }
  });

  it('laisse passer la veille et le lendemain', () => {
    for (const jour of ['2026-09-17', '2026-09-21']) {
      const m = makeMatch({ scheduledAt: `${jour}T18:30:00.000Z` });
      expect(checkConstraint(m, blackout)).toBeNull();
    }
  });

  it('formule un blackout d’un seul jour au singulier', () => {
    const v = checkConstraint(
      makeMatch({ scheduledAt: '2026-09-25T18:30:00.000Z' }),
      makeConstraint({
        kind: 'blackout',
        timeOfDay: null,
        startsOn: '2026-09-25',
        endsOn: '2026-09-25',
      })
    );
    expect(v?.reason).toBe('indisponible le 2026-09-25');
  });

  it('juge sur le jour MURAL, pas sur le jour UTC', () => {
    // 2026-09-21T22:30Z = 22 h 30 UTC → 00 h 30 le 22 à Paris. Le blackout du
    // 18 au 21 ne doit PAS mordre : pour l'équipe, on est le 22.
    const m = makeMatch({ scheduledAt: '2026-09-21T22:30:00.000Z' });
    const c = makeConstraint({
      kind: 'blackout',
      timeOfDay: null,
      startsOn: '2026-09-18',
      endsOn: '2026-09-21',
    });
    expect(checkConstraint(m, c)).toBeNull();
  });
});

describe('checkConstraint · weekday', () => {
  it('signale les jours listés, en ISO (1 = lundi)', () => {
    // 2026-09-18 est un vendredi → ISO 5.
    const c = makeConstraint({
      kind: 'weekday',
      timeOfDay: null,
      weekdays: [5, 6],
    });
    const v = checkConstraint(makeMatch(), c);
    expect(v?.reason).toBe('indisponible le vendredi');
  });

  it('laisse passer un jour non listé', () => {
    const c = makeConstraint({
      kind: 'weekday',
      timeOfDay: null,
      weekdays: [1, 2],
    });
    expect(checkConstraint(makeMatch(), c)).toBeNull();
  });

  it('numérote dimanche 7 et non 0', () => {
    // 2026-09-20 est un dimanche.
    const m = makeMatch({ scheduledAt: '2026-09-20T18:30:00.000Z' });
    const c = makeConstraint({ kind: 'weekday', timeOfDay: null, weekdays: [7] });
    expect(checkConstraint(m, c)?.reason).toBe('indisponible le dimanche');
  });
});

describe('checkConstraint · robustesse', () => {
  it('ne dit rien d’un match non planifié', () => {
    expect(checkConstraint(makeMatch({ scheduledAt: null }), makeConstraint())).toBeNull();
  });

  it('ne dit rien d’une date illisible', () => {
    expect(checkConstraint(makeMatch({ scheduledAt: 'pas-une-date' }), makeConstraint())).toBeNull();
  });

  it('ne dit rien d’une contrainte incomplète plutôt que d’inventer', () => {
    expect(checkConstraint(makeMatch(), makeConstraint({ timeOfDay: null }))).toBeNull();
    expect(
      checkConstraint(makeMatch(), makeConstraint({ kind: 'blackout', timeOfDay: null, startsOn: '2026-09-18', endsOn: null }))
    ).toBeNull();
    expect(
      checkConstraint(makeMatch(), makeConstraint({ kind: 'weekday', timeOfDay: null, weekdays: [] }))
    ).toBeNull();
  });

  it('retombe sur Europe/Paris quand le fuseau est absent', () => {
    const v = checkConstraint(makeMatch(), makeConstraint({ timezone: null }));
    expect(v?.wallClock.timezone).toBe('Europe/Paris');
    expect(v?.wallClock.time).toBe('20:30');
  });
});

describe('checkConstraint · bascule d’heure d’hiver', () => {
  // L'Europe repasse à l'heure d'hiver le 25 octobre 2026 : Paris quitte
  // UTC+2 pour UTC+1. La Cup court jusqu'au 23/10, elle frôle la bascule ;
  // un décalage d'une heure ici déplacerait de vrais matchs.
  it('lit 21 h Paris à 19 h UTC AVANT la bascule', () => {
    const m = makeMatch({ scheduledAt: '2026-10-23T19:00:00.000Z' });
    expect(checkConstraint(m, makeConstraint())).toBeNull();
  });

  it('lit 20 h Paris à 19 h UTC APRÈS la bascule — et le signale', () => {
    const m = makeMatch({ scheduledAt: '2026-10-30T19:00:00.000Z' });
    const v = checkConstraint(m, makeConstraint());
    expect(v?.wallClock.time).toBe('20:00');
  });

  it('reste exact sur un fuseau sans heure d’été', () => {
    const m = makeMatch({ scheduledAt: '2026-10-30T19:00:00.000Z' });
    const v = checkConstraint(m, makeConstraint({ timezone: 'UTC' }));
    expect(v?.wallClock).toEqual({
      date: '2026-10-30',
      time: '19:00',
      timezone: 'UTC',
    });
  });
});

describe('findAvailabilityViolations', () => {
  const contraintes: AvailabilityConstraint[] = [
    makeConstraint({ id: 'avant-21h' }),
    makeConstraint({
      id: 'indispo-18-20',
      kind: 'blackout',
      timeOfDay: null,
      startsOn: '2026-09-18',
      endsOn: '2026-09-20',
    }),
  ];

  it('cumule les violations d’un même match', () => {
    // 18/09 à 20 h 30 : avant 21 h ET dans la fenêtre bloquée. Les deux comptent —
    // corriger l'heure ne suffirait pas, il faut changer de date.
    const v = findAvailabilityViolations([makeMatch()], contraintes);
    expect(v.map((x) => x.constraintId).sort()).toEqual([
      'avant-21h',
      'indispo-18-20',
    ]);
  });

  it('rend les anomalies dans l’ordre du calendrier', () => {
    const tard = makeMatch({ id: 'tard', scheduledAt: '2026-09-25T18:30:00.000Z' });
    const tot = makeMatch({ id: 'tot', scheduledAt: '2026-09-19T18:30:00.000Z' });
    const v = findAvailabilityViolations([tard, tot], contraintes);
    expect(v[0].matchId).toBe('tot');
    expect(v.at(-1)?.matchId).toBe('tard');
  });

  it('ignore les matchs sans date', () => {
    expect(
      findAvailabilityViolations([makeMatch({ scheduledAt: null })], contraintes)
    ).toEqual([]);
  });

  it('ne dit rien d’un calendrier conforme', () => {
    const bon = makeMatch({ scheduledAt: '2026-09-23T20:00:00.000Z' }); // 22 h, hors blackout
    expect(findAvailabilityViolations([bon], contraintes)).toEqual([]);
  });
});

describe('isSlotAllowed', () => {
  const contraintes = [makeConstraint()];

  it('refuse un créneau trop tôt sans toucher au match', () => {
    const m = makeMatch({ scheduledAt: null });
    const res = isSlotAllowed(m, new Date('2026-09-23T17:00:00.000Z'), contraintes);
    expect(res.allowed).toBe(false);
    expect(res.violations).toHaveLength(1);
    expect(m.scheduledAt).toBeNull(); // le match d'entrée n'est pas muté
  });

  it('accepte un créneau conforme', () => {
    const res = isSlotAllowed(
      makeMatch({ scheduledAt: null }),
      new Date('2026-09-23T20:00:00.000Z'),
      contraintes
    );
    expect(res).toEqual({ allowed: true, violations: [] });
  });
});

describe('groupConstraintsByTeam', () => {
  it('indexe par équipe', () => {
    const map = groupConstraintsByTeam([
      makeConstraint({ id: 'a', teamId: HIN }),
      makeConstraint({ id: 'b', teamId: HIN }),
      makeConstraint({ id: 'c', teamId: SHU }),
    ]);
    expect(map.get(HIN)?.map((c) => c.id)).toEqual(['a', 'b']);
    expect(map.get(SHU)?.map((c) => c.id)).toEqual(['c']);
    expect(map.get('inconnue')).toBeUndefined();
  });
});

describe('isoWeekdayOfYmd', () => {
  it('numérote lundi 1 et dimanche 7', () => {
    expect(isoWeekdayOfYmd('2026-09-14')).toBe(1); // lundi
    expect(isoWeekdayOfYmd('2026-09-18')).toBe(5); // vendredi
    expect(isoWeekdayOfYmd('2026-09-20')).toBe(7); // dimanche
  });

  it('ne dépend pas du fuseau de la machine', () => {
    // Un `new Date('2026-09-20')` interprété en heure locale bascule d'un jour
    // à l'ouest de Greenwich. Le helper passe par Date.UTC exprès.
    expect(isoWeekdayOfYmd('2026-01-01')).toBe(4); // jeudi
  });

  it('rejette ce qui n’est pas une date', () => {
    expect(isoWeekdayOfYmd('18/09/2026')).toBeNull();
    expect(isoWeekdayOfYmd('')).toBeNull();
  });
});

describe('blackoutDaysByTeam', () => {
  const blackout = makeConstraint({
    id: 'b',
    kind: 'blackout',
    timeOfDay: null,
    startsOn: '2026-09-18',
    endsOn: '2026-09-20',
  });

  it('déplie une plage en jours, bornes comprises', () => {
    const map = blackoutDaysByTeam([blackout], '2026-09-01', '2026-09-30');
    expect([...map.keys()].sort()).toEqual([
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]);
    expect(map.get('2026-09-19')).toEqual([HIN]);
  });

  it('tronque à la fenêtre demandée', () => {
    const map = blackoutDaysByTeam([blackout], '2026-09-19', '2026-09-19');
    expect([...map.keys()]).toEqual(['2026-09-19']);
  });

  it('déplie aussi les jours de semaine', () => {
    const map = blackoutDaysByTeam(
      [makeConstraint({ id: 'w', kind: 'weekday', timeOfDay: null, weekdays: [1] })],
      '2026-09-01',
      '2026-09-30'
    );
    // Les lundis de septembre 2026 : 7, 14, 21, 28.
    expect([...map.keys()].sort()).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
    ]);
  });

  it('cumule les équipes sur un même jour sans doublon', () => {
    const map = blackoutDaysByTeam(
      [
        blackout,
        makeConstraint({ id: 'b2', teamId: SHU, kind: 'blackout', timeOfDay: null, startsOn: '2026-09-19', endsOn: '2026-09-19' }),
        makeConstraint({ id: 'b3', kind: 'blackout', timeOfDay: null, startsOn: '2026-09-19', endsOn: '2026-09-19' }),
      ],
      '2026-09-18',
      '2026-09-20'
    );
    expect(map.get('2026-09-19')?.sort()).toEqual([HIN, SHU].sort());
  });

  it('ignore les contraintes d’HEURE — une heure ne grise pas une journée', () => {
    // Griser le jour entier pour « pas avant 21 h » se lirait comme une
    // interdiction, alors que le créneau de 22 h reste jouable.
    const map = blackoutDaysByTeam([makeConstraint()], '2026-09-01', '2026-09-30');
    expect(map.size).toBe(0);
  });

  it('rend une carte vide sur une plage illisible', () => {
    expect(blackoutDaysByTeam([blackout], 'hier', 'demain').size).toBe(0);
  });
});
