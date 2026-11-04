// tests/unit/cloudflareDatabase.test.ts
//
// Lot 6 de docs/D1-MIGRATION.md (marche à suivre : docs/D1-SWITCH.md) : la base que lit le
// rendu serveur du site (cloudflare/database.ts, appelé par cloudflare/worker.mjs à chaque
// requête). Avec DB_BACKEND = « d1 », le crochet de la façade (utils/db/d1/primary.ts, recopié de
// l'API) est posé : le VRAI utils/supabase.ts (pas le faux Supabase des autres tests) envoie ses
// lectures à la base MAIN_DB. Ici, MAIN_DB est un SQLite en mémoire (node:sqlite) à la forme de
// l'API D1, avec les tables de la carte (database/d1/catalog.json) ; une vraie page, la liste
// des actualités, se construit dessus sans qu'aucune requête ne parte vers Supabase.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { bindSiteDatabase } from '../../cloudflare/database';
import type { D1CatalogJson } from '../../utils/db/d1/catalog';
import type { D1Database, D1Statement } from '../../utils/db/d1/execute';

// Le vrai client : ses `from()` passent par le crochet.
vi.mock('@/utils/supabase', async (importOriginal) => importOriginal());

const ROOT = resolve(__dirname, '../..');
const catalog = JSON.parse(
  readFileSync(join(ROOT, 'database/d1/catalog.json'), 'utf8')
) as D1CatalogJson;
const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TEAM = '04000000-0000-4000-8000-000000000001';
const FROM_HOOK = Symbol.for('owwc.db.from-hook');
const RPC_HOOK = Symbol.for('owwc.db.rpc-hook');
const store = globalThis as unknown as Record<symbol, unknown>;

/** L'API D1 (prepare / bind / all / batch atomique) sur un SQLite en mémoire. */
function sqliteD1(): { db: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  type Bound = D1Statement & { run(): Record<string, unknown>[] };
  const statement = (sql: string, params: unknown[] = []): Bound => ({
    bind: (...values: unknown[]) => statement(sql, values),
    run: () =>
      sqlite.prepare(sql).all(...(params as never[])) as Record<
        string,
        unknown
      >[],
    all: async <T>() => ({
      results: sqlite.prepare(sql).all(...(params as never[])) as T[],
    }),
  });
  const db: D1Database = {
    prepare: (sql) => statement(sql),
    batch: async <T>(statements: D1Statement[]) => {
      sqlite.exec('BEGIN');
      try {
        const out = statements.map((s) => ({
          results: (s as Bound).run() as T[],
        }));
        sqlite.exec('COMMIT');
        return out;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };
  return { db, sqlite };
}

/** Une table de la carte, sans ses règles : de quoi lire. */
function createTable(sqlite: DatabaseSync, name: string): void {
  const table = catalog.tables[name];
  if (!table) throw new Error(`table absente de la carte : ${name}`);
  const affinity = (type: string) =>
    ['integer', 'bigint', 'smallint', 'boolean'].includes(type)
      ? 'INTEGER'
      : ['numeric', 'double'].includes(type)
        ? 'REAL'
        : 'TEXT';
  sqlite.exec(
    `CREATE TABLE "${name}" (${table.columns.map((c) => `"${c.name}" ${affinity(c.type)}`).join(', ')})`
  );
}

let main: ReturnType<typeof sqliteD1>;
const stray: string[] = [];

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://supabase.invalid');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    stray.push(String(input));
    throw new Error('requête réseau inattendue');
  });
  main = sqliteD1();
  for (const t of ['news', 'teams', 'tenants']) createTable(main.sqlite, t);
  main.sqlite.exec(
    `INSERT INTO "teams" ("id", "tenant_id", "name", "slug", "logo_url") VALUES ('${TEAM}', '${TENANT}', 'Aurores', 'aurores', 'https://media.test/aurores.png')`
  );
  const news = (
    id: number,
    slug: string,
    status: string,
    publishedAt: string | null,
    team: string | null
  ) =>
    main.sqlite
      .prepare(
        'INSERT INTO "news" ("id", "tenant_id", "title", "slug", "tag", "content", "status", "published_at", "created_at", "team_id") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        `05000000-0000-4000-8000-00000000000${id}`,
        TENANT,
        `Titre ${slug}`,
        slug,
        'general',
        '…',
        status,
        publishedAt,
        '2026-11-01T09:00:00.000000+00:00',
        team
      );
  news(1, 'premiere', 'published', '2026-11-01T10:00:00.000000+00:00', TEAM);
  news(2, 'brouillon', 'draft', null, null);
  news(3, 'seconde', 'published', '2026-11-02T10:00:00.000000+00:00', null);
});

afterAll(() => {
  bindSiteDatabase({});
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('la base du rendu serveur', () => {
  it('« supabase » ou rien : aucun crochet, Supabase répond comme avant', () => {
    expect(bindSiteDatabase({})).toBe('supabase');
    expect(bindSiteDatabase({ DB_BACKEND: 'supabase', MAIN_DB: main.db })).toBe(
      'supabase'
    );
    expect(store[FROM_HOOK]).toBeUndefined();
    expect(store[RPC_HOOK]).toBeUndefined();
  });

  it('« d1 » : les lectures des pages partent dans MAIN_DB, sans rien demander à Supabase', async () => {
    expect(bindSiteDatabase({ DB_BACKEND: 'd1', MAIN_DB: main.db })).toBe('d1');
    expect(typeof store[FROM_HOOK]).toBe('function');
    vi.resetModules();
    const { getStaticProps } = await import('../../pages/news/index');
    const result = (await getStaticProps({} as never)) as {
      props: {
        news: Array<{ slug: string; imageUrl: string | null }>;
        loadError: boolean;
      };
    };
    expect(result.props.loadError).toBe(false);
    expect(result.props.news.map((n) => n.slug)).toEqual([
      'seconde',
      'premiere',
    ]);
    // La table liée (teams) vient de D1 aussi.
    expect(result.props.news[1]?.imageUrl).toBe(
      'https://media.test/aurores.png'
    );
    expect(stray).toEqual([]);
  });

  it('une configuration cassée le dit une fois, et laisse Supabase répondre', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(bindSiteDatabase({ DB_BACKEND: 'd1' })).toBe('missing-db');
      expect(store[FROM_HOOK]).toBeUndefined();
      expect(bindSiteDatabase({ DB_BACKEND: 'D1', MAIN_DB: main.db })).toBe(
        'invalid'
      );
      expect(store[FROM_HOOK]).toBeUndefined();
      expect(error).toHaveBeenCalledTimes(1);
    } finally {
      error.mockRestore();
    }
  });

  it('cloudflare/worker.mjs pose la base à chaque requête', () => {
    const worker = readFileSync(join(ROOT, 'cloudflare/worker.mjs'), 'utf8');
    expect(worker).toContain("from './database.ts'");
    expect(worker).toMatch(/bindSiteDatabase\(env\)/);
  });

  it('wrangler.jsonc : la base liée, l’interrupteur à « supabase » (sans effet)', () => {
    const config = JSON.parse(
      readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8').replace(
        /^\s*\/\/.*$/gm,
        ''
      )
    ) as {
      vars: Record<string, string>;
      d1_databases: Array<Record<string, string>>;
    };
    expect(config.vars.DB_BACKEND).toBe('supabase');
    expect(config.d1_databases).toEqual([
      {
        binding: 'MAIN_DB',
        database_name: 'owwomenscup-db',
        database_id: '967ed911-71e3-41ae-a2fe-ae7a3ad5c8c1',
      },
    ]);
  });
});
