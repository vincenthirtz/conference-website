// tests/unit/tcgRecycleApi.test.ts
// POST /api/player/tcg/recycle — recycler un DOUBLON contre des pièces.
//
// CE QUE CES CAS PROTÈGENT, ET POURQUOI CHACUN EST DANGEREUX SANS EUX.
//
//   1. LE DERNIER EXEMPLAIRE EST INTOUCHABLE. Sans ce refus, « recycler un
//      doublon » deviendrait « détruire sa collection contre de la monnaie » :
//      une joueuse pourrait effacer d'un clic une carte qu'elle est seule à
//      posséder. C'est le cas le plus important du fichier.
//   2. PAS DE DOUBLE RECYCLAGE. Deux clics simultanés créditeraient deux fois
//      la même carte. Deux garde-fous indépendants s'y opposent — le marquage
//      atomique (`recycled_at IS NULL`) et l'unicité du registre — et ce test
//      couvre le premier.
//   3. LA CARTE QUITTE LA COLLECTION MAIS RESTE EXPLICABLE. Elle est marquée,
//      pas supprimée : c'est ce qui permet au registre de justifier le crédit.
//      Un test vérifie les deux moitiés, parce que n'en tenir qu'une donnerait
//      soit une carte fantôme, soit un crédit inexplicable.
//   4. LE MONTANT VIENT DES CONSTANTES. Écrire « 30 » en dur figerait un
//      barème que le code dérive exprès de BOOSTER_PRICE_COINS.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { RECYCLE_REFUND_COINS } from '../../utils/tcg/economy';

import handler from '../../pages/api/player/tcg/recycle';

const PLAYER = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const PACK = '22222222-2222-4222-8222-222222222222';
const SUBJECT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const SUBJECT_B = 'bbbbbbbb-0000-4000-8000-000000000002';

let _token = 0;
function makeReq(body: Record<string, unknown>, over: any = {}): any {
  _token += 1;
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_token}` },
    cookies: {},
    query: {},
    body,
    ...over,
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

/** Un paquet OUVERT appartenant à la joueuse. */
function seedOpenedPack(userId = PLAYER) {
  store.tcg_packs = [
    {
      id: PACK,
      tenant_id: DEFAULT_TENANT_ID,
      user_id: userId,
      opened_at: '2026-01-02T00:00:00.000Z',
    },
  ] as any;
}

function card(position: number, subject: string, over: any = {}) {
  return {
    pack_id: PACK,
    position,
    subject_kind: 'player',
    card_user_id: subject,
    card_team_id: null,
    rarity: 'common',
    is_foil: false,
    recycled_at: null,
    ...over,
  };
}

const cards = () => (store.tcg_pack_cards ?? []) as any[];
const entries = () => (store.tcg_wallet_entries ?? []) as any[];

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: PLAYER });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/player/tcg/recycle', () => {
  it('refuse de recycler le SEUL exemplaire d’une carte', async () => {
    // LE cas qui distingue « recycler un doublon » de « détruire sa
    // collection ». Un exemplaire unique n'est pas un doublon.
    seedOpenedPack();
    store.tcg_pack_cards = [card(0, SUBJECT_A), card(1, SUBJECT_B)] as any;

    const res = makeRes();
    await handler(makeReq({ packId: PACK, position: 0 }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('not_a_duplicate');
    // Rien n'a bougé : ni marquage, ni crédit.
    expect(cards()[0].recycled_at).toBeNull();
    expect(entries()).toHaveLength(0);
  });

  it('recycle un doublon : la carte quitte la collection ET le crédit est tracé', async () => {
    seedOpenedPack();
    store.tcg_pack_cards = [card(0, SUBJECT_A), card(1, SUBJECT_A)] as any;

    const res = makeRes();
    await handler(makeReq({ packId: PACK, position: 0 }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.refund).toBe(RECYCLE_REFUND_COINS);

    // La carte est MARQUÉE, pas supprimée : la ligne subsiste pour que le
    // crédit reste explicable dans l'historique du porte-monnaie.
    const recycled = cards().find((c) => c.position === 0);
    expect(recycled).toBeTruthy();
    expect(recycled.recycled_at).toBeTruthy();
    // L'autre exemplaire est intact.
    expect(cards().find((c) => c.position === 1).recycled_at).toBeNull();

    // Le crédit désigne LA carte, ce qui rend un rejeu impossible.
    expect(entries()).toHaveLength(1);
    expect(entries()[0].amount).toBe(RECYCLE_REFUND_COINS);
    expect(entries()[0].source_kind).toBe('card_recycled');
    expect(entries()[0].source_ref).toBe(`${PACK}:0`);
  });

  it('refuse de recycler deux fois la même carte', async () => {
    // Le marquage exige `recycled_at IS NULL` : le second appel ne touche
    // aucune ligne, donc ne crédite rien.
    seedOpenedPack();
    store.tcg_pack_cards = [
      card(0, SUBJECT_A),
      card(1, SUBJECT_A),
      card(2, SUBJECT_A),
    ] as any;

    await handler(makeReq({ packId: PACK, position: 0 }), makeRes());
    const res2 = makeRes();
    await handler(makeReq({ packId: PACK, position: 0 }), res2);

    expect(res2.statusCode).toBe(409);
    expect(res2.body.code).toBe('already_recycled');
    // Un seul crédit, malgré deux appels.
    expect(entries()).toHaveLength(1);
  });

  it('ne compte pas les cartes DÉJÀ recyclées comme des doublons', async () => {
    // Deux exemplaires dont un déjà recyclé = un seul possédé. Recycler le
    // dernier reviendrait à vider la collection en deux temps.
    seedOpenedPack();
    store.tcg_pack_cards = [
      card(0, SUBJECT_A, { recycled_at: '2026-01-03T00:00:00.000Z' }),
      card(1, SUBJECT_A),
    ] as any;

    const res = makeRes();
    await handler(makeReq({ packId: PACK, position: 1 }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('not_a_duplicate');
  });

  it('ne recycle pas la carte de quelqu’un d’autre', async () => {
    // 404 et non 403 : on ne confirme pas l'existence d'une carte qui n'est
    // pas la sienne.
    seedOpenedPack(OTHER);
    store.tcg_pack_cards = [card(0, SUBJECT_A), card(1, SUBJECT_A)] as any;

    const res = makeRes();
    await handler(makeReq({ packId: PACK, position: 0 }), res);

    expect(res.statusCode).toBe(404);
    expect(entries()).toHaveLength(0);
  });

  it('ignore les cartes d’un paquet encore FERMÉ', async () => {
    // Une carte d'un paquet non ouvert n'est pas encore possédée.
    store.tcg_packs = [
      {
        id: PACK,
        tenant_id: DEFAULT_TENANT_ID,
        user_id: PLAYER,
        opened_at: null,
      },
    ] as any;
    store.tcg_pack_cards = [card(0, SUBJECT_A), card(1, SUBJECT_A)] as any;

    const res = makeRes();
    await handler(makeReq({ packId: PACK, position: 0 }), res);

    expect(res.statusCode).toBe(404);
  });

  it('refuse une requête sans carte désignée', async () => {
    const res = makeRes();
    await handler(makeReq({}), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('missing_card');
  });

  it('refuse une méthode non autorisée', async () => {
    const res = makeRes();
    await handler(makeReq({}, { method: 'GET' }), res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });
});

describe('POST /api/player/tcg/recycle — recyclages concurrents (audit du 2026-09-15)', () => {
  it('SCÉNARIO : deux recyclages simultanés des DEUX derniers exemplaires ne détruisent pas le dernier', async () => {
    // AVANT : chaque requête comptait « 2 exemplaires » AVANT de réserver, puis
    // réservait SA carte (`recycled_at IS NULL` protège une carte, pas un
    // sujet) → les deux passaient, la joueuse perdait sa dernière carte.
    // On simule la requête concurrente : elle réserve la position 1 juste après
    // notre lecture de contrôle, avant notre réservation de la position 0.
    seedOpenedPack();
    store.tcg_pack_cards = [card(0, SUBJECT_A), card(1, SUBJECT_A)] as any;

    const real = supabaseAdmin.from.bind(supabaseAdmin);
    let cardReads = 0;
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      const builder: any = real(table);
      if (table === 'tcg_pack_cards') {
        const originalThen = builder.then.bind(builder);
        builder.then = (onFulfilled: any, onRejected: any) =>
          originalThen((result: any) => {
            // La première lecture est le contrôle « au moins deux exemplaires ».
            if (builder.op === 'select' && ++cardReads === 1) {
              cards()[1].recycled_at = '2026-09-15T10:00:00.000Z';
            }
            return onFulfilled ? onFulfilled(result) : result;
          }, onRejected);
      }
      return builder;
    });

    const res = makeRes();
    await handler(makeReq({ packId: PACK, position: 0 }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('not_a_duplicate');
    // Notre réservation est relâchée : il reste un exemplaire non recyclé.
    expect(cards()[0].recycled_at).toBeNull();
    expect(cards().filter((c) => c.recycled_at === null)).toHaveLength(1);
    // Et aucune pièce n'a été créée pour une carte rendue.
    expect(entries()).toHaveLength(0);
  });

  it('un recompte illisible annule le recyclage (500) et relâche la réservation', async () => {
    seedOpenedPack();
    store.tcg_pack_cards = [card(0, SUBJECT_A), card(1, SUBJECT_A)] as any;
    const real = supabaseAdmin.from.bind(supabaseAdmin);
    let cardReads = 0;
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      const builder: any = real(table);
      if (table === 'tcg_pack_cards') {
        const originalThen = builder.then.bind(builder);
        builder.then = (onFulfilled: any, onRejected: any) => {
          if (builder.op === 'select' && ++cardReads === 2) {
            return Promise.resolve({
              data: null,
              error: { message: '504 upstream' },
            }).then(onFulfilled, onRejected);
          }
          return originalThen(onFulfilled, onRejected);
        };
      }
      return builder;
    });

    const res = makeRes();
    await handler(makeReq({ packId: PACK, position: 0 }), res);

    expect(res.statusCode).toBe(500);
    expect(cards().every((c) => c.recycled_at === null)).toBe(true);
    expect(entries()).toHaveLength(0);
  });
});
