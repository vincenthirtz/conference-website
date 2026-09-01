import { describe, it, expect } from 'vitest';

// We can only test the pure functions — the ones that don't touch supabase.
// We need to mock the supabase import to avoid errors on import.
import { vi } from 'vitest';
vi.mock('../../utils/supabase', () => ({
  supabaseAdmin: {},
  getServerClient: () => ({}),
}));

import {
  STAFF_ROLES,
  STAFF_ROLE_LABEL,
  STAFF_ROLE_RANK,
  formatStaffRoleLabel,
  getRoleLabel,
  getRoleDescription,
  getRoleOptions,
  hasAtLeastRole,
  isStaff,
  isAdmin,
  isManagerOrAbove,
  StaffUnauthorizedError,
  StaffUnauthenticatedError,
} from '../../utils/staff';

describe('STAFF_ROLES', () => {
  // Depuis le lot A2 (docs/PLAN-espace-admin.md), deux rôles ÉTROITS
  // s'ajoutent : `referee` et `helper`. Ils sont listés après les trois
  // historiques, dont l'ordre et le périmètre n'ont pas bougé — leur accès
  // passe par les permissions (utils/staffPermissions.ts), pas par le rang.
  it('liste les rôles, historiques d’abord', () => {
    expect(STAFF_ROLES).toEqual([
      'owner',
      'admin',
      'caster',
      'referee',
      'helper',
    ]);
  });
});

describe('formatStaffRoleLabel', () => {
  it('returns label for each role', () => {
    expect(formatStaffRoleLabel('owner')).toBe('Owner');
    expect(formatStaffRoleLabel('admin')).toBe('Admin');
    expect(formatStaffRoleLabel('caster')).toBe('Caster');
  });
});

describe('getRoleLabel', () => {
  it('returns label for valid role', () => {
    expect(getRoleLabel('admin')).toBe('Admin');
  });

  it('returns dash for null', () => {
    expect(getRoleLabel(null)).toBe('—');
  });

  it('returns dash for undefined', () => {
    expect(getRoleLabel(undefined)).toBe('—');
  });
});

describe('getRoleDescription', () => {
  it('returns description for valid role', () => {
    expect(getRoleDescription('owner')).toContain('complet');
  });

  it('returns empty string for null', () => {
    expect(getRoleDescription(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(getRoleDescription(undefined)).toBe('');
  });
});

describe('getRoleOptions', () => {
  it('returns one option per role', () => {
    const options = getRoleOptions();
    expect(options).toHaveLength(STAFF_ROLES.length);
  });

  it('each option has value, label, description', () => {
    const options = getRoleOptions();
    for (const opt of options) {
      expect(opt).toHaveProperty('value');
      expect(opt).toHaveProperty('label');
      expect(opt).toHaveProperty('description');
      expect(typeof opt.label).toBe('string');
      expect(typeof opt.description).toBe('string');
    }
  });

  it('options match STAFF_ROLES order', () => {
    const options = getRoleOptions();
    expect(options.map((o) => o.value)).toEqual(STAFF_ROLES);
  });
});

describe('hasAtLeastRole', () => {
  it('owner has at least any role', () => {
    expect(hasAtLeastRole('owner', 'caster')).toBe(true);
    expect(hasAtLeastRole('owner', 'admin')).toBe(true);
    expect(hasAtLeastRole('owner', 'owner')).toBe(true);
  });

  it('caster only has at least caster', () => {
    expect(hasAtLeastRole('caster', 'caster')).toBe(true);
    expect(hasAtLeastRole('caster', 'admin')).toBe(false);
    expect(hasAtLeastRole('caster', 'owner')).toBe(false);
  });

  it('admin has at least admin and caster but not owner', () => {
    expect(hasAtLeastRole('admin', 'caster')).toBe(true);
    expect(hasAtLeastRole('admin', 'admin')).toBe(true);
    expect(hasAtLeastRole('admin', 'owner')).toBe(false);
  });

  it('returns false for null role', () => {
    expect(hasAtLeastRole(null, 'caster')).toBe(false);
  });

  it('returns false for undefined role', () => {
    expect(hasAtLeastRole(undefined, 'caster')).toBe(false);
  });
});

describe('isStaff', () => {
  it('returns true for any role', () => {
    expect(isStaff('caster')).toBe(true);
    expect(isStaff('owner')).toBe(true);
  });

  it('returns false for null/undefined', () => {
    expect(isStaff(null)).toBe(false);
    expect(isStaff(undefined)).toBe(false);
  });
});

describe('isAdmin', () => {
  it('returns true for admin and above', () => {
    expect(isAdmin('admin')).toBe(true);
    expect(isAdmin('owner')).toBe(true);
  });

  it('returns false for caster', () => {
    expect(isAdmin('caster')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isAdmin(null)).toBe(false);
  });
});

describe('isManagerOrAbove', () => {
  it('returns true for admin and above', () => {
    expect(isManagerOrAbove('admin')).toBe(true);
    expect(isManagerOrAbove('owner')).toBe(true);
  });

  it('returns false for caster', () => {
    expect(isManagerOrAbove('caster')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isManagerOrAbove(null)).toBe(false);
  });
});

describe('StaffUnauthorizedError', () => {
  it('has statusCode 403', () => {
    const err = new StaffUnauthorizedError();
    expect(err.statusCode).toBe(403);
    expect(err.name).toBe('StaffUnauthorizedError');
  });

  it('accepts custom message', () => {
    const err = new StaffUnauthorizedError('Custom msg');
    expect(err.message).toBe('Custom msg');
  });
});

describe('StaffUnauthenticatedError', () => {
  it('has statusCode 401', () => {
    const err = new StaffUnauthenticatedError();
    expect(err.statusCode).toBe(401);
    expect(err.name).toBe('StaffUnauthenticatedError');
  });
});
