// Permissions staff fines — lot A2 (docs/PLAN-espace-admin.md).
//
// Ce lot touche l'AUTORISATION : ses tests protègent d'abord ce qui, en cas
// d'erreur, ouvre le back-office à quelqu'un qui ne devrait pas l'avoir.
//
//   1. les trois rôles historiques gardent EXACTEMENT leur périmètre (sinon la
//      migration devient une refonte des droits, faite en douce) ;
//   2. les deux rôles nouveaux sont ÉTROITS, et ne passent aucune garde
//      héritée par rang ;
//   3. le catalogue et la table des rôles restent en phase.

import { describe, it, expect } from 'vitest';
import {
  STAFF_PERMISSION_CATALOG,
  STAFF_PERMISSION_VALUES,
  STAFF_ROLE_PERMISSIONS,
  isStaffPermission,
  roleHasStaffPermission,
  staffPermissionsFor,
} from '../../utils/staffPermissions';
import { STAFF_ROLES, hasAtLeastRole } from '../../utils/staff';

describe('catalogue', () => {
  it('chaque rôle connu a une entrée', () => {
    for (const role of STAFF_ROLES) {
      expect(STAFF_ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it('aucune permission inventée dans la table des rôles', () => {
    for (const [role, perms] of Object.entries(STAFF_ROLE_PERMISSIONS)) {
      for (const p of perms) {
        expect(isStaffPermission(p), `${role} → ${p}`).toBe(true);
      }
    }
  });

  it('le catalogue n’a pas de doublon', () => {
    const values = STAFF_PERMISSION_CATALOG.map((p) => p.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('périmètre des rôles historiques', () => {
  it('owner a tout', () => {
    expect(staffPermissionsFor('owner')).toEqual(STAFF_PERMISSION_VALUES);
  });

  it('admin a tout sauf l’administration de l’organisation', () => {
    // Miroir EXACT du périmètre actuel : `/admin/users/manage` et
    // `/admin/billing` sont gatées `admin` aujourd'hui ; seules les 7 routes
    // `owner` (secrets tenant, plan, pôle) lui échappent.
    const admin = staffPermissionsFor('admin');
    expect(admin).not.toContain('manage_tenant');
    expect(admin).toContain('manage_staff');
    expect(admin).toContain('manage_billing');
    expect(admin).toContain('manage_tournaments');
    expect(admin).toContain('run_checkin');
  });

  it('caster garde son périmètre — le cockpit, pas la conduite de la régie', () => {
    // `manage_broadcast` (tops, vagues, présences, run of show) était et reste
    // réservé à l'admin : le caster n'a jamais eu ces routes.
    expect(staffPermissionsFor('caster')).toEqual(['use_cast_cockpit']);
    expect(roleHasStaffPermission('caster', 'manage_broadcast')).toBe(false);
  });
});

describe('rôles du lot A2', () => {
  it('un bénévole ne peut QUE tenir le check-in', () => {
    expect(staffPermissionsFor('helper')).toEqual(['run_checkin']);
    expect(roleHasStaffPermission('helper', 'manage_teams')).toBe(false);
    expect(roleHasStaffPermission('helper', 'manage_settings')).toBe(false);
    expect(roleHasStaffPermission('helper', 'arbitrate_matches')).toBe(false);
  });

  it('un arbitre arbitre et tient le check-in, rien d’autre', () => {
    expect(staffPermissionsFor('referee').sort()).toEqual(
      ['arbitrate_matches', 'run_checkin'].sort()
    );
    expect(roleHasStaffPermission('referee', 'manage_tournaments')).toBe(false);
  });

  it('ils ne franchissent AUCUNE garde héritée par rang', () => {
    for (const role of ['referee', 'helper'] as const) {
      expect(hasAtLeastRole(role, 'admin')).toBe(false);
      expect(hasAtLeastRole(role, 'owner')).toBe(false);
      // Y compris les pages « caster » : leur accès ne passe QUE par les
      // permissions, jamais par l'échelle.
      expect(hasAtLeastRole(role, 'caster')).toBe(false);
    }
  });

  it('un rôle inconnu n’a rien', () => {
    expect(staffPermissionsFor(null)).toEqual([]);
    expect(staffPermissionsFor('inventé' as never)).toEqual([]);
  });
});
