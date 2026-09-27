// POST /api/player/tcg/forge — l'endpoint de la forge.
//
// Le module PUR est couvert à part (`tcgForgeRules.test.ts`) : ici on vérifie
// ce que le pur ne peut pas voir — que rien n'est débité avant d'être sûr, que
// le sujet forgé est bien absent de la collection, et que les refus levés par
// la TRANSACTION (une carte consommée entre-temps, un solde qui a bougé)
// remontent en refus lisibles plutôt qu'en 500.
//
// LE CAS QUI COMPTE LE PLUS : `pool_exhausted`. Si le vivier ne peut rien
// offrir, le refus doit arriver AVANT la transaction — sinon on prélève des
// pièces et on détruit trois cartes pour ne rien rendre.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const { readPlayerBadges } = vi.hoisted(() => ({
  readPlayerBadges: vi.fn(),
}));
vi.mock('@/utils/rating/readPlayerBadges', () => ({ readPlayerBadges }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setRpcResult,
  rpcCalls,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/player/tcg/forge';
import { FORGE_FEE_COINS } from '../../utils/tcg/economy';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const ME = 'user-me';
/** Sujets que je possède en double : ce sont eux qu'on forge. */
const DUPES = ['subj-a', 'subj-b', 'subj-c'];
/** Joueuse du vivier, `rare`, que je ne possède pas : la cible attendue. */
const TARGET = 'user-target';

function makeReq(cards: { packId: string; position: number }[]): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: 'Bearer t' },
    cookies: {},
    query: {},
    body: { cards },
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

/** Deux exemplaires de chacun des trois sujets, tous `common` et ouverts. */
function seedCollection() {
  store.tcg_packs = DUPES.flatMap((_, i) => [
    {
      id: `pack-${i}-0`,
      tenant_id: TENANT,
      user_id: ME,
      opened_at: '2026-09-01T00:00:00.000Z',
      source_kind: 'victory',
    },
    {
      id: `pack-${i}-1`,
      tenant_id: TENANT,
      user_id: ME,
      opened_at: '2026-09-01T00:00:00.000Z',
      source_kind: 'victory',
    },
  ]) as never;

  store.tcg_pack_cards = DUPES.flatMap((subject, i) =>
    [0, 1].map((copy) => ({
      pack_id: `pack-${i}-${copy}`,
      position: 0,
      subject_kind: 'player',
      card_user_id: subject,
      card_team_id: null,
      card_map_slug: null,
      card_fanart_id: null,
      card_mascot_slug: null,
      rarity: 'common',
      is_foil: false,
      recycled_at: null,
    }))
  ) as never;

  // Un solde suffisant, écrit au registre — c'est lui qui fait foi.
  store.tcg_wallet_entries = [
    {
      tenant_id: TENANT,
      user_id: ME,
      amount: FORGE_FEE_COINS + 100,
      source_kind: 'match_win',
      source_ref: 'm1',
    },
  ] as never;

  // Le vivier : mes trois sujets, plus la cible que je n'ai pas.
  store.player_ratings = [...DUPES, TARGET].map((id) => ({
    tenant_id: TENANT,
    user_id: id,
  })) as never;
  store.teams = [] as never;
}

/** La sélection nominale : un exemplaire de chaque sujet. */
const NOMINAL = DUPES.map((_, i) => ({ packId: `pack-${i}-0`, position: 0 }));

beforeEach(() => {
  resetSupabaseMock();
  readPlayerBadges.mockReset();
  setAuthUser({ id: ME });
  seedCollection();
  // TARGET est `rare` (un badge argent) ; mes sujets restent `common`.
  readPlayerBadges.mockResolvedValue(
    new Map<string, unknown[]>([
      [TARGET, [{ key: 'veteran', tier: 'silver' }]],
      ...DUPES.map((id) => [id, []] as [string, unknown[]]),
    ])
  );
  setRpcResult('tcg_forge_card', {
    data: { ok: true, packId: 'pack-forged', rarity: 'rare', balance: 100 },
  });
});

describe('POST /api/player/tcg/forge', () => {
  it('forge, et passe à la transaction les cartes et le sujet choisi', async () => {
    const res = makeRes();
    await handler(makeReq(NOMINAL), res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ packId: 'pack-forged', rarity: 'rare' });
    // Le sujet rendu est bien celui que je ne possédais pas.
    expect((res.body as any).userId).toBe(TARGET);

    const call = rpcCalls.find((c) => c.fn === 'tcg_forge_card');
    expect(call).toBeTruthy();
    const params = call!.params as Record<string, unknown>;
    expect(params.p_fee).toBe(FORGE_FEE_COINS);
    expect(params.p_rarity).toBe('rare');
    expect(params.p_card_user_id).toBe(TARGET);
    expect(params.p_cards).toHaveLength(3);
  });

  it('refuse AVANT la transaction quand le vivier n’offre rien', async () => {
    // LE CAS QUI COMPTE : sans ce refus, on prélèverait des pièces et on
    // détruirait trois cartes pour ne rien rendre.
    readPlayerBadges.mockResolvedValue(
      new Map<string, unknown[]>(
        [...DUPES, TARGET].map((id) => [id, []] as [string, unknown[]])
      )
    );

    const res = makeRes();
    await handler(makeReq(NOMINAL), res);

    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('pool_exhausted');
    expect(rpcCalls.filter((c) => c.fn === 'tcg_forge_card')).toHaveLength(0);
  });

  it('ne forge pas si les badges sont illisibles', async () => {
    // Sans badges on ne distingue plus les raretés : rendre une `common` à
    // quelqu'un qui vient de payer pour mieux serait pire que de refuser.
    readPlayerBadges.mockRejectedValue(new Error('boom'));

    const res = makeRes();
    await handler(makeReq(NOMINAL), res);

    expect(res.statusCode).toBe(409);
    expect(rpcCalls.filter((c) => c.fn === 'tcg_forge_card')).toHaveLength(0);
  });

  it('refuse un solde insuffisant sans appeler la transaction', async () => {
    store.tcg_wallet_entries = [
      {
        tenant_id: TENANT,
        user_id: ME,
        amount: FORGE_FEE_COINS - 1,
        source_kind: 'match_win',
        source_ref: 'm1',
      },
    ] as never;

    const res = makeRes();
    await handler(makeReq(NOMINAL), res);

    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('insufficient_funds');
    expect(rpcCalls.filter((c) => c.fn === 'tcg_forge_card')).toHaveLength(0);
  });

  it('traduit un refus de la transaction en refus lisible', async () => {
    // Entre la lecture et l'écriture, une autre requête a consommé la carte.
    setRpcResult('tcg_forge_card', {
      error: { message: 'forge_cards_unavailable' },
    });

    const res = makeRes();
    await handler(makeReq(NOMINAL), res);

    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('already_used');
  });

  it('refuse un corps mal formé', async () => {
    const res = makeRes();
    await handler(makeReq([]), res);
    expect(res.statusCode).toBe(400);
  });

  it('refuse une méthode autre que POST', async () => {
    const res = makeRes();
    await handler({ ...makeReq(NOMINAL), method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
  });
});
