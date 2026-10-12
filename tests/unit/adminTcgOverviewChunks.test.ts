// tests/unit/adminTcgOverviewChunks.test.ts
//
// LA LECTURE DES CARTES DE LA VUE D'ENSEMBLE, PAR TRANCHES.
//
// `overviewCards` reçoit jusqu'à OVERVIEW_MAX_PACKS (5000) identifiants de
// paquets. En une seule liste `.in()`, c'est une URL que PostgREST refuse : la
// vue d'ensemble d'un espace actif tombait en « cartes illisibles ». Ces tests
// épinglent le découpage (plusieurs requêtes, aucune au-delà de la tranche),
// la fusion des résultats et le plafond total conservé.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import {
  overviewCards,
  OVERVIEW_PACK_CHUNK,
  OVERVIEW_MAX_CARDS,
} from '../../features/admin/tcg/repository';

function packIds(n: number) {
  return Array.from({ length: n }, (_, i) => `pack-${i}`);
}

function seedCards(ids: string[], perPack = 1) {
  store.tcg_pack_cards = ids.flatMap((pack_id) =>
    Array.from({ length: perPack }, (_, position) => ({
      pack_id,
      position,
      subject_kind: 'player',
      card_user_id: 'u',
      card_team_id: null,
      card_map_slug: null,
      card_fanart_id: null,
      card_mascot_slug: null,
      rarity: 'common',
      is_foil: false,
      recycled_at: null,
    }))
  ) as any;
}

/** Espionne chaque `.in('pack_id', …)` envoyé à `tcg_pack_cards`. */
function spyInLists() {
  const lists: string[][] = [];
  const realFrom = supabaseAdmin.from;
  vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
    const builder: any = realFrom(table);
    if (table === 'tcg_pack_cards') {
      const realIn = builder.in.bind(builder);
      builder.in = (col: string, vals: string[]) => {
        lists.push([...vals]);
        return realIn(col, vals);
      };
    }
    return builder;
  });
  return lists;
}

beforeEach(() => {
  resetSupabaseMock();
  vi.restoreAllMocks();
});

describe('overviewCards — `.in()` par tranches', () => {
  it('découpe plus de 200 paquets en plusieurs requêtes et fusionne', async () => {
    const ids = packIds(450);
    seedCards(ids, 2);
    const lists = spyInLists();

    const { rows, error } = await overviewCards(supabaseAdmin as any, ids);

    expect(error).toBeNull();
    expect(lists).toHaveLength(3);
    for (const list of lists) {
      expect(list.length).toBeLessThanOrEqual(OVERVIEW_PACK_CHUNK);
    }
    // Chaque paquet demandé une fois et une seule.
    expect(lists.flat().sort()).toEqual([...ids].sort());
    // Toutes les cartes de toutes les tranches.
    expect(rows).toHaveLength(900);
  });

  it('200 paquets ou moins : une seule requête', async () => {
    const ids = packIds(OVERVIEW_PACK_CHUNK);
    seedCards(ids);
    const lists = spyInLists();
    const { rows } = await overviewCards(supabaseAdmin as any, ids);
    expect(lists).toHaveLength(1);
    expect(rows).toHaveLength(OVERVIEW_PACK_CHUNK);
  });

  it('le plafond reste TOTAL : jamais plus de OVERVIEW_MAX_CARDS lignes', async () => {
    const ids = packIds(5000);
    seedCards(ids, 5); // 25 000 cartes > 20 000
    const { rows, error } = await overviewCards(supabaseAdmin as any, ids);
    expect(error).toBeNull();
    expect(rows).toHaveLength(OVERVIEW_MAX_CARDS);
  });

  it('une tranche en échec fait échouer l’ensemble (pas de total partiel)', async () => {
    const ids = packIds(450);
    seedCards(ids);
    const realFrom = supabaseAdmin.from;
    let n = 0;
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      const builder: any = realFrom(table);
      if (table === 'tcg_pack_cards' && ++n === 2) {
        builder.limit = () =>
          Promise.resolve({ data: null, error: { message: 'boom' } });
      }
      return builder;
    });
    const { rows, error } = await overviewCards(supabaseAdmin as any, ids);
    expect(error).toMatchObject({ message: 'boom' });
    expect(rows).toEqual([]);
  });
});
