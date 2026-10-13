// Lot P0 — sécurité : l'éditeur de page d'équipe côté SSR
// (docs/PLAN-industrialisation-joueur.md, § P0 et P10).
//
// Les routes (`/api/teams/[teamId]/*`, `/api/player/team-rhythm`) sont testées
// dans conference-api (tests/unit/playerSecurityP0.routes.test.ts). Ici, ce que
// la PAGE `/team/[slug]/edit` fait des mêmes règles, via `defineSubjectPage` :
//
//   S1  — un staff admin global sans act-as est un compte comme un autre : il
//         est renvoyé vers la fiche publique ;
//   P10 — l'édition staff passe par l'act-as journalisé (`?as=<sujet>&act=1`) :
//         sans la seconde clé → /403 ; le droit est celui du SUJET ; un compte
//         non staff qui pose `?as=` → /403 ; la manager sans `?as=` garde son
//         éditeur (témoin).

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setCookieUser,
  setAdminUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import { getServerSideProps as editTeamSSR } from '../../pages/team/[slug]/edit';

const TENANT_B = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';

const TEAM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEAM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const CAPTAIN_A = 'c0000000-0000-4000-8000-00000000000a';
const CAPTAIN_B = 'c0000000-0000-4000-8000-00000000000b';
const MANAGER_A = 'd0000000-0000-4000-8000-00000000000a';
const MANAGER_B = 'd0000000-0000-4000-8000-00000000000b';
const STAFF_ADMIN = '5a000000-0000-4000-8000-0000000000ad';

const MEMBER_ROW_A = '9a000000-0000-4000-8000-000000000001';
const MEMBER_ROW_B = '9b000000-0000-4000-8000-000000000001';

function teamRow(id: string, tenantId: string, captainId: string) {
  return {
    id,
    tenant_id: tenantId,
    name: `Team ${id.slice(0, 4)}`,
    short_name: id.slice(0, 3).toUpperCase(),
    slug: `team-${id.slice(0, 4)}`,
    logo_url: null,
    tcg_image_path: null,
    description: 'original',
    captain_id: captainId,
    discord_role_id: '111111111111111111',
    discord_channel_id: '222222222222222222',
    discord_voice_channel_id: '333333333333333333',
    is_active: true,
    deleted_at: null,
  };
}

function seed() {
  store.teams = [
    teamRow(TEAM_A, CONFERENCE_TENANT_ID, CAPTAIN_A),
    teamRow(TEAM_B, TENANT_B, CAPTAIN_B),
  ] as any;
  store.team_members = [
    {
      id: MEMBER_ROW_A,
      team_id: TEAM_A,
      user_id: MANAGER_A,
      role: 'manager',
      display_name: 'MgrA',
      tenant_id: CONFERENCE_TENANT_ID,
    },
    {
      // Le staff admin est aussi une simple joueuse de l'équipe A.
      id: '9a000000-0000-4000-8000-000000000002',
      team_id: TEAM_A,
      user_id: STAFF_ADMIN,
      role: 'player',
      display_name: 'StaffPlayer',
      tenant_id: CONFERENCE_TENANT_ID,
    },
    {
      id: MEMBER_ROW_B,
      team_id: TEAM_B,
      user_id: MANAGER_B,
      role: 'manager',
      display_name: 'MgrB',
      tenant_id: TENANT_B,
    },
  ] as any;
  store.team_member_permissions = [] as any;
  store.team_availability = [] as any;
  store.staff = [
    {
      id: 'staff-p0',
      auth_user_id: STAFF_ADMIN,
      email: 'admin@example.com',
      role: 'admin',
      is_active: true,
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
}

const ssr = (query: Record<string, string>) =>
  editTeamSSR({
    params: { slug: TEAM_A },
    req: { headers: { host: 'h' }, cookies: {} },
    res: { setHeader: () => {}, getHeader: () => undefined },
    query,
    resolvedUrl: `/team/${TEAM_A}/edit`,
  } as any) as Promise<any>;

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  seed();
});

describe('S1 — SSR /team/[slug]/edit : un staff admin global sans act-as est un compte comme un autre', () => {
  it('redirige vers la fiche publique', async () => {
    setCookieUser({ id: STAFF_ADMIN });
    const result = await ssr({});
    expect(result.redirect?.destination).toBe(`/team/${TEAM_A}`);
  });
});

describe('P10 — SSR /team/[slug]/edit : act-as staff', () => {
  beforeEach(() => {
    // Un sujet inconnu est un 404 (`resolveSubject`) : on les déclare.
    for (const id of [MANAGER_A, MANAGER_B, STAFF_ADMIN]) {
      setAdminUser(id, `${id.slice(0, 4)}@example.com`);
    }
  });

  it('?as=<manager>&act=1 → éditeur ouvert, entrée journalisée', async () => {
    setCookieUser({ id: STAFF_ADMIN });
    const result = await ssr({ as: MANAGER_A, act: '1' });
    expect(result.props?.team?.id).toBe(TEAM_A);
    expect(result.props?.subjectScope).toEqual({
      subjectId: MANAGER_A,
      actAs: true,
    });
    const entry = ((store as any).staff_logs ?? []).find(
      (l: any) => l.action === 'view_captain_data'
    );
    expect(entry?.entity_id).toBe(MANAGER_A);
    expect(entry?.payload?.act).toBe(true);
  });

  it('sans `act=1`, ou sujet sans le droit → refus', async () => {
    setCookieUser({ id: STAFF_ADMIN });
    expect((await ssr({ as: MANAGER_A })).redirect?.destination).toBe('/403');
    // Représenter une simple joueuse : le droit est celui du SUJET.
    expect(
      (await ssr({ as: STAFF_ADMIN, act: '1' })).redirect?.destination
    ).toBe(`/team/${TEAM_A}`);
  });

  it('?as= par un compte non staff → /403', async () => {
    setCookieUser({ id: MANAGER_B });
    const result = await ssr({ as: MANAGER_A, act: '1' });
    expect(result.redirect?.destination).toBe('/403');
  });

  it('sans ?as= : la manager ouvre son éditeur (témoin)', async () => {
    setCookieUser({ id: MANAGER_A });
    const result = await ssr({});
    expect(result.props?.team?.id).toBe(TEAM_A);
    expect(result.props?.subjectScope).toEqual({
      subjectId: null,
      actAs: false,
    });
  });
});
