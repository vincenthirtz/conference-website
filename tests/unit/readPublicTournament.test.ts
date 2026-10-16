// utils/tournament/readPublicTournament — l'en-tête des pages /tournament/[id]/*
// en UNE lecture : la ligne du tournoi et sa playlist « Reviews ».
//
// CE QUE CE CAS PROTÈGE :
//   - UUID puis slug, scopés au tenant (même règle que findTournamentByIdOrSlug) ;
//   - la colonne Reviews ne fuit pas dans les props quand la page ne l'a pas
//     demandée ; une valeur corrompue n'en sort jamais ;
//   - environnement non migré (colonne absente) : la page s'affiche, onglet
//     Reviews masqué — au prix d'une seconde lecture, là seulement ;
//   - une seule requête `tournaments` dans le cas nominal.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  fromCalls,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { readPublicTournament } from '../../utils/tournament/readPublicTournament';

const TOUR = 'eeeeeeee-0000-4000-8000-000000000001';
const OTHER_TENANT = 'aaaaaaaa-0000-4000-8000-00000000000f';
const PL = 'PLBu9E8qChrHcAbCdEfGhIjKlMnOpQrStU';

type T = { id: string; slug: string | null; name: string; status: string };

function seed(extra: Record<string, unknown> = {}) {
  store.tournaments = [
    {
      id: TOUR,
      tenant_id: DEFAULT_TENANT_ID,
      slug: 'cup',
      name: 'Cup',
      status: 'running',
      visibility: 'public',
      ...extra,
    },
  ] as any;
}

/** Les sélections passées à `.select()` sur `tournaments`, dans l'ordre. */
function spySelects() {
  const selects: string[] = [];
  const original = supabaseAdmin.from.bind(supabaseAdmin);
  vi.spyOn(supabaseAdmin, 'from').mockImplementation(((table: string) => {
    const builder = original(table) as any;
    if (table !== 'tournaments') return builder;
    const select = builder.select.bind(builder);
    builder.select = (cols: string, opts?: unknown) => {
      selects.push(cols);
      return select(cols, opts);
    };
    return builder;
  }) as typeof supabaseAdmin.from);
  return selects;
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetSupabaseMock();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('readPublicTournament', () => {
  it('par slug : la ligne et la playlist, en une requête', async () => {
    seed({ reviews_playlist_id: PL });
    const selects = spySelects();
    const res = await readPublicTournament<T>(
      'cup',
      'id, slug, name, status',
      DEFAULT_TENANT_ID
    );
    expect(res?.tournament).toMatchObject({ id: TOUR, name: 'Cup' });
    expect(res?.reviewsPlaylistId).toBe(PL);
    expect(fromCalls.filter((t) => t === 'tournaments')).toHaveLength(1);
    expect(selects).toEqual(['id, slug, name, status, reviews_playlist_id']);
  });

  it('par UUID', async () => {
    seed();
    const res = await readPublicTournament<T>(TOUR, 'id, name');
    expect(res?.tournament.id).toBe(TOUR);
    expect(res?.reviewsPlaylistId).toBeNull();
    expect(fromCalls.filter((t) => t === 'tournaments')).toHaveLength(1);
  });

  it('un UUID inconnu retombe sur le slug', async () => {
    const SLUG_LOOKS_LIKE_UUID = 'bbbbbbbb-0000-4000-8000-000000000001';
    seed({ slug: SLUG_LOOKS_LIKE_UUID });
    const res = await readPublicTournament<T>(SLUG_LOOKS_LIKE_UUID, 'id');
    expect(res?.tournament.id).toBe(TOUR);
  });

  it('ne fuit pas la colonne Reviews dans la ligne rendue', async () => {
    seed({ reviews_playlist_id: PL });
    const res = await readPublicTournament<Record<string, unknown>>(
      'cup',
      'id, name'
    );
    expect(res?.tournament).not.toHaveProperty('reviews_playlist_id');
  });

  it('`*` : la ligne est rendue telle quelle, sans colonne ajoutée', async () => {
    seed({ reviews_playlist_id: PL });
    const selects = spySelects();
    const res = await readPublicTournament<Record<string, unknown>>('cup', '*');
    expect(selects).toEqual(['*']);
    expect(res?.reviewsPlaylistId).toBe(PL);
    expect(res?.tournament.reviews_playlist_id).toBe(PL);
  });

  it('valeur corrompue → pas de playlist', async () => {
    seed({ reviews_playlist_id: 'x"><script>' });
    const res = await readPublicTournament<T>('cup', 'id');
    expect(res?.reviewsPlaylistId).toBeNull();
  });

  it('introuvable, ou autre tenant → null', async () => {
    seed({ tenant_id: OTHER_TENANT });
    expect(await readPublicTournament<T>('cup', 'id')).toBeNull();
    expect(await readPublicTournament<T>('', 'id')).toBeNull();
  });

  it('colonne Reviews absente (base non migrée) → ligne sans playlist', async () => {
    seed({ reviews_playlist_id: PL });
    const original = supabaseAdmin.from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin, 'from').mockImplementation(((table: string) => {
      const builder = original(table) as any;
      if (table !== 'tournaments') return builder;
      const select = builder.select.bind(builder);
      builder.select = (cols: string, opts?: unknown) => {
        if (!cols.includes('reviews_playlist_id')) return select(cols, opts);
        // Postgres : colonne inconnue → toute la requête échoue.
        const failing: any = {
          eq: () => failing,
          maybeSingle: async () => ({
            data: null,
            error: {
              code: '42703',
              message: 'column tournaments.reviews_playlist_id does not exist',
            },
          }),
        };
        return failing;
      };
      return builder;
    }) as typeof supabaseAdmin.from);

    const res = await readPublicTournament<T>('cup', 'id, name');
    expect(res?.tournament).toMatchObject({ id: TOUR, name: 'Cup' });
    expect(res?.reviewsPlaylistId).toBeNull();
  });

  it('autre erreur de lecture → null (la page rend 404, comme avant)', async () => {
    seed();
    const original = supabaseAdmin.from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin, 'from').mockImplementation(((table: string) => {
      if (table !== 'tournaments') return original(table);
      const failing: any = {
        select: () => failing,
        eq: () => failing,
        maybeSingle: async () => ({
          data: null,
          error: { code: '57014', message: 'canceling statement' },
        }),
      };
      return failing;
    }) as typeof supabaseAdmin.from);
    expect(await readPublicTournament<T>('cup', 'id')).toBeNull();
  });
});
