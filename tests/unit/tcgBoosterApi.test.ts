// tests/unit/tcgBoosterApi.test.ts
//
// POST /api/player/tcg/booster — la seule route du TCG qui DÉBITE une joueuse.
//
// CE QUE CES CAS PROTÈGENT (refonte du 2026-09-15, audit de sécurité).
//
//   1. PLUS D'ACHAT EN PLUSIEURS REQUÊTES. L'ancienne route débitait le cache,
//      créait le paquet, puis écrivait au registre : trois transactions. Un
//      recalcul du solde intercalé (gain, recyclage, autre achat) écrasait le
//      débit, et trois achats rapides en livraient trois pour le prix de deux.
//      L'achat passe désormais par UNE fonction SQL (`tcg_purchase_booster`) ;
//      le cas « la route n'écrit plus elle-même paquet, registre ni cache » est
//      donc le garde-fou central : le réintroduire rouvrirait la course.
//
//   2. LE MOCK N'EXÉCUTE PAS LE SQL. La route est testée contre les réponses
//      de la fonction (`setRpcResult`) : chaque issue garde son code HTTP. Ce
//      que la fonction garantit (verrou, contrôle du solde par SUM, paquet et
//      registre dans la même transaction) est vérifié par LECTURE de la
//      migration dans `tcgWalletAtomicSql.test.ts`.
//
//   3. MIGRATION ABSENTE : ON REFUSE. Jamais un achat sans verrou (503).
//
//   4. LE BARÈME VIENT DE `utils/tcg/economy.ts` : aucun montant en dur ici.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setRpcResult,
  rpcCalls,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { BOOSTER_PRICE_COINS } from '../../utils/tcg/economy';

import handler from '../../pages/api/player/tcg/booster';

const PLAYER = '11111111-1111-4111-8111-111111111111';
const PACK = 'a0000000-0000-4000-8000-000000000001';

let _token = 0;
function makeReq(over: Partial<Record<string, unknown>> = {}): any {
  _token += 1;
  return {
    method: 'POST',
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

async function buy() {
  const res = makeRes();
  await handler(makeReq(), res);
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: PLAYER });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/player/tcg/booster — refus', () => {
  it('refuse une méthode non autorisée, sans appeler la base', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
    expect(rpcCalls).toHaveLength(0);
  });

  it('400 insufficient_funds avec le solde RELU SOUS VERROU et le prix', async () => {
    setRpcResult('tcg_purchase_booster', {
      data: {
        status: 'insufficient_funds',
        balance: BOOSTER_PRICE_COINS - 1,
        price: BOOSTER_PRICE_COINS,
      },
    });

    const res = await buy();

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'insufficient_funds',
      balance: BOOSTER_PRICE_COINS - 1,
      price: BOOSTER_PRICE_COINS,
    });
  });
});

describe('POST /api/player/tcg/booster — achat', () => {
  it('appelle `tcg_purchase_booster` avec le tenant, la joueuse et le prix du barème', async () => {
    setRpcResult('tcg_purchase_booster', {
      data: {
        status: 'ok',
        pack_id: PACK,
        balance: 0,
        price: BOOSTER_PRICE_COINS,
      },
    });

    const res = await buy();

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ packId: PACK, price: BOOSTER_PRICE_COINS });
    expect(rpcCalls).toEqual([
      {
        fn: 'tcg_purchase_booster',
        params: {
          p_tenant_id: DEFAULT_TENANT_ID,
          p_user_id: PLAYER,
          p_price: BOOSTER_PRICE_COINS,
        },
      },
    ]);
  });

  it('GARDE-FOU DE LA COURSE : la route n’écrit plus elle-même ni cache, ni paquet, ni registre', async () => {
    // AVANT : `tcg_wallets.update` (débit du cache) → `tcg_packs.insert` →
    // `tcg_wallet_entries.insert` → `refreshBalance`, quatre requêtes et autant
    // de fenêtres pour un recalcul concurrent. Toute réécriture de ce chemin
    // hors de la fonction SQL rouvrirait « 3 boosters pour le prix de 2 ».
    setRpcResult('tcg_purchase_booster', {
      data: {
        status: 'ok',
        pack_id: PACK,
        balance: 0,
        price: BOOSTER_PRICE_COINS,
      },
    });
    const touched: string[] = [];
    const real = supabaseAdmin.from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      touched.push(table);
      return real(table);
    });

    await buy();

    expect(touched).not.toContain('tcg_wallets');
    expect(touched).not.toContain('tcg_packs');
    expect(touched).not.toContain('tcg_wallet_entries');
    expect(store.tcg_packs ?? []).toHaveLength(0);
  });
});

describe('POST /api/player/tcg/booster — issues dégradées', () => {
  it('migration absente (PGRST202) : 503 purchase_unavailable, jamais un achat sans verrou', async () => {
    setRpcResult('tcg_purchase_booster', {
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.tcg_purchase_booster',
      },
    });
    const writes: string[] = [];
    const real = supabaseAdmin.from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      writes.push(table);
      return real(table);
    });

    const res = await buy();

    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('purchase_unavailable');
    // Aucun repli sur l'ancien chemin en plusieurs requêtes.
    expect(writes).toHaveLength(0);
  });

  it('signature introuvable côté Postgres (42883) : même refus', async () => {
    setRpcResult('tcg_purchase_booster', {
      error: { code: '42883', message: 'function does not exist' },
    });
    const res = await buy();
    expect(res.statusCode).toBe(503);
  });

  it('verrou non obtenu (55P03) : 409 balance_changed, réessayer est sûr', async () => {
    setRpcResult('tcg_purchase_booster', {
      error: { code: '55P03', message: 'could not obtain lock' },
    });
    const res = await buy();
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('balance_changed');
  });

  it('panne (504) : 500, et RIEN à rembourser ni à supprimer', async () => {
    // AVANT : un 504 après la création du paquet déclenchait un « remboursement »
    // par recalcul, et le paquet — peut-être déjà committé — restait gratuit.
    // Une transaction est tout ou rien : la route ne tente plus aucune reprise.
    setRpcResult('tcg_purchase_booster', {
      error: { message: '504 upstream timeout' },
    });
    const touched: string[] = [];
    const real = supabaseAdmin.from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      touched.push(table);
      return real(table);
    });

    const res = await buy();

    expect(res.statusCode).toBe(500);
    expect(touched).toHaveLength(0);
  });

  it('réponse inattendue : 500, jamais un faux succès', async () => {
    setRpcResult('tcg_purchase_booster', { data: { status: 'ok' } });
    const res = await buy();
    expect(res.statusCode).toBe(500);
  });
});
