// tests/unit/graphqlSchema.test.ts
//
// Unit tests for `utils/graphql/schema.ts` — the public GraphQL surface (Lot 4).
// Resolvers carry no new business logic: queries reuse the public read utils
// (anonymous, like the REST public read), mutations require a scoped token.
//
// Executed through a graphql-yoga instance wired exactly like the production
// endpoint (`pages/api/graphql.ts`): the context is built by the real
// `buildGraphQLContext`, which resolves the `Authorization: Bearer pk_live_…`
// token against the (mocked) `tenant_api_tokens` table. Using yoga's `fetch`
// keeps a single `graphql` module instance (a direct `graphql()` call from the
// test hits the CJS/ESM dual-package hazard). `applyMatchScore` is mocked (its
// bracket/discord/rating machinery is covered by its own suites).

import crypto from 'crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createYoga } from 'graphql-yoga';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const { applyMatchScore } = vi.hoisted(() => ({
  applyMatchScore: vi.fn(async (_input: any) => ({
    matchId: _input.matchId,
    updated: true,
    match: {},
    winnerTeamId: '33333333-3333-4333-8333-333333330001',
  })),
}));
vi.mock('@/utils/matches/applyScore', () => ({ applyMatchScore }));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { publicGraphQLSchema } from '../../utils/graphql/schema';
import { buildGraphQLContext } from '../../utils/graphql/context';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const MATCH = '11111111-1111-4111-8111-111111111111';
const TOURN = '22222222-2222-4222-8222-22222222aaaa';
const TEAM1 = '33333333-3333-4333-8333-333333330001';
const TEAM2 = '33333333-3333-4333-8333-333333330002';
const PLAIN_TOKEN = 'pk_live_deadbeefcafebabe0123456789abcdef';

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Seed a `tenant_api_tokens` row so the given scopes resolve from the header.
 * Also seeds a `tenants` row (default plan `foundation`, full access) so the
 * API PLAN gate lets the token through — pass `plan` to exercise the gate.
 */
function seedToken(
  scopes: string[],
  plain = PLAIN_TOKEN,
  plan: {
    plan?: string;
    plan_status?: string;
    plan_expires_at?: string | null;
  } = {},
  comp = false
): string {
  (store.tenant_api_tokens ||= []).push({
    id: 'tok-1',
    tenant_id: TENANT,
    token_hash: sha256Hex(plain),
    token_prefix: plain.slice(0, 16),
    name: 'test',
    scopes,
    revoked_at: null,
    comp,
  });
  const tenants = (store.tenants ||= []);
  if (!tenants.some((r) => r.id === TENANT)) {
    tenants.push({
      id: TENANT,
      plan: plan.plan ?? 'foundation',
      plan_status: plan.plan_status ?? 'active',
      plan_expires_at: plan.plan_expires_at ?? null,
    });
  }
  return plain;
}

// Yoga instance mirroring pages/api/graphql.ts: real context factory.
const yoga = createYoga({
  schema: publicGraphQLSchema,
  context: ({ request }: { request: Request }) =>
    buildGraphQLContext(request.headers.get('authorization')),
  // Do not mask GraphQLError extensions (we assert on `code`).
  maskedErrors: false,
});

async function gql(
  query: string,
  variables?: Record<string, unknown>,
  authHeader?: string
): Promise<any> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (authHeader) headers.authorization = authHeader;
  const res = await yoga.fetch('http://test.local/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

beforeEach(() => {
  resetSupabaseMock();
  applyMatchScore.mockClear();
});

/* ------------------------------------------------------------------ *
 * Query: tournaments (anonymous read — no token)
 * ------------------------------------------------------------------ */

describe('Query.tournaments (anonymous)', () => {
  it('resolves without a token from seeded public tournaments', async () => {
    store.tournaments = [
      {
        id: TOURN,
        tenant_id: TENANT,
        name: 'Summer Cup',
        slug: 'summer-cup',
        game: 'overwatch',
        status: 'running',
        start_date: '2026-07-01',
        end_date: null,
        format: 'single_elim',
      },
      {
        // draft must not surface in the public list
        id: '22222222-2222-4222-8222-22222222bbbb',
        tenant_id: TENANT,
        name: 'Hidden',
        slug: 'hidden',
        status: 'draft',
      },
    ];

    const body = await gql(
      `query { tournaments { items { id name status } count } }`
    );
    expect(body.errors).toBeUndefined();
    const data = body.data.tournaments;
    expect(data.count).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toEqual({
      id: TOURN,
      name: 'Summer Cup',
      status: 'running',
    });
  });

  it('returns an empty list when nothing is seeded', async () => {
    const body = await gql(`query { tournaments { items { id } count } }`);
    expect(body.errors).toBeUndefined();
    expect(body.data.tournaments.count).toBe(0);
    expect(body.data.tournaments.items).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Mutation: reportMatchResult (scope gate)
 * ------------------------------------------------------------------ */

const MUTATION = `
  mutation($id: ID!, $s1: Int!, $s2: Int!) {
    reportMatchResult(matchId: $id, team1Score: $s1, team2Score: $s2) {
      matchId
      status
      winnerTeamId
    }
  }
`;

function seedMatch(over: Record<string, unknown> = {}) {
  (store.matches ||= []).push({
    id: MATCH,
    tenant_id: TENANT,
    status: 'ongoing',
    is_bye: false,
    team1_id: TEAM1,
    team2_id: TEAM2,
    ...over,
  });
}

describe('Mutation.reportMatchResult', () => {
  it('UNAUTHENTICATED when the request carries no token', async () => {
    seedMatch();
    const body = await gql(MUTATION, { id: MATCH, s1: 2, s2: 1 });
    expect(body.data?.reportMatchResult ?? null).toBeNull();
    expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('FORBIDDEN when the token lacks matches:write', async () => {
    const plain = seedToken(['matches:read']);
    seedMatch();
    const body = await gql(
      MUTATION,
      { id: MATCH, s1: 2, s2: 1 },
      `Bearer ${plain}`
    );
    expect(body.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('FORBIDDEN plan_required when the tenant plan lacks apiWrite (discovery)', async () => {
    const plain = seedToken(['matches:write'], PLAIN_TOKEN, {
      plan: 'discovery',
    });
    seedMatch();
    const body = await gql(
      MUTATION,
      { id: MATCH, s1: 2, s2: 1 },
      `Bearer ${plain}`
    );
    expect(body.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    expect(body.errors?.[0]?.extensions?.reason).toBe('plan_required');
    expect(body.errors?.[0]?.extensions?.requiredCapability).toBe('apiWrite');
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('FORBIDDEN plan_required when a regie plan attempts a write (read-only tier)', async () => {
    const plain = seedToken(['matches:write'], PLAIN_TOKEN, { plan: 'regie' });
    seedMatch();
    const body = await gql(
      MUTATION,
      { id: MATCH, s1: 2, s2: 1 },
      `Bearer ${plain}`
    );
    expect(body.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    expect(body.errors?.[0]?.extensions?.reason).toBe('plan_required');
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('comp key bypasses the plan gate: write allowed on a discovery tenant', async () => {
    const plain = seedToken(
      ['matches:write'],
      PLAIN_TOKEN,
      { plan: 'discovery' },
      true
    );
    seedMatch();
    const body = await gql(
      MUTATION,
      { id: MATCH, s1: 2, s2: 1 },
      `Bearer ${plain}`
    );
    expect(body.errors).toBeUndefined();
    expect(applyMatchScore).toHaveBeenCalledTimes(1);
  });

  it('NOT_FOUND for an unknown match with a scoped token', async () => {
    const plain = seedToken(['matches:write']);
    const body = await gql(
      MUTATION,
      { id: MATCH, s1: 2, s2: 1 },
      `Bearer ${plain}`
    );
    expect(body.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('CONFLICT when the match is already finished', async () => {
    const plain = seedToken(['matches:write']);
    seedMatch({ status: 'finished' });
    const body = await gql(
      MUTATION,
      { id: MATCH, s1: 2, s2: 1 },
      `Bearer ${plain}`
    );
    expect(body.errors?.[0]?.extensions?.code).toBe('CONFLICT');
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('BAD_USER_INPUT on out-of-range scores', async () => {
    const plain = seedToken(['matches:write']);
    seedMatch();
    const body = await gql(
      MUTATION,
      { id: MATCH, s1: 100, s2: 1 },
      `Bearer ${plain}`
    );
    expect(body.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('happy path: reaches applyMatchScore and returns the finished payload', async () => {
    const plain = seedToken(['matches:write']);
    seedMatch();
    const body = await gql(
      MUTATION,
      { id: MATCH, s1: 2, s2: 1 },
      `Bearer ${plain}`
    );
    expect(body.errors).toBeUndefined();
    expect(applyMatchScore).toHaveBeenCalledTimes(1);
    expect(applyMatchScore).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        matchId: MATCH,
        team1Score: 2,
        team2Score: 1,
        markFinished: true,
        propagateBracket: true,
      })
    );
    expect(body.data.reportMatchResult).toEqual({
      matchId: MATCH,
      status: 'finished',
      winnerTeamId: TEAM1,
    });
  });
});
