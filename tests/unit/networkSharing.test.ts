// Réseau entre espaces volontaires (lot 4 du rapport).
// Targets : utils/tenants/networkSharing.ts (pur + lecture),
//           pages/api/public/free-players, pages/api/public/team-openings.
//
// CE QUE CES CAS PROTÈGENT, par ordre d'importance :
//   1. RIEN NE SORT SANS CONSENTEMENT. Un espace fermé ne publie rien chez les
//      autres, et l'annonce d'une JOUEUSE ne voyage que si elle l'a acceptée —
//      l'espace ne peut pas décider à sa place.
//   2. ON NE VOIT QUE SI L'ON DONNE. Un espace fermé ne lit que ses propres
//      annonces : sans cette réciprocité, le réseau se remplit de lecteurs et
//      ceux qui publient referment.
//   3. UNE PANNE REFERME, ELLE N'OUVRE PAS. Toute erreur de lecture rend
//      l'espace à lui-même plutôt que de publier ce que personne n'a accepté.
//   4. UNE ANNONCE VENUE D'AILLEURS DIT D'OÙ ELLE VIENT.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  readNetworkTenantIds,
  resetNetworkSharingCache,
  selectNetworkTenantIds,
  sharesNetwork,
} from '../../utils/tenants/networkSharing';
import freePlayersHandler from '../../pages/api/public/free-players/index';
import teamOpeningsHandler from '../../pages/api/public/team-openings/index';

const OTHER = '22222222-0000-4000-8000-000000000002';
const THIRD = '33333333-0000-4000-8000-000000000003';

function makeReq(query: Record<string, unknown> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'owwomenscup.fr' },
    cookies: {},
    query,
    url: '/api/public/free-players',
    body: {},
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function tenantRow(id: string, open: boolean) {
  return {
    id,
    name: id === OTHER ? 'Ardent League' : 'Espace',
    slug: id === OTHER ? 'ardent' : 'espace',
    is_active: true,
    network_share_scrims: open,
    network_share_recruitment: open,
  };
}

let seq = 0;
function freePlayer(tenantId: string, share: boolean, name: string) {
  seq += 1;
  return {
    id: `fp-${seq}`,
    tenant_id: tenantId,
    source: 'web',
    discord_user_id: null,
    discord_username: null,
    auth_user_id: null,
    display_name: name,
    roles: ['dps'],
    availability: null,
    level: 'unknown',
    note: null,
    contact_email: 'x@example.test',
    contact_discord: null,
    marked_at: '2026-09-16T08:00:00.000Z',
    expires_at: '2099-01-01T00:00:00.000Z',
    share_across_tenants: share,
  };
}

function teamOpening(tenantId: string, teamName: string) {
  seq += 1;
  return {
    id: `to-${seq}`,
    tenant_id: tenantId,
    source: 'web',
    team_id: null,
    team_name: teamName,
    roles: ['dps'],
    level: 'unknown',
    availability: null,
    note: null,
    contact_email: 'x@example.test',
    contact_discord: null,
    marked_at: '2026-09-16T08:00:00.000Z',
    expires_at: '2099-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  resetSupabaseMock();
  resetNetworkSharingCache();
  seq = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ── La règle, sans base ───────────────────────────────────────────────── */

describe('réciprocité', () => {
  const rows = [
    {
      id: 'self',
      network_share_scrims: false,
      network_share_recruitment: true,
    },
    { id: 'a', network_share_scrims: true, network_share_recruitment: true },
    { id: 'b', network_share_scrims: true, network_share_recruitment: false },
  ];

  it('un espace fermé ne voit que lui-même', () => {
    expect(selectNetworkTenantIds('self', rows, 'scrims')).toEqual(['self']);
  });

  it('un espace ouvert voit les autres ouverts, réseau par réseau', () => {
    const ids = selectNetworkTenantIds('self', rows, 'recruitment');
    expect(ids).toContain('self');
    expect(ids).toContain('a');
    // `b` n'a ouvert que les scrims : il ne doit pas apparaître côté
    // recrutement. Deux interrupteurs, deux portées.
    expect(ids).not.toContain('b');
  });

  it('un espace inconnu de la liste reste seul', () => {
    expect(selectNetworkTenantIds('fantome', rows, 'scrims')).toEqual([
      'fantome',
    ]);
  });

  it('lit le bon drapeau selon le réseau', () => {
    expect(sharesNetwork(rows[2], 'scrims')).toBe(true);
    expect(sharesNetwork(rows[2], 'recruitment')).toBe(false);
    expect(sharesNetwork(null, 'scrims')).toBe(false);
  });
});

describe('lecture en base', () => {
  it('rend l’espace seul quand il n’a rien ouvert', async () => {
    store.tenants = [
      tenantRow(DEFAULT_TENANT_ID, false),
      tenantRow(OTHER, true),
    ];
    await expect(
      readNetworkTenantIds(DEFAULT_TENANT_ID, 'scrims')
    ).resolves.toEqual([DEFAULT_TENANT_ID]);
  });

  it('rend les espaces ouverts quand il a ouvert le sien', async () => {
    store.tenants = [
      tenantRow(DEFAULT_TENANT_ID, true),
      tenantRow(OTHER, true),
      tenantRow(THIRD, false),
    ];
    const ids = await readNetworkTenantIds(DEFAULT_TENANT_ID, 'scrims');
    expect(ids).toContain(OTHER);
    expect(ids).not.toContain(THIRD);
  });
});

/* ── Les listes publiques ──────────────────────────────────────────────── */

describe('GET /api/public/free-players', () => {
  it('ne sort pas une annonce que la joueuse n’a pas partagée', async () => {
    store.tenants = [
      tenantRow(DEFAULT_TENANT_ID, true),
      tenantRow(OTHER, true),
    ];
    store.free_players = [
      freePlayer(DEFAULT_TENANT_ID, false, 'Chez moi'),
      freePlayer(OTHER, false, 'Ailleurs, non partagée'),
      freePlayer(OTHER, true, 'Ailleurs, partagée'),
    ];

    const res = makeRes();
    await freePlayersHandler(makeReq(), res);

    const names = res.body.players.map((p: { name: string }) => p.name);
    expect(names).toContain('Chez moi');
    expect(names).toContain('Ailleurs, partagée');
    // Le cœur du sujet : déposer une annonce sur un site n'est pas la déposer
    // sur tous les autres.
    expect(names).not.toContain('Ailleurs, non partagée');
  });

  it('dit d’où vient une annonce du réseau, et rien pour les siennes', async () => {
    store.tenants = [
      tenantRow(DEFAULT_TENANT_ID, true),
      tenantRow(OTHER, true),
    ];
    store.free_players = [
      freePlayer(DEFAULT_TENANT_ID, true, 'Chez moi'),
      freePlayer(OTHER, true, 'Ailleurs'),
    ];

    const res = makeRes();
    await freePlayersHandler(makeReq(), res);

    const mine = res.body.players.find(
      (p: { name: string }) => p.name === 'Chez moi'
    );
    const theirs = res.body.players.find(
      (p: { name: string }) => p.name === 'Ailleurs'
    );
    expect(mine.from ?? null).toBeNull();
    expect(theirs.from.name).toBe('Ardent League');
  });

  it('ne lit rien d’ailleurs quand mon espace est fermé', async () => {
    store.tenants = [
      tenantRow(DEFAULT_TENANT_ID, false),
      tenantRow(OTHER, true),
    ];
    store.free_players = [
      freePlayer(DEFAULT_TENANT_ID, true, 'Chez moi'),
      freePlayer(OTHER, true, 'Ailleurs'),
    ];

    const res = makeRes();
    await freePlayersHandler(makeReq(), res);

    const names = res.body.players.map((p: { name: string }) => p.name);
    expect(names).toEqual(['Chez moi']);
  });
});

describe('GET /api/public/team-openings', () => {
  it('suit la décision du staff, sans consentement par annonce', async () => {
    // Différence assumée avec les joueuses : une annonce d'équipe engage
    // l'équipe, pas une personne. Le staff qui ouvre son espace l'ouvre pour
    // ses équipes.
    store.tenants = [
      tenantRow(DEFAULT_TENANT_ID, true),
      tenantRow(OTHER, true),
    ];
    store.team_openings = [
      teamOpening(DEFAULT_TENANT_ID, 'Mon équipe'),
      teamOpening(OTHER, 'Équipe voisine'),
    ];

    const res = makeRes();
    await teamOpeningsHandler(makeReq(), res);

    const names = res.body.openings.map(
      (o: { teamName: string }) => o.teamName
    );
    expect(names).toContain('Mon équipe');
    expect(names).toContain('Équipe voisine');
    const theirs = res.body.openings.find(
      (o: { teamName: string }) => o.teamName === 'Équipe voisine'
    );
    expect(theirs.from.name).toBe('Ardent League');
  });

  it('reste mono-espace quand le staff n’a pas ouvert', async () => {
    store.tenants = [
      tenantRow(DEFAULT_TENANT_ID, false),
      tenantRow(OTHER, true),
    ];
    store.team_openings = [
      teamOpening(DEFAULT_TENANT_ID, 'Mon équipe'),
      teamOpening(OTHER, 'Équipe voisine'),
    ];

    const res = makeRes();
    await teamOpeningsHandler(makeReq(), res);

    const names = res.body.openings.map(
      (o: { teamName: string }) => o.teamName
    );
    expect(names).toEqual(['Mon équipe']);
  });
});
