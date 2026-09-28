// utils/admin/adminAccess.ts — la règle d'accès des liens admin (lot L14).

import { describe, it, expect } from 'vitest';
import {
  ANY_STAFF,
  canAccess,
  diffusionTabAccess,
  rolesAdmitted,
} from '../../utils/admin/adminAccess';
import { PALETTE_ACTIONS } from '../../components/admin/commandPaletteActions';

describe('canAccess', () => {
  it('par rôle minimum', () => {
    expect(canAccess({ minRole: 'caster' }, 'admin')).toBe(true);
    expect(canAccess({ minRole: 'caster' }, 'referee')).toBe(false);
    expect(canAccess({ minRole: 'caster' }, null)).toBe(false);
  });

  it('par permission, y compris accordée à l’unité', () => {
    const rule = { permission: 'manage_tasks' } as const;
    expect(canAccess(rule, 'helper')).toBe(true);
    expect(canAccess(rule, 'referee')).toBe(false);
    expect(canAccess(rule, 'referee', ['manage_tasks'])).toBe(true);
  });

  it('ANY_STAFF admet tous les rôles staff', () => {
    expect(rolesAdmitted(ANY_STAFF).sort()).toEqual(
      ['admin', 'caster', 'helper', 'owner', 'referee'].sort()
    );
  });
});

describe('diffusionTabAccess', () => {
  it('permission > rôle minimum > tout le staff', () => {
    expect(
      diffusionTabAccess({ permission: 'manage_broadcast', minRole: 'caster' })
    ).toEqual({ permission: 'manage_broadcast' });
    expect(diffusionTabAccess({ minRole: 'caster' })).toEqual({
      minRole: 'caster',
    });
    expect(diffusionTabAccess({})).toEqual(ANY_STAFF);
  });
});

describe('palette ⌘K', () => {
  const visibleFor = (role: 'referee' | 'helper' | 'caster' | 'admin') =>
    PALETTE_ACTIONS.filter((a) => canAccess(a.access, role)).map((a) => a.id);

  it('ne propose plus à un arbitre des raccourcis qui mènent à un 403', () => {
    expect(visibleFor('referee')).toEqual([]);
    expect(visibleFor('helper')).toEqual(['action-tasks']);
    expect(visibleFor('caster')).toEqual(['action-current']);
    expect(visibleFor('admin')).toEqual([
      'action-current',
      'action-tasks',
      'action-support',
    ]);
  });
});
