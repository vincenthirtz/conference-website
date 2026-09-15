// Rattrapage de la récompense « compte Battle.net vérifié ».
// Target: pages/api/admin/tcg/battlenet-backfill.ts
//         (+ utils/tcg/battlenetBackfill.ts, utils/tcg/battlenetBackfillModel.ts)
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. SIMULER N'ÉCRIT RIEN, et annonce les bons nombres (dont les DM Discord).
//   2. DISTRIBUER CRÉDITE UNE FOIS ; RELANCER NE RECRÉDITE PERSONNE.
//   3. L'AUDIENCE EST L'ESPACE. Un compte lié qui ne joue ni ne collectionne
//      dans l'espace du staff n'est pas crédité : l'index « une fois par
//      personne » étant global, le créditer ici consommerait sa récompense
//      unique au mauvais endroit. « Collectionner » = un GAIN RÉEL au registre
//      de l'espace, plus un simple porte-monnaie : un porte-monnaie né d'un
//      `admin_grant` était la porte du vol de récompense (audit 2026-09-15).
//   4. UNE AUDIENCE ILLISIBLE N'EST PAS UNE AUDIENCE VIDE : 500, rien écrit.
//   5. `manage_tcg` EST EXIGÉE.
//
// Le mock n'évalue pas les index partiels : la règle cross-tenant de
// l'écrivain est couverte par `tcgBattlenetVerifiedReward.test.ts`.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: vi.fn().mockResolvedValue(undefined),
}));

import {
  resetSupabaseMock,
  setAuthUser,
  store,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { logStaffAction } from '../../utils/staffLogs';
import { BATTLENET_VERIFIED_COINS } from '../../utils/tcg/earnSources';
import { battlenetRewardSourceRef } from '../../utils/tcg/grantBattlenetVerified';
import {
  backfillOutcome,
  canDistribute,
  confirmFigures,
  normalizeBackfillReport,
  normalizeBackfillSimulation,
} from '../../utils/tcg/battlenetBackfillModel';
import handler from '../../pages/api/admin/tcg/battlenet-backfill';

const TENANT = DEFAULT_TENANT_ID;
const OTHER_TENANT = '5b8e2f14-7c3a-4d9e-8f1b-2a6c4e8d0f13';
const STAFF_ROW = '55555555-5555-4555-8555-555555555555';
const STAFF_AUTH = '66666666-6666-4666-8666-666666666666';

/** Sur un roster de l'espace, jamais récompensée. */
const ROSTER = '3f6c2a1e-8b4d-4c7e-9a2b-1d5e6f7a8b9c';
/** Supportrice : pas de roster, mais un GAIN RÉEL (drop Twitch) dans l'espace. */
const COLLECTOR = '9d4b7e21-3a6c-4f8d-b2e5-7c1a9f3d6e40';
/**
 * Victime de l'attaque : ne joue que dans un AUTRE espace, mais un owner de
 * celui-ci lui a crédité +1 (`admin_grant`), ce qui lui a créé un porte-monnaie
 * ici. Hors audience.
 */
const VICTIM = '4c6e8a0b-2d4f-4a6c-8e0a-2b4d6f8a0c2e';
/** Sur un roster de l'espace, DÉJÀ récompensée (au retour d'OAuth). */
const REWARDED = '7a1c3e5f-2b4d-4e6f-8a1b-3c5d7e9f1a2b';
/** Ne joue que dans un AUTRE espace : hors audience. */
const ELSEWHERE = '2e4f6a8c-1b3d-4f5e-9a7b-6c8d0e2f4a6b';

const BNET = {
  [ROSTER]: '1000000001',
  [COLLECTOR]: '1000000002',
  [REWARDED]: '1000000003',
  [ELSEWHERE]: '1000000004',
  [VICTIM]: '1000000005',
};

let _n = 0;
function makeReq(method: 'GET' | 'POST') {
  _n += 1;
  return {
    method,
    headers: {
      host: 'h',
      authorization: `Bearer t-${_n}`,
      'x-real-ip': `10.1.0.${_n % 250}`,
    },
    cookies: {},
    query: {},
    body: {},
  } as any;
}

function makeRes(): any {
  const res: any = { statusCode: 200, headers: {} as Record<string, unknown> };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

async function call(method: 'GET' | 'POST') {
  const res = makeRes();
  await handler(makeReq(method), res);
  return res;
}

function seedStaff(role: 'owner' | 'admin' | 'caster' = 'admin') {
  store.staff = [
    {
      id: STAFF_ROW,
      auth_user_id: STAFF_AUTH,
      email: 'staff@example.com',
      role,
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      is_pole_admin: false,
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: STAFF_ROW, role, created_at: '2026-01-01' },
  ] as any;
  setAuthUser({ id: STAFF_AUTH });
  invalidateStaffCache();
}

function seedWorld() {
  store.user_battlenet_links = Object.entries(BNET).map(([user, bnet]) => ({
    auth_user_id: user,
    battle_net_id: bnet,
    battle_tag: 'Player#1234',
  })) as any;
  store.team_members = [
    {
      id: 'tm-1',
      tenant_id: TENANT,
      user_id: ROSTER,
      team_id: 't-1',
      accepted_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'tm-2',
      tenant_id: TENANT,
      user_id: REWARDED,
      team_id: 't-1',
      accepted_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'tm-3',
      tenant_id: OTHER_TENANT,
      user_id: ELSEWHERE,
      team_id: 't-9',
      accepted_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
  store.tcg_wallets = [
    { tenant_id: TENANT, user_id: COLLECTOR, balance: 25 },
    { tenant_id: OTHER_TENANT, user_id: ELSEWHERE, balance: 0 },
    { tenant_id: TENANT, user_id: VICTIM, balance: 1 },
  ] as any;
  store.tcg_wallet_entries = [
    {
      id: 'e0000000-0000-4000-8000-000000000002',
      tenant_id: TENANT,
      user_id: COLLECTOR,
      amount: 25,
      source_kind: 'twitch_drop',
      source_ref: 'live-1',
      created_at: '2026-09-14T20:00:00.000Z',
    },
    {
      id: 'e0000000-0000-4000-8000-000000000003',
      tenant_id: TENANT,
      user_id: VICTIM,
      amount: 1,
      source_kind: 'admin_grant',
      source_ref: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      created_at: '2026-09-15T07:00:00.000Z',
    },
    {
      id: 'e0000000-0000-4000-8000-000000000001',
      tenant_id: TENANT,
      user_id: REWARDED,
      amount: BATTLENET_VERIFIED_COINS,
      source_kind: 'battlenet_verified',
      source_ref: battlenetRewardSourceRef(BNET[REWARDED]),
      created_at: '2026-09-15T08:00:00.000Z',
    },
  ] as any;
  store.user_discord_links = [
    { auth_user_id: ROSTER, discord_user_id: '123456789012345678' },
  ] as any;
}

const battlenetEntries = () =>
  ((store.tcg_wallet_entries ?? []) as any[]).filter(
    (e) => e.source_kind === 'battlenet_verified'
  );

beforeEach(() => {
  resetSupabaseMock();
  vi.mocked(logStaffAction).mockClear();
  vi.restoreAllMocks();
  delete process.env.BOT_WEBHOOK_URL;
  seedStaff();
  seedWorld();
});

describe('GET — simulation', () => {
  it('annonce l’audience de l’espace sans rien écrire', async () => {
    const before = JSON.stringify(store.tcg_wallet_entries);
    const res = await call('GET');

    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.body).toEqual({
      eligible: 3,
      alreadyRewarded: 1,
      wouldGrant: 2,
      // ROSTER est reliée à Discord, COLLECTOR non.
      discordDms: 1,
      // ELSEWHERE, et VICTIM malgré son porte-monnaie né d'un `admin_grant`.
      outsideSpace: 2,
      ready: true,
      reward: { coins: BATTLENET_VERIFIED_COINS },
    });
    expect(JSON.stringify(store.tcg_wallet_entries)).toBe(before);
    expect(store.bot_event_outbox ?? []).toHaveLength(0);
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  it('lit les liens au-delà de 1000 (PostgREST coupe à 1000)', async () => {
    const many = Array.from({ length: 1005 }, (_, i) => {
      const hex = i.toString(16).padStart(12, '0');
      return `aaaaaaaa-0000-4000-8000-${hex}`;
    });
    store.user_battlenet_links = many.map((user, i) => ({
      auth_user_id: user,
      battle_net_id: `2${String(i).padStart(9, '0')}`,
      battle_tag: 'P#1',
    })) as any;
    store.team_members = many.map((user, i) => ({
      id: `tm-${i}`,
      tenant_id: TENANT,
      user_id: user,
      team_id: 't-1',
      accepted_at: '2026-01-01T00:00:00.000Z',
    })) as any;
    store.tcg_wallet_entries = [];

    const res = await call('GET');

    expect(res.statusCode).toBe(200);
    expect(res.body.eligible).toBe(1005);
    expect(res.body.wouldGrant).toBe(1005);
  });

  it('une audience illisible rend 500, jamais « 0 compte »', async () => {
    const original = supabaseAdmin.from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin, 'from').mockImplementation(((table: string) => {
      const builder = original(table) as any;
      if (table === 'team_members') {
        builder.then = (resolve: (r: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: 'boom' } }).then(
            resolve
          );
      }
      return builder;
    }) as any);

    const res = await call('GET');

    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('AUDIENCE_UNREADABLE');
  });
});

describe('POST — distribution', () => {
  it('crédite l’audience une fois, journalise, et annonce', async () => {
    const res = await call('POST');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      eligible: 3,
      granted: 2,
      already: 1,
      errors: 0,
      reward: { coins: BATTLENET_VERIFIED_COINS },
    });

    const credited = battlenetEntries()
      .map((e) => e.user_id)
      .sort();
    expect(credited).toEqual([COLLECTOR, REWARDED, ROSTER].sort());
    for (const entry of battlenetEntries()) {
      expect(entry.tenant_id).toBe(TENANT);
      expect(entry.amount).toBe(BATTLENET_VERIFIED_COINS);
    }

    // Un événement par personne créditée par CET appel.
    const events = ((store.bot_event_outbox ?? []) as any[]).filter(
      (row) =>
        row.event_name === 'tcg.reward_granted' ||
        row.payload?.event === 'tcg.reward_granted'
    );
    expect(events).toHaveLength(2);

    expect(logStaffAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tcg_battlenet_backfill',
        entity_type: 'tenant',
        entity_id: TENANT,
        tenant_id: TENANT,
        payload: {
          eligible: 3,
          granted: 2,
          already: 1,
          errors: 0,
          coins: BATTLENET_VERIFIED_COINS,
        },
      })
    );
  });

  it('relancer ne recrédite personne', async () => {
    await call('POST');
    const afterFirst = battlenetEntries().length;

    const res = await call('POST');

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ granted: 0, already: 3, errors: 0 });
    expect(battlenetEntries()).toHaveLength(afterFirst);
  });

  it('ne crédite jamais un compte hors de l’espace', async () => {
    await call('POST');
    expect(battlenetEntries().some((e) => e.user_id === ELSEWHERE)).toBe(false);
  });

  it('SCÉNARIO D’ATTAQUE : un porte-monnaie né d’un `admin_grant` ne livre pas la récompense unique', async () => {
    // AVANT : `tcg_wallets` suffisait à rattacher. L'owner d'un espace tiers
    // créditait +1 pièce à VICTIM (qui joue ailleurs), puis lançait ce
    // rattrapage : la récompense Battle.net de VICTIM — une fois par personne,
    // tous espaces confondus — était consommée ICI, et son espace ne pourrait
    // plus jamais la lui verser. APRÈS : ignorée.
    const res = await call('POST');
    expect(res.statusCode).toBe(200);
    expect(battlenetEntries().some((e) => e.user_id === VICTIM)).toBe(false);
  });

  it('une audience illisible n’écrit rien', async () => {
    const original = supabaseAdmin.from.bind(supabaseAdmin);
    let entriesCalls = 0;
    vi.spyOn(supabaseAdmin, 'from').mockImplementation(((table: string) => {
      const builder = original(table) as any;
      // La PREMIÈRE lecture du registre est celle du rattachement (gains réels).
      if (table === 'tcg_wallet_entries' && ++entriesCalls === 1) {
        builder.then = (resolve: (r: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: 'boom' } }).then(
            resolve
          );
      }
      return builder;
    }) as any);

    const res = await call('POST');

    expect(res.statusCode).toBe(500);
    expect(battlenetEntries()).toHaveLength(1);
    expect(logStaffAction).not.toHaveBeenCalled();
  });
});

describe('accès', () => {
  it('403 sans `manage_tcg`, et rien n’est écrit', async () => {
    seedStaff('caster');

    const get = await call('GET');
    const post = await call('POST');

    expect(get.statusCode).toBe(403);
    expect(post.statusCode).toBe(403);
    expect(battlenetEntries()).toHaveLength(1);
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  it('405 avec `Allow: GET, POST` sur une autre méthode', async () => {
    const res = makeRes();
    await handler({ ...makeReq('GET'), method: 'DELETE' }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET, POST');
  });
});

describe('modèle de la carte', () => {
  const sim = {
    eligible: 3,
    alreadyRewarded: 1,
    wouldGrant: 2,
    discordDms: null,
    outsideSpace: 1,
    ready: true,
    reward: { coins: 100 },
  };

  it('récapitule nombre, montant, total et DM pour la confirmation', () => {
    expect(confirmFigures(sim)).toEqual({
      count: 2,
      coins: 100,
      total: 200,
      dms: null,
    });
  });

  it('n’arme le bouton que s’il y a à créditer ET que la source est prête', () => {
    expect(canDistribute(sim)).toBe(true);
    expect(canDistribute({ ...sim, wouldGrant: 0 })).toBe(false);
    expect(canDistribute({ ...sim, ready: false })).toBe(false);
    expect(canDistribute(null)).toBe(false);
  });

  it('garde `null` pour un nombre de DM non mesurable, jamais zéro', () => {
    expect(normalizeBackfillSimulation(sim)?.discordDms).toBeNull();
    expect(
      normalizeBackfillSimulation({ ...sim, discordDms: 4 })?.discordDms
    ).toBe(4);
  });

  it('refuse une réponse aberrante plutôt que d’armer le bouton', () => {
    expect(normalizeBackfillSimulation(null)).toBeNull();
    expect(normalizeBackfillSimulation({ ...sim, wouldGrant: -1 })).toBeNull();
    expect(normalizeBackfillSimulation({ ...sim, reward: {} })).toBeNull();
    expect(normalizeBackfillReport({ granted: 'deux' })).toBeNull();
  });

  it('dit « partiel » dès qu’une écriture échoue, même si d’autres ont réussi', () => {
    const base = {
      eligible: 3,
      granted: 2,
      already: 0,
      errors: 0,
      reward: { coins: 100 },
    };
    expect(backfillOutcome(base)).toBe('granted');
    expect(backfillOutcome({ ...base, errors: 1 })).toBe('partial');
    expect(backfillOutcome({ ...base, granted: 0, already: 3 })).toBe(
      'nothing'
    );
  });
});
