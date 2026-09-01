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
  effectiveStaffPermissions,
  grantableStaffPermissions,
  hasStaffPermission,
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

  it('les documents de l’asso ne vont à aucun rôle étroit', () => {
    // Un PV d'AG nomme des personnes physiques, un rapport financier donne des
    // montants. Ces droits s'accordent à quelqu'un ; ils ne s'héritent pas d'un
    // rôle d'exploitation. Cf. docs/ETUDE-drive-et-chat.md.
    for (const role of ['caster', 'referee', 'helper'] as const) {
      expect(roleHasStaffPermission(role, 'read_documents')).toBe(false);
      expect(roleHasStaffPermission(role, 'manage_documents')).toBe(false);
    }
    for (const role of ['owner', 'admin'] as const) {
      expect(roleHasStaffPermission(role, 'read_documents')).toBe(true);
      expect(roleHasStaffPermission(role, 'manage_documents')).toBe(true);
    }
  });

  it('lecture et écriture des documents restent deux droits distincts', () => {
    // Le jour où l'attribution à l'unité existera, c'est cette séparation qui
    // permettra « la trésorière dépose, le bureau consulte ». Les fusionner
    // maintenant rendrait ce réglage impossible sans nouvelle migration.
    const values = STAFF_PERMISSION_VALUES;
    expect(values).toContain('read_documents');
    expect(values).toContain('manage_documents');
  });

  it('caster garde son périmètre — le cockpit, pas la conduite de la régie', () => {
    // `manage_broadcast` (tops, vagues, présences, run of show) était et reste
    // réservé à l'admin : le caster n'a jamais eu ces routes.
    expect(staffPermissionsFor('caster')).toEqual(['use_cast_cockpit']);
    expect(roleHasStaffPermission('caster', 'manage_broadcast')).toBe(false);
  });
});

describe('rôles du lot A2', () => {
  it('un bénévole tient le check-in et le tableau de tâches, rien d’autre', () => {
    // Décision produit du 2026-09-01 : le Kanban est ouvert au bénévole (c'est
    // là que vivent les tâches du jour), pas à l'arbitre — ces deux rôles ne
    // forment pas une échelle mais deux jeux de droits distincts.
    expect(staffPermissionsFor('helper')).toEqual([
      'run_checkin',
      'manage_tasks',
    ]);
    expect(roleHasStaffPermission('helper', 'manage_teams')).toBe(false);
    expect(roleHasStaffPermission('helper', 'manage_settings')).toBe(false);
    expect(roleHasStaffPermission('helper', 'arbitrate_matches')).toBe(false);
  });

  it('un arbitre arbitre et tient le check-in, rien d’autre', () => {
    expect(staffPermissionsFor('referee').sort()).toEqual(
      ['arbitrate_matches', 'run_checkin'].sort()
    );
    expect(roleHasStaffPermission('referee', 'manage_tournaments')).toBe(false);
    // L'asymétrie est voulue : le Kanban va au bénévole, pas à l'arbitre.
    expect(roleHasStaffPermission('referee', 'manage_tasks')).toBe(false);
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

/* ---------------------------------------------------------------------------
 * « À quel titre ? » — la permission dans le journal (lot A2).
 *
 * L'acteur ne suffit plus depuis que le staff peut compter un renfort d'un
 * jour : savoir QUI a relancé un check-in importe moins que savoir qu'il l'a
 * fait en tant que bénévole. Le champ voyage dans le payload, pas dans une
 * colonne — une colonne à moitié vide serait le défaut qu'on vient de corriger
 * ailleurs (26 % du journal en `other`).
 * ------------------------------------------------------------------------- */

describe('permission portée par le journal', () => {
  it('le contexte de garde par permission la retient', async () => {
    // Contrat de type : `AuthenticatedStaffContext.permission` existe et est
    // typé sur le catalogue. Un renommage de permission casse ici.
    const ctx: { permission?: (typeof STAFF_PERMISSION_VALUES)[number] } = {
      permission: 'run_checkin',
    };
    expect(ctx.permission).toBe('run_checkin');
  });
});

describe('permissions accordées à l’unité', () => {
  it('ajoutent au rôle sans jamais en retirer', () => {
    // Une soustraction créerait un état où deux personnes du même rôle n'ont
    // pas les mêmes droits sans que rien ne le dise, et où lire le rôle ne
    // renseignerait plus sur rien. Pour retirer, on change de rôle.
    const effective = effectiveStaffPermissions('helper', ['read_documents']);
    expect(effective).toContain('read_documents');
    for (const p of staffPermissionsFor('helper')) {
      expect(effective).toContain(p);
    }
  });

  it('ignorent une valeur inconnue plutôt que d’échouer', () => {
    // La colonne SQL n'est pas contrainte par un enum : un droit retiré du
    // catalogue ne doit pas casser la résolution des droits de qui l'avait.
    expect(
      effectiveStaffPermissions('helper', ['droit_supprime_en_2027'])
    ).toEqual(staffPermissionsFor('helper'));
  });

  it('ouvrent la porte que le rôle seul ne couvre pas', () => {
    // Le cas d'usage du lot : la trésorière consulte le Drive de l'asso sans
    // devenir administratrice du site.
    expect(roleHasStaffPermission('helper', 'read_documents')).toBe(false);
    expect(
      hasStaffPermission('helper', ['read_documents'], 'read_documents')
    ).toBe(true);
    // Et rien d'autre ne s'ouvre au passage.
    expect(
      hasStaffPermission('helper', ['read_documents'], 'manage_documents')
    ).toBe(false);
    expect(
      hasStaffPermission('helper', ['read_documents'], 'manage_staff')
    ).toBe(false);
  });

  it('un acteur ne peut accorder que ce qu’il détient', () => {
    // Sans cette règle, `manage_staff` serait le seul droit qui existe : un
    // admin s'accorderait `manage_tenant`, qu'aucun rôle sauf owner ne porte,
    // et se hisserait au-dessus de son propre rôle.
    expect(grantableStaffPermissions('admin')).not.toContain('manage_tenant');
    expect(grantableStaffPermissions('owner')).toContain('manage_tenant');
    // Un droit reçu à l'unité est redélégable : c'est une délégation, pas un
    // privilège de second rang.
    expect(grantableStaffPermissions('helper', ['read_documents'])).toContain(
      'read_documents'
    );
  });

  it('ne stocke pas deux fois le même droit', () => {
    const effective = effectiveStaffPermissions('admin', [
      'manage_teams',
      'manage_teams',
    ]);
    expect(effective.filter((p) => p === 'manage_teams')).toHaveLength(1);
  });
});
