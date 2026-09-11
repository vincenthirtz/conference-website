// Page publique d'un scrim : SEO propre, cache CDN, une seule requête.
//
// Avant : pas de `seo` → chaque scrim héritait du titre par défaut du site ;
// pas de Cache-Control → rendu SSR à chaque visite ; deux requêtes en série
// (scrim puis matchs). Le mock renvoie les lignes telles quelles : on sème
// directement les matchs embarqués que PostgREST joindrait.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});
vi.mock('@/utils/tenant', () => ({
  resolveTenantIdForPublicRequest: () => 'tenant-1',
}));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { getServerSideProps, buildScrimSeo } from '@/pages/scrim/[id]';

const SCRIM_ID = '33333333-3333-4333-8333-333333333333';

const team = (id: string, name: string, slug: string | null = null) => ({
  id,
  name,
  short_name: null,
  slug,
  logo_url: null,
});

function scrimRow(over: Record<string, unknown> = {}) {
  return {
    id: SCRIM_ID,
    tenant_id: 'tenant-1',
    name: 'Scrim de rentrée',
    slug: 'scrim-rentree',
    status: 'scheduled',
    game: 'Overwatch',
    is_public: true,
    deleted_at: null,
    // 19 h à Paris (heure d'été) = 17 h UTC.
    scheduled_date: '2026-09-18T17:00:00Z',
    timezone: 'Europe/Paris',
    description: null,
    banner_url: null,
    logo_url: null,
    stream_url: null,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    team1: team('a', 'Les Alpha', 'alpha'),
    team2: team('b', 'Les Bêta'),
    matches: [],
    ...over,
  };
}

async function run(id = SCRIM_ID) {
  const headers: Record<string, string> = {};
  const res = await getServerSideProps({
    params: { id },
    req: { headers: {} },
    res: { setHeader: (k: string, v: string) => (headers[k] = v) },
  } as never);
  return { res: res as any, headers };
}

describe('pages/scrim/[id] — getServerSideProps', () => {
  beforeEach(() => resetSupabaseMock());

  it('renvoie le SEO du scrim et pose un cache CDN court', async () => {
    store.scrims = [scrimRow()];
    const { res, headers } = await run();
    expect(res.props.seo.title).toEqual({
      fr: 'Les Alpha vs Les Bêta – Scrim',
      en: 'Les Alpha vs Les Bêta – Scrim',
    });
    expect(headers['Cache-Control']).toBe(
      'public, s-maxage=60, stale-while-revalidate=300'
    );
    // Les matchs embarqués ne restent pas dans l'objet scrim.
    expect(res.props.scrim).not.toHaveProperty('matches');
  });

  it('trie les matchs embarqués par horaire, non planifiés en dernier', async () => {
    store.scrims = [
      scrimRow({
        matches: [
          { id: 'm3', scheduled_at: null, created_at: '2026-09-01T00:00:00Z' },
          {
            id: 'm2',
            scheduled_at: '2026-09-18T18:00:00Z',
            created_at: '2026-09-01T00:00:00Z',
          },
          {
            id: 'm1',
            scheduled_at: '2026-09-18T17:00:00Z',
            created_at: '2026-09-02T00:00:00Z',
          },
        ],
      }),
    ];
    const { res } = await run();
    expect(res.props.matches.map((m: { id: string }) => m.id)).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
  });

  it('trouve un scrim par son slug', async () => {
    store.scrims = [scrimRow()];
    const { res } = await run('scrim-rentree');
    expect(res.props.scrim.id).toBe(SCRIM_ID);
  });

  it.each([
    ['privé', { is_public: false }],
    ['brouillon', { status: 'draft' }],
    ['supprimé', { deleted_at: '2026-09-01T00:00:00Z' }],
  ])('rend 404 pour un scrim %s', async (_label, over) => {
    store.scrims = [scrimRow(over)];
    const { res } = await run();
    expect(res).toEqual({ notFound: true });
  });
});

describe('buildScrimSeo', () => {
  it("date la description à l'heure de Paris, dans chaque langue", () => {
    const seo = buildScrimSeo(scrimRow() as never);
    expect(seo.description).toEqual({
      fr: "Scrim Overwatch Les Alpha vs Les Bêta le 18 septembre 2026 — OW Women's Cup : score, matchs joués et stream.",
      en: "Overwatch scrim Les Alpha vs Les Bêta on 18 September 2026 — OW Women's Cup: score, matches played and stream.",
    });
  });

  it('prend la bannière comme image, et la reporte dans le JSON-LD', () => {
    const seo = buildScrimSeo(
      scrimRow({ banner_url: 'https://cdn.test/banner.png' }) as never
    );
    expect(seo.image).toBe('https://cdn.test/banner.png');
    expect(seo.jsonLd).toMatchObject({
      '@type': 'SportsEvent',
      image: 'https://cdn.test/banner.png',
      startDate: '2026-09-18T17:00:00Z',
      url: 'https://owwomenscup.fr/scrim/scrim-rentree',
    });
  });

  it("nomme l'équipe manquante « à définir » selon la langue", () => {
    const seo = buildScrimSeo(scrimRow({ team2: null }) as never);
    expect(seo.title).toEqual({
      fr: 'Les Alpha vs À définir – Scrim',
      en: 'Les Alpha vs TBD – Scrim',
    });
  });

  it("retombe sur le nom du scrim quand aucune équipe n'est connue", () => {
    const seo = buildScrimSeo(scrimRow({ team1: null, team2: null }) as never);
    expect(seo.title).toEqual({
      fr: 'Scrim de rentrée – Scrim',
      en: 'Scrim de rentrée – Scrim',
    });
  });
});
