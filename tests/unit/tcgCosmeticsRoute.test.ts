// /api/player/tcg/cosmetics — acheter (POST) et poser (PUT).
//
// LE CŒUR DU LOT EST LA SÉPARATION DES DEUX VERBES. Acheter fait payer, une
// fois ; poser ne fait JAMAIS payer. Si un jour PUT prélevait, chaque essai
// d'habillage coûterait — et personne n'essaierait, ce qui viderait le débit de
// son objet. Ces cas le figent.
//
// L'autre bord est `already_owned` : prélever deux fois pour un objet qu'on ne
// peut posséder qu'une est la façon la plus sûre de perdre la confiance dans
// une monnaie, et ça ne laisse aucune trace visible ailleurs que dans un solde.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setRpcResult,
  rpcCalls,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/player/tcg/cosmetics';
import { COSMETICS } from '../../utils/tcg/cosmetics';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const ME = 'user-me';
const FRAME = COSMETICS.find((c) => c.kind === 'frame')!;
const BACKGROUND = COSMETICS.find((c) => c.kind === 'background')!;

function makeReq(method: string, body: unknown = {}): any {
  return {
    method,
    headers: { host: 'h', authorization: 'Bearer t' },
    cookies: {},
    query: {},
    body,
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

function seed(over: Partial<Record<string, unknown>> = {}) {
  store.tcg_showcases = [
    {
      tenant_id: TENANT,
      user_id: ME,
      enabled: false,
      subject_keys: [],
      frame: null,
      background: null,
      unlocked_cosmetics: [],
      ...over,
    },
  ] as never;
  store.tcg_wallet_entries = [
    {
      tenant_id: TENANT,
      user_id: ME,
      amount: 100_000,
      source_kind: 'match_win',
      source_ref: 'm1',
    },
  ] as never;
}

function showcase() {
  return (store.tcg_showcases as any[])[0];
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: ME });
  seed();
  setRpcResult('tcg_buy_cosmetic', { data: { ok: true, balance: 42 } });
});

describe('GET — l’état et le catalogue', () => {
  it('rend le catalogue avec l’état, pour que l’écran ne le duplique pas', async () => {
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).catalog).toHaveLength(COSMETICS.length);
    expect((res.body as any).owned).toEqual([]);
  });
});

describe('POST — acheter', () => {
  it('achète au prix du catalogue', async () => {
    const res = makeRes();
    await handler(makeReq('POST', { key: FRAME.key }), res);

    expect(res.statusCode).toBe(201);
    const call = rpcCalls.find((c) => c.fn === 'tcg_buy_cosmetic');
    expect((call!.params as any).p_price).toBe(FRAME.priceCoins);
    expect((call!.params as any).p_key).toBe(FRAME.key);
  });

  it('REFUSE un second achat, sans appeler la transaction', async () => {
    seed({ unlocked_cosmetics: [FRAME.key] });
    const res = makeRes();
    await handler(makeReq('POST', { key: FRAME.key }), res);

    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('already_owned');
    expect(rpcCalls.filter((c) => c.fn === 'tcg_buy_cosmetic')).toHaveLength(0);
  });

  it('refuse un solde insuffisant sans appeler la transaction', async () => {
    store.tcg_wallet_entries = [
      {
        tenant_id: TENANT,
        user_id: ME,
        amount: FRAME.priceCoins - 1,
        source_kind: 'match_win',
        source_ref: 'm1',
      },
    ] as never;
    const res = makeRes();
    await handler(makeReq('POST', { key: FRAME.key }), res);

    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('insufficient_funds');
    expect(rpcCalls.filter((c) => c.fn === 'tcg_buy_cosmetic')).toHaveLength(0);
  });

  it('traduit la course entre deux onglets en refus lisible', async () => {
    setRpcResult('tcg_buy_cosmetic', {
      error: { message: 'cosmetic_already_owned' },
    });
    const res = makeRes();
    await handler(makeReq('POST', { key: FRAME.key }), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('already_owned');
  });

  it('refuse une clé hors catalogue en 400', async () => {
    const res = makeRes();
    await handler(makeReq('POST', { key: 'frame_or_massif' }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('PUT — poser, et ne jamais faire payer', () => {
  it('pose un habillage acheté SANS aucun débit', async () => {
    // LE CAS CENTRAL : changer d'habillage est gratuit. Si ce test tombe parce
    // qu'un débit est apparu, c'est tout le lot qui perd son sens.
    seed({ unlocked_cosmetics: [FRAME.key, BACKGROUND.key] });
    const res = makeRes();
    await handler(
      makeReq('PUT', { frame: FRAME.key, background: BACKGROUND.key }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(showcase().frame).toBe(FRAME.key);
    expect(showcase().background).toBe(BACKGROUND.key);
    expect(rpcCalls.filter((c) => c.fn === 'tcg_buy_cosmetic')).toHaveLength(0);
    // Aucune écriture au registre : le solde n'a pas bougé.
    expect((store.tcg_wallet_entries as any[]).length).toBe(1);
  });

  it('accepte le retrait, même sans rien posséder', async () => {
    seed({ frame: FRAME.key, unlocked_cosmetics: [FRAME.key] });
    const res = makeRes();
    await handler(makeReq('PUT', { frame: null }), res);

    expect(res.statusCode).toBe(200);
    expect(showcase().frame).toBeNull();
  });

  it('refuse de poser un habillage non acheté', async () => {
    const res = makeRes();
    await handler(makeReq('PUT', { frame: FRAME.key }), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('not_unlocked');
  });

  it('refuse un fond dans l’emplacement du cadre', async () => {
    seed({ unlocked_cosmetics: [BACKGROUND.key] });
    const res = makeRes();
    await handler(makeReq('PUT', { frame: BACKGROUND.key }), res);
    expect(res.statusCode).toBe(409);
  });

  it('refuse un corps qui ne demande rien', async () => {
    const res = makeRes();
    await handler(makeReq('PUT', {}), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('méthode', () => {
  it('refuse un DELETE', async () => {
    const res = makeRes();
    await handler(makeReq('DELETE'), res);
    expect(res.statusCode).toBe(405);
  });
});
