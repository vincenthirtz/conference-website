// tests/unit/botPlayerTeamSnapshot.test.ts
//
// GET /api/bot/v1/players/by-discord/[discordUserId]/team — mode rafale.
//
// Le scan blacklist du bot appelle cette route pour chaque membre de chaque
// serveur, à la suite : ~4 requêtes par membre, ~14 000 requêtes/jour. Au-delà
// de BURST_THRESHOLD appels rapprochés, la route répond depuis un instantané
// de 30 s. Contrat vérifié :
//   - réponses STRICTEMENT identiques au chemin direct (404, sans équipe,
//     équipe + coéquipières dans le même ordre) ;
//   - une rafale ne relit plus les tables à chaque membre ;
//   - un appel isolé garde le chemin direct (données exactes) ;
//   - instantané illisible → chemin direct, pas d'erreur.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resetSupabaseMock,
  seedBotAuth,
  BOT_TEST_API_KEY,
  CONFERENCE_TENANT_ID,
  store,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { __resetBotImpersonationCachesForTests } from '../../utils/botAuth';
import { __resetBotPlanCacheForTests } from '../../utils/billing/botPlanGate';
import {
  registerPlayerTeamCall,
  BURST_THRESHOLD,
  BURST_WINDOW_MS,
  __resetPlayerTeamSnapshotForTests,
} from '../../utils/botPlayerTeamSnapshot';
import handler from '../../pages/api/bot/v1/players/by-discord/[discordUserId]/team';

const TEAM = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_TENANT = '99999999-8888-4777-8666-555555555555';
const U = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const D = (n: number) => `10000000000000000${n}`;

let ip = 0;
function req(discordUserId: string): any {
  ip += 1;
  return {
    method: 'GET',
    headers: {
      host: 'h',
      'x-api-key': BOT_TEST_API_KEY,
      // IP distincte : le test ne doit pas mesurer le rate limit de la route.
      'x-nf-client-connection-ip': `10.0.${Math.floor(ip / 250)}.${ip % 250}`,
    },
    query: { discordUserId },
    body: {},
  };
}

function res(): any {
  const r: any = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c: number) => ((r.statusCode = c), r);
  r.json = (b: unknown) => ((r.body = b), r);
  r.setHeader = (k: string, v: unknown) => {
    r.headers[k] = v;
  };
  return r;
}

async function call(discordUserId: string) {
  const r = res();
  await handler(req(discordUserId), r);
  return { status: r.statusCode, body: r.body };
}

function seed() {
  seedBotAuth();
  store.teams = [
    {
      id: TEAM,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Les Rapides',
      slug: 'les-rapides',
      short_name: 'RAP',
      logo_url: null,
      banner_url: null,
      country: 'FR',
      captain_id: U(1),
      is_joinable: true,
      discord: null,
      discord_role_id: '555',
      description: null,
      website: null,
    },
  ];
  store.team_members = [
    // Ordre d'insertion volontairement mélangé : le tri doit être recalculé.
    {
      id: 'm3',
      user_id: U(3),
      team_id: TEAM,
      tenant_id: CONFERENCE_TENANT_ID,
      role: 'player',
      battle_tag: 'Trois#3',
      is_substitute: true,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'm2',
      user_id: U(2),
      team_id: TEAM,
      tenant_id: CONFERENCE_TENANT_ID,
      role: 'player',
      battle_tag: 'Deux#2',
      is_substitute: false,
      created_at: '2026-03-01T00:00:00Z',
    },
    {
      id: 'm1',
      user_id: U(1),
      team_id: TEAM,
      tenant_id: CONFERENCE_TENANT_ID,
      role: 'captain',
      battle_tag: 'Un#1',
      is_substitute: false,
      created_at: '2026-02-01T00:00:00Z',
    },
    // Même compte dans un AUTRE tenant : ne doit jamais remonter.
    {
      id: 'mx',
      user_id: U(2),
      team_id: 'bbbbbbbb-0000-4000-8000-000000000002',
      tenant_id: OTHER_TENANT,
      role: 'player',
      battle_tag: 'Ailleurs#9',
      is_substitute: false,
      created_at: '2025-01-01T00:00:00Z',
    },
  ];
  store.user_discord_links = [
    { auth_user_id: U(1), discord_user_id: D(1), discord_username: 'un' },
    { auth_user_id: U(2), discord_user_id: D(2), discord_username: 'deux' },
    { auth_user_id: U(3), discord_user_id: D(3), discord_username: 'trois' },
    // Lié, sans équipe.
    { auth_user_id: U(4), discord_user_id: D(4), discord_username: 'quatre' },
  ];
}

/** D(5) n'est lié à personne. */
const IDS = [D(1), D(2), D(3), D(4), D(5)];

function resetAll() {
  resetSupabaseMock();
  __resetBotImpersonationCachesForTests();
  __resetBotPlanCacheForTests();
  __resetPlayerTeamSnapshotForTests();
  seed();
}

/** Réponses du chemin direct : un appel isolé par identifiant. */
async function directResponses() {
  const out: Record<string, unknown> = {};
  for (const id of IDS) {
    __resetPlayerTeamSnapshotForTests();
    out[id] = await call(id);
  }
  return out;
}

beforeEach(() => resetAll());
afterEach(() => vi.restoreAllMocks());

describe('registerPlayerTeamCall()', () => {
  it('ne détecte la rafale qu’au seuil, dans la fenêtre', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < BURST_THRESHOLD - 1; i += 1) {
      expect(registerPlayerTeamCall('t', t0 + i)).toBe(false);
    }
    expect(registerPlayerTeamCall('t', t0 + BURST_THRESHOLD)).toBe(true);
  });

  it('des appels espacés ne font jamais rafale', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i += 1) {
      expect(registerPlayerTeamCall('t', t0 + i * BURST_WINDOW_MS)).toBe(false);
    }
  });

  it('les tenants sont comptés séparément', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < BURST_THRESHOLD - 1; i += 1) {
      registerPlayerTeamCall('a', t0 + i);
    }
    expect(registerPlayerTeamCall('b', t0 + 5)).toBe(false);
  });
});

describe('route team — rafale', () => {
  it('rend exactement les mêmes réponses que le chemin direct', async () => {
    const expected = await directResponses();

    // Sanity : les trois formes sont couvertes.
    expect((expected[D(5)] as any).status).toBe(404);
    expect((expected[D(4)] as any).body.team).toBeNull();
    expect(
      (expected[D(2)] as any).body.teammates.map((m: any) => m.id)
    ).toEqual(['m1', 'm2', 'm3']);

    resetAll();
    // Deux passages : le second est entièrement servi par l'instantané.
    for (const id of IDS) expect(await call(id)).toEqual(expected[id]);
    for (const id of IDS) expect(await call(id)).toEqual(expected[id]);
  });

  it('une rafale ne relit plus les tables à chaque membre', async () => {
    const from = vi.spyOn(supabaseAdmin as any, 'from');
    const many = [...IDS, ...IDS, ...IDS, ...IDS];
    for (const id of many) await call(id);

    const linkReads = from.mock.calls.filter(
      (c) => c[0] === 'user_discord_links'
    ).length;
    // Chemin direct pour les BURST_THRESHOLD - 1 premiers appels, puis UNE
    // lecture d'instantané. Sans le mode rafale : un par appel (20).
    expect(linkReads).toBeLessThanOrEqual(BURST_THRESHOLD);
    expect(linkReads).toBeLessThan(many.length);
  });

  it('un appel isolé garde le chemin direct (données exactes)', async () => {
    const first = await call(D(2));
    expect(first.body).toMatchObject({ member: { battleTag: 'Deux#2' } });
    // Changement d'état entre deux appels isolés : vu immédiatement.
    (store.team_members as any[]).find((m) => m.id === 'm2').battle_tag =
      'Nouveau#2';
    __resetPlayerTeamSnapshotForTests(); // pas de rafale en cours
    const second = await call(D(2));
    expect(second.body).toMatchObject({ member: { battleTag: 'Nouveau#2' } });
  });

  it('instantané illisible → chemin direct, sans erreur', async () => {
    const expected = await directResponses();
    resetAll();
    const realFrom = (supabaseAdmin as any).from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin as any, 'from').mockImplementation(
      (...args: unknown[]) => {
        const qb = realFrom(...args);
        // La pagination n'est utilisée QUE par l'instantané : on la fait
        // échouer pour simuler une lecture d'instantané ratée.
        qb.range = () =>
          Promise.resolve({ data: null, error: { message: 'x' } });
        return qb;
      }
    );
    for (const id of IDS) expect(await call(id)).toEqual(expected[id]);
  });
});
