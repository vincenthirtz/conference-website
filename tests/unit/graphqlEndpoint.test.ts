// tests/unit/graphqlEndpoint.test.ts
//
// L'ENDPOINT RÉEL `pages/api/graphql.ts`, pas une copie de son câblage.
//
// POURQUOI CE FICHIER. `graphqlSchema.test.ts` construit sa propre instance
// yoga : il couvre les résolveurs, pas ce que l'endpoint AJOUTE — la règle de
// profondeur maximale (garde anti-DoS) branchée par un plugin `onValidate`, et
// le masquage d'introspection. C'est précisément la couche qu'une montée de
// version de `graphql` (16 → 17 le 2026-09-15 : constructeur `GraphQLError`,
// API des règles de validation) peut casser sans qu'aucun résolveur ne rougisse.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import yoga from '../../pages/api/graphql';

async function post(query: string) {
  const res = await yoga.fetch('http://localhost/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return { status: res.status, body: (await res.json()) as any };
}

/** Une sélection imbriquée `depth` fois via `__type { ofType { … } }`. */
function nestedQuery(depth: number): string {
  let inner = 'name';
  for (let i = 0; i < depth; i += 1) inner = `ofType { ${inner} }`;
  return `{ __type(name: "Query") { ${inner} } }`;
}

describe('POST /api/graphql (endpoint réel)', () => {
  it('exécute une requête simple', async () => {
    const { status, body } = await post('{ __typename }');
    expect(status).toBe(200);
    expect(body.errors).toBeUndefined();
    expect(body.data).toEqual({ __typename: 'Query' });
  });

  it('refuse une requête plus profonde que la limite, avec le message dédié', async () => {
    const { body } = await post(nestedQuery(12));
    expect(body.data).toBeUndefined();
    expect(
      (body.errors ?? []).some((e: { message: string }) =>
        /maximum depth/i.test(e.message)
      )
    ).toBe(true);
  });

  it('laisse passer une requête sous la limite', async () => {
    const { body } = await post(nestedQuery(3));
    expect(
      (body.errors ?? []).some((e: { message: string }) =>
        /maximum depth/i.test(e.message)
      )
    ).toBe(false);
  });

  it('rejette une requête syntaxiquement invalide sans fuite de pile', async () => {
    const { body } = await post('{ tournaments( }');
    expect(body.errors?.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toMatch(/at .*\.(ts|js):\d+/);
  });
});
