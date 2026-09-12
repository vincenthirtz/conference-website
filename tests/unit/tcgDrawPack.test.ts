// Composition d'un paquet TCG.
// Target: utils/tcg/drawPack.ts
//
// Module pur : l'aléa entre par un tableau de tirages, donc chaque cas est
// reproductible. Ce qui compte ici, ce sont les situations DÉGRADÉES — vivier
// trop court, tirage aberrant, viviers vides —, parce qu'un paquet amputé ou
// une carte en double se voient immédiatement à l'ouverture et ne se
// rattrapent pas.

import { describe, expect, it } from 'vitest';

import {
  PACK_SIZE,
  TEAM_SLOTS,
  pickPackSubjects,
} from '../../utils/tcg/drawPack';

const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const TEAMS = ['t1', 't2', 't3'];

/** Tirages neutres : toujours le premier élément restant. */
const ZEROS = Array(12).fill(0);

describe('pickPackSubjects', () => {
  it('compose un paquet complet : quatre joueuses et une équipe', () => {
    const out = pickPackSubjects({
      playerIds: PLAYERS,
      teamIds: TEAMS,
      rolls: ZEROS,
    });

    expect(out).toHaveLength(PACK_SIZE);
    expect(out.filter((s) => s.kind === 'team')).toHaveLength(TEAM_SLOTS);
    expect(out.filter((s) => s.kind === 'player')).toHaveLength(
      PACK_SIZE - TEAM_SLOTS
    );
  });

  it('ne répète jamais un sujet dans le même paquet', () => {
    const out = pickPackSubjects({
      playerIds: PLAYERS,
      teamIds: TEAMS,
      rolls: [0.9, 0.1, 0.5, 0.99, 0.3, 0.7, 0.2],
    });

    const ids = out.map((s) => (s.kind === 'player' ? s.userId : s.teamId));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('comble avec des joueuses quand aucune équipe n’existe', () => {
    const out = pickPackSubjects({
      playerIds: PLAYERS,
      teamIds: [],
      rolls: ZEROS,
    });

    expect(out).toHaveLength(PACK_SIZE);
    expect(out.every((s) => s.kind === 'player')).toBe(true);
  });

  it('comble avec des équipes quand les joueuses manquent', () => {
    // Vivier de joueuses plus court que le paquet : on ne sort pas un paquet
    // amputé tant qu'il reste des sujets ailleurs.
    const out = pickPackSubjects({
      playerIds: ['p1', 'p2'],
      teamIds: TEAMS,
      rolls: ZEROS,
    });

    expect(out).toHaveLength(PACK_SIZE);
    expect(out.filter((s) => s.kind === 'player')).toHaveLength(2);
    expect(out.filter((s) => s.kind === 'team')).toHaveLength(3);

    const teamIds = out
      .filter((s): s is { kind: 'team'; teamId: string } => s.kind === 'team')
      .map((s) => s.teamId);
    expect(new Set(teamIds).size).toBe(teamIds.length);
  });

  it('rend moins de cartes seulement quand les deux viviers sont épuisés', () => {
    const out = pickPackSubjects({
      playerIds: ['p1'],
      teamIds: ['t1'],
      rolls: ZEROS,
    });
    expect(out).toHaveLength(2);
  });

  it('rend un paquet vide quand il n’y a aucun sujet', () => {
    // À l'appelant de refuser l'ouverture : un paquet sans carte n'en est pas
    // un, et il ne faut surtout pas consommer le paquet pour autant.
    expect(
      pickPackSubjects({ playerIds: [], teamIds: [], rolls: ZEROS })
    ).toEqual([]);
  });

  it('tolère des tirages manquants ou aberrants', () => {
    // Mieux vaut une carte prévisible qu'un paquet incomplet ou un index hors
    // bornes.
    const out = pickPackSubjects({
      playerIds: PLAYERS,
      teamIds: TEAMS,
      rolls: [Number.NaN, -1, 2, Number.POSITIVE_INFINITY],
    });

    expect(out).toHaveLength(PACK_SIZE);
    const ids = out.map((s) => (s.kind === 'player' ? s.userId : s.teamId));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('respecte le tirage fourni : une valeur haute prend la fin du vivier', () => {
    const out = pickPackSubjects({
      playerIds: PLAYERS,
      teamIds: TEAMS,
      rolls: [0.99, 0.99, 0, 0, 0, 0],
    });

    // Premier tirage = équipe, valeur haute → dernière équipe du vivier.
    const team = out.find((s) => s.kind === 'team');
    expect(team).toEqual({ kind: 'team', teamId: 't3' });
  });
});
