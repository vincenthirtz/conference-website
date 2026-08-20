// Tests pour utils/teamRoles.ts :
//   - parseTeamRoles : tolérance aux entrées invalides + fallback défaut
//   - serializeTeamRoles : format JSON stable
//   - permissions : catalogue + helpers

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TEAM_ROLES,
  TEAM_PERMISSION_CATALOG,
  TEAM_PERMISSION_VALUES,
  isTeamPermission,
  parseTeamRoles,
  privilegedRoleValues,
  roleHasAnyPermission,
  roleHasPermission,
  serializeTeamRoles,
} from '../../utils/teamRoles';

describe('parseTeamRoles', () => {
  it('returns the default list when input is null/undefined/empty', () => {
    expect(parseTeamRoles(null)).toEqual(DEFAULT_TEAM_ROLES);
    expect(parseTeamRoles(undefined)).toEqual(DEFAULT_TEAM_ROLES);
    expect(parseTeamRoles('')).toEqual(DEFAULT_TEAM_ROLES);
  });

  it('returns the default list on invalid JSON', () => {
    expect(parseTeamRoles('{ not json')).toEqual(DEFAULT_TEAM_ROLES);
  });

  it('returns the default list when JSON is not an array', () => {
    expect(parseTeamRoles('{"value":"player"}')).toEqual(DEFAULT_TEAM_ROLES);
    expect(parseTeamRoles('"player"')).toEqual(DEFAULT_TEAM_ROLES);
    expect(parseTeamRoles('null')).toEqual(DEFAULT_TEAM_ROLES);
  });

  it('parses a well-formed list and lowercases the value', () => {
    const parsed = parseTeamRoles(
      JSON.stringify([
        { value: 'PLAYER', label: 'Player' },
        { value: 'Coach', label: 'Coach FR' },
      ])
    );
    expect(parsed).toEqual([
      { value: 'player', label: 'Player', permissions: [] },
      { value: 'coach', label: 'Coach FR', permissions: [] },
    ]);
  });

  it('falls back to a capitalized label when label is missing or blank', () => {
    const parsed = parseTeamRoles(
      JSON.stringify([
        { value: 'tank' },
        { value: 'dps', label: '   ' },
        { value: 'sub', label: 'Remplaçant' },
      ])
    );
    expect(parsed).toEqual([
      { value: 'tank', label: 'Tank', permissions: [] },
      { value: 'dps', label: 'Dps', permissions: [] },
      { value: 'sub', label: 'Remplaçant', permissions: [] },
    ]);
  });

  it('drops entries without a value', () => {
    const parsed = parseTeamRoles(
      JSON.stringify([
        { value: '', label: 'Empty' },
        { label: 'No value' },
        { value: 'coach', label: 'Coach' },
      ])
    );
    expect(parsed).toEqual([
      { value: 'coach', label: 'Coach', permissions: [] },
    ]);
  });

  it('deduplicates by value (keeps first occurrence)', () => {
    const parsed = parseTeamRoles(
      JSON.stringify([
        { value: 'player', label: 'First' },
        { value: 'PLAYER', label: 'Dup' },
        { value: 'coach', label: 'Coach' },
      ])
    );
    expect(parsed).toEqual([
      { value: 'player', label: 'First', permissions: [] },
      { value: 'coach', label: 'Coach', permissions: [] },
    ]);
  });

  it('returns the default list when the cleaned array would be empty', () => {
    const parsed = parseTeamRoles(
      JSON.stringify([{ value: '' }, { foo: 'bar' }])
    );
    expect(parsed).toEqual(DEFAULT_TEAM_ROLES);
  });

  it('exposes a non-empty default list with player as first entry', () => {
    expect(DEFAULT_TEAM_ROLES.length).toBeGreaterThan(0);
    expect(DEFAULT_TEAM_ROLES[0].value).toBe('player');
  });

  it('parses permissions from the catalog and ignores unknown ones', () => {
    const parsed = parseTeamRoles(
      JSON.stringify([
        {
          value: 'manager',
          label: 'Manager',
          permissions: ['manage_roster', 'unknown_perm', 'manage_scrims'],
        },
      ])
    );
    expect(parsed).toEqual([
      {
        value: 'manager',
        label: 'Manager',
        permissions: ['manage_roster', 'manage_scrims'],
      },
    ]);
  });

  it('defaults permissions to [] when missing or not an array', () => {
    const parsed = parseTeamRoles(
      JSON.stringify([
        { value: 'a' },
        { value: 'b', permissions: 'manage_roster' },
        { value: 'c', permissions: null },
      ])
    );
    expect(parsed.every((r) => Array.isArray(r.permissions))).toBe(true);
    expect(parsed.map((r) => r.permissions)).toEqual([[], [], []]);
  });

  it('deduplicates permissions and keeps catalog order', () => {
    const parsed = parseTeamRoles(
      JSON.stringify([
        {
          value: 'manager',
          permissions: [
            'manage_scrims',
            'manage_roster',
            'manage_roster',
            'manage_team_info',
          ],
        },
      ])
    );
    expect(parsed[0].permissions).toEqual([
      'manage_roster',
      'manage_team_info',
      'manage_scrims',
    ]);
  });
});

describe('serializeTeamRoles', () => {
  it('outputs a JSON array with value/label/permissions fields', () => {
    const out = serializeTeamRoles([
      { value: 'player', label: 'Player', permissions: [] },
      {
        value: 'manager',
        label: 'Manager',
        permissions: ['manage_roster'],
      },
    ]);
    expect(JSON.parse(out)).toEqual([
      { value: 'player', label: 'Player', permissions: [] },
      { value: 'manager', label: 'Manager', permissions: ['manage_roster'] },
    ]);
  });

  it('round-trips with parseTeamRoles', () => {
    const input = [
      {
        value: 'tank',
        label: 'Tank',
        permissions: ['manage_roster' as const],
      },
      { value: 'support', label: 'Support', permissions: [] },
    ];
    expect(parseTeamRoles(serializeTeamRoles(input))).toEqual(input);
  });
});

describe('permissions catalog', () => {
  it('exposes a non-empty catalog with stable values list', () => {
    expect(TEAM_PERMISSION_CATALOG.length).toBeGreaterThan(0);
    expect(TEAM_PERMISSION_VALUES).toEqual(
      TEAM_PERMISSION_CATALOG.map((p) => p.value)
    );
  });

  it('isTeamPermission narrows correctly', () => {
    expect(isTeamPermission('manage_roster')).toBe(true);
    expect(isTeamPermission('not_a_real_permission')).toBe(false);
    expect(isTeamPermission(42)).toBe(false);
    expect(isTeamPermission(undefined)).toBe(false);
  });

  it('default manager role gets every permission', () => {
    const manager = DEFAULT_TEAM_ROLES.find((r) => r.value === 'manager');
    expect(manager).toBeDefined();
    expect(manager?.permissions).toEqual(TEAM_PERMISSION_VALUES);
  });

  it('seuls le manager et le coach portent des permissions par défaut', () => {
    // Le coach a cessé d'être « une joueuse qui ne joue pas » le 2026-08-21 :
    // il porte les deux gestes de son métier. Joueuse et remplaçante restent
    // sans permission — elles ne gèrent rien, par définition.
    const byValue = Object.fromEntries(
      DEFAULT_TEAM_ROLES.map((r) => [r.value, r.permissions])
    );
    expect(byValue.player).toEqual([]);
    expect(byValue.substitute).toEqual([]);
    expect(new Set(byValue.coach)).toEqual(
      new Set(['manage_scrims', 'validate_lineup'])
    );
    // Le manager garde l'intégralité du catalogue.
    expect(byValue.manager?.length).toBe(TEAM_PERMISSION_VALUES.length);
  });
});

describe('lookup helpers', () => {
  const roles = [
    {
      value: 'manager',
      label: 'Manager',
      permissions: ['manage_roster' as const, 'manage_scrims' as const],
    },
    { value: 'coach', label: 'Coach', permissions: [] },
  ];

  it('roleHasPermission matches case-insensitively and on exact perm', () => {
    expect(roleHasPermission(roles, 'manager', 'manage_roster')).toBe(true);
    expect(roleHasPermission(roles, 'MANAGER', 'manage_scrims')).toBe(true);
    expect(roleHasPermission(roles, 'manager', 'register_tournaments')).toBe(
      false
    );
    expect(roleHasPermission(roles, 'coach', 'manage_roster')).toBe(false);
    expect(roleHasPermission(roles, '', 'manage_roster')).toBe(false);
    expect(roleHasPermission(roles, null, 'manage_roster')).toBe(false);
    expect(roleHasPermission(roles, 'unknown', 'manage_roster')).toBe(false);
  });

  it('roleHasAnyPermission returns true only for roles with >=1 perm', () => {
    expect(roleHasAnyPermission(roles, 'manager')).toBe(true);
    expect(roleHasAnyPermission(roles, 'coach')).toBe(false);
    expect(roleHasAnyPermission(roles, 'unknown')).toBe(false);
    expect(roleHasAnyPermission(roles, null)).toBe(false);
  });

  it('privilegedRoleValues returns only roles with >=1 perm', () => {
    expect(privilegedRoleValues(roles)).toEqual(['manager']);
    expect(
      privilegedRoleValues([
        { value: 'a', label: 'A', permissions: [] },
        { value: 'b', label: 'B', permissions: [] },
      ])
    ).toEqual([]);
  });
});
