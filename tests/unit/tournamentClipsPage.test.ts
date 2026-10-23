// Page publique /tournament/[id]/clips — getStaticProps (ISR), fenêtre de
// clips et onglet.
//
// CE QUE CES CAS PROTÈGENT :
//   - la fenêtre est celle DU TOURNOI (premier jour → lendemain du dernier),
//     pas « les 30 derniers jours » : un tournoi terminé garde ses clips ;
//   - avant le coup d'envoi, aucun appel à Twitch, et la page le dit ;
//   - Twitch absent ou muet → page vide mais servie (jamais une 500) ;
//   - pas de régénération à la minute : chaque passage coûte trois appels ;
//   - l'onglet Clips est présent sur les pages du tournoi.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import TournamentClipsPage, {
  getStaticProps,
} from '../../pages/tournament/[id]/clips';
import { tournamentClipsWindow } from '../../utils/tournament/clipsWindow';
import TournamentTabs from '../../components/tournament/TournamentTabs';

const TOUR = 'eeeeeeee-0000-4000-8000-000000000002';

function seed(extra: Record<string, unknown> = {}) {
  store.tournaments = [
    {
      id: TOUR,
      tenant_id: DEFAULT_TENANT_ID,
      slug: 'cup',
      name: 'Cup',
      status: 'completed',
      visibility: 'public',
      start_date: '2026-09-18',
      end_date: '2026-10-20',
      ...extra,
    },
  ] as any;
  store.tournament_stages = [] as any;
}

/** Twitch simulé : jeton, chaîne, puis les clips demandés. */
function stubTwitch(clips: Array<Record<string, unknown>> = []) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('oauth2/token')) {
        return new Response(
          JSON.stringify({ access_token: 't', expires_in: 3600 }),
          { status: 200 }
        );
      }
      if (url.includes('helix/users')) {
        return new Response(JSON.stringify({ data: [{ id: '42' }] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ data: clips }), { status: 200 });
    })
  );
  return calls;
}

const CLIP = {
  id: 'clip-1',
  title: 'Le retournement de la grande finale',
  url: 'https://www.twitch.tv/womens_cup/clip/AbcDef',
  thumbnail_url: 'https://static-cdn.jtvnw.net/twitch-clips/abc-480x272.jpg',
  view_count: 1200,
  duration: 28,
  created_at: '2026-10-23T19:40:00Z',
};

beforeEach(() => {
  resetSupabaseMock();
  process.env.TWITCH_CLIENT_ID = 'id';
  process.env.TWITCH_CLIENT_SECRET = 'secret';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tournamentClipsWindow', () => {
  const NOW = new Date('2026-12-01T12:00:00.000Z');

  it('va du premier jour au lendemain du dernier', () => {
    const w = tournamentClipsWindow(
      { start_date: '2026-09-18', end_date: '2026-10-23' },
      NOW
    );
    expect(w?.from.toISOString()).toBe('2026-09-18T00:00:00.000Z');
    // Le lendemain : les clips coupés après la finale du soir y entrent.
    expect(w?.to.toISOString()).toBe('2026-10-24T00:00:00.000Z');
  });

  it('s’arrête à maintenant pendant le tournoi', () => {
    const now = new Date('2026-10-23T15:00:00.000Z');
    const w = tournamentClipsWindow(
      { start_date: '2026-09-18', end_date: '2026-10-23' },
      now
    );
    expect(w?.to.toISOString()).toBe(now.toISOString());
  });

  it('court jusqu’à maintenant sans date de fin', () => {
    const w = tournamentClipsWindow({ start_date: '2026-09-18' }, NOW);
    expect(w?.to.toISOString()).toBe(NOW.toISOString());
  });

  it('rend null avant le premier jour, ou sans date de début', () => {
    expect(tournamentClipsWindow({ start_date: '2027-01-10' }, NOW)).toBeNull();
    expect(tournamentClipsWindow({ start_date: null }, NOW)).toBeNull();
    expect(
      tournamentClipsWindow({ start_date: 'pas une date' }, NOW)
    ).toBeNull();
  });
});

describe('page Clips — getStaticProps', () => {
  it('demande à Twitch la fenêtre du tournoi et sert ses clips', async () => {
    seed();
    const calls = stubTwitch([CLIP]);
    const res: any = await getStaticProps({ params: { id: 'cup' } } as any);

    const clipsCall = calls.find((c) => c.includes('helix/clips'));
    expect(clipsCall).toBeDefined();
    const q = new URL(clipsCall as string).searchParams;
    expect(q.get('started_at')).toBe('2026-09-18T00:00:00.000Z');
    expect(q.get('ended_at')).toBe('2026-10-21T00:00:00.000Z');
    expect(q.get('first')).toBe('24');

    expect(res.props.started).toBe(true);
    expect(res.props.clips).toEqual([
      {
        id: 'clip-1',
        title: 'Le retournement de la grande finale',
        url: 'https://www.twitch.tv/womens_cup/clip/AbcDef',
        thumbnailUrl:
          'https://static-cdn.jtvnw.net/twitch-clips/abc-480x272.jpg',
        viewCount: 1200,
        duration: 28,
      },
    ]);
    expect(res.props.seo.title.fr).toContain('Clips');
  });

  it('n’appelle pas Twitch avant le coup d’envoi', async () => {
    seed({ status: 'published', start_date: '2099-01-01', end_date: null });
    const calls = stubTwitch([CLIP]);
    const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
    expect(calls).toHaveLength(0);
    expect(res.props.started).toBe(false);
    expect(res.props.clips).toEqual([]);
  });

  it('sert une page vide quand Twitch ne répond pas', async () => {
    seed();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('réseau');
      })
    );
    const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
    expect(res.notFound).toBeUndefined();
    expect(res.props.clips).toEqual([]);
  });

  it('ne régénère pas plus d’une fois par quart d’heure, même en direct', async () => {
    seed({ status: 'running', end_date: null });
    stubTwitch([]);
    const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
    expect(res.revalidate).toBeGreaterThanOrEqual(900);
  });

  it('404 sur un tournoi non public', async () => {
    seed({ visibility: 'private' });
    stubTwitch([]);
    const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
    expect(res.notFound).toBe(true);
  });
});

describe('page Clips — rendu', () => {
  const base = {
    tournament: { id: TOUR, slug: 'cup', name: 'Cup', status: 'running' },
    hasFfaStage: false,
    bracketTab: 'bracket' as const,
    hasReviews: false,
    seo: {},
  };

  it('liste les clips, ouverts sur Twitch', () => {
    const html = renderToString(
      createElement(TournamentClipsPage, {
        ...base,
        started: true,
        clips: [
          {
            id: 'clip-1',
            title: 'Le retournement',
            url: 'https://www.twitch.tv/womens_cup/clip/AbcDef',
            thumbnailUrl:
              'https://static-cdn.jtvnw.net/twitch-clips/abc-480x272.jpg',
            viewCount: 1200,
            duration: 28,
          },
        ],
      })
    );
    expect(html).toContain(
      'href="https://www.twitch.tv/womens_cup/clip/AbcDef"'
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('Le retournement');
    expect(html).toContain('28 s');
    expect(html).toMatch(/aria-current="page"[^>]*>Clips</);
  });

  it('dit « pas encore commencé » avant le coup d’envoi, « pas encore de clip » ensuite', () => {
    const before = renderToString(
      createElement(TournamentClipsPage, { ...base, started: false, clips: [] })
    );
    expect(before).toContain('pas encore commencé');
    const after = renderToString(
      createElement(TournamentClipsPage, { ...base, started: true, clips: [] })
    );
    expect(after).toContain('Pas encore de clip');
  });
});

describe('TournamentTabs — onglet Clips', () => {
  it('apparaît sur les pages du tournoi', () => {
    const html = renderToString(
      createElement(TournamentTabs, {
        tournamentPath: '/tournament/cup',
        active: 'hub',
      })
    );
    expect(html).toContain('href="/tournament/cup/clips"');
  });
});
