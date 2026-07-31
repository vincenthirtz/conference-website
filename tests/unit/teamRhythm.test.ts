// Unit tests — rythme d'équipe (N1).
//
// Deux zones de risque, et elles ne sont pas au même endroit :
//
//   - la VALIDATION des clés : une clé hors grille serait invisible dans la
//     grille, donc impossible à décocher — un créneau fantôme qui gonflerait le
//     noyau pour toujours ;
//   - la PROJECTION vers des instants réels : c'est elle qui traverse les
//     changements d'heure et les fuseaux. Une erreur ici ne plante pas, elle
//     décale silencieusement un scrim d'une heure.

import { describe, it, expect } from 'vitest';

import {
  buildRhythmHeatmap,
  coreRhythmSlots,
  MAX_RHYTHM_SLOTS,
  normalizeRhythmSlots,
  overlappingRhythmSlots,
  parseRhythmSlot,
  projectRhythmSlot,
  projectRhythmSlots,
  RHYTHM_DAY_END_MIN,
  RHYTHM_DAY_START_MIN,
  rhythmCoreThreshold,
  rhythmMinutesOfDay,
  rhythmSlotKey,
} from '../../utils/teams/teamRhythm';

/** Mardi 21 h — le créneau canonique d'une équipe amateur. */
const TUE_21 = rhythmSlotKey(2, 21 * 60);
const THU_21 = rhythmSlotKey(4, 21 * 60);

describe('grille', () => {
  it('couvre la bande horaire au pas horaire', () => {
    const minutes = rhythmMinutesOfDay();
    expect(minutes[0]).toBe(RHYTHM_DAY_START_MIN);
    expect(minutes[minutes.length - 1]).toBe(RHYTHM_DAY_END_MIN - 60);
    expect(MAX_RHYTHM_SLOTS).toBe(minutes.length * 7);
  });
});

describe('parseRhythmSlot', () => {
  it('accepte une clé de la grille', () => {
    expect(parseRhythmSlot(TUE_21)).toEqual({ weekday: 2, minutes: 1260 });
  });

  it('refuse un jour hors 1-7', () => {
    expect(parseRhythmSlot('0-1260')).toBeNull();
    expect(parseRhythmSlot('8-1260')).toBeNull();
  });

  it('refuse une heure hors de la bande affichée', () => {
    // 3 h du matin n'a pas de case : la garder rendrait le créneau indécochable.
    expect(parseRhythmSlot(rhythmSlotKey(2, 180))).toBeNull();
  });

  it('refuse une minute non alignée sur le pas', () => {
    expect(parseRhythmSlot('2-1290')).toBeNull(); // 21 h 30
  });

  it('refuse tout ce qui n’est pas une chaîne', () => {
    expect(parseRhythmSlot(null)).toBeNull();
    expect(parseRhythmSlot(42)).toBeNull();
    expect(parseRhythmSlot({ weekday: 2 })).toBeNull();
  });
});

describe('normalizeRhythmSlots', () => {
  it('déduplique et ordonne par jour puis par heure', () => {
    const result = normalizeRhythmSlots([THU_21, TUE_21, TUE_21]);
    expect(result).toEqual({ ok: true, slots: [TUE_21, THU_21] });
  });

  it('accepte le tableau vide — c’est ainsi qu’on se retire', () => {
    expect(normalizeRhythmSlots([])).toEqual({ ok: true, slots: [] });
  });

  it('rejette une entrée invalide plutôt que de la filtrer', () => {
    // Filtrer silencieusement ferait disparaître des cases sans rien dire.
    const result = normalizeRhythmSlots([TUE_21, 'nope']);
    expect(result.ok).toBe(false);
  });

  it('rejette au-delà du nombre de cases de la grille', () => {
    const tooMany = Array.from({ length: MAX_RHYTHM_SLOTS + 1 }, () => TUE_21);
    expect(normalizeRhythmSlots(tooMany).ok).toBe(false);
  });
});

describe('heatmap et noyau', () => {
  const member = (userId: string, slots: string[]) => ({
    userId,
    timezone: 'Europe/Paris',
    slots,
  });

  it('additionne les membres sur un même créneau', () => {
    const heatmap = buildRhythmHeatmap(
      [
        member('a', [TUE_21, THU_21]),
        member('b', [TUE_21]),
        member('c', [TUE_21]),
      ],
      'Europe/Paris'
    );
    expect(heatmap[TUE_21].count).toBe(3);
    expect(heatmap[TUE_21].userIds.sort()).toEqual(['a', 'b', 'c']);
    expect(heatmap[THU_21].count).toBe(1);
  });

  it('ne compte pas deux fois un membre qui répète un créneau', () => {
    const heatmap = buildRhythmHeatmap(
      [member('a', [TUE_21, TUE_21])],
      'Europe/Paris'
    );
    expect(heatmap[TUE_21].count).toBe(1);
  });

  it('exige tout le monde sous l’effectif titulaire, les titulaires au-delà', () => {
    expect(rhythmCoreThreshold(3)).toBe(3);
    expect(rhythmCoreThreshold(5)).toBe(5);
    expect(rhythmCoreThreshold(8)).toBe(5);
    expect(rhythmCoreThreshold(0)).toBe(1);
  });

  it('ne retient que les créneaux atteignant le seuil', () => {
    const heatmap = buildRhythmHeatmap(
      [member('a', [TUE_21, THU_21]), member('b', [TUE_21])],
      'Europe/Paris'
    );
    expect(coreRhythmSlots(heatmap, 2)).toEqual([TUE_21]);
  });

  it('reprojette le créneau d’un membre dans un autre fuseau', () => {
    // 21 h à Montréal, c’est 3 h du matin à Paris le lendemain : hors grille,
    // donc ce membre ne doit PAS gonfler le noyau parisien du mardi 21 h.
    const heatmap = buildRhythmHeatmap(
      [
        { userId: 'paris', timezone: 'Europe/Paris', slots: [TUE_21] },
        { userId: 'mtl', timezone: 'America/Montreal', slots: [TUE_21] },
      ],
      'Europe/Paris',
      new Date('2026-07-01T09:00:00.000Z')
    );
    expect(heatmap[TUE_21].count).toBe(1);
    expect(heatmap[TUE_21].userIds).toEqual(['paris']);
  });
});

describe('overlappingRhythmSlots', () => {
  it('renvoie l’intersection ordonnée', () => {
    expect(overlappingRhythmSlots([THU_21, TUE_21], [TUE_21])).toEqual([
      TUE_21,
    ]);
  });

  it('renvoie vide sans recoupement', () => {
    expect(overlappingRhythmSlots([TUE_21], [THU_21])).toEqual([]);
  });
});

describe('projection vers des instants réels', () => {
  it('tombe sur la bonne heure locale en heure d’été', () => {
    // Mardi 21 h à Paris début juillet = 19 h UTC (UTC+2).
    const iso = projectRhythmSlot(
      { weekday: 2, minutes: 21 * 60 },
      'Europe/Paris',
      new Date('2026-07-01T09:00:00.000Z') // un mercredi
    );
    expect(iso).toBe('2026-07-07T19:00:00.000Z');
  });

  it('tombe sur la bonne heure locale en heure d’hiver', () => {
    // Même créneau en janvier = 20 h UTC (UTC+1). C'est ce décalage qu'un
    // stockage « en UTC » aurait silencieusement raté.
    const iso = projectRhythmSlot(
      { weekday: 2, minutes: 21 * 60 },
      'Europe/Paris',
      new Date('2026-01-07T09:00:00.000Z') // un mercredi
    );
    expect(iso).toBe('2026-01-13T20:00:00.000Z');
  });

  it('saute l’occurrence du jour déjà passée', () => {
    // Mardi 22 h locale : le créneau de 21 h est passé, on vise mardi prochain.
    const iso = projectRhythmSlot(
      { weekday: 2, minutes: 21 * 60 },
      'Europe/Paris',
      new Date('2026-07-07T20:00:00.000Z')
    );
    expect(iso).toBe('2026-07-14T19:00:00.000Z');
  });

  it('garde l’occurrence du jour encore à venir', () => {
    const iso = projectRhythmSlot(
      { weekday: 2, minutes: 21 * 60 },
      'Europe/Paris',
      new Date('2026-07-07T12:00:00.000Z')
    );
    expect(iso).toBe('2026-07-07T19:00:00.000Z');
  });

  it('produit des ISO triés, dédupliqués et plafonnés', () => {
    const slots = projectRhythmSlots([THU_21, TUE_21, TUE_21], 'Europe/Paris', {
      from: new Date('2026-07-01T09:00:00.000Z'),
    });
    expect(slots).toEqual([
      '2026-07-02T19:00:00.000Z', // jeudi 2
      '2026-07-07T19:00:00.000Z', // mardi 7
    ]);
  });

  it('respecte le plafond demandé', () => {
    const slots = projectRhythmSlots([TUE_21, THU_21], 'Europe/Paris', {
      from: new Date('2026-07-01T09:00:00.000Z'),
      max: 1,
    });
    expect(slots).toHaveLength(1);
  });

  it('ignore les clés invalides sans planter', () => {
    expect(
      projectRhythmSlots(['bidon', TUE_21], 'Europe/Paris', {
        from: new Date('2026-07-01T09:00:00.000Z'),
      })
    ).toEqual(['2026-07-07T19:00:00.000Z']);
  });
});
