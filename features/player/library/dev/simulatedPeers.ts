// features/player/library/dev/simulatedPeers.ts — des joueuses SIMULÉES pour
// les pages de développement de la Library (`/dev/library-room`,
// `/dev/library-apartment`, 404 en production), sur le Realtime EN MÉMOIRE
// (`./fakeRealtime.ts`). Aucun réseau.
//
// Chacune entre (présence), puis, à tour de rôle : vise une case LIBRE
// (broadcast `move`), y arrive au rythme d'une marche (la présence suit,
// comme le fait une vraie cliente à l'arrivée), et fait parfois un signe
// permis par la salle (la Grande salle de lecture est silencieuse).

import { useEffect } from 'react';
import {
  encodeLibraryLook,
  randomLibraryLook,
} from '@/config/library/avatarLook';
import { LIBRARY_FURNITURE } from '@/config/library/furniture';
import {
  placementLayerOf,
  placementTiles,
  type PlacementSpec,
} from '../placement';
import { LIBRARY_PEER_EVENTS } from '../realtime/payloads';
import { socialAllowance } from '../realtime/social';
import type { LibraryApartmentItem } from '../responses';
import type { LibraryRoomKind } from '../socialResponses';
import type { FakeRealtime } from './fakeRealtime';

export type DevPeer = {
  userId: string;
  nickname: string;
  avatarId: string;
  /** Look composé (lot 13, forme compacte) ; absent : la feuille `avatarId`. */
  look?: string;
};

/** Un look composé reproductible par rang (lot 13 : la foule est composée). */
function devLook(k: number): string {
  let s = (k + 1) * 2654435761;
  return encodeLibraryLook(
    randomLibraryLook(() => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    })
  );
}

/** Trois joueuses nommées, puis une foule (mesure à 30 avatars). */
export const DEV_PEERS: readonly DevPeer[] = [
  {
    userId: '00000000-0000-4000-8000-000000000011',
    nickname: 'Iris',
    avatarId: 'a05',
    look: devLook(0),
  },
  {
    userId: '00000000-0000-4000-8000-000000000012',
    nickname: 'Nova',
    avatarId: 'a08',
  },
  {
    userId: '00000000-0000-4000-8000-000000000013',
    nickname: 'Sacha',
    avatarId: 'a11',
  },
  ...Array.from({ length: 26 }, (_, k) => ({
    userId: `00000000-0000-4000-8000-0000000001${String(k).padStart(2, '0')}`,
    nickname: `Joueuse ${k + 4}`,
    avatarId: `a${String((k % 12) + 1).padStart(2, '0')}`,
    look: devLook(k + 1),
  })),
];

/** Les empreintes du catalogue (celles qu'aurait rendues `GET catalog`). */
export const DEV_SPECS: ReadonlyMap<string, PlacementSpec> = new Map(
  LIBRARY_FURNITURE.map((f) => [
    f.key,
    { footprint: { ...f.footprint }, layer: placementLayerOf(f) },
  ])
);

type Tile = { i: number; j: number };

/** Les cases qu'aucun objet ne couvre (tapis et cadres ne bloquent pas). */
export function freeTilesOf(
  items: readonly LibraryApartmentItem[],
  width: number,
  depth: number
): Tile[] {
  const blocked = new Set<string>();
  for (const item of items) {
    const spec = DEV_SPECS.get(item.key);
    if (!spec || spec.layer !== 'object') continue;
    for (const t of placementTiles(item, spec)) blocked.add(`${t.i},${t.j}`);
  }
  const out: Tile[] = [];
  for (let j = 0; j < depth; j++)
    for (let i = 0; i < width; i++)
      if (!blocked.has(`${i},${j}`)) out.push({ i, j });
  return out;
}

/** 1,3 m/s = 2,6 cases/s ; un trajet A* fait ~1,2 × la distance. */
const walkMs = (a: Tile, b: Tile) =>
  Math.round(
    ((Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j)) * 1.2) / 2.6) * 1000
  ) + 120;

export function useSimulatedPeers(
  bus: FakeRealtime,
  room: {
    topic: string;
    kind: LibraryRoomKind;
    width: number;
    depth: number;
    items: readonly LibraryApartmentItem[];
  },
  count: number,
  intervalMs = 1_400
) {
  const { topic, kind, width, depth, items } = room;
  useEffect(() => {
    const peers = DEV_PEERS.slice(0, count);
    const free = freeTilesOf(items, width, depth);
    if (!peers.length || !free.length) return undefined;
    const pick = () => free[Math.floor(Math.random() * free.length)];
    const at = new Map(peers.map((p) => [p.userId, pick()]));
    for (const p of peers) {
      const t = at.get(p.userId) as Tile;
      bus.peerJoin(topic, { ...p, gx: t.i, gy: t.j, dir: 4 });
    }
    const { emotes, phrases } = socialAllowance(kind);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const id = setInterval(() => {
      const p = peers[Math.floor(Math.random() * peers.length)];
      const from = at.get(p.userId) as Tile;
      const to = pick();
      bus.peerSend(topic, LIBRARY_PEER_EVENTS.move, {
        userId: p.userId,
        gx: to.i,
        gy: to.j,
        at: Date.now(),
      });
      const arrive = setTimeout(
        () => {
          timers.delete(arrive);
          at.set(p.userId, to);
          bus.peerJoin(topic, { ...p, gx: to.i, gy: to.j, dir: 4 });
        },
        walkMs(from, to)
      );
      timers.add(arrive);
      if (Math.random() < 0.35) {
        const usePhrase = phrases.length > 0 && Math.random() < 0.5;
        if (usePhrase)
          bus.peerSend(topic, LIBRARY_PEER_EVENTS.phrase, {
            userId: p.userId,
            phraseId: phrases[Math.floor(Math.random() * phrases.length)],
          });
        else
          bus.peerSend(topic, LIBRARY_PEER_EVENTS.emote, {
            userId: p.userId,
            emote: emotes[Math.floor(Math.random() * emotes.length)],
          });
      }
    }, intervalMs);
    return () => {
      clearInterval(id);
      for (const t of timers) clearTimeout(t);
      for (const p of peers) bus.peerLeave(topic, p.userId);
    };
  }, [bus, topic, kind, width, depth, items, count, intervalMs]);
}
