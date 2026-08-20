// Tests pour utils/teams/permissions.ts (hasTeamPermission)
//   - capitaine -> true peu importe la permission
//   - membre avec role accordant la permission -> true
//   - membre avec role sans la permission -> false
//   - non-membre -> false
//   - team inexistante -> false
//   - args manquants -> false

import { describe, it, expect, beforeEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { hasTeamPermission } from '../../utils/teams/permissions';
import { TEAM_ROLES_SETTING_KEY } from '../../utils/teamRoles';

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MANAGER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const COACH_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STRANGER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

function seed() {
  store.teams = [
    { id: TEAM_ID, name: 'Alpha', captain_id: CAPTAIN_ID, is_active: true },
  ] as any;
  store.team_members = [
    { id: 'tm-cap', team_id: TEAM_ID, user_id: CAPTAIN_ID, role: 'player' },
    { id: 'tm-mgr', team_id: TEAM_ID, user_id: MANAGER_ID, role: 'manager' },
    { id: 'tm-coa', team_id: TEAM_ID, user_id: COACH_ID, role: 'coach' },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: CAPTAIN_ID });
  seed();
});

describe('hasTeamPermission with default config', () => {
  it('captain has every permission, regardless of their team_members.role', async () => {
    expect(await hasTeamPermission(CAPTAIN_ID, TEAM_ID, 'manage_roster')).toBe(
      true
    );
    expect(await hasTeamPermission(CAPTAIN_ID, TEAM_ID, 'manage_scrims')).toBe(
      true
    );
    expect(
      await hasTeamPermission(CAPTAIN_ID, TEAM_ID, 'register_tournaments')
    ).toBe(true);
  });

  it('manager has all permissions via the default catalog', async () => {
    expect(await hasTeamPermission(MANAGER_ID, TEAM_ID, 'manage_roster')).toBe(
      true
    );
    expect(
      await hasTeamPermission(MANAGER_ID, TEAM_ID, 'manage_team_info')
    ).toBe(true);
    expect(
      await hasTeamPermission(MANAGER_ID, TEAM_ID, 'send_captain_messages')
    ).toBe(true);
  });

  it('le coach gère les scrims et la feuille de match, rien d’autre', async () => {
    // Décision produit 2026-08-21. Le coach avait ZÉRO permission : il était
    // exactement une joueuse qui ne joue pas. Les deux gestes qui définissent
    // le métier lui reviennent — organiser l'entraînement et décider qui est
    // aligné. La gestion administrative (roster, infos, inscriptions) reste
    // hors de son périmètre.
    expect(await hasTeamPermission(COACH_ID, TEAM_ID, 'manage_scrims')).toBe(
      true
    );
    expect(await hasTeamPermission(COACH_ID, TEAM_ID, 'validate_lineup')).toBe(
      true
    );
    expect(await hasTeamPermission(COACH_ID, TEAM_ID, 'manage_roster')).toBe(
      false
    );
    expect(
      await hasTeamPermission(COACH_ID, TEAM_ID, 'register_tournaments')
    ).toBe(false);
  });

  it('non-member returns false', async () => {
    expect(await hasTeamPermission(STRANGER_ID, TEAM_ID, 'manage_roster')).toBe(
      false
    );
  });

  it('returns false on unknown team', async () => {
    expect(
      await hasTeamPermission(CAPTAIN_ID, 'unknown-team', 'manage_roster')
    ).toBe(false);
  });

  it('returns false when userId or teamId is empty', async () => {
    expect(await hasTeamPermission('', TEAM_ID, 'manage_roster')).toBe(false);
    expect(await hasTeamPermission(CAPTAIN_ID, '', 'manage_roster')).toBe(
      false
    );
    expect(await hasTeamPermission(null, null, 'manage_roster')).toBe(false);
  });
});

describe('hasTeamPermission with custom config', () => {
  beforeEach(() => {
    // Override default: coach gets only manage_scrims; manager loses everything.
    store.site_settings = [
      {
        key: TEAM_ROLES_SETTING_KEY,
        value: JSON.stringify([
          { value: 'player', label: 'Player', permissions: [] },
          {
            value: 'coach',
            label: 'Coach',
            permissions: ['manage_scrims'],
          },
          { value: 'manager', label: 'Manager', permissions: [] },
        ]),
        description: null,
      },
    ] as any;
  });

  it('coach can now manage_scrims', async () => {
    expect(await hasTeamPermission(COACH_ID, TEAM_ID, 'manage_scrims')).toBe(
      true
    );
  });

  it('coach still cannot manage_roster', async () => {
    expect(await hasTeamPermission(COACH_ID, TEAM_ID, 'manage_roster')).toBe(
      false
    );
  });

  it('manager loses all permissions when config strips them', async () => {
    expect(await hasTeamPermission(MANAGER_ID, TEAM_ID, 'manage_roster')).toBe(
      false
    );
    expect(await hasTeamPermission(MANAGER_ID, TEAM_ID, 'manage_scrims')).toBe(
      false
    );
  });

  it('captain still bypasses everything', async () => {
    expect(await hasTeamPermission(CAPTAIN_ID, TEAM_ID, 'manage_roster')).toBe(
      true
    );
  });
});
