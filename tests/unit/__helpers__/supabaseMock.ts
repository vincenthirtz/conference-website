// In-memory chainable mock of `@/utils/supabase` for unit tests.
//
// Wire it up in a test file like this (the dynamic import inside the factory
// is required because `vi.mock` is hoisted above ordinary imports):
//
//   import { vi } from 'vitest';
//   vi.mock('@/utils/supabase', async () => {
//     const m = await import('./__helpers__/supabaseMock');
//     return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
//   });
//   import { store, resetSupabaseMock, setAuthUser } from './__helpers__/supabaseMock';
//
// Then seed `store.<table>` and (optionally) call `setAuthUser`/`setCookieUser`
// in your test, and `resetSupabaseMock()` from `beforeEach`.

import crypto from 'crypto';

export type Row = Record<string, unknown>;
export type Store = Record<string, Row[]>;

export const store: Store = {};

/**
 * Registry of table names the mock knows about. The chainable Builder creates
 * tables lazily (`store[table] ||= []`), so this list is primarily
 * documentation + a safety net: `resetSupabaseMock()` clears every key present
 * in `store`, and tests can seed any of these. Kept in sync as new tables ship.
 *
 * Rating + leagues feature (7 new tables):
 *   match_participants, player_ratings, player_rating_history, team_ratings,
 *   leagues, league_tournaments, league_standings.
 */
export const KNOWN_TABLES: readonly string[] = [
  // rating / H2H
  'match_participants',
  'player_ratings',
  'player_rating_history',
  'team_ratings',
  // leagues / seasons
  'leagues',
  'league_tournaments',
  'league_standings',
  // profile achievements (palmarès + saisons)
  'final_rankings',
  'tournaments',
  'teams',
  'matches',
  // public/v1 read-only API (overlays, widgets, embeds)
  'games',
  'team_members',
  'tournament_stages',
  // custom registration fields feature
  'tournament_teams',
  'demandes',
];

/**
 * Per-table default columns applied when a row is READ back (select/single/
 * maybeSingle). Mirrors NOT-NULL-with-DEFAULT JSONB columns so both seeded and
 * inserted rows expose the column even when a fixture omits it. A fresh value
 * is produced per read so callers can't mutate shared state.
 *
 * - tournaments.registration_fields  -> [] (field definitions)
 * - tournament_teams.field_values     -> {} (a team's answers)
 */
function tableColumnDefaults(table: string): Row {
  if (table === 'tournaments') return { registration_fields: [] };
  if (table === 'tournament_teams') return { field_values: {} };
  return {};
}

/**
 * Conference tenant UUID — matches `DEFAULT_TENANT_ID` in `utils/tenant.ts`.
 * Bot tests historically authenticated against this tenant via the (now
 * removed) `BOT_API_KEY` env fallback + `x-tenant-id` header. With the new
 * 100%-per-tenant auth, the in-memory `tenant_secrets` table must carry a row
 * whose `bot_api_key_hash` is the sha256 of the test API key.
 */
export const CONFERENCE_TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

/** The plaintext API key every bot test sends via `x-api-key`. */
export const BOT_TEST_API_KEY = 'test-key';

/** Webhook secret seeded alongside the API key (read by botEvents). */
export const BOT_TEST_WEBHOOK_SECRET = 'test-webhook-secret';

/** sha256 hex of a plaintext API key (matches `verifyBotApiKeyMultiTenant`). */
export function hashBotApiKey(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Seed a `tenant_secrets` row so `x-api-key: <apiKey>` resolves to `tenantId`
 * under the new per-tenant-only bot auth. Pushes onto the existing array so
 * multiple tenants can be seeded. Also ensures a matching `tenants` row exists
 * (harmless for routes that no longer check tenant existence).
 *
 * Defaults reproduce the legacy idiom: `'test-key'` → CONFERENCE_TENANT_ID.
 */
export function seedBotAuth(
  opts: {
    /** Seed onto a specific store (defaults to the shared `store`). */
    store?: Store;
    tenantId?: string;
    apiKey?: string;
    webhookSecret?: string;
    /**
     * Also push a `tenants` row for the seeded tenant. Defaults to `true`.
     * Set `false` for onboarding tests that assert on `store.tenants.length`
     * (the per-tenant auth only needs `tenant_secrets`, not a `tenants` row).
     */
    withTenantRow?: boolean;
  } = {}
): { tenantId: string; apiKey: string } {
  const s = opts.store ?? store;
  const tenantId = opts.tenantId ?? CONFERENCE_TENANT_ID;
  const apiKey = opts.apiKey ?? BOT_TEST_API_KEY;
  const webhookSecret = opts.webhookSecret ?? BOT_TEST_WEBHOOK_SECRET;

  (s.tenant_secrets ||= []).push({
    tenant_id: tenantId,
    bot_api_key_hash: hashBotApiKey(apiKey),
    bot_webhook_secret: webhookSecret,
  });
  if (opts.withTenantRow !== false) {
    if (!(s.tenants ||= []).some((r) => r.id === tenantId)) {
      s.tenants.push({ id: tenantId });
    }
  }
  return { tenantId, apiKey };
}

/** Names of tables that .from() has been called with — useful for asserting cache hits. */
export const fromCalls: string[] = [];

/** Mutable auth state — read by `supabaseAdmin.auth.getUser` (Bearer token path). */
let _authUser: unknown = null;
let _authError: unknown = null;

/** Mutable cookie state — read by `getServerClient().auth.getUser` (SSR path). */
let _cookieUser: unknown = null;
let _cookieError: unknown = null;

/**
 * Map<userId, { email, identities? }> — read by
 * `supabaseAdmin.auth.admin.getUserById(id)`. Used by helpers like
 * checkin.getCaptainEmail (email only) and the onboarding flow (identities).
 */
type AdminUserEntry = {
  email: string | null;
  identities?: Array<{
    provider: string;
    identity_data?: Record<string, unknown>;
  }>;
  user_metadata?: Record<string, unknown>;
  created_at?: string | null;
};
const _adminUsers = new Map<string, AdminUserEntry>();

/** State returned by `supabaseAdmin.auth.admin.generateLink()`. */
let _generateLinkResult: {
  data: {
    properties?: { action_link?: string; hashed_token?: string };
  } | null;
  error: { status?: number; message?: string } | null;
} = {
  data: {
    properties: {
      action_link: 'https://example.com/reset?t=fake',
      hashed_token: 'fake-token-hash',
    },
  },
  error: null,
};

export function setGenerateLinkResult(result: typeof _generateLinkResult) {
  _generateLinkResult = result;
}

/** Users returned by `auth.admin.listUsers()` and `createUser()`. */
let _authListUsers: Array<{ id: string; email: string | null }> = [];
let _createUserResult: {
  data: { user: { id: string; email: string | null } | null };
  error: { message?: string } | null;
} = {
  data: { user: { id: 'gen-user', email: null } },
  error: null,
};

export function setAuthListUsers(
  users: Array<{ id: string; email: string | null }>
) {
  _authListUsers = users;
}

export function setCreateUserResult(result: typeof _createUserResult) {
  _createUserResult = result;
}

/** State returned by `supabaseAnonServer.auth.signUp()` + capture des appels. */
let _signUpResult: {
  data: { user: unknown | null };
  error: { status?: number; message?: string } | null;
} = {
  data: { user: { id: 'signed-up-user' } },
  error: null,
};

/** Inputs passés à `supabaseAnonServer.auth.signUp()` (pour assertions). */
export const signUpCalls: Array<{
  email: string;
  password: string;
  options?: { data?: Record<string, unknown> };
}> = [];

export function setSignUpResult(result: typeof _signUpResult) {
  _signUpResult = result;
}

export function setAuthUser(user: unknown, error: unknown = null) {
  _authUser = user;
  _authError = error;
}

export function setCookieUser(user: unknown, error: unknown = null) {
  _cookieUser = user;
  _cookieError = error;
}

export function setAdminUser(
  userId: string,
  email: string | null,
  extra?: {
    user_metadata?: Record<string, unknown>;
    created_at?: string | null;
  }
) {
  _adminUsers.set(userId, { email, ...extra });
}

/**
 * Seed identities on an admin user. Used by onboarding tests that need the
 * Discord snowflake to be exposed via `auth.admin.getUserById(id).user.identities`.
 */
export function setAdminUserIdentities(
  userId: string,
  identities: Array<{
    provider: string;
    identity_data?: Record<string, unknown>;
  }>,
  email: string | null = null
) {
  _adminUsers.set(userId, { email, identities });
}

export function resetSupabaseMock() {
  for (const k of Object.keys(store)) delete store[k];
  fromCalls.length = 0;
  _authUser = null;
  _authError = null;
  _cookieUser = null;
  _cookieError = null;
  _adminUsers.clear();
  _generateLinkResult = {
    data: {
      properties: {
        action_link: 'https://example.com/reset?t=fake',
        hashed_token: 'fake-token-hash',
      },
    },
    error: null,
  };
  _authListUsers = [];
  _createUserResult = {
    data: { user: { id: 'gen-user', email: null } },
    error: null,
  };
  _signUpResult = {
    data: { user: { id: 'signed-up-user' } },
    error: null,
  };
  signUpCalls.length = 0;
  _storageUploadResult = { error: null };
  _rpcResults.clear();
  rpcCalls.length = 0;
}

type Filter = (row: Row) => boolean;

class Builder {
  private filters: Filter[] = [];
  private op: 'select' | 'update' | 'insert' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private selectAfterMutation = false;
  private rangeFromTo: [number, number] | null = null;
  private wantCount = false;

  constructor(private readonly table: string) {}

  select(_cols?: string, opts?: { count?: 'exact' | 'planned' | 'estimated' }) {
    if (opts?.count) this.wantCount = true;
    if (this.op !== 'select') this.selectAfterMutation = true;
    return this;
  }

  update(payload: Row) {
    this.op = 'update';
    this.payload = payload;
    return this;
  }

  insert(payload: Row | Row[]) {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }

  /**
   * Upsert: replace existing row matching the `onConflict` key, or insert.
   * Supports composite conflict targets ("col_a,col_b") as PostgREST does:
   * every listed column must match for a row to be considered the same.
   */
  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    const items = Array.isArray(payload) ? payload : [payload];
    const onConflict = opts?.onConflict;
    const rows = (store[this.table] ||= []);
    if (onConflict) {
      const keys = onConflict.split(',').map((k) => k.trim());
      for (const item of items) {
        const idx = rows.findIndex((r) =>
          keys.every((k) => (r as any)[k] === (item as any)[k])
        );
        if (idx >= 0) Object.assign(rows[idx], item);
        else rows.push({ ...item });
      }
    } else {
      for (const item of items) rows.push({ ...item });
    }
    // Return self so the caller can still chain, but `_execute` will be a no-op.
    this.op = 'select'; // already mutated, terminal awaits should resolve cleanly
    this.filters = [() => false]; // empty result on subsequent select
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  eq(col: string, val: unknown) {
    // S5b compat : les fixtures legacy ne seedent pas `tenant_id`. Quand le
    // code applicatif filtre `.eq('tenant_id', DEFAULT_TENANT_ID)` mais que
    // la row n'a aucune valeur tenant_id, on laisse passer (pas de
    // filtrage). Une row qui a explicitement un tenant_id different garde
    // bien sur son comportement strict.
    if (col === 'tenant_id') {
      this.filters.push(
        (row) => row[col] === undefined || row[col] === null || row[col] === val
      );
      return this;
    }
    this.filters.push((row) => row[col] === val);
    return this;
  }

  in(col: string, vals: unknown[]) {
    this.filters.push((row) => vals.includes(row[col]));
    return this;
  }

  neq(col: string, val: unknown) {
    this.filters.push((row) => row[col] !== val);
    return this;
  }

  /** PostgREST `.is(col, value)` / `.not(col, 'is', value)` — tracked but only `.is(col, null)` is meaningful. */
  is(col: string, val: unknown) {
    if (val === null) {
      this.filters.push((row) => row[col] === null || row[col] === undefined);
    }
    return this;
  }

  not(col: string, op: string, val: unknown) {
    if (op === 'is' && val === null) {
      this.filters.push((row) => row[col] !== null && row[col] !== undefined);
    }
    return this;
  }

  gte(col: string, val: unknown) {
    this.filters.push((row) => (row[col] as any) >= (val as any));
    return this;
  }

  lte(col: string, val: unknown) {
    this.filters.push((row) => (row[col] as any) <= (val as any));
    return this;
  }

  gt(col: string, val: unknown) {
    this.filters.push((row) => (row[col] as any) > (val as any));
    return this;
  }

  lt(col: string, val: unknown) {
    this.filters.push((row) => (row[col] as any) < (val as any));
    return this;
  }

  /** PostgREST .or() — treated as a no-op. Tests should not rely on its filtering. */
  or(_expr: string) {
    return this;
  }

  /**
   * PostgREST .filter(col, op, value) — supports JSON-path syntax like
   * `payload->>field` for the `eq` operator. Other operators are treated as a
   * no-op so the surrounding query still resolves to an empty list.
   */
  filter(col: string, op: string, value: unknown) {
    if (op !== 'eq') return this;
    const arrowIdx = col.indexOf('->>');
    if (arrowIdx === -1) {
      this.filters.push((row) => row[col] === value);
      return this;
    }
    const base = col.slice(0, arrowIdx);
    const key = col.slice(arrowIdx + 3);
    this.filters.push((row) => {
      const obj = row[base] as Record<string, unknown> | null | undefined;
      return Boolean(obj) && (obj as Record<string, unknown>)[key] === value;
    });
    return this;
  }

  /** PostgREST .ilike(col, pattern) — naive contains-style match (case-insensitive). */
  ilike(col: string, pattern: string) {
    const trimmed = pattern.replace(/^%|%$/g, '').toLowerCase();
    if (!trimmed) return this;
    this.filters.push((row) =>
      String(row[col] ?? '')
        .toLowerCase()
        .includes(trimmed)
    );
    return this;
  }

  /** PostgREST .contains(col, json) — checks key/value pairs are present in the row's JSON column. */
  contains(col: string, value: Record<string, unknown>) {
    this.filters.push((row) => {
      const target = row[col] as Record<string, unknown> | null | undefined;
      if (!target || typeof target !== 'object') return false;
      for (const [k, v] of Object.entries(value)) {
        if ((target as any)[k] !== v) return false;
      }
      return true;
    });
    return this;
  }

  order(_col: string, _opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    return this;
  }

  range(from: number, to: number) {
    this.rangeFromTo = [from, to];
    return this;
  }

  limit(n: number) {
    // .limit(n) is equivalent to .range(0, n - 1) for our purposes.
    this.rangeFromTo = [0, n - 1];
    return this;
  }

  maybeSingle() {
    return this._execute().then((r) => ({
      data: r.data && r.data.length > 0 ? r.data[0] : null,
      error: r.error,
    }));
  }

  single() {
    return this._execute().then((r) => {
      if (!r.data || r.data.length === 0) {
        return {
          data: null,
          error: { message: 'No row matched .single()' },
        };
      }
      return { data: r.data[0], error: null };
    });
  }

  /** Awaiting a non-terminal chain runs the query and resolves to {data, error[, count]}. */
  then<R1 = unknown, R2 = never>(
    onFulfilled?: (r: {
      data: Row[] | null;
      error: unknown;
      count?: number | null;
    }) => R1 | PromiseLike<R1>,
    onRejected?: (err: unknown) => R2 | PromiseLike<R2>
  ): Promise<R1 | R2> {
    return this._execute().then(onFulfilled, onRejected);
  }

  private async _execute(): Promise<{
    data: Row[] | null;
    error: unknown;
    count?: number | null;
  }> {
    const rows = (store[this.table] ||= []);

    if (this.op === 'select') {
      let matched = rows.filter((r) => this.filters.every((f) => f(r)));
      const total = matched.length;
      if (this.rangeFromTo) {
        const [from, to] = this.rangeFromTo;
        matched = matched.slice(from, to + 1);
      }
      // Clone rows so the returned `data` is a snapshot — matches Supabase
      // behavior and prevents callers from spotting later mutations through
      // their cached select result.
      const defaults = tableColumnDefaults(this.table);
      return {
        data: matched.map((r) => ({ ...defaults, ...r })),
        error: null,
        count: this.wantCount ? total : null,
      };
    }

    if (this.op === 'update') {
      const matched = rows.filter((r) => this.filters.every((f) => f(r)));
      for (const r of matched) Object.assign(r, this.payload as Row);
      return {
        // Snapshot the post-update state for the caller.
        data: this.selectAfterMutation ? matched.map((r) => ({ ...r })) : null,
        error: null,
      };
    }

    if (this.op === 'delete') {
      const matched = rows.filter((r) => this.filters.every((f) => f(r)));
      // Mutate in place by index so any reference to `store[table]` keeps the
      // same identity.
      for (let i = rows.length - 1; i >= 0; i--) {
        if (matched.includes(rows[i])) rows.splice(i, 1);
      }
      return {
        data: this.selectAfterMutation ? matched : null,
        error: null,
      };
    }

    if (this.op === 'insert') {
      const items = Array.isArray(this.payload)
        ? (this.payload as Row[])
        : [this.payload as Row];
      const inserted: Row[] = [];
      let counter = rows.length + 1;
      for (const item of items) {
        const row = {
          id: (item.id as string) ?? `gen-${this.table}-${counter++}`,
          ...item,
        };
        rows.push(row);
        inserted.push(row);
      }
      return { data: inserted, error: null };
    }

    return { data: [], error: null };
  }
}

/** State for `supabaseAdmin.storage.from(bucket).upload()`. */
let _storageUploadResult: { error: { message: string } | null } = {
  error: null,
};

export function setStorageUploadResult(result: typeof _storageUploadResult) {
  _storageUploadResult = result;
}

/**
 * Responses returned by `supabaseAdmin.rpc(fn, params)`, keyed by function name.
 * Tests seed a per-function `{ data, error }` via `setRpcResult`; unseeded
 * functions resolve to `{ data: null, error: null }`. Also captures every call
 * for assertions on the params passed.
 */
type RpcResult = { data: unknown; error: unknown };
// Tests seed only the relevant half (`{ data }` or `{ error }`); the other
// defaults to null so consumers always read a full `{ data, error }` pair.
type RpcResultInput = { data?: unknown; error?: unknown };
const _rpcResults = new Map<string, RpcResult>();
export const rpcCalls: Array<{ fn: string; params: unknown }> = [];

export function setRpcResult(fn: string, result: RpcResultInput) {
  _rpcResults.set(fn, {
    data: result.data ?? null,
    error: result.error ?? null,
  });
}

export const supabaseAdmin = {
  storage: {
    from: (bucket: string) => ({
      upload: (_path: string, _data: any, _opts?: any) =>
        Promise.resolve(_storageUploadResult),
      getPublicUrl: (path: string) => ({
        data: {
          publicUrl: `https://storage.example.test/${bucket}/${path}`,
        },
      }),
    }),
  },
  from: (table: string) => {
    fromCalls.push(table);
    return new Builder(table);
  },
  rpc: (fn: string, params?: unknown) => {
    rpcCalls.push({ fn, params });
    const result = _rpcResults.get(fn);
    return Promise.resolve(result ?? { data: null as any, error: null as any });
  },
  auth: {
    getUser: (_token?: string) =>
      Promise.resolve({
        data: { user: _authUser as any },
        error: _authError as any,
      }),
    admin: {
      getUserById: (userId: string) => {
        const entry = _adminUsers.get(userId);
        return Promise.resolve({
          data: entry
            ? {
                user: {
                  id: userId,
                  email: entry.email,
                  identities: entry.identities ?? [],
                  user_metadata: entry.user_metadata ?? {},
                  created_at: entry.created_at ?? null,
                } as any,
              }
            : { user: null as any },
          error: null as any,
        });
      },
      generateLink: (_input: unknown) => Promise.resolve(_generateLinkResult),
      updateUserById: (userId: string, updates: any) => {
        // Echo back a minimal user object so callers that read `data.user`
        // get something meaningful (mirrors Supabase's real behavior).
        const existing = _adminUsers.get(userId);
        return Promise.resolve({
          data: {
            user: {
              id: userId,
              email: existing?.email ?? null,
              user_metadata: updates?.user_metadata ?? {},
              created_at: '2026-01-01T00:00:00.000Z',
            } as any,
          },
          error: null as any,
        });
      },
      deleteUser: (_userId: string) =>
        Promise.resolve({ data: null as any, error: null as any }),
      listUsers: (_opts?: { page?: number; perPage?: number }) =>
        Promise.resolve({
          data: { users: _authListUsers as any[] },
          error: null as any,
        }),
      createUser: (_input: unknown) => Promise.resolve(_createUserResult),
    },
  },
};

export const getServerClient = () => ({
  from: (table: string) => new Builder(table),
  auth: {
    getUser: () =>
      Promise.resolve({
        data: { user: _cookieUser as any },
        error: _cookieError as any,
      }),
    // Sign-out SSR (utilisé par /api/admin/logout) : purge l'état cookie mocké.
    signOut: () => {
      _cookieUser = null;
      _cookieError = null;
      return Promise.resolve({ error: null as any });
    },
  },
});

/** Client anon serveur — utilisé par /api/auth/register (signUp public). */
export const supabaseAnonServer = {
  auth: {
    signUp: (input: {
      email: string;
      password: string;
      options?: { data?: Record<string, unknown> };
    }) => {
      signUpCalls.push(input);
      return Promise.resolve(_signUpResult);
    },
  },
};
