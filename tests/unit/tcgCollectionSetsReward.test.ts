// tests/unit/tcgCollectionSetsReward.test.ts
//
// Séries du TCG — la RÉCOMPENSE (`utils/tcg/grantCollectionSets.ts`), la
// lecture paresseuse (`GET /api/player/tcg/sets`) et le déclenchement à
// l'ouverture d'un paquet (`POST /api/player/tcg/packs`).
//
// CE QUE CES CAS PROTÈGENT.
//   1. UNE FOIS PAR SÉRIE : la complétion crédite, le rejeu et la lecture
//      paresseuse ne recréditent pas, et l'annonce `tcg.set_completed` part une
//      seule fois.
//   2. RECYCLER APRÈS LA RÉCOMPENSE NE LA REPREND PAS, et recompléter la série
//      ne la reverse pas.
//   3. UNE ÉCRITURE REFUSÉE (migration absente) NE PERD RIEN : la lecture
//      suivante crédite.
//   4. UNE LECTURE PARTIELLE N'ÉCRIT RIEN : un roster illisible pourrait
//      paraître complet.
//   5. L'ANNONCE NE NOMME AUCUNE JOUEUSE.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetSupabaseMock,
  setAuthUser,
  store,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { COLLECTION_SET_COINS } from '../../utils/tcg/earnSources';
import { checkCollectionSets } from '../../utils/tcg/grantCollectionSets';
import setsHandler from '../../pages/api/player/tcg/sets';
import packsHandler from '../../pages/api/player/tcg/packs';

const TENANT = DEFAULT_TENANT_ID;
const OWNER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
const TOURNAMENT = 'd2e3f4a5-b6c7-4d8e-9f0a-1b2c3d4e5f60';
const STAGE = 'e3f4a5b6-c7d8-4e9f-8a1b-2c3d4e5f6071';
const TEAM = 'f4a5b6c7-d8e9-4f0a-9b2c-3d4e5f607182';
const P1 = '0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e';
const P2 = '1b2c3d4e-5f60-4172-9839-4a5b6c7d8e9f';
const P3 = '2c3d4e5f-6071-4283-a94a-5b6c7d8e9fa0';
const SET_KEY = `roster:${TOURNAMENT}:${TEAM}`;

const PLAYER_NAMES = ['Akira', 'Bérénice', 'Chloé'];

let _token = 0;
function makeReq(over: Partial<Record<string, unknown>> = {}): any {
  _token += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_token}` },
    cookies: {},
    query: {},
    body: {},
    ...over,
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

/**
 * Une édition en cours, une équipe de trois joueuses — toutes dans le vivier
 * du tirage. La série de roster compte donc QUATRE cartes (équipe + 3).
 * Une seule équipe : pas de série « équipes de l'édition » (sous le minimum).
 */
function seedEdition() {
  store.tournaments = [
    { id: TOURNAMENT, tenant_id: TENANT, name: 'Cup 2026', status: 'running' },
  ] as any;
  store.tournament_stages = [
    {
      id: STAGE,
      tenant_id: TENANT,
      tournament_id: TOURNAMENT,
      deleted_at: null,
    },
  ] as any;
  store.stage_teams = [
    { stage_id: STAGE, team_id: TEAM, tenant_id: TENANT },
  ] as any;
  store.teams = [
    {
      id: TEAM,
      tenant_id: TENANT,
      name: 'Hinode Sparkles',
      short_name: 'HIN',
      slug: 'hinode-sparkles',
      logo_url: '/img/teams-images/hinode-sparkles.png',
      deleted_at: null,
      is_active: true,
    },
  ] as any;
  store.team_members = [P1, P2, P3].map((userId, i) => ({
    id: `9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6${i}`,
    tenant_id: TENANT,
    team_id: TEAM,
    user_id: userId,
    role: 'dps',
  })) as any;
  store.player_ratings = [P1, P2, P3].map((userId, i) => ({
    user_id: userId,
    tenant_id: TENANT,
    display_name: PLAYER_NAMES[i],
    battle_tag: null,
    avatar_url: null,
    rating: 1500,
    rd: 200,
    volatility: 0.06,
    peak_rating: 1500,
    games_played: 0,
    wins: 0,
    losses: 0,
  })) as any;
}

let _packCounter = 0;
/** Un paquet OUVERT de l'OWNER contenant ces sujets. Rend l'identifiant. */
function seedOpenedPack(subjects: Array<['player' | 'team', string]>): string {
  _packCounter += 1;
  const packId = `aa000000-0000-4000-8000-${String(_packCounter).padStart(12, '0')}`;
  (store.tcg_packs ||= []).push({
    id: packId,
    tenant_id: TENANT,
    user_id: OWNER,
    source_kind: 'purchase',
    source_match_id: null,
    granted_at: '2026-09-01T00:00:00.000Z',
    opened_at: '2026-09-01T00:01:00.000Z',
  });
  subjects.forEach(([kind, id], position) => {
    (store.tcg_pack_cards ||= []).push({
      pack_id: packId,
      position,
      subject_kind: kind,
      card_user_id: kind === 'player' ? id : null,
      card_team_id: kind === 'team' ? id : null,
      card_map_slug: null,
      rarity: 'common',
      is_foil: false,
      recycled_at: null,
    });
  });
  return packId;
}

const setEntries = () =>
  ((store.tcg_wallet_entries ?? []) as Array<Record<string, unknown>>).filter(
    (e) => e.source_kind === 'collection_set'
  );

const setEvents = () =>
  ((store.bot_event_outbox ?? []) as Array<Record<string, any>>)
    .filter((row) => row.event_name === 'tcg.set_completed')
    .map((row) => row.payload?.data as Record<string, unknown>);

beforeEach(() => {
  resetSupabaseMock();
  _packCounter = 0;
  setAuthUser({ id: OWNER });
  // Pas de push HTTP vers le bot : l'outbox suffit à observer l'annonce.
  delete process.env.BOT_WEBHOOK_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkCollectionSets — complétion et récompense', () => {
  it('ne crédite rien tant que la série est incomplète', async () => {
    seedEdition();
    seedOpenedPack([
      ['team', TEAM],
      ['player', P1],
      ['player', P2],
    ]);

    const result = await checkCollectionSets({
      tenantId: TENANT,
      userId: OWNER,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const roster = result.sets.find((s) => s.key === SET_KEY);
    expect(roster).toMatchObject({
      owned: 3,
      total: 4,
      complete: false,
      missingPlayers: 1,
      rewarded: false,
    });
    expect(setEntries()).toHaveLength(0);
    expect(setEvents()).toHaveLength(0);
  });

  it('crédite UNE fois la série complétée et l’annonce une fois', async () => {
    seedEdition();
    seedOpenedPack([
      ['team', TEAM],
      ['player', P1],
      ['player', P2],
      ['player', P3],
    ]);

    const first = await checkCollectionSets({
      tenantId: TENANT,
      userId: OWNER,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.newlyRewarded.map((n) => n.key)).toEqual([SET_KEY]);
    expect(first.sets.find((s) => s.key === SET_KEY)).toMatchObject({
      complete: true,
      rewarded: true,
      justRewarded: true,
    });

    expect(setEntries()).toEqual([
      expect.objectContaining({
        tenant_id: TENANT,
        user_id: OWNER,
        amount: COLLECTION_SET_COINS,
        source_ref: SET_KEY,
      }),
    ]);

    // Rejeu : aucune écriture, aucune annonce.
    const replay = await checkCollectionSets({
      tenantId: TENANT,
      userId: OWNER,
    });
    expect(replay.ok && replay.newlyRewarded).toEqual([]);
    expect(
      replay.ok && replay.sets.find((s) => s.key === SET_KEY)
    ).toMatchObject({ rewarded: true, justRewarded: false });
    expect(setEntries()).toHaveLength(1);
    expect(setEvents()).toHaveLength(1);
  });

  it('émet tcg.set_completed au contrat fixe, sans nom de joueuse', async () => {
    seedEdition();
    store.user_discord_links = [
      {
        auth_user_id: OWNER,
        discord_user_id: '123456789012345678',
        discord_username: 'owner',
      },
    ] as any;
    seedOpenedPack([
      ['team', TEAM],
      ['player', P1],
      ['player', P2],
      ['player', P3],
    ]);

    await checkCollectionSets({ tenantId: TENANT, userId: OWNER });

    const events = setEvents();
    expect(events).toHaveLength(1);
    const payload = events[0];
    expect(Object.keys(payload).sort()).toEqual(
      [
        'coins',
        'ctaUrl',
        'discordUserId',
        'discordUsername',
        'setKey',
        'setLabel',
        'userId',
      ].sort()
    );
    expect(payload).toMatchObject({
      userId: OWNER,
      discordUserId: '123456789012345678',
      discordUsername: 'owner',
      setKey: SET_KEY,
      setLabel: 'Roster Hinode Sparkles — Cup 2026',
      coins: COLLECTION_SET_COINS,
    });
    expect(String(payload.ctaUrl)).toMatch(/^https?:\/\/.+\/player\/tcg$/);
    for (const name of PLAYER_NAMES) {
      expect(JSON.stringify(payload)).not.toContain(name);
    }
  });

  it('ne reprend pas la récompense après un recyclage, et ne la reverse pas à la recomplétion', async () => {
    seedEdition();
    seedOpenedPack([
      ['team', TEAM],
      ['player', P1],
      ['player', P2],
      ['player', P3],
    ]);
    await checkCollectionSets({ tenantId: TENANT, userId: OWNER });
    expect(setEntries()).toHaveLength(1);

    // La carte de P3 quitte la collection (recyclée).
    for (const card of store.tcg_pack_cards as Array<Record<string, unknown>>) {
      if (card.card_user_id === P3) card.recycled_at = '2026-09-02T00:00:00Z';
    }
    const after = await checkCollectionSets({
      tenantId: TENANT,
      userId: OWNER,
    });
    expect(after.ok && after.sets.find((s) => s.key === SET_KEY)).toMatchObject(
      { complete: false, owned: 3, rewarded: true }
    );
    // Rien n'est repris : aucune écriture négative.
    expect(
      (store.tcg_wallet_entries as Array<Record<string, number>>).every(
        (e) => e.amount > 0
      )
    ).toBe(true);

    // Recomplétée : toujours une seule récompense.
    seedOpenedPack([['player', P3]]);
    const again = await checkCollectionSets({
      tenantId: TENANT,
      userId: OWNER,
    });
    expect(again.ok && again.newlyRewarded).toEqual([]);
    expect(setEntries()).toHaveLength(1);
    expect(setEvents()).toHaveLength(1);
  });

  it('ne perd rien sur un refus d’écriture : la lecture suivante crédite', async () => {
    seedEdition();
    seedOpenedPack([
      ['team', TEAM],
      ['player', P1],
      ['player', P2],
      ['player', P3],
    ]);

    // La migration n'est pas passée : le CHECK refuse (23514).
    const original = supabaseAdmin.from.bind(supabaseAdmin);
    const spy = vi.spyOn(supabaseAdmin, 'from').mockImplementation(((
      table: string
    ) => {
      if (table !== 'tcg_wallet_entries') return original(table);
      const builder = original(table) as any;
      builder.upsert = () => ({
        select: async () => ({
          data: null,
          error: { code: '23514', message: 'violates check constraint' },
        }),
      });
      return builder;
    }) as any);

    const refused = await checkCollectionSets({
      tenantId: TENANT,
      userId: OWNER,
    });
    expect(refused.ok && refused.newlyRewarded).toEqual([]);
    expect(setEntries()).toHaveLength(0);
    expect(setEvents()).toHaveLength(0);

    spy.mockRestore();
    const retried = await checkCollectionSets({
      tenantId: TENANT,
      userId: OWNER,
    });
    expect(retried.ok && retried.newlyRewarded.map((n) => n.key)).toEqual([
      SET_KEY,
    ]);
    expect(setEntries()).toHaveLength(1);
  });

  it('registre illisible : tente l’écriture, mais seul le RETURNING décide — ni recrédit ni réannonce', async () => {
    // La lecture préalable des séries récompensées n'est PAS un garde-fou.
    // Quand elle échoue, la série complète est retentée : c'est la clé du
    // registre (`ON CONFLICT DO NOTHING ... RETURNING`) qui doit empêcher le
    // second crédit ET la seconde annonce.
    seedEdition();
    seedOpenedPack([
      ['team', TEAM],
      ['player', P1],
      ['player', P2],
      ['player', P3],
    ]);
    await checkCollectionSets({ tenantId: TENANT, userId: OWNER });
    expect(setEntries()).toHaveLength(1);

    const original = supabaseAdmin.from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin, 'from').mockImplementation(((table: string) => {
      const builder = original(table) as any;
      if (table !== 'tcg_wallet_entries') return builder;
      const select = builder.select.bind(builder);
      builder.select = (cols?: string, opts?: unknown) => {
        if (cols !== 'source_ref') return select(cols, opts);
        const failing: any = {
          eq: () => failing,
          limit: async () => ({ data: null, error: { message: 'timeout' } }),
        };
        return failing;
      };
      return builder;
    }) as any);

    const blind = await checkCollectionSets({
      tenantId: TENANT,
      userId: OWNER,
    });
    expect(blind.ok).toBe(true);
    if (!blind.ok) return;
    expect(blind.newlyRewarded).toEqual([]);
    // Déjà écrite par quelqu'un d'autre : affichée comme reçue, pas « inconnue ».
    expect(blind.sets.find((s) => s.key === SET_KEY)).toMatchObject({
      rewarded: true,
      justRewarded: false,
    });
    expect(setEntries()).toHaveLength(1);
    expect(setEvents()).toHaveLength(1);
  });

  it('n’écrit rien quand un effectif est illisible', async () => {
    seedEdition();
    seedOpenedPack([
      ['team', TEAM],
      ['player', P1],
      ['player', P2],
      ['player', P3],
    ]);
    const original = supabaseAdmin.from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin, 'from').mockImplementation(((table: string) => {
      if (table !== 'team_members') return original(table);
      const builder = original(table) as any;
      builder.range = async () => ({
        data: null,
        error: { message: 'timeout' },
      });
      return builder;
    }) as any);

    const result = await checkCollectionSets({
      tenantId: TENANT,
      userId: OWNER,
    });
    expect(result.ok).toBe(false);
    expect(setEntries()).toHaveLength(0);
  });
});

describe('GET /api/player/tcg/sets — vérification paresseuse', () => {
  it('rattrape une série déjà complète, puis ne recrédite plus', async () => {
    seedEdition();
    seedOpenedPack([
      ['team', TEAM],
      ['player', P1],
      ['player', P2],
      ['player', P3],
    ]);

    const res = makeRes();
    await setsHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.body.rewardCoins).toBe(COLLECTION_SET_COINS);
    expect(res.body.newlyRewarded.map((n: { key: string }) => n.key)).toEqual([
      SET_KEY,
    ]);
    // La réponse ne nomme aucune joueuse.
    for (const name of PLAYER_NAMES) {
      expect(JSON.stringify(res.body)).not.toContain(name);
    }

    const again = makeRes();
    await setsHandler(makeReq(), again);
    expect(again.body.newlyRewarded).toEqual([]);
    expect(setEntries()).toHaveLength(1);
    expect(setEvents()).toHaveLength(1);
  });

  it('rend 500 sets_unreadable plutôt qu’une liste vide', async () => {
    seedEdition();
    const original = supabaseAdmin.from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin, 'from').mockImplementation(((table: string) => {
      if (table !== 'tournaments') return original(table);
      const builder = original(table) as any;
      builder.limit = async () => ({ data: null, error: { message: 'down' } });
      return builder;
    }) as any);

    const res = makeRes();
    await setsHandler(makeReq(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('sets_unreadable');
  });

  it('refuse toute autre méthode', async () => {
    const res = makeRes();
    await setsHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });
});

describe('POST /api/player/tcg/packs — la série se complète à l’ouverture', () => {
  it('rend setsCompleted et crédite une seule fois', async () => {
    // Vivier réduit à l'équipe et à ses trois joueuses : le paquet (3 joueuses,
    // 1 équipe, 1 map) contient forcément toute la série de roster.
    seedEdition();
    const PACK = 'bb000000-0000-4000-8000-000000000001';
    store.tcg_packs = [
      {
        id: PACK,
        tenant_id: TENANT,
        user_id: OWNER,
        source_kind: 'purchase',
        source_match_id: null,
        granted_at: '2026-09-01T00:00:00.000Z',
        opened_at: null,
      },
    ] as any;

    const res = makeRes();
    await packsHandler(
      makeReq({ method: 'POST', body: { packId: PACK } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.setsCompleted.map((s: { key: string }) => s.key)).toEqual([
      SET_KEY,
    ]);
    expect(res.body.setsCompleted[0].coins).toBe(COLLECTION_SET_COINS);
    expect(setEntries()).toHaveLength(1);
    expect(setEvents()).toHaveLength(1);

    // La lecture qui suit ne recrédite pas.
    const read = makeRes();
    await setsHandler(makeReq(), read);
    expect(read.body.newlyRewarded).toEqual([]);
    expect(setEntries()).toHaveLength(1);
  });
});
