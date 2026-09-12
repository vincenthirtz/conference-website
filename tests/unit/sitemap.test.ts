// Le sitemap ne doit lister que des URL qui rendent réellement une page.
//
// Avant ce test, il annonçait :
//  - les matchs terminés de TOUS les tournois, privés compris (404), et ceux
//    des scrims (redirection) ;
//  - les équipes inactives, dont la fiche rend 404 ;
// et il oubliait les scrims publics, qui ont pourtant une page indexable.
//
// Le mock Supabase partagé ne sait pas filtrer sur une colonne embarquée
// (`tournaments.visibility`) : ce faux client minimal le fait, pour que le
// filtre `!inner` soit réellement exercé et pas seulement appelé.

import { describe, it, expect, beforeEach, vi } from 'vitest';

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

const TENANT = 'tenant-1';

/** Sème une table du tenant courant (le sitemap filtre sur tenant_id). */
function seed(table: string, rows: Row[]) {
  tables[table] = rows.map((r) => ({ tenant_id: TENANT, ...r }));
}

function read(row: Row, col: string): unknown {
  const dot = col.indexOf('.');
  if (dot === -1) return row[col];
  const rel = row[col.slice(0, dot)] as Row | null | undefined;
  return rel ? rel[col.slice(dot + 1)] : undefined;
}

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let limit = Infinity;
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (filters.push((r) => read(r, c) === v), q),
    neq: (c: string, v: unknown) => (filters.push((r) => read(r, c) !== v), q),
    gt: (c: string, v: number) => (
      filters.push((r) => (read(r, c) as number) > v),
      q
    ),
    is: (c: string, v: unknown) => (
      filters.push((r) => (read(r, c) ?? null) === v),
      q
    ),
    not: (c: string, op: string, v: unknown) => {
      if (op === 'is') filters.push((r) => (read(r, c) ?? null) !== v);
      return q;
    },
    order: () => q,
    limit: (n: number) => ((limit = n), q),
    then: (resolve: (r: { data: Row[]; error: null }) => unknown) => {
      // Une jointure `!inner` écarte les lignes sans relation : c'est ce que
      // fait PostgREST quand `tournament_id` est NULL.
      const rows = (tables[table] ?? []).filter((r) =>
        filters.every((f) => f(r))
      );
      return Promise.resolve({ data: rows.slice(0, limit), error: null }).then(
        resolve
      );
    },
  };
  return q;
}

vi.mock('@/utils/supabase', () => ({
  supabaseAdmin: { from: (t: string) => query(t) },
  getServerClient: () => ({ from: (t: string) => query(t) }),
}));
vi.mock('@/utils/tenant', () => ({
  resolveTenantIdForPublicRequest: () => 'tenant-1',
}));

import { getServerSideProps } from '@/pages/sitemap.xml';

async function renderSitemap(): Promise<string> {
  let body = '';
  const res = {
    setHeader: () => undefined,
    write: (chunk: string) => {
      body += chunk;
    },
    end: () => undefined,
  };
  await getServerSideProps({
    req: { headers: { host: 'example.test' } },
    res,
  } as never);
  return body;
}

const BASE = 'https://owwomenscup.fr';

describe('sitemap.xml — seulement des pages qui existent', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = BASE;
    for (const k of Object.keys(tables)) delete tables[k];
  });

  it("ne liste que les matchs terminés d'un tournoi public", async () => {
    seed('matches', [
      {
        id: 'm-public',
        status: 'finished',
        tournaments: { visibility: 'public' },
      },
      {
        id: 'm-private',
        status: 'finished',
        tournaments: { visibility: 'private' },
      },
      // Match de scrim : pas de tournoi, la jointure inner l'écarte.
      { id: 'm-scrim', status: 'finished', tournaments: null },
      {
        id: 'm-pending',
        status: 'pending',
        tournaments: { visibility: 'public' },
      },
    ]);
    const xml = await renderSitemap();
    expect(xml).toContain(`${BASE}/match/m-public<`);
    expect(xml).not.toContain('/match/m-private');
    expect(xml).not.toContain('/match/m-scrim');
    expect(xml).not.toContain('/match/m-pending');
  });

  // Garde-fou de la décision produit du 2026-07-13
  // (create_player_discovery_profiles.sql) : aucune page PUBLIQUE ni INDEXÉE de
  // personne. Le sitemap poussait pourtant vers l'index toute joueuse ayant un
  // match classé, sans qu'elle l'ait demandé. Ce test existe pour qu'on ne les
  // y remette pas « parce que c'est bon pour le référencement ».
  it('ne liste AUCUN profil de joueuse, même classée', async () => {
    seed('player_ratings', [
      { user_id: 'u-1', games_played: 42, rating: 1900 },
      { user_id: 'u-2', games_played: 3, rating: 1500 },
    ]);
    const xml = await renderSitemap();
    expect(xml).not.toContain('/player/');
  });

  it('écarte les équipes inactives, supprimées ou sans slug', async () => {
    seed('teams', [
      { slug: 'actives', is_active: true, deleted_at: null },
      { slug: 'inactives', is_active: false, deleted_at: null },
      { slug: 'supprimees', is_active: true, deleted_at: '2026-01-01' },
      { slug: null, is_active: true, deleted_at: null },
    ]);
    const xml = await renderSitemap();
    expect(xml).toContain(`${BASE}/team/actives<`);
    expect(xml).not.toContain('/team/inactives');
    expect(xml).not.toContain('/team/supprimees');
    expect(xml).not.toContain('/team/null');
  });

  it('liste les scrims publics non brouillons, par slug sinon par id', async () => {
    seed('scrims', [
      { id: 's1', slug: 'a-vs-b', is_public: true, status: 'completed' },
      { id: 's2', slug: null, is_public: true, status: 'scheduled' },
      { id: 's3', slug: 'prive', is_public: false, status: 'scheduled' },
      { id: 's4', slug: 'brouillon', is_public: true, status: 'draft' },
      {
        id: 's5',
        slug: 'supprime',
        is_public: true,
        status: 'scheduled',
        deleted_at: '2026-01-01',
      },
    ]);
    const xml = await renderSitemap();
    expect(xml).toContain(`${BASE}/scrim/a-vs-b<`);
    expect(xml).toContain(`${BASE}/scrim/s2<`);
    expect(xml).not.toContain('/scrim/prive');
    expect(xml).not.toContain('/scrim/brouillon');
    expect(xml).not.toContain('/scrim/supprime');
  });

  it('ne liste que les actualités publiées', async () => {
    seed('news', [
      { slug: 'publiee', status: 'published' },
      { slug: 'brouillon', status: 'draft' },
    ]);
    const xml = await renderSitemap();
    expect(xml).toContain(`${BASE}/news/publiee<`);
    expect(xml).not.toContain('/news/brouillon');
  });

  it('ne liste que les tournois publics', async () => {
    seed('tournaments', [
      { id: 't1', slug: 'cup', visibility: 'public' },
      { id: 't2', slug: 'secret', visibility: 'private' },
    ]);
    const xml = await renderSitemap();
    expect(xml).toContain(`${BASE}/tournament/cup<`);
    expect(xml).not.toContain('/tournament/secret');
  });
});
