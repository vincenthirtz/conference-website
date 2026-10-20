// features/player/library/dev/fakeClient.ts — un client de la Library EN
// MÉMOIRE, pour la page de développement `/dev/library-apartment` (404 en
// production) : l'écran « Mon appartement » s'y voit et s'y éprouve sans l'API.
//
// Il rend les MÊMES formes que l'API (responses.ts) et refuse comme elle
// l'enregistrement des meubles : version dépassée (409 `room_conflict`),
// meuble inconnu, en double ou mal placé (400 `placement_invalid`, géométrie
// de `placement.ts`). Rien ne quitte le navigateur.

import {
  libraryDecorProblem,
  mergeApartmentDecor,
  resolveApartmentDecor,
} from '@/config/library/decor';
import { getFurniture, LIBRARY_FURNITURE } from '@/config/library/furniture';
import { PlayerHttpError } from '@/utils/player/playerHttp';
import type { LibraryClient } from '../clientContext';
import { placementIssues, placementLayerOf } from '../placement';
import type {
  LibraryApartmentItem,
  LibraryApartmentResponse,
  LibraryMeResponse,
  LibraryPlacementIssue,
} from '../responses';

const AVATARS = Array.from(
  { length: 12 },
  (_, k) => `a${String(k + 1).padStart(2, '0')}`
);

/** Les meubles de la démo : `at` = posé (gx, gy, rotation), sinon rangé. */
const FIXTURES: Array<{
  id: string;
  key: string;
  at?: [number, number, number];
}> = [
  { id: 'inv-01', key: 'coffee_table', at: [6, 6, 0] },
  { id: 'inv-02', key: 'armchair', at: [3, 6, 1] },
  { id: 'inv-03', key: 'bookshelf_filled', at: [5, 0, 0] },
  { id: 'inv-04', key: 'floor_lamp', at: [1, 4, 0] },
  { id: 'inv-05', key: 'plant_tall', at: [12, 1, 0] },
  { id: 'inv-06', key: 'rug_red' },
  { id: 'inv-07', key: 'frame_painting' },
  { id: 'inv-08', key: 'sofa' },
  { id: 'inv-09', key: 'chair' },
  { id: 'inv-10', key: 'cactus' },
  { id: 'inv-11', key: 'lamp' },
];

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Les meubles POSÉS de la démo, tels que l'API les rend (visiteuse simulée comprise). */
export const DEV_APARTMENT_ITEMS: LibraryApartmentItem[] = FIXTURES.flatMap(
  (f) =>
    f.at
      ? [
          {
            inventoryId: f.id,
            key: f.key,
            gx: f.at[0],
            gy: f.at[1],
            rotation: f.at[2],
          },
        ]
      : []
);

function refuse(status: number, code: string, extra: object = {}): never {
  throw new PlayerHttpError('refus (démo)', status, {
    error: 'refus (démo)',
    code,
    ...extra,
  });
}

export function createFakeLibraryClient(
  opts: { latencyMs?: number } = {}
): LibraryClient {
  const latency = opts.latencyMs ?? 250;
  const wait = <T>(v: T) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(clone(v)), latency));

  const me: LibraryMeResponse = {
    attested: true,
    attestedAt: '2026-10-01T08:00:00.000Z',
    avatar: { nickname: 'Lune', avatarId: 'a03', look: {} },
    inventory: FIXTURES.map((f, k) => ({
      id: f.id,
      key: f.key,
      acquiredAt: `2026-10-${String(1 + k).padStart(2, '0')}T10:00:00.000Z`,
    })),
    inventoryTruncated: false,
    balance: 1840,
  };
  const apartment: LibraryApartmentResponse = {
    room: {
      id: 'dev-room',
      name: 'Chez Lune',
      access: 'private',
      listed: false,
      width: 14,
      depth: 12,
      decor: { floor: 'parquet', wall: 'window' },
      version: 1,
    },
    items: clone(DEV_APARTMENT_ITEMS),
  };
  let bought = 0;

  return {
    catalog: () =>
      wait({
        tileSizeM: 0.5,
        rotations: 4,
        furniture: LIBRARY_FURNITURE.map((f) => ({
          key: f.key,
          category: f.category,
          footprint: { ...f.footprint },
          heightM: f.heightM,
          price: f.price,
          sittable: f.sittable,
          stackable: f.stackable,
          layer: placementLayerOf(f),
          // Grand catalogue (lot 11), comme l'API.
          family: f.family,
          variant: f.variant ?? null,
          sets: [...f.sets],
          window: f.window ?? null,
        })),
        avatars: AVATARS,
      }),
    me: () => wait(me),
    attestAdult: () =>
      wait({
        attested: true as const,
        attestedAt: me.attestedAt,
        avatar: me.avatar,
      }),
    buy: async (key: string) => {
      const item = getFurniture(key);
      if (!item) refuse(400, 'unknown_furniture');
      if (me.balance < item.price)
        refuse(400, 'insufficient_funds', {
          balance: me.balance,
          price: item.price,
        });
      bought += 1;
      const id = `inv-new-${bought}`;
      me.balance -= item.price;
      me.inventory.push({ id, key, acquiredAt: new Date().toISOString() });
      return wait({
        inventoryId: id,
        key,
        price: item.price,
        balance: me.balance,
        replayed: false,
      });
    },
    updateAvatar: (input) => {
      if (input.nickname !== undefined) me.avatar.nickname = input.nickname;
      if (input.avatarId !== undefined) me.avatar.avatarId = input.avatarId;
      // Lot 13 : comme l'API, un look remplace l'apparence, `null` la retire.
      if (input.look !== undefined) me.avatar.look = input.look ?? {};
      else if (input.avatarId !== undefined) me.avatar.look = {};
      return wait({ avatar: { ...me.avatar } });
    },
    apartment: () => wait(apartment),
    updateApartment: (input) => {
      const room = apartment.room;
      if (input.name !== undefined) room.name = input.name;
      if (input.access !== undefined) room.access = input.access;
      room.listed = room.access === 'open' && (input.listed ?? room.listed);
      // Décor : mêmes règles que l'API (config/library/decor.ts, lot 12).
      if (input.decor) {
        if (libraryDecorProblem(input.decor))
          throw new PlayerHttpError('Ce décor n’existe pas.', 400, {
            error: 'Ce décor n’existe pas.',
            code: 'decor_invalid',
          });
        room.decor = mergeApartmentDecor(
          resolveApartmentDecor(room.decor),
          input.decor
        );
      }
      return wait({ room });
    },
    saveItems: async (body) => {
      await new Promise((r) => setTimeout(r, latency));
      const room = apartment.room;
      if (body.version !== room.version)
        refuse(409, 'room_conflict', { version: room.version });
      const keyOf = new Map(me.inventory.map((i) => [i.id, i.key]));
      const issues: LibraryPlacementIssue[] = [];
      const seen = new Set<string>();
      for (const i of body.items) {
        if (seen.has(i.inventoryId))
          issues.push({ inventoryId: i.inventoryId, reason: 'duplicate' });
        seen.add(i.inventoryId);
        if (!keyOf.has(i.inventoryId))
          issues.push({ inventoryId: i.inventoryId, reason: 'not_owned' });
      }
      for (const g of placementIssues(
        { width: room.width, depth: room.depth },
        body.items.map((i) => ({ id: i.inventoryId, ...i })),
        (p) => {
          const f = getFurniture(keyOf.get(p.id));
          return f
            ? { footprint: f.footprint, layer: placementLayerOf(f) }
            : null;
        }
      ))
        issues.push({ inventoryId: g.id, reason: g.reason });
      if (issues.length) refuse(400, 'placement_invalid', { issues });
      room.version += 1;
      apartment.items = body.items.map((i) => ({
        inventoryId: i.inventoryId,
        key: keyOf.get(i.inventoryId) as string,
        gx: i.gx,
        gy: i.gy,
        rotation: i.rotation,
      }));
      return clone(apartment);
    },
  };
}
