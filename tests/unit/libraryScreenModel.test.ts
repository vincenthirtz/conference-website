// Women's Library, lot 4 — la logique pure de l'écran « Mon appartement » :
// porte, messages d'erreur, inventaire posé / rangé, corps du PATCH
// (model.ts), passage au RoomModel du moteur (apartmentModel.ts) et vignettes
// tirées du manifeste (sprites.ts).

import { describe, expect, it } from 'vitest';
import {
  applyPurchase,
  apartmentSettingsPatch,
  furnitureName,
  groupInventory,
  humanizeKey,
  libraryErrorCode,
  libraryErrorNumber,
  libraryGateOf,
  ownedCounts,
  placementSpecsOf,
} from '../../features/player/library/model';
import {
  apartmentRenderKey,
  apartmentRoomModel,
  apartmentStartTile,
  wallSlots,
} from '../../features/player/library/apartmentModel';
import {
  avatarIdleBox,
  avatarSheetOf,
  cssUrl,
  furnitureFrame,
} from '../../features/player/library/sprites';
import type { AvatarSheet } from '../../features/player/library/engine/avatarSprites';
import type { LibraryManifest } from '../../features/player/library/engine/assets';
import type {
  LibraryApartmentResponse,
  LibraryMeResponse,
} from '../../features/player/library/responses';

const httpError = (status: number, payload: Record<string, unknown>) =>
  Object.assign(new Error('x'), {
    status,
    code: (payload.code as string) ?? null,
    payload,
  });

describe('porte de la Library', () => {
  it.each([
    ['LIBRARY_ADULT_REQUIRED', 403, 'attest'],
    ['LIBRARY_MINOR', 403, 'minor'],
    ['LIBRARY_BANNED', 403, 'banned'],
    ['library_unavailable', 503, 'unavailable'],
    ['library_read_failed', 500, 'error'],
  ])('%s (%i) → %s', (code, status, gate) => {
    expect(
      libraryGateOf({ isPending: false, error: httpError(status, { code }) })
    ).toBe(gate);
  });

  it('en cours → loading ; lue → ready ; panne réseau → error', () => {
    expect(libraryGateOf({ isPending: true, error: null })).toBe('loading');
    expect(libraryGateOf({ isPending: false, error: null })).toBe('ready');
    expect(
      libraryGateOf({ isPending: false, error: new TypeError('fetch') })
    ).toBe('error');
  });

  it('lit le code et les champs du corps d’erreur', () => {
    const err = httpError(400, {
      code: 'insufficient_funds',
      balance: 40,
      price: 75,
    });
    expect(libraryErrorCode(err)).toBe('insufficient_funds');
    expect(libraryErrorNumber(err, 'balance')).toBe(40);
    expect(libraryErrorNumber(err, 'absent')).toBeNull();
    expect(libraryErrorCode('nope')).toBeNull();
  });
});

describe('noms, inventaire, achat', () => {
  it('nom traduit, sinon la clé lisible', () => {
    expect(furnitureName({ lamp: 'Lampe' }, 'lamp')).toBe('Lampe');
    expect(furnitureName({ lamp: 'Lampe' }, 'coffee_table')).toBe(
      'coffee table'
    );
    expect(humanizeKey('rug__round_')).toBe('rug round');
    // Une clé héritée d'Object n'est pas un nom.
    expect(furnitureName({}, 'constructor')).toBe('constructor');
  });

  it('regroupe par meuble, posés et rangés', () => {
    const inv = [
      { id: '1', key: 'lamp', acquiredAt: '' },
      { id: '2', key: 'lamp', acquiredAt: '' },
      { id: '3', key: 'armchair', acquiredAt: '' },
    ];
    expect(groupInventory(inv, new Set(['2']))).toEqual([
      { key: 'lamp', total: 2, placed: 1, ids: ['1', '2'] },
      { key: 'armchair', total: 1, placed: 0, ids: ['3'] },
    ]);
    expect(ownedCounts(inv)).toEqual(
      new Map([
        ['lamp', 2],
        ['armchair', 1],
      ])
    );
  });

  it('un achat met le solde du registre et ajoute le meuble une seule fois', () => {
    const me: LibraryMeResponse = {
      attested: true,
      attestedAt: '2026-10-01T00:00:00.000Z',
      avatar: { nickname: 'Lune', avatarId: 'a01', look: {} },
      inventory: [{ id: 'old', key: 'lamp', acquiredAt: '' }],
      inventoryTruncated: false,
      balance: 300,
    };
    const purchase = {
      inventoryId: 'new',
      key: 'armchair',
      price: 250,
      balance: 50,
      replayed: false,
    };
    const after = applyPurchase(me, purchase, new Date('2026-10-19T10:00:00Z'));
    expect(after.balance).toBe(50);
    expect(after.inventory.map((i) => i.id)).toEqual(['old', 'new']);
    // Rejoué : le meuble est déjà là, il n'est pas doublé.
    expect(
      applyPurchase(after, { ...purchase, replayed: true }).inventory
    ).toHaveLength(2);
  });

  it('les specs de placement viennent du catalogue de l’API, calque compris', () => {
    const specs = placementSpecsOf([
      {
        key: 'rug_red',
        category: 'rug',
        footprint: { w: 6, d: 4 },
        heightM: 0.02,
        price: 400,
        sittable: false,
        stackable: false,
        layer: 'floor',
      },
    ]);
    expect(specs.get('rug_red')).toEqual({
      footprint: { w: 6, d: 4 },
      layer: 'floor',
    });
  });
});

describe('réglages : le PATCH ne porte que ce qui change', () => {
  const room = {
    id: 'r',
    name: 'Chez Lune',
    access: 'private' as const,
    listed: false,
    width: 14,
    depth: 12,
    decor: { floor: 'parquet' as const, wall: 'plain' as const },
    version: 0,
  };
  const form = {
    name: 'Chez Lune',
    access: 'private' as const,
    listed: false,
    floor: 'parquet',
    wall: 'plain',
  };

  it('rien de changé → corps vide', () => {
    expect(apartmentSettingsPatch(room, form)).toEqual({});
  });

  it('nom vidé → null ; ouvrir et lister ; sol seul', () => {
    expect(
      apartmentSettingsPatch(room, {
        ...form,
        name: '  ',
        access: 'open',
        listed: true,
        floor: 'tiles',
      })
    ).toEqual({
      name: null,
      access: 'open',
      listed: true,
      decor: { floor: 'tiles' },
    });
  });

  it('privé : jamais listé', () => {
    expect(
      apartmentSettingsPatch(
        { ...room, access: 'open', listed: true },
        { ...form, access: 'private', listed: true }
      )
    ).toEqual({ access: 'private', listed: false });
  });
});

const APARTMENT: LibraryApartmentResponse = {
  room: {
    id: 'room-1',
    name: null,
    access: 'private',
    listed: false,
    width: 14,
    depth: 12,
    decor: { floor: 'carpet', wall: 'window' },
    version: 2,
  },
  items: [
    { inventoryId: 'i1', key: 'armchair', gx: 6, gy: 5, rotation: 1 },
    { inventoryId: 'i2', key: 'rug_red', gx: 4, gy: 4, rotation: 0 },
  ],
};

describe('de l’appartement à la salle du moteur', () => {
  it('dimensions, meubles (id = ligne d’inventaire), sol, fenêtres', () => {
    const model = apartmentRoomModel(APARTMENT);
    expect(model.w).toBe(14);
    expect(model.d).toBe(12);
    expect(model.items).toEqual([
      { id: 'i1', key: 'armchair', gx: 6, gy: 5, r: 1 },
      { id: 'i2', key: 'rug_red', gx: 4, gy: 4, r: 0 },
    ]);
    expect(model.decor).toEqual({
      floor: 'carpet',
      wallStyle: 'library',
      right: [
        { at: 1, variant: 'window' },
        { at: 5, variant: 'window' },
        { at: 9, variant: 'window' },
      ],
      left: [
        { at: 1, variant: 'window' },
        { at: 5, variant: 'window' },
        { at: 9, variant: 'window' },
      ],
    });
  });

  it('murs pleins : aucune fenêtre ; un mur trop court n’en prend pas', () => {
    expect(wallSlots('plain', 14)).toEqual([]);
    expect(wallSlots('window', 4)).toEqual([{ at: 1, variant: 'window' }]);
    expect(wallSlots('window', 3)).toEqual([]);
  });

  it('l’avatar apparaît sur la case libre la plus proche du centre (un tapis ne bloque pas)', () => {
    const specs = placementSpecsOf([
      {
        key: 'armchair',
        category: 'seating',
        footprint: { w: 2, d: 2 },
        heightM: 1,
        price: 250,
        sittable: true,
        stackable: false,
        layer: 'object',
      },
      {
        key: 'rug_red',
        category: 'rug',
        footprint: { w: 6, d: 4 },
        heightM: 0.02,
        price: 400,
        sittable: false,
        stackable: false,
        layer: 'floor',
      },
    ]);
    // Centre (7, 6) : couvert par le fauteuil (6..7, 5..6).
    const start = apartmentStartTile(APARTMENT, specs);
    expect(start).not.toEqual({ i: 7, j: 6 });
    expect(Math.abs(start.i - 7) + Math.abs(start.j - 6)).toBe(1);
    expect(apartmentStartTile({ ...APARTMENT, items: [] }, specs)).toEqual({
      i: 7,
      j: 6,
    });
  });

  it('la clé de rendu suit le contenu, pas l’identité de l’objet', () => {
    const copy = JSON.parse(JSON.stringify(APARTMENT));
    expect(apartmentRenderKey(copy)).toBe(apartmentRenderKey(APARTMENT));
    copy.items[0].gx = 7;
    expect(apartmentRenderKey(copy)).not.toBe(apartmentRenderKey(APARTMENT));
  });
});

describe('vignettes du manifeste', () => {
  const sheet: AvatarSheet = {
    sheet: { src: '/library/a01.webp', width: 1000, height: 800 },
    animations: {
      idle: {
        fps: 1,
        sheet: { src: '/library/a01.webp', width: 1000, height: 800 },
        directions: {
          0: [{ x: 0, y: 0, w: 100, h: 300, ax: 50, ay: 290 }],
          4: [{ x: 200, y: 400, w: 120, h: 320, ax: 60, ay: 310 }],
        },
      },
    },
  };

  it('avatar : image d’attente face caméra, mise à la hauteur demandée', () => {
    expect(avatarIdleBox(sheet, 80)).toEqual({
      src: '/library/a01.webp',
      width: 30,
      height: 80,
      backgroundWidth: 250,
      backgroundHeight: 200,
      offsetX: -50,
      offsetY: -100,
    });
  });

  it('avatar sans direction 4 : la première rendue ; sans feuille : null', () => {
    const only0: AvatarSheet = {
      ...sheet,
      animations: {
        idle: {
          ...sheet.animations.idle,
          directions: { 0: sheet.animations.idle.directions[0]! },
        },
      },
    };
    expect(avatarIdleBox(only0, 60)?.offsetY).toBe(-0);
    expect(avatarIdleBox(null, 60)).toBeNull();
  });

  it('meuble : sprite de la rotation demandée, null si inconnu', () => {
    const frame = {
      src: '/f/lamp_r0.webp',
      width: 10,
      height: 20,
      anchor: { x: 1, y: 2 },
    };
    const manifest = {
      furniture: {
        lamp: {
          footprint: { w: 1, d: 2 },
          height: 0.9,
          rotations: [frame, frame, frame, frame],
        },
      },
      avatars: { a01: sheet },
    } as unknown as LibraryManifest;
    expect(furnitureFrame(manifest, 'lamp')).toBe(frame);
    expect(furnitureFrame(manifest, 'sofa')).toBeNull();
    expect(furnitureFrame(null, 'lamp')).toBeNull();
    expect(avatarSheetOf(manifest, 'a01')).toBe(sheet);
    expect(avatarSheetOf(manifest, 'toString')).toBeNull();
  });

  it('url CSS : guillemets échappés', () => {
    expect(cssUrl('/a b.webp')).toBe('url("/a b.webp")');
    expect(cssUrl('/x".webp')).toBe('url("/x%22.webp")');
  });
});
