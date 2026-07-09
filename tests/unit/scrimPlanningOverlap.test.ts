// Unit tests for the pure scrim-planning overlap helpers.
// Targets: utils/teams/scrimPlanningOverlap.ts

import { describe, it, expect } from 'vitest';

import {
  PLANNING_PARTIES,
  horizonDates,
  slotMinutesOfDay,
  slotKey,
  slotKeysForHorizon,
  maxSlotsForConfig,
  normalizePlanningSlots,
  buildHeatmap,
  isSlotValidatable,
  isFullOverlap,
  rankValidatableSlots,
  copyFirstPaintedDayAcrossHorizon,
  type PlanningConfig,
} from '../../utils/teams/scrimPlanningOverlap';

// Session type : 2 jours, créneaux 1h, bande 18h→22h, Europe/Paris.
// En été (juillet), Paris = UTC+2, donc 18h Paris = 16:00Z.
const cfg: PlanningConfig = {
  horizonStart: '2026-07-10',
  horizonDays: 2,
  slotMinutes: 60,
  dayStartMin: 18 * 60, // 18:00
  dayEndMin: 22 * 60, // 22:00
  timezone: 'Europe/Paris',
};

describe('géométrie de la grille', () => {
  it('horizonDates énumère les jours consécutifs', () => {
    expect(horizonDates(cfg)).toEqual(['2026-07-10', '2026-07-11']);
  });

  it('slotMinutesOfDay borne au dernier début de créneau (exclut dayEnd)', () => {
    // 18,19,20,21 → 4 créneaux d'1h (le dernier commence à 21h, finit à 22h).
    expect(slotMinutesOfDay(cfg)).toEqual([1080, 1140, 1200, 1260]);
  });

  it('slotKey convertit le mur-horloge Paris en ISO UTC (DST été = UTC+2)', () => {
    expect(slotKey(cfg, '2026-07-10', 18 * 60)).toBe('2026-07-10T16:00:00.000Z');
  });

  it('slotKeysForHorizon = jours × créneaux, ordre de rendu, dédup implicite', () => {
    const keys = slotKeysForHorizon(cfg);
    expect(keys).toHaveLength(maxSlotsForConfig(cfg));
    expect(keys).toHaveLength(8);
    expect(keys[0]).toBe('2026-07-10T16:00:00.000Z');
    expect(keys[keys.length - 1]).toBe('2026-07-11T19:00:00.000Z');
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('normalizePlanningSlots', () => {
  it('accepte des slots valides et les ré-ordonne selon la grille', () => {
    const a = '2026-07-11T16:00:00.000Z';
    const b = '2026-07-10T16:00:00.000Z';
    const res = normalizePlanningSlots([a, b], cfg);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.slots).toEqual([b, a]); // ordre grille, pas d'entrée
  });

  it('déduplique les slots identiques', () => {
    const s = '2026-07-10T16:00:00.000Z';
    const res = normalizePlanningSlots([s, s, s], cfg);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.slots).toEqual([s]);
  });

  it('accepte une liste vide (efface la peinture)', () => {
    const res = normalizePlanningSlots([], cfg);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.slots).toEqual([]);
  });

  it('rejette un slot hors de la grille', () => {
    const res = normalizePlanningSlots(['2026-07-10T10:00:00.000Z'], cfg);
    expect(res.ok).toBe(false);
  });

  it('rejette une date non parsable', () => {
    const res = normalizePlanningSlots(['pas une date'], cfg);
    expect(res.ok).toBe(false);
  });

  it('rejette un non-tableau', () => {
    const res = normalizePlanningSlots('nope' as unknown, cfg);
    expect(res.ok).toBe(false);
  });

  it('normalise une forme ISO non canonique vers la clé de grille', () => {
    // +02:00 == 16:00Z ; doit matcher la cellule 18h Paris.
    const res = normalizePlanningSlots(['2026-07-10T18:00:00+02:00'], cfg);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.slots).toEqual(['2026-07-10T16:00:00.000Z']);
  });
});

describe('buildHeatmap', () => {
  const slotA = '2026-07-10T16:00:00.000Z';
  const slotB = '2026-07-10T17:00:00.000Z';

  it('compte les parties DISTINCTES par slot (staff fusionné)', () => {
    const hm = buildHeatmap([
      { party: 'team1', userId: 'u1', slots: [slotA, slotB] },
      { party: 'team2', userId: 'u2', slots: [slotA] },
      { party: 'staff', userId: 'c1', slots: [slotA] },
      { party: 'staff', userId: 'c2', slots: [slotA] }, // 2e caster, même partie
    ]);
    expect(hm[slotA].count).toBe(3); // team1 + team2 + staff
    expect(hm[slotA].parties.sort()).toEqual(['staff', 'team1', 'team2']);
    expect(hm[slotB].count).toBe(1);
  });

  it('conserve l\'attribution des participants pour le hover', () => {
    const hm = buildHeatmap([
      { party: 'staff', userId: 'c1', displayName: 'Alice', slots: [slotA] },
      { party: 'staff', userId: 'c2', displayName: 'Bob', slots: [slotA] },
    ]);
    expect(hm[slotA].participants).toHaveLength(2);
    expect(hm[slotA].participants.map((p) => p.displayName).sort()).toEqual([
      'Alice',
      'Bob',
    ]);
    expect(hm[slotA].count).toBe(1); // toujours 1 partie « staff »
  });

  it('ignore les slots non parsables sans planter', () => {
    const hm = buildHeatmap([
      { party: 'team1', userId: 'u1', slots: [slotA, 'garbage'] },
    ]);
    expect(Object.keys(hm)).toEqual([slotA]);
  });
});

describe('isSlotValidatable / isFullOverlap', () => {
  const bothTeams = { count: 2, parties: ['team1', 'team2'] as const, participants: [] };
  const oneTeam = { count: 1, parties: ['team1'] as const, participants: [] };
  const full = {
    count: 3,
    parties: ['team1', 'team2', 'staff'] as const,
    participants: [],
  };

  it('validatable dès que les 2 équipes sont présentes', () => {
    expect(isSlotValidatable({ ...bothTeams, parties: [...bothTeams.parties] })).toBe(true);
    expect(isSlotValidatable({ ...oneTeam, parties: [...oneTeam.parties] })).toBe(false);
    expect(isSlotValidatable(undefined)).toBe(false);
  });

  it('full overlap = les 3 parties', () => {
    expect(isFullOverlap({ ...full, parties: [...full.parties] })).toBe(true);
    expect(isFullOverlap({ ...bothTeams, parties: [...bothTeams.parties] })).toBe(false);
  });

  it('PLANNING_PARTIES contient bien 3 parties', () => {
    expect(PLANNING_PARTIES).toHaveLength(3);
  });
});

describe('rankValidatableSlots', () => {
  const s1 = '2026-07-10T16:00:00.000Z';
  const s2 = '2026-07-10T17:00:00.000Z';
  const s3 = '2026-07-11T16:00:00.000Z';

  it('classe overlap parfait en tête, puis par date croissante', () => {
    const hm = buildHeatmap([
      // s1 : les 2 équipes (validatable, count 2)
      { party: 'team1', userId: 'a', slots: [s1, s3] },
      { party: 'team2', userId: 'b', slots: [s1, s2, s3] },
      // s3 : full (team1+team2+staff)
      { party: 'staff', userId: 'c', slots: [s3] },
      // s2 : seulement team2 → non validatable
    ]);
    const ranked = rankValidatableSlots(hm);
    // s3 (full, count 3) devant s1 (count 2). s2 exclu.
    expect(ranked.map((r) => r.slot)).toEqual([s3, s1]);
    expect(ranked[0].full).toBe(true);
    expect(ranked[1].full).toBe(false);
  });

  it('renvoie [] quand aucun créneau n\'a les 2 équipes', () => {
    const hm = buildHeatmap([{ party: 'team1', userId: 'a', slots: [s1] }]);
    expect(rankValidatableSlots(hm)).toEqual([]);
  });
});

describe('copyFirstPaintedDayAcrossHorizon', () => {
  // 2 jours, créneaux 1h, 18h→21h Paris (été = UTC+2).
  const cfg2: PlanningConfig = {
    horizonStart: '2026-07-10',
    horizonDays: 2,
    slotMinutes: 60,
    dayStartMin: 18 * 60,
    dayEndMin: 21 * 60,
    timezone: 'Europe/Paris',
  };
  const d0_18 = '2026-07-10T16:00:00.000Z';
  const d0_19 = '2026-07-10T17:00:00.000Z';
  const d1_18 = '2026-07-11T16:00:00.000Z';
  const d1_19 = '2026-07-11T17:00:00.000Z';

  it('réplique le motif du premier jour peint sur tous les jours', () => {
    const out = copyFirstPaintedDayAcrossHorizon(cfg2, [d0_18, d0_19]);
    expect(out.sort()).toEqual([d0_18, d0_19, d1_18, d1_19].sort());
  });

  it('renvoie l\'entrée inchangée si rien n\'est peint', () => {
    expect(copyFirstPaintedDayAcrossHorizon(cfg2, [])).toEqual([]);
  });

  it('prend le PREMIER jour peint comme modèle (ignore un jour 2 différent)', () => {
    // jour 0 = 18h seulement ; jour 1 = 19h. Modèle = jour 0 (18h) → tous à 18h.
    const out = copyFirstPaintedDayAcrossHorizon(cfg2, [d0_18, d1_19]);
    expect(out.sort()).toEqual([d0_18, d1_18].sort());
  });
});
