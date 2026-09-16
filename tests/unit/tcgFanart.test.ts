// Cartes FAN ART : proposition, modération, tirage, crédits.
// Targets : utils/tcg/fanart.ts, utils/tcg/drawPack.ts,
//           pages/api/player/tcg/fanart.ts, pages/api/admin/tcg/fanart.ts
//
// CE QUE CES CAS PROTÈGENT, par ordre d'importance :
//   1. RIEN N'EST PUBLIÉ SANS ACCORD NI SANS RELECTURE. Une proposition sans
//      déclaration d'originalité est refusée, et une proposition naît toujours
//      `pending` — le bucket est public.
//   2. LE CRÉDIT SUIT L'ŒUVRE. Le nom à créditer est une donnée obligatoire,
//      rendue partout où la carte apparaît.
//   3. UNE FAN ART NE PREND JAMAIS LA PLACE D'UNE JOUEUSE : elle partage
//      l'emplacement de décor avec les maps, et la composition du paquet ne
//      bouge pas.
//   4. RETIRER N'EST PAS SUPPRIMER : une œuvre retirée sort des paquets à
//      venir ; on ne casse pas les collections.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  DEFAULT_FANART_RARITY,
  MAX_PENDING_FANART,
  displayableArtistUrl,
  pickDecorKind,
} from '../../utils/tcg/fanart';
import { PACK_SIZE, pickPackSubjects } from '../../utils/tcg/drawPack';
import playerHandler from '../../pages/api/player/tcg/fanart';
import adminHandler from '../../pages/api/admin/tcg/fanart';

const PLAYER = '11111111-0000-4000-8000-000000000001';
const STAFF = '22222222-0000-4000-8000-000000000002';
const FANART = '33333333-0000-4000-8000-000000000003';

// 1×1 PNG valide (magic bytes corrects) — le serveur vérifie le contenu.
const PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let _token = 0;
function makeReq(over: Partial<any> = {}): any {
  _token += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_token}` },
    cookies: {},
    query: {},
    body: {},
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

const submissions = () => (store.tcg_fanart_cards ?? []) as any[];

function validBody(over: Record<string, unknown> = {}) {
  return {
    data: PNG_BASE64,
    mimeType: 'image/png',
    title: 'Hinode en garde',
    artistName: 'Lya',
    licenceAccepted: true,
    ...over,
  };
}

function seedApproved(over: Record<string, unknown> = {}) {
  store.tcg_fanart_cards = [
    {
      id: FANART,
      tenant_id: DEFAULT_TENANT_ID,
      submitted_by: PLAYER,
      title: 'Hinode en garde',
      artist_name: 'Lya',
      artist_url: 'https://lya.example/art',
      image_path: 'tcg-fanart/lya.png',
      status: 'approved',
      rarity: 'epic',
      review_notes: null,
      created_at: '2026-09-15T10:00:00.000Z',
      reviewed_at: '2026-09-16T10:00:00.000Z',
      ...over,
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: PLAYER });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('emplacement de décor', () => {
  it('reste une map tant qu’aucune fan art n’est validée', () => {
    expect(pickDecorKind({ roll: 0, hasFanart: false, hasMaps: true })).toBe(
      'map'
    );
    // Tirage absent ou aberrant : comportement d'AVANT les fan arts.
    expect(
      pickDecorKind({ roll: Number.NaN, hasFanart: true, hasMaps: true })
    ).toBe('map');
  });

  it('partage la place avec les maps, jamais celle d’une joueuse', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const withFanart = pickPackSubjects({
      playerIds: players,
      teamIds: ['t1'],
      mapSlugs: ['ilios'],
      fanartIds: ['f1'],
      decorRoll: 0.1, // < FANART_DECOR_SHARE → décor = fan art
      rolls: Array.from({ length: PACK_SIZE * 4 }, () => 0.5),
    });
    expect(withFanart).toHaveLength(PACK_SIZE);
    expect(withFanart.filter((s) => s.kind === 'fanart')).toHaveLength(1);
    expect(withFanart.filter((s) => s.kind === 'map')).toHaveLength(0);
    // Le nombre de joueuses ne bouge pas : 5 - 1 équipe - 1 décor = 3.
    expect(withFanart.filter((s) => s.kind === 'player')).toHaveLength(3);

    const withMap = pickPackSubjects({
      playerIds: players,
      teamIds: ['t1'],
      mapSlugs: ['ilios'],
      fanartIds: ['f1'],
      decorRoll: 0.9, // ≥ part → décor = map
      rolls: Array.from({ length: PACK_SIZE * 4 }, () => 0.5),
    });
    expect(withMap.filter((s) => s.kind === 'map')).toHaveLength(1);
    expect(withMap.filter((s) => s.kind === 'fanart')).toHaveLength(0);
    expect(withMap.filter((s) => s.kind === 'player')).toHaveLength(3);
  });

  it('n’affiche un lien d’autrice que s’il est http(s)', () => {
    expect(displayableArtistUrl('https://lya.example')).toBe(
      'https://lya.example/'
    );
    expect(displayableArtistUrl('javascript:alert(1)')).toBeNull();
    expect(displayableArtistUrl(null)).toBeNull();
  });
});

describe('POST /api/player/tcg/fanart', () => {
  it('enregistre une proposition EN ATTENTE, avec son crédit', async () => {
    const res = makeRes();
    await playerHandler(makeReq({ method: 'POST', body: validBody() }), res);
    expect(res.statusCode).toBe(201);
    expect(submissions()).toHaveLength(1);
    expect(submissions()[0]).toMatchObject({
      status: 'pending',
      artist_name: 'Lya',
      title: 'Hinode en garde',
      submitted_by: PLAYER,
    });
    // La proposition VAUT déclaration : la date est posée.
    expect(submissions()[0].licence_accepted_at).toBeTruthy();
    // Aucune rareté avant validation : c'est le staff qui décide.
    expect(submissions()[0].rarity ?? null).toBeNull();
  });

  it('refuse sans déclaration d’originalité', async () => {
    const res = makeRes();
    await playerHandler(
      makeReq({
        method: 'POST',
        body: validBody({ licenceAccepted: false }),
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('licence');
    expect(submissions()).toHaveLength(0);
  });

  it('exige un nom à créditer', async () => {
    const res = makeRes();
    await playerHandler(
      makeReq({ method: 'POST', body: validBody({ artistName: ' ' }) }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('artist_name');
    expect(submissions()).toHaveLength(0);
  });

  it('plafonne les propositions en attente', async () => {
    store.tcg_fanart_cards = Array.from(
      { length: MAX_PENDING_FANART },
      (_, i) => ({
        id: `pending-${i}`,
        tenant_id: DEFAULT_TENANT_ID,
        submitted_by: PLAYER,
        title: `Essai ${i}`,
        artist_name: 'Lya',
        image_path: `tcg-fanart/${i}.png`,
        status: 'pending',
        created_at: '2026-09-15T10:00:00.000Z',
      })
    ) as any;
    const res = makeRes();
    await playerHandler(makeReq({ method: 'POST', body: validBody() }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('too_many_pending');
    expect(submissions()).toHaveLength(MAX_PENDING_FANART);
  });

  it('retire une proposition en attente, jamais une validée', async () => {
    seedApproved({ status: 'pending', rarity: null });
    const ok = makeRes();
    await playerHandler(
      makeReq({ method: 'DELETE', query: { id: FANART } }),
      ok
    );
    expect(ok.statusCode).toBe(200);
    expect(submissions()).toHaveLength(0);

    seedApproved();
    const refused = makeRes();
    await playerHandler(
      makeReq({ method: 'DELETE', query: { id: FANART } }),
      refused
    );
    expect(refused.statusCode).toBe(409);
    expect(submissions()).toHaveLength(1);
  });
});

describe('PATCH /api/admin/tcg/fanart', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-staff' });
    store.staff = [
      {
        id: STAFF,
        auth_user_id: 'user-staff',
        email: 'staff@example.com',
        role: 'owner',
        is_pole_admin: false,
      },
    ] as any;
  });

  it('valide en décidant d’une rareté', async () => {
    seedApproved({ status: 'pending', rarity: null });
    const res = makeRes();
    await adminHandler(
      makeReq({
        method: 'PATCH',
        body: { action: 'approve', id: FANART, rarity: 'legendary' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(submissions()[0]).toMatchObject({
      status: 'approved',
      rarity: 'legendary',
      reviewed_by: STAFF,
    });
  });

  it('valide avec la rareté par défaut quand aucune n’est choisie', async () => {
    seedApproved({ status: 'pending', rarity: null });
    const res = makeRes();
    await adminHandler(
      makeReq({ method: 'PATCH', body: { action: 'approve', id: FANART } }),
      res
    );
    expect(submissions()[0].rarity).toBe(DEFAULT_FANART_RARITY);
  });

  it('refuse avec un motif, et pas sans', async () => {
    seedApproved({ status: 'pending', rarity: null });
    const sansMotif = makeRes();
    await adminHandler(
      makeReq({ method: 'PATCH', body: { action: 'reject', id: FANART } }),
      sansMotif
    );
    expect(sansMotif.statusCode).toBe(400);
    expect(submissions()[0].status).toBe('pending');

    const avecMotif = makeRes();
    await adminHandler(
      makeReq({
        method: 'PATCH',
        body: { action: 'reject', id: FANART, notes: 'Hors sujet.' },
      }),
      avecMotif
    );
    expect(avecMotif.statusCode).toBe(200);
    expect(submissions()[0]).toMatchObject({
      status: 'rejected',
      review_notes: 'Hors sujet.',
    });
  });

  it('retire une œuvre validée SANS la supprimer', async () => {
    seedApproved();
    const res = makeRes();
    await adminHandler(
      makeReq({
        method: 'PATCH',
        body: { action: 'revoke', id: FANART, notes: 'Demande de l’autrice.' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    // La ligne EXISTE toujours : des cartes tirées la référencent.
    expect(submissions()).toHaveLength(1);
    expect(submissions()[0].status).toBe('revoked');
  });

  it('ne tranche pas deux fois la même proposition', async () => {
    seedApproved({ status: 'rejected', rarity: null });
    const res = makeRes();
    await adminHandler(
      makeReq({
        method: 'PATCH',
        body: { action: 'approve', id: FANART, rarity: 'rare' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(submissions()[0].status).toBe('rejected');
  });

  it('ne rend que la file demandée, sans l’identité de la proposante', async () => {
    seedApproved({ status: 'pending', rarity: null });
    const res = makeRes();
    await adminHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).not.toHaveProperty('submittedBy');
    expect(res.body.items[0].artistName).toBe('Lya');
  });
});
