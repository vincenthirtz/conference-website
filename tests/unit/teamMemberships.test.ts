// utils/teams/memberships — « à quelle équipe cette personne appartient-elle ? »
//
// Ces sélecteurs remplacent une quinzaine de `.maybeSingle()` sur
// (user_id, tenant_id) qui s'appuyaient sur une contrainte d'unicité devenue
// PARTIELLE : l'index `team_members_tenant_user_key` exclut désormais le rôle
// `manager` (allow_manager_multi_team.sql). Deux règles en découlent, et elles
// ne doivent pas se confondre :
//
//   - « qui prend le compte » (garde « tu es déjà dans une équipe ») ;
//   - « sur quoi l'écran travaille » (repli du sélecteur d'équipe).
//
// Le prédicat doit rester le MIROIR EXACT du SQL : `role IS DISTINCT FROM
// 'manager'`. S'il dérive, soit un manager se voit refuser une équipe, soit une
// joueuse en obtient deux.

import { describe, it, expect } from 'vitest';
import {
  isExclusiveMembership,
  pickExclusiveMembership,
  pickMembership,
} from '../../utils/teams/memberships';

const row = (team_id: string, role: string | null) => ({ team_id, role });

describe('isExclusiveMembership', () => {
  it('seul `manager` échappe à l’unicité', () => {
    expect(isExclusiveMembership({ role: 'manager' })).toBe(false);
    for (const role of ['player', 'substitute', 'coach', 'captain']) {
      expect(isExclusiveMembership({ role })).toBe(true);
    }
  });

  it('tolère casse et espaces, comme le reste du code rôle', () => {
    expect(isExclusiveMembership({ role: '  Manager ' })).toBe(false);
    expect(isExclusiveMembership({ role: 'MANAGER' })).toBe(false);
  });

  it('un rôle NULL reste couvert — comme `IS DISTINCT FROM` en SQL', () => {
    expect(isExclusiveMembership({ role: null })).toBe(true);
    expect(isExclusiveMembership({})).toBe(true);
  });

  it('une ligne absente n’est pas une appartenance', () => {
    expect(isExclusiveMembership(null)).toBe(false);
    expect(isExclusiveMembership(undefined)).toBe(false);
  });
});

describe('pickExclusiveMembership', () => {
  it('ignore les sièges de manager', () => {
    const rows = [row('a', 'manager'), row('b', 'manager')];
    expect(pickExclusiveMembership(rows)).toBeNull();
  });

  it('trouve la seule appartenance qui compte, même noyée dans l’encadrement', () => {
    const rows = [row('a', 'manager'), row('b', 'player'), row('c', 'manager')];
    expect(pickExclusiveMembership(rows)?.team_id).toBe('b');
  });

  it('liste vide → null', () => {
    expect(pickExclusiveMembership([])).toBeNull();
  });
});

describe('pickMembership', () => {
  const rows = [row('a', 'manager'), row('b', 'manager'), row('c', 'player')];

  it('honore l’équipe demandée quand elle existe', () => {
    expect(pickMembership(rows, 'b')?.team_id).toBe('b');
  });

  it('ignore une équipe demandée à laquelle on n’appartient pas', () => {
    // Point de sécurité : `?teamId=` ne doit JAMAIS élargir la portée. On
    // retombe sur une appartenance réelle, pas sur celle demandée.
    expect(pickMembership(rows, 'zzz')?.team_id).toBe('c');
  });

  it('sans demande, l’appartenance exclusive prime sur l’ordre', () => {
    expect(pickMembership(rows)?.team_id).toBe('c');
  });

  it('manager pur : repli déterministe sur la première (la plus ancienne)', () => {
    const onlyManager = [row('a', 'manager'), row('b', 'manager')];
    expect(pickMembership(onlyManager)?.team_id).toBe('a');
  });

  it('aucune appartenance → null', () => {
    expect(pickMembership([], 'a')).toBeNull();
  });
});
