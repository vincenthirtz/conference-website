// Feuille de match — les règles pures.
//
// Ce que la brique répare : `snapshotMatchParticipants` figeait le ROSTER
// COURANT au moment de la saisie du score (« approximation assumée », dit son
// propre commentaire). Une remplaçante restée sur le banc recevait le même
// ajustement de rating qu'une titulaire, et une joueuse arrivée APRÈS le match
// se voyait attribuer un match qu'elle n'a pas joué.
//
// Cible : utils/matches/lineup.ts

import { describe, it, expect } from 'vitest';

import {
  teamSlot,
  hasCheckedIn,
  lineupOpenState,
  eligibleForLineup,
  validateLineup,
  canEditLineup,
} from '../../utils/matches/lineup';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

const baseMatch = {
  id: 'm1',
  status: 'scheduled',
  team1_id: TEAM_A,
  team2_id: TEAM_B,
  team1_checked_in_at: null as string | null,
  team2_checked_in_at: null as string | null,
};

describe('teamSlot / hasCheckedIn', () => {
  it('rend le côté occupé, ou null hors du match', () => {
    expect(teamSlot(baseMatch, TEAM_A)).toBe(1);
    expect(teamSlot(baseMatch, TEAM_B)).toBe(2);
    expect(teamSlot(baseMatch, 'team-c')).toBeNull();
  });

  it('lit le check-in du BON côté', () => {
    const m = { ...baseMatch, team2_checked_in_at: '2026-08-21T10:00:00Z' };
    expect(hasCheckedIn(m, TEAM_A)).toBe(false);
    expect(hasCheckedIn(m, TEAM_B)).toBe(true);
  });

  it('une équipe hors du match n’a jamais « fait son check-in »', () => {
    expect(hasCheckedIn(baseMatch, 'team-c')).toBe(false);
  });
});

describe('lineupOpenState', () => {
  it('le check-in est la PORTE : sans lui, la feuille reste fermée', () => {
    expect(lineupOpenState(baseMatch, TEAM_A)).toMatchObject({
      open: false,
      reason: 'awaiting_checkin',
      slot: 1,
    });
  });

  it('s’ouvre dès que l’équipe a fait son check-in', () => {
    const m = { ...baseMatch, team1_checked_in_at: '2026-08-21T10:00:00Z' };
    expect(lineupOpenState(m, TEAM_A)).toEqual({ open: true, slot: 1 });
    // …et reste fermée pour l'autre équipe, qui n'a pas fait le sien.
    expect(lineupOpenState(m, TEAM_B)).toMatchObject({
      reason: 'awaiting_checkin',
    });
  });

  it('« tu ne joues pas ce match » prime sur « fais ton check-in »', () => {
    // L'ordre des refus est celui de l'utilité : envoyer une équipe étrangère
    // chercher un bouton de check-in qui n'existe pas serait absurde.
    expect(lineupOpenState(baseMatch, 'team-c')).toMatchObject({
      open: false,
      reason: 'not_in_match',
      slot: null,
    });
  });

  it('un match terminé ferme la feuille, check-in ou pas', () => {
    const m = {
      ...baseMatch,
      status: 'completed',
      team1_checked_in_at: '2026-08-21T10:00:00Z',
    };
    expect(lineupOpenState(m, TEAM_A)).toMatchObject({
      open: false,
      reason: 'match_over',
    });
  });

  it('couvre aussi annulé et forfait', () => {
    for (const status of ['cancelled', 'forfeit']) {
      const m = {
        ...baseMatch,
        status,
        team1_checked_in_at: '2026-08-21T10:00:00Z',
      };
      expect(lineupOpenState(m, TEAM_A)).toMatchObject({
        reason: 'match_over',
      });
    }
  });
});

describe('eligibleForLineup', () => {
  it('garde le roster jouant, écarte l’encadrement', () => {
    const members = [
      { user_id: 'u1', role: 'player' },
      { user_id: 'u2', role: 'substitute' },
      { user_id: 'u3', role: 'coach' },
      { user_id: 'u4', role: 'manager' },
    ];
    expect(eligibleForLineup(members).map((m) => m.user_id)).toEqual([
      'u1',
      'u2',
    ]);
  });

  it('une remplaçante EST éligible — le banc n’est pas une exclusion', () => {
    // `is_substitute` dit « titulaire en général », pas « n'a pas joué ce
    // match ». C'est justement la distinction que la feuille introduit.
    expect(
      eligibleForLineup([{ user_id: 'u2', role: 'substitute' }])
    ).toHaveLength(1);
  });

  it('écarte une ligne sans compte (invitation jamais acceptée)', () => {
    expect(eligibleForLineup([{ user_id: null, role: 'player' }])).toEqual([]);
  });
});

describe('validateLineup', () => {
  const eligible = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];

  it('accepte une composition du roster', () => {
    expect(validateLineup(['u1', 'u2', 'u3'], eligible)).toEqual({
      ok: true,
      starters: ['u1', 'u2', 'u3'],
    });
  });

  it('refuse une feuille vide', () => {
    expect(validateLineup([], eligible)).toMatchObject({ error: 'empty' });
  });

  it('refuse plus d’alignées que la taille d’une line-up', () => {
    expect(
      validateLineup(['u1', 'u2', 'u3', 'u4', 'u5', 'u6'], eligible)
    ).toMatchObject({ error: 'too_many' });
  });

  it('refuse quelqu’un qui n’est pas du roster jouant', () => {
    const r = validateLineup(['u1', 'intruse'], eligible);
    expect(r).toMatchObject({ error: 'not_eligible', offending: ['intruse'] });
  });

  it('refuse les doublons AVANT de compter', () => {
    // Sans cette garde, cinq fois la même personne passerait pour une équipe
    // complète — et la feuille dirait cinq joueuses là où il y en a une.
    const r = validateLineup(['u1', 'u1', 'u1', 'u1', 'u1'], eligible);
    expect(r).toMatchObject({ error: 'duplicate', offending: ['u1'] });
  });

  it('la taille de line-up est un paramètre, pas une constante en dur', () => {
    // Elle dépend du jeu (5 en Overwatch) et le registre des jeux la porte.
    expect(validateLineup(['u1', 'u2', 'u3'], eligible, 2)).toMatchObject({
      error: 'too_many',
    });
  });
});

describe('canEditLineup', () => {
  it('un brouillon se modifie', () => {
    expect(canEditLineup('draft')).toBe(true);
  });

  it('une feuille validée est FIGÉE — sinon elle ne prouve rien', () => {
    expect(canEditLineup('validated')).toBe(false);
  });

  it('sauf pour un admin : une erreur de saisie ne doit pas être définitive', () => {
    expect(canEditLineup('validated', { isAdmin: true })).toBe(true);
  });
});
