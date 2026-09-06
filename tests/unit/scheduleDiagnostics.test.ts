import { describe, it, expect } from 'vitest';
import {
  deriveSlotGrid,
  diagnoseSchedule,
  previewMoves,
  type DiagnosableMatch,
} from '../../utils/matches/scheduleDiagnostics';
import type { AvailabilityConstraint } from '../../utils/matches/availability';

// Le décor est celui de la Cup 2026, parce que c'est lui qui a montré le trou :
// une grille de trois créneaux par soirée (19 h / 20 h 30 / 22 h, Paris) et une
// équipe qui ne peut jouer qu'au dernier.
const HIN = 'hinode';
const SHU = 'shujaa';
const ECL = 'eclypse';
const POS = 'positivite';
const TOURNOI = 'cup-2026';

/** `2026-09-18 20:30` Paris → ISO UTC (CEST = UTC+2 en septembre). */
function paris(day: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(`${day}T${String(h - 2).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`).toISOString();
}

function match(
  id: string,
  day: string,
  hhmm: string,
  t1: string,
  t2: string,
  over: Partial<DiagnosableMatch> = {}
): DiagnosableMatch {
  return {
    id,
    tournamentId: TOURNOI,
    scheduledAt: paris(day, hhmm),
    team1Id: t1,
    team2Id: t2,
    team1Name: t1,
    team2Name: t2,
    format: 'bo3',
    ...over,
  };
}

const pasAvant21h: AvailabilityConstraint = {
  id: 'c-21h',
  teamId: HIN,
  tournamentId: null,
  kind: 'earliest',
  timeOfDay: '21:00',
  timezone: 'Europe/Paris',
};

const indispo18au20: AvailabilityConstraint = {
  id: 'c-blackout',
  teamId: HIN,
  tournamentId: TOURNOI,
  kind: 'blackout',
  startsOn: '2026-09-18',
  endsOn: '2026-09-20',
  timezone: 'Europe/Paris',
};

describe('deriveSlotGrid', () => {
  it('déduit la grille du calendrier, sans la faire déclarer', () => {
    const grid = deriveSlotGrid([
      match('a', '2026-09-18', '22:00', ECL, POS),
      match('b', '2026-09-18', '19:00', SHU, POS),
      match('c', '2026-09-23', '20:30', ECL, SHU),
    ]);
    expect(grid).toEqual(['19:00', '20:30', '22:00']);
  });

  it('ignore les byes, les annulés et les matchs sans date', () => {
    const grid = deriveSlotGrid([
      match('a', '2026-09-18', '19:00', SHU, POS),
      match('b', '2026-09-18', '22:00', ECL, POS, { isBye: true }),
      match('c', '2026-09-18', '20:30', ECL, SHU, { status: 'cancelled' }),
      match('d', '2026-09-18', '20:30', HIN, POS, { scheduledAt: null }),
    ]);
    expect(grid).toEqual(['19:00']);
  });
});

describe('diagnoseSchedule · contraintes', () => {
  it('signale les DEUX contraintes violées par le même match', () => {
    // 18/09 à 20 h 30 : avant 21 h ET dans la fenêtre bloquée. Corriger l'heure
    // ne suffit pas — c'est précisément ce que la simulation du 06/09 a montré.
    const d = diagnoseSchedule(
      [match('m1', '2026-09-18', '20:30', HIN, SHU)],
      [pasAvant21h, indispo18au20]
    );
    const avail = d.anomalies.filter((a) => a.kind === 'availability');
    expect(avail).toHaveLength(2);
    expect(avail.every((a) => a.severity === 'blocking')).toBe(true);
    expect(avail.every((a) => a.teamId === HIN)).toBe(true);
  });

  it('ne dit rien d’un calendrier conforme', () => {
    const d = diagnoseSchedule(
      [match('m1', '2026-09-23', '22:00', HIN, SHU)],
      [pasAvant21h, indispo18au20]
    );
    expect(d.anomalies).toEqual([]);
    expect(d.counts).toEqual({ blocking: 0, warning: 0, info: 0 });
  });
});

describe('diagnoseSchedule · correction triviale', () => {
  it('propose le créneau libre du même soir', () => {
    // 21/10 : Hinode à 20 h 30, et 22 h est vide. C'est le « décalage trivial »
    // de la simulation — personne d'autre ne bouge.
    const d = diagnoseSchedule(
      [
        match('m1', '2026-10-21', '20:30', HIN, SHU),
        match('m2', '2026-10-21', '19:00', ECL, POS),
        match('m3', '2026-10-14', '22:00', ECL, SHU), // fournit 22:00 à la grille
      ],
      [pasAvant21h]
    );
    const a = d.anomalies.find((x) => x.kind === 'availability');
    expect(a?.suggestion?.matchId).toBe('m1');
    expect(a?.suggestion?.moveTo).toBe(paris('2026-10-21', '22:00'));
  });

  it('ne propose rien quand le créneau conforme est déjà pris', () => {
    const d = diagnoseSchedule(
      [
        match('m1', '2026-10-21', '20:30', HIN, SHU),
        match('m2', '2026-10-21', '22:00', ECL, POS), // 22 h occupé
      ],
      [pasAvant21h]
    );
    expect(d.anomalies.find((x) => x.kind === 'availability')?.suggestion).toBeNull();
  });

  it('ne propose rien quand le créneau conforme ferait jouer une équipe deux fois', () => {
    const d = diagnoseSchedule(
      [
        match('m1', '2026-10-21', '20:30', HIN, SHU),
        // Shujaa joue déjà à 22 h ailleurs : le créneau est libre, mais pas pour elle.
        match('m2', '2026-10-21', '22:00', SHU, POS),
      ],
      [pasAvant21h],
      { maxConcurrentMatches: 2 }
    );
    expect(d.anomalies.find((x) => x.kind === 'availability')?.suggestion).toBeNull();
  });

  it('ne propose rien quand aucun créneau du soir ne convient', () => {
    // Blackout : aucune heure ne sauve la date. Seul un changement de date le
    // ferait, et ce n'est pas une correction triviale.
    const d = diagnoseSchedule(
      [
        match('m1', '2026-09-18', '22:00', HIN, SHU),
        match('m2', '2026-09-18', '19:00', ECL, POS),
      ],
      [indispo18au20]
    );
    expect(d.anomalies.find((x) => x.kind === 'availability')?.suggestion).toBeNull();
  });
});

describe('diagnoseSchedule · double-booking', () => {
  it('bloque deux matchs collés (19 h puis 20 h 30 en bo3)', () => {
    // 45 min de bo3 + 30 min de repos : 19 h et 20 h 30 ne tiennent pas debout
    // pour la même équipe... si le repos exigé dépasse l'intervalle.
    const d = diagnoseSchedule(
      [
        match('m1', '2026-10-16', '19:00', POS, SHU),
        match('m2', '2026-10-16', '20:30', SHU, ECL),
      ],
      [],
      { teamRestMinutes: 60 }
    );
    const dbl = d.anomalies.find((a) => a.kind === 'double_booking');
    expect(dbl?.severity).toBe('blocking');
    expect(dbl?.teamId).toBe(SHU);
    expect(dbl?.matchIds).toEqual(['m1', 'm2']);
  });

  it('classe en info une double soirée qui respire (19 h puis 22 h)', () => {
    const d = diagnoseSchedule(
      [
        match('m1', '2026-10-16', '19:00', POS, SHU),
        match('m2', '2026-10-16', '22:00', SHU, ECL),
      ],
      []
    );
    expect(d.anomalies.map((a) => a.kind)).toEqual(['same_evening']);
    expect(d.anomalies[0].severity).toBe('info');
  });

  it('ne dit rien de deux matchs à des soirées différentes', () => {
    const d = diagnoseSchedule(
      [
        match('m1', '2026-10-16', '19:00', POS, SHU),
        match('m2', '2026-10-21', '19:00', SHU, ECL),
      ],
      []
    );
    expect(d.anomalies).toEqual([]);
  });
});

describe('diagnoseSchedule · cadre du tournoi', () => {
  it('signale un match hors des dates annoncées', () => {
    const d = diagnoseSchedule([match('m1', '2026-11-05', '20:30', ECL, POS)], [], {
      tournamentStart: '2026-09-18',
      tournamentEnd: '2026-10-23',
    });
    const a = d.anomalies.find((x) => x.kind === 'outside_tournament');
    expect(a?.severity).toBe('warning');
    expect(a?.message).toContain('2026-11-05');
  });

  it('accepte les bornes elles-mêmes', () => {
    const d = diagnoseSchedule(
      [
        match('m1', '2026-09-18', '20:30', ECL, POS),
        match('m2', '2026-10-23', '20:30', SHU, HIN),
      ],
      [],
      { tournamentStart: '2026-09-18', tournamentEnd: '2026-10-23' }
    );
    expect(d.anomalies.filter((a) => a.kind === 'outside_tournament')).toEqual([]);
  });

  it('signale un créneau qui porte plus de matchs que la production', () => {
    const d = diagnoseSchedule(
      [
        match('m1', '2026-10-16', '19:00', POS, SHU),
        match('m2', '2026-10-16', '19:00', ECL, HIN),
      ],
      []
    );
    const a = d.anomalies.find((x) => x.kind === 'slot_collision');
    expect(a?.matchIds.sort()).toEqual(['m1', 'm2']);
  });

  it('se tait quand la production peut porter deux matchs', () => {
    const d = diagnoseSchedule(
      [
        match('m1', '2026-10-16', '19:00', POS, SHU),
        match('m2', '2026-10-16', '19:00', ECL, HIN),
      ],
      [],
      { maxConcurrentMatches: 2 }
    );
    expect(d.anomalies.filter((a) => a.kind === 'slot_collision')).toEqual([]);
  });

  it('signale les matchs sans date', () => {
    const d = diagnoseSchedule(
      [match('m1', '2026-10-16', '19:00', POS, SHU, { scheduledAt: null })],
      []
    );
    expect(d.anomalies.map((a) => a.kind)).toEqual(['unscheduled']);
  });
});

describe('diagnoseSchedule · lecture', () => {
  it('rend le bloquant avant le reste, puis l’ordre du calendrier', () => {
    const d = diagnoseSchedule(
      [
        match('tard', '2026-10-16', '19:00', POS, SHU),
        match('tard2', '2026-10-16', '22:00', SHU, ECL),
        match('bloquant', '2026-09-18', '20:30', HIN, ECL),
      ],
      [pasAvant21h]
    );
    expect(d.anomalies[0].severity).toBe('blocking');
    expect(d.anomalies[0].matchIds).toEqual(['bloquant']);
    expect(d.counts.blocking).toBe(1);
    expect(d.counts.info).toBe(1);
  });

  it('ignore byes et matchs annulés partout', () => {
    const d = diagnoseSchedule(
      [
        match('m1', '2026-09-18', '20:30', HIN, SHU, { isBye: true }),
        match('m2', '2026-09-18', '20:30', HIN, ECL, { status: 'cancelled' }),
      ],
      [pasAvant21h, indispo18au20]
    );
    expect(d.anomalies).toEqual([]);
  });
});

describe('previewMoves', () => {
  const cal = () => [
    match('m1', '2026-10-21', '20:30', HIN, SHU), // viole « pas avant 21 h »
    match('m2', '2026-10-21', '19:00', ECL, POS),
    match('m3', '2026-10-14', '22:00', ECL, SHU), // fournit 22:00 à la grille
  ];

  it('dit ce que le déplacement répare', () => {
    const impact = previewMoves(cal(), [pasAvant21h], [
      { matchId: 'm1', scheduledAt: paris('2026-10-21', '22:00') },
    ]);
    expect(impact.fixed).toHaveLength(1);
    expect(impact.fixed[0].kind).toBe('availability');
    expect(impact.broken).toEqual([]);
    expect(impact.createsBlocking).toBe(false);
    expect(impact.before.blocking).toBe(1);
    expect(impact.after.blocking).toBe(0);
  });

  it('dit ce qu’il casse ailleurs', () => {
    // Déplacer m2 sur le créneau de m1 met deux matchs à 20 h 30 : la
    // production n'en porte qu'un. Le déplacement répare zéro et casse un.
    const impact = previewMoves(cal(), [], [
      { matchId: 'm2', scheduledAt: paris('2026-10-21', '20:30') },
    ]);
    expect(impact.fixed).toEqual([]);
    expect(impact.broken.map((a) => a.kind)).toContain('slot_collision');
  });

  it('juge un ÉCHANGE d’un seul tenant', () => {
    // Chacun pris seul écraserait l'autre ; ensemble, la permutation est nette.
    const impact = previewMoves(cal(), [pasAvant21h], [
      { matchId: 'm1', scheduledAt: paris('2026-10-21', '19:00') },
      { matchId: 'm2', scheduledAt: paris('2026-10-21', '20:30') },
    ]);
    expect(impact.broken.filter((a) => a.kind === 'slot_collision')).toEqual([]);
    // Hinode passe de 20 h 30 à 19 h : toujours avant 21 h, donc l'anomalie
    // change de message — elle est « réparée » puis « recréée », pas conservée.
    expect(impact.fixed).toHaveLength(1);
    expect(impact.broken).toHaveLength(1);
    expect(impact.createsBlocking).toBe(true);
  });

  it('signale une anomalie inchangée comme restante, pas comme réparée', () => {
    const impact = previewMoves(cal(), [pasAvant21h], [
      { matchId: 'm3', scheduledAt: paris('2026-10-15', '22:00') },
    ]);
    expect(impact.fixed).toEqual([]);
    expect(impact.remaining.map((a) => a.matchIds[0])).toContain('m1');
  });

  it('accepte de déplanifier, et le signale', () => {
    const impact = previewMoves(cal(), [pasAvant21h], [
      { matchId: 'm1', scheduledAt: null },
    ]);
    expect(impact.fixed.map((a) => a.kind)).toEqual(['availability']);
    expect(impact.broken.map((a) => a.kind)).toEqual(['unscheduled']);
    expect(impact.createsBlocking).toBe(false);
  });

  it('ne touche pas au calendrier d’entrée', () => {
    const input = cal();
    const before = input.map((m) => m.scheduledAt);
    previewMoves(input, [pasAvant21h], [
      { matchId: 'm1', scheduledAt: paris('2026-10-21', '22:00') },
    ]);
    expect(input.map((m) => m.scheduledAt)).toEqual(before);
  });
});
