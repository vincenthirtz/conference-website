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

export type Row = Record<string, unknown>;
export type Store = Record<string, Row[]>;

export const store: Store = {};

/** Names of tables that .from() has been called with — useful for asserting cache hits. */
export const fromCalls: string[] = [];

/** Mutable auth state — read by `supabaseAdmin.auth.getUser` (Bearer token path). */
let _authUser: unknown = null;
let _authError: unknown = null;

/** Mutable cookie state — read by `getServerClient().auth.getUser` (SSR path). */
let _cookieUser: unknown = null;
let _cookieError: unknown = null;

/**
 * Map<userId, email> — read by `supabaseAdmin.auth.admin.getUserById(id)`.
 * Used by helpers like checkin.getCaptainEmail.
 */
const _adminUsers = new Map<string, { email: string | null }>();

/** State returned by `supabaseAdmin.auth.admin.generateLink()`. */
let _generateLinkResult: {
  data: { properties?: { action_link?: string } } | null;
  error: { status?: number; message?: string } | null;
} = {
  data: { properties: { action_link: 'https://example.com/reset?t=fake' } },
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

export function setAuthUser(user: unknown, error: unknown = null) {
  _authUser = user;
  _authError = error;
}

export function setCookieUser(user: unknown, error: unknown = null) {
  _cookieUser = user;
  _cookieError = error;
}

export function setAdminUser(userId: string, email: string | null) {
  _adminUsers.set(userId, { email });
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
    data: { properties: { action_link: 'https://example.com/reset?t=fake' } },
    error: null,
  };
  _authListUsers = [];
  _createUserResult = {
    data: { user: { id: 'gen-user', email: null } },
    error: null,
  };
  _storageUploadResult = { error: null };
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

  /** Upsert: replace existing row matching `onConflict` key, or insert. */
  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    const items = Array.isArray(payload) ? payload : [payload];
    const onConflict = opts?.onConflict;
    const rows = (store[this.table] ||= []);
    if (onConflict) {
      for (const item of items) {
        const idx = rows.findIndex(
          (r) => (r as any)[onConflict] === (item as any)[onConflict]
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
      return {
        data: matched.map((r) => ({ ...r })),
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
            ? { user: { id: userId, email: entry.email } as any }
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
  },
});
