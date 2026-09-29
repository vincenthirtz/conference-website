// tests/unit/scrimCounterProposalForm.test.ts — schéma de la
// contre-proposition d'un scrim (lot P13). Reprend la normalisation que le
// tableau de bord faisait à la main : cases vides écartées, ≥ 1 créneau,
// sortie en ISO UTC.

import { describe, expect, it } from 'vitest';
import { makeCounterProposalSchema } from '../../features/player/scrims/negotiationForm';

const schema = makeCounterProposalSchema('au moins un');

describe('contre-proposition de scrim', () => {
  it('écarte les cases vides et rend de l’ISO', () => {
    const out = schema.parse({ slots: ['', ' 2026-10-01T20:30 ', ''] });
    expect(out.slots).toEqual([new Date('2026-10-01T20:30').toISOString()]);
  });

  it('refuse une proposition sans créneau, erreur sur le champ', () => {
    const r = schema.safeParse({ slots: ['', '  '] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['slots']);
    expect(r.error?.issues[0]?.message).toBe('au moins un');
  });

  it('refuse un créneau illisible au lieu de lever', () => {
    expect(schema.safeParse({ slots: ['pas une date'] }).success).toBe(false);
  });
});
