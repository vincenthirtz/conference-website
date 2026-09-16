// Unit tests — recrutement lisible dans l'annuaire connecté (/player/teams).
//
// Règles couvertes :
//   - `is_joinable` vaut true PAR DÉFAUT : il ne doit jamais, seul, produire le
//     signal fort. Seule une annonce active de `team_openings` le produit ;
//   - rattachement d'une annonce : par `team_id`, sinon par nom normalisé et
//     UNIQUE dans l'espace ; jamais depuis un autre espace ;
//   - annonces périmées ignorées ; une seule lecture des annonces par page ;
//   - aucune colonne de contact lue par l'annuaire ;
//   - filtre « recrutent » : annonces en tête, ordre de l'API conservé ensuite.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  fromCalls,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import directoryHandler from '../../pages/api/player/teams-directory';
import {
  DIRECTORY_OPENING_SELECT,
  indexOpeningsByTeam,
  isRecruiting,
  sortRecruitingFirst,
  type DirectoryOpeningRow,
} from '../../utils/teams/directoryRecruitment';

const TEAM_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEAM_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEAM_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const TEAM_D = 'dddddddd-0000-0000-0000-dddddddddddd';
const CAPTAIN_A = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const OTHER_TENANT = '99999999-9999-9999-9999-999999999999';

const FUTURE = new Date(Date.now() + 10 * 86_400_000).toISOString();
const PAST = '2020-01-01T00:00:00.000Z';

let _tok = 0;
function makeReq(over: Partial<any> = {}): any {
  _tok += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_tok}` },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function team(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    captain_id: `captain-${id}`,
    tenant_id: CONFERENCE_TENANT_ID,
    is_active: true,
    is_joinable: true,
    open_for_scrim: false,
    deleted_at: null,
    team_members: [],
    ...extra,
  };
}

function opening(over: Record<string, unknown>) {
  return {
    id: `op-${Math.random()}`,
    tenant_id: CONFERENCE_TENANT_ID,
    source: 'web',
    team_id: null,
    team_name: null,
    roles: [],
    contact_email: 'capitaine@example.com',
    contact_discord: 'cap#0001',
    marked_at: '2026-09-10T10:00:00.000Z',
    expires_at: FUTURE,
    ...over,
  };
}

async function getDirectory() {
  const res = makeRes();
  await directoryHandler(makeReq(), res);
  expect(res.statusCode).toBe(200);
  const body = res.body as any;
  return {
    body,
    byId: (id: string) => body.teams.find((t: any) => t.id === id),
  };
}

beforeEach(() => {
  resetSupabaseMock();
  store.teams = [
    team(TEAM_A, 'Alpha', { captain_id: CAPTAIN_A }),
    // Joinable par défaut, non pleine, SANS annonce : le cas qui mentait.
    team(TEAM_B, 'Bravo'),
    team(TEAM_C, 'Charlie Étoile', { is_joinable: false }),
  ] as any;
  store.team_members = [] as any;
  store.scrim_searches = [] as any;
  store.team_ratings = [] as any;
  store.team_openings = [] as any;
  setAuthUser({ id: CAPTAIN_A });
});

describe('GET /api/player/teams-directory — annonces de recrutement', () => {
  it("une équipe is_joinable SANS annonce n'a pas de signal fort", async () => {
    const { byId } = await getDirectory();
    const bravo = byId(TEAM_B);
    expect(bravo.is_joinable).toBe(true);
    expect(bravo.is_full).toBe(false);
    expect(bravo.opening).toBeNull();
  });

  // SÉCURITÉ. Une annonce publique se dépose sans compte et porte les
  // coordonnées de qui la dépose. Si le NOM suffisait à la rattacher, n'importe
  // qui obtiendrait le badge « Annonce publiée » sur la vraie fiche d'une équipe
  // avec ses propres coordonnées. Ce test garantit que ça n'arrive pas.
  it("une annonce SANS team_id n'accroche jamais le signal fort, même au nom exact d'une équipe", async () => {
    (store.team_openings as any[]).push(
      opening({ team_name: 'Charlie Étoile', roles: ['support'] }),
      opening({ team_name: '  charlie etoile ' })
    );
    const { byId } = await getDirectory();
    expect(byId(TEAM_C).opening).toBeNull();
  });

  it('une annonce avec team_id porte le signal fort et ses postes', async () => {
    (store.team_openings as any[]).push(
      opening({
        team_id: TEAM_B,
        team_name: 'Nom sans rapport',
        roles: ['support', 'tank', 'bogus'],
      })
    );
    const { byId } = await getDirectory();
    expect(byId(TEAM_B).opening).toEqual({
      roles: ['tank', 'support'],
      since: '2026-09-10T10:00:00.000Z',
      linked_by: 'team',
    });
    expect(byId(TEAM_C).opening).toBeNull();
  });

  it("ignore les annonces périmées et celles d'un autre espace", async () => {
    (store.team_openings as any[]).push(
      opening({ team_id: TEAM_B, expires_at: PAST }),
      opening({ team_id: TEAM_B, tenant_id: OTHER_TENANT })
    );
    const { byId } = await getDirectory();
    expect(byId(TEAM_B).opening).toBeNull();
  });

  it('lit les annonces UNE seule fois, sans colonne de contact', async () => {
    (store.team_openings as any[]).push(
      opening({ team_name: 'Bravo' }),
      opening({ team_name: 'Charlie Étoile' })
    );
    const { body } = await getDirectory();
    expect(fromCalls.filter((t) => t === 'team_openings')).toHaveLength(1);
    expect(DIRECTORY_OPENING_SELECT).not.toMatch(/contact/);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('capitaine@example.com');
    expect(serialized).not.toContain('cap#0001');
  });
});

describe('indexOpeningsByTeam', () => {
  const teams = [
    { id: TEAM_A, name: 'Alpha' },
    { id: TEAM_B, name: 'Nova' },
    { id: TEAM_C, name: 'NOVA' },
    { id: TEAM_D, name: 'Delta' },
  ];
  const row = (over: Partial<DirectoryOpeningRow>): DirectoryOpeningRow => ({
    id: 'x',
    team_id: null,
    team_name: null,
    roles: [],
    marked_at: '2026-09-01T00:00:00.000Z',
    expires_at: FUTURE,
    ...over,
  });

  it('ne rattache jamais par nom, même unique et exact', () => {
    const map = indexOpeningsByTeam(
      [row({ team_name: 'Alpha' }), row({ team_name: 'Delta' })],
      teams
    );
    expect(map.size).toBe(0);
  });

  it("un team_id hors de l'espace ne retombe pas sur le nom", () => {
    const map = indexOpeningsByTeam(
      [row({ team_id: OTHER_TENANT, team_name: 'Alpha' })],
      teams
    );
    expect(map.size).toBe(0);
  });

  it('fusionne plusieurs annonces : union des postes, date la plus récente', () => {
    const map = indexOpeningsByTeam(
      [
        row({
          team_id: TEAM_D,
          roles: ['dps'],
          marked_at: '2026-09-12T00:00:00.000Z',
        }),
        row({
          team_id: TEAM_D,
          roles: ['tank'],
          marked_at: '2026-09-02T00:00:00.000Z',
        }),
      ],
      teams
    );
    expect(map.get(TEAM_D)).toEqual({
      roles: ['tank', 'dps'],
      since: '2026-09-12T00:00:00.000Z',
      linked_by: 'team',
    });
  });
});

describe('filtre « recrutent »', () => {
  const op = { roles: [], since: null, linked_by: 'team' as const };
  const list = [
    { id: '1', opening: null, is_joinable: true, is_full: false },
    { id: '2', opening: op, is_joinable: false, is_full: true },
    { id: '3', opening: null, is_joinable: false, is_full: false },
    { id: '4', opening: null, is_joinable: true, is_full: false },
    { id: '5', opening: op, is_joinable: true, is_full: false },
  ];

  it('une annonce suffit, même équipe pleine ; sinon il faut joinable et non pleine', () => {
    expect(list.filter(isRecruiting).map((t) => t.id)).toEqual([
      '1',
      '2',
      '4',
      '5',
    ]);
  });

  it("met les annonces en tête sans casser l'ordre reçu dans chaque groupe", () => {
    expect(
      sortRecruitingFirst(list.filter(isRecruiting)).map((t) => t.id)
    ).toEqual(['2', '5', '1', '4']);
  });
});
