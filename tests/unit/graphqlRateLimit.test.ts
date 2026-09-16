// tests/unit/graphqlRateLimit.test.ts
//
// Limite de débit de `POST /api/graphql` (pages/api/graphql.ts).
//
// Avant : aucune limite applicative (le commentaire renvoyait à « l'infra », qui
// n'en posait pas), sur un endpoint anonyme à profondeur 8. On vérifie ici :
//   - qu'elle est GÉNÉREUSE : les overlays qui sondent en continu ne doivent
//     jamais la sentir ;
//   - qu'un 429 garde le format GraphQL (`errors[].extensions.code`) et pose
//     `Retry-After` — un client GraphQL ne lit pas le `{ error }` du REST ;
//   - que la requête refusée n'atteint pas yoga.
//
// Le limiteur est le VRAI (`applyRateLimit`), démocké : le setup global le
// neutralise pour toutes les autres suites.

import { describe, expect, it, vi } from 'vitest';

vi.unmock('@/utils/rateLimit');

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import graphqlHandler, {
  GRAPHQL_RATE_LIMIT,
  rejectIfGraphQLRateLimited,
} from '../../pages/api/graphql';

let ipCounter = 0;
/** Une IP neuve par test : le compteur en mémoire est partagé par le module. */
function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

function makeReq(ip: string): any {
  return {
    method: 'POST',
    headers: { 'x-nf-client-connection-ip': ip },
    socket: { remoteAddress: ip },
  };
}

function makeRes(): any {
  const res: any = {
    statusCode: 200,
    body: undefined,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

describe('limite de débit GraphQL', () => {
  it('est généreuse : 600 requêtes/min par IP, fenêtre d’une minute', () => {
    // Un overlay toutes les 2 s = 30/min : 20 overlays derrière une même IP
    // doivent passer. Baisser la valeur doit être un choix, pas un accident.
    expect(GRAPHQL_RATE_LIMIT.windowMs).toBe(60_000);
    expect(GRAPHQL_RATE_LIMIT.max).toBeGreaterThanOrEqual(600);
  });

  it('laisse passer tout le budget, puis répond 429 au format GraphQL avec Retry-After', () => {
    const ip = freshIp();
    for (let i = 0; i < GRAPHQL_RATE_LIMIT.max; i += 1) {
      const res = makeRes();
      expect(rejectIfGraphQLRateLimited(makeReq(ip), res)).toBe(false);
      // Rien d'écrit tant que la requête passe : c'est yoga qui répondra.
      expect(res.body).toBeUndefined();
      expect(res.headers).toEqual({});
    }

    const res = makeRes();
    expect(rejectIfGraphQLRateLimited(makeReq(ip), res)).toBe(true);
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe('60');
    expect(res.body).toEqual({
      errors: [
        {
          message: expect.any(String),
          extensions: {
            code: 'RATE_LIMITED',
            retryAfterSec: 60,
            limit: GRAPHQL_RATE_LIMIT.max,
          },
        },
      ],
    });
    // Pas le corps REST du limiteur.
    expect(res.body.error).toBeUndefined();
  });

  it('compte par IP : une autre IP n’est pas pénalisée', () => {
    const noisy = freshIp();
    for (let i = 0; i <= GRAPHQL_RATE_LIMIT.max; i += 1) {
      rejectIfGraphQLRateLimited(makeReq(noisy), makeRes());
    }
    expect(rejectIfGraphQLRateLimited(makeReq(noisy), makeRes())).toBe(true);
    expect(rejectIfGraphQLRateLimited(makeReq(freshIp()), makeRes())).toBe(
      false
    );
  });

  it('le handler exporté applique la limite avant yoga', async () => {
    const ip = freshIp();
    for (let i = 0; i < GRAPHQL_RATE_LIMIT.max; i += 1) {
      rejectIfGraphQLRateLimited(makeReq(ip), makeRes());
    }
    // Requête-témoin sans corps lisible : si yoga était appelé, il ne pourrait
    // pas produire ce 429 GraphQL.
    const res = makeRes();
    await graphqlHandler(makeReq(ip), res);
    expect(res.statusCode).toBe(429);
    expect(res.body.errors[0].extensions.code).toBe('RATE_LIMITED');
    expect(res.headers['Retry-After']).toBe('60');
  });
});
