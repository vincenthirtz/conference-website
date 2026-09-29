// utils/matches/reportRight.ts — décision PURE du droit de
// déclarer (capitaine ou manager d'équipe ; jamais les deux côtés).

import { describe, expect, it } from 'vitest';

import { decideReportingSide, mayReportFor } from '@/utils/matches/reportRight';

const A = 'team-a';
const B = 'team-b';

describe('decideReportingSide', () => {
  it('côté 1 / côté 2 selon l’équipe tenue', () => {
    expect(decideReportingSide(new Set([A]), A, B)).toEqual({ side: 1 });
    expect(decideReportingSide(new Set([B]), A, B)).toEqual({ side: 2 });
  });

  it('aucune équipe tenue → NOT_A_REPORTER', () => {
    expect(decideReportingSide(new Set(['x']), A, B)).toEqual({
      side: null,
      code: 'NOT_A_REPORTER',
    });
  });

  it('les deux équipes tenues → REPORT_BOTH_SIDES', () => {
    expect(decideReportingSide(new Set([A, B]), A, B)).toEqual({
      side: null,
      code: 'REPORT_BOTH_SIDES',
    });
  });

  it('équipe non assignée : jamais de droit sur un id vide', () => {
    expect(decideReportingSide(new Set([A]), null, B).side).toBeNull();
  });
});

describe('mayReportFor', () => {
  it('vrai pour mon équipe, faux si je tiens aussi l’adversaire', () => {
    expect(mayReportFor(new Set([A]), A, B)).toBe(true);
    expect(mayReportFor(new Set([A, B]), A, B)).toBe(false);
    expect(mayReportFor(new Set([B]), A, B)).toBe(false);
    expect(mayReportFor(new Set([A]), A, null)).toBe(false);
  });
});
