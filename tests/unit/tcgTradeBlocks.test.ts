// /api/player/tcg/trades/blocks — « ne plus recevoir de proposition d'elle ».
//
// CE QUE CES CAS PROTÈGENT. C'est une protection, pas un réglage de confort :
// les erreurs coûteuses sont celles qui FUITENT (dire à la personne bloquée
// qu'elle l'est, ou permettre de deviner qui l'est) et celles qui RATIONNENT
// (un plafond, un 409 sur un re-blocage qui obligerait l'écran à gérer un cas
// pour rien).
//
// Le refus lui-même vit dans `tcg_propose_trade`, avec les autres invariants
// de l'échange : il rend `recipient_unavailable`, indistinguable d'une
// destinataire qui n'accepte pas les échanges.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/player/tcg/trades/blocks';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const ME = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const HER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

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

function blocks() {
  return (store.tcg_trade_blocks as any[]) ?? [];
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: ME });
  store.tcg_trade_blocks = [] as never;
});

describe('POST — bloquer', () => {
  it('enregistre un blocage ORIENTÉ', async () => {
    const res = makeRes();
    await handler(makeReq('POST', { userId: HER }), res);

    expect(res.statusCode).toBe(201);
    expect(blocks()).toHaveLength(1);
    // Moi qui bloque, elle qui est bloquée — et pas l'inverse. Un blocage
    // réciproque révélerait la protection à la première tentative.
    expect(blocks()[0].user_id).toBe(ME);
    expect(blocks()[0].blocked_user_id).toBe(HER);
  });

  it('rebloquer réussit en silence, sans doublon', async () => {
    // Un 409 ne dirait rien d'utile : l'état voulu est atteint, et l'écran
    // n'aurait qu'un cas de plus à distinguer pour rien.
    const res1 = makeRes();
    await handler(makeReq('POST', { userId: HER }), res1);
    const res2 = makeRes();
    await handler(makeReq('POST', { userId: HER }), res2);

    expect(res2.statusCode).toBe(201);
    expect(blocks()).toHaveLength(1);
  });

  it('refuse de se bloquer soi-même', async () => {
    const res = makeRes();
    await handler(makeReq('POST', { userId: ME }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('self_block');
    expect(blocks()).toHaveLength(0);
  });

  it('refuse un identifiant qui n’en est pas un', async () => {
    const res = makeRes();
    await handler(makeReq('POST', { userId: 'pas-un-uuid' }), res);
    expect(res.statusCode).toBe(400);
    expect(blocks()).toHaveLength(0);
  });
});

describe('DELETE — débloquer', () => {
  it('retire le blocage', async () => {
    await handler(makeReq('POST', { userId: HER }), makeRes());
    const res = makeRes();
    await handler(makeReq('DELETE', { userId: HER }), res);

    expect(res.statusCode).toBe(200);
    expect(blocks()).toHaveLength(0);
  });

  it('débloquer quelqu’un qui ne l’était pas rend 200', async () => {
    // Compter les lignes pour rendre un 404 ne ferait que confirmer qui était
    // bloqué — à qui saurait poser la question.
    const res = makeRes();
    await handler(makeReq('DELETE', { userId: HER }), res);
    expect(res.statusCode).toBe(200);
  });
});

describe('GET — ma liste', () => {
  it('ne rend QUE mes blocages', async () => {
    store.tcg_trade_blocks = [
      {
        tenant_id: TENANT,
        user_id: ME,
        blocked_user_id: HER,
        created_at: '2026-09-27T00:00:00.000Z',
      },
      // Le blocage de quelqu'un d'autre : il ne me regarde pas, et le rendre
      // dirait à qui sait lire une réponse d'API qui a bloqué qui.
      {
        tenant_id: TENANT,
        user_id: HER,
        blocked_user_id: ME,
        created_at: '2026-09-27T00:00:00.000Z',
      },
    ] as never;

    const res = makeRes();
    await handler(makeReq('GET'), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).blocked).toEqual([
      { userId: HER, since: '2026-09-27T00:00:00.000Z' },
    ]);
  });
});

describe('méthode', () => {
  it('refuse un PUT', async () => {
    const res = makeRes();
    await handler(makeReq('PUT'), res);
    expect(res.statusCode).toBe(405);
  });
});
