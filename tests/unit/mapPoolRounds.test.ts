// Journées d'un tournoi vues du pool de cartes — fonctions PURES.
//
// Ces trois fonctions décident quel pool une écriture vise. Une erreur ici ne
// se voit pas à l'écran : elle écrit dans le mauvais pool. D'où des tests
// séparés de la base.

import { describe, it, expect } from 'vitest';
import {
  buildRoundOptions,
  parisDayKey,
  parseRoundParam,
} from '../../utils/maps/roundPools';

describe('parseRoundParam', () => {
  it('absent, vide ou « default » → pool par défaut', () => {
    expect(parseRoundParam(undefined)).toEqual({ ok: true, round: null });
    expect(parseRoundParam('')).toEqual({ ok: true, round: null });
    expect(parseRoundParam('   ')).toEqual({ ok: true, round: null });
    expect(parseRoundParam('default')).toEqual({ ok: true, round: null });
    expect(parseRoundParam('DEFAULT')).toEqual({ ok: true, round: null });
  });

  it('entier décimal ≥ 1 → cette journée', () => {
    expect(parseRoundParam('1')).toEqual({ ok: true, round: 1 });
    expect(parseRoundParam('2')).toEqual({ ok: true, round: 2 });
    expect(parseRoundParam(' 7 ')).toEqual({ ok: true, round: 7 });
  });

  // Le point du test : une valeur illisible doit ÉCHOUER, pas retomber
  // silencieusement sur le pool par défaut — sinon `?round=deux` écrirait dans
  // le pool du tournoi sans que personne le voie.
  it('refuse ce qui n’est pas une journée, plutôt que de viser le pool par défaut', () => {
    for (const bad of ['deux', '0', '-1', '2.5', '2e1', '0x2', '1 2', '+2']) {
      expect(
        parseRoundParam(bad).ok,
        `« ${bad} » devrait être refusé`
      ).toBe(false);
    }
  });

  it('refuse un paramètre répété (tableau)', () => {
    expect(parseRoundParam(['1', '2']).ok).toBe(false);
  });
});

describe('parisDayKey', () => {
  it('classe un instant au jour civil PARISIEN, pas UTC', () => {
    // 22/09 23h30 UTC = 23/09 01h30 à Paris (CEST). Un serveur en UTC
    // rangerait ce match au 22 : la journée afficherait la mauvaise date.
    expect(parisDayKey('2026-09-22T23:30:00Z')).toBe('2026-09-23');
    expect(parisDayKey('2026-09-23T18:30:00Z')).toBe('2026-09-23');
  });

  it('gère le passage à l’heure d’hiver', () => {
    // Le 26/10/2026 la France est en CET (+01:00).
    expect(parisDayKey('2026-10-26T23:30:00Z')).toBe('2026-10-27');
  });

  it('null / date illisible → null', () => {
    expect(parisDayKey(null)).toBeNull();
    expect(parisDayKey('')).toBeNull();
    expect(parisDayKey('pas une date')).toBeNull();
  });
});

describe('buildRoundOptions', () => {
  const matches = [
    { round_number: 2, round_name: 'J2', scheduled_at: '2026-09-23T18:30:00Z' },
    { round_number: 2, round_name: 'J2', scheduled_at: '2026-09-25T17:00:00Z' },
    { round_number: 2, round_name: 'J2', scheduled_at: '2026-09-25T18:30:00Z' },
    { round_number: 1, round_name: 'J1', scheduled_at: '2026-09-18T17:00:00Z' },
  ];

  it('regroupe par journée, dédoublonne les jours et trie', () => {
    const options = buildRoundOptions(matches);
    expect(options.map((o) => o.round)).toEqual([1, 2]);
    expect(options[1].label).toBe('J2');
    // 23/09 et 25/09 : trois matchs, deux jours.
    expect(options[1].days).toEqual(['2026-09-23', '2026-09-25']);
  });

  it('reporte le nombre de cartes déjà déclarées', () => {
    const options = buildRoundOptions(matches, new Map([[2, 11]]));
    expect(options.find((o) => o.round === 1)?.mapsCount).toBe(0);
    expect(options.find((o) => o.round === 2)?.mapsCount).toBe(11);
  });

  it('libellé de repli « J<n> » quand round_name manque', () => {
    const options = buildRoundOptions([
      { round_number: 4, round_name: null, scheduled_at: null },
    ]);
    expect(options[0].label).toBe('J4');
    expect(options[0].days).toEqual([]);
  });

  // Sans ça, un pool déclaré pour une journée dont les matchs ne sont pas
  // encore datés deviendrait inaccessible à l'écran.
  it('liste une journée qui a un pool mais aucun match', () => {
    const options = buildRoundOptions([], new Map([[3, 11]]));
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ round: 3, label: 'J3', mapsCount: 11 });
  });

  it('ignore les matchs sans numéro de journée', () => {
    const options = buildRoundOptions([
      { round_number: null, round_name: 'Hors série', scheduled_at: null },
    ]);
    expect(options).toEqual([]);
  });
});
