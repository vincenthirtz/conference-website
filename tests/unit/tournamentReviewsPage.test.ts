// Page publique /tournament/[id]/reviews — getStaticProps (ISR) et onglet.
//
// CE QUE CE CAS PROTÈGE :
//   - pas de playlist (ou colonne pas encore migrée) → 404, onglet masqué ;
//   - la liste vient du flux RSS lu CÔTÉ SERVEUR, avec un cache ISR long en
//     cas de succès et court après un échec (une erreur passagère ne doit pas
//     rester figée une heure) ;
//   - les pages sœurs exposent `hasReviews` pour afficher l'onglet.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { getStaticProps } from '../../pages/tournament/[id]/reviews';
import { getStaticProps as getStandingsProps } from '../../pages/tournament/[id]/standings';
import { isMissingColumnError } from '../../utils/tournaments/reviewsPlaylist';
import { normalizePlaylistInput } from '../../features/admin/tournaments/service/reviewsPlaylist';

const TOUR = 'eeeeeeee-0000-4000-8000-000000000001';
const PL = 'PLBu9E8qChrHcAbCdEfGhIjKlMnOpQrStU';

const FEED = `<feed><entry><yt:videoId>dQw4w9WgXcQ</yt:videoId><title>Review 1</title><published>2026-09-20T18:00:00+00:00</published></entry></feed>`;

function seed(extra: Record<string, unknown> = {}) {
  store.tournaments = [
    {
      id: TOUR,
      tenant_id: DEFAULT_TENANT_ID,
      slug: 'cup',
      name: 'Cup',
      status: 'published',
      visibility: 'public',
      ...extra,
    },
  ] as any;
  store.tournament_stages = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('page Reviews — getStaticProps', () => {
  it('404 sans playlist configurée, sans appel à YouTube', async () => {
    seed();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
    expect(res.notFound).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('liste les vidéos et met la page en cache 1 h', async () => {
    seed({ reviews_playlist_id: PL });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(FEED, { status: 200 }))
    );
    const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
    expect(res.revalidate).toBe(3600);
    expect(res.props.feedStatus).toBe('ok');
    expect(res.props.playlistId).toBe(PL);
    expect(res.props.videos).toEqual([
      expect.objectContaining({ id: 'dQw4w9WgXcQ', title: 'Review 1' }),
    ]);
    expect(res.props.seo.title.fr).toContain('Reviews');
  });

  it('playlist introuvable → état dédié, cache court', async () => {
    seed({ reviews_playlist_id: 'PLBu9E8qChrHc' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 }))
    );
    const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
    expect(res.props.feedStatus).toBe('not_found');
    expect(res.props.videos).toEqual([]);
    expect(res.revalidate).toBe(300);
  });

  it('YouTube injoignable → état erreur, cache court', async () => {
    seed({ reviews_playlist_id: PL });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      })
    );
    const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
    expect(res.props.feedStatus).toBe('error');
    expect(res.revalidate).toBe(300);
  });

  it('valeur corrompue en base → traitée comme absente', async () => {
    seed({ reviews_playlist_id: 'x"><script>' });
    const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
    expect(res.notFound).toBe(true);
  });

  it('tournoi privé → 404', async () => {
    seed({ reviews_playlist_id: PL, visibility: 'private' });
    const res: any = await getStaticProps({ params: { id: 'cup' } } as any);
    expect(res.notFound).toBe(true);
  });
});

describe('onglet Reviews sur les pages sœurs', () => {
  it('hasReviews suit la présence de la playlist', async () => {
    seed();
    const off: any = await getStandingsProps({ params: { id: 'cup' } } as any);
    expect(off.props.hasReviews).toBe(false);
    seed({ reviews_playlist_id: PL });
    const on: any = await getStandingsProps({ params: { id: 'cup' } } as any);
    expect(on.props.hasReviews).toBe(true);
  });
});

describe('tolérance à la migration absente', () => {
  it('reconnaît la colonne inconnue (code ou message)', () => {
    expect(isMissingColumnError({ code: '42703' })).toBe(true);
    expect(
      isMissingColumnError({
        message: 'column tournaments.reviews_playlist_id does not exist',
      })
    ).toBe(true);
    expect(isMissingColumnError({ code: '42501', message: 'denied' })).toBe(
      false
    );
  });
});

describe('admin — normalisation de la saisie', () => {
  it('URL ou ID → ID ; vide/null → retrait ; le reste → refus', () => {
    expect(
      normalizePlaylistInput(`https://www.youtube.com/playlist?list=${PL}`)
    ).toBe(PL);
    expect(normalizePlaylistInput(PL)).toBe(PL);
    expect(normalizePlaylistInput('')).toBeNull();
    expect(normalizePlaylistInput('  ')).toBeNull();
    expect(normalizePlaylistInput(null)).toBeNull();
    expect(normalizePlaylistInput('https://example.com/?list=abc')).toBe(
      undefined
    );
    expect(normalizePlaylistInput(123)).toBe(undefined);
  });
});
