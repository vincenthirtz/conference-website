// Page publique d'un match : ce qu'elle refuse d'afficher.
//
// Deux trous avant ce test :
//  - elle servait les matchs d'un tournoi PRIVÉ (la page tournoi, elle, rend
//    404) — il suffisait de connaître l'id ;
//  - un match de scrim (`tournament_id` NULL) faisait planter le rendu sur
//    `match.tournament.name` : 500 au lieu d'une page.
//
// Le mock renvoie les lignes telles quelles : on sème directement l'objet
// `tournament` embarqué que PostgREST aurait joint.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { getStaticProps } from '@/pages/match/[id]';

const MATCH_ID = '11111111-1111-4111-8111-111111111111';
const SCRIM_ID = '22222222-2222-4222-8222-222222222222';

function seedMatch(over: Record<string, unknown> = {}) {
  store.matches = [
    {
      id: MATCH_ID,
      tournament_id: 't1',
      scrim_id: null,
      status: 'finished',
      team1: null,
      team2: null,
      stage: null,
      games: [],
      tournament: {
        id: 't1',
        slug: 'cup-2026',
        name: 'Cup 2026',
        visibility: 'public',
      },
      ...over,
    },
  ];
}

function seedScrim(over: Record<string, unknown> = {}) {
  store.scrims = [
    {
      id: SCRIM_ID,
      slug: 'scrim-a-vs-b',
      is_public: true,
      status: 'scheduled',
      deleted_at: null,
      ...over,
    },
  ];
}

async function run() {
  return (await getStaticProps({ params: { id: MATCH_ID } } as never)) as any;
}

describe('pages/match/[id] — ce qui est public', () => {
  beforeEach(() => resetSupabaseMock());

  it('rend un match de tournoi public', async () => {
    seedMatch();
    const res = await run();
    expect(res.props.match.id).toBe(MATCH_ID);
    expect(res.props.seo.title).toContain('Cup 2026');
  });

  it('rend 404 pour un match de tournoi privé', async () => {
    seedMatch({
      tournament: { id: 't1', name: 'Privé', visibility: 'private' },
    });
    expect(await run()).toMatchObject({ notFound: true });
  });

  it('redirige un match de scrim public vers la page du scrim', async () => {
    seedMatch({ tournament_id: null, tournament: null, scrim_id: SCRIM_ID });
    seedScrim();
    expect(await run()).toMatchObject({
      redirect: { destination: '/scrim/scrim-a-vs-b', permanent: false },
    });
  });

  it("retombe sur l'id quand le scrim n'a pas de slug", async () => {
    seedMatch({ tournament_id: null, tournament: null, scrim_id: SCRIM_ID });
    seedScrim({ slug: null });
    expect(await run()).toMatchObject({
      redirect: { destination: `/scrim/${SCRIM_ID}` },
    });
  });

  it.each([
    ['privé', { is_public: false }],
    ['brouillon', { status: 'draft' }],
    ['supprimé', { deleted_at: '2026-09-01T00:00:00Z' }],
  ])('rend 404 pour un match de scrim %s', async (_label, over) => {
    seedMatch({ tournament_id: null, tournament: null, scrim_id: SCRIM_ID });
    seedScrim(over);
    expect(await run()).toMatchObject({ notFound: true });
  });

  it('rend 404 pour un match sans tournoi ni scrim, sans planter', async () => {
    seedMatch({ tournament_id: null, tournament: null, scrim_id: null });
    expect(await run()).toMatchObject({ notFound: true });
  });
});
