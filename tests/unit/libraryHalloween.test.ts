// Women's Library, lot 16 — le fantôme d'Halloween, côté PUR :
//   * la fenêtre de l'événement (`halloween/event.ts`) ;
//   * la citrouille du hall, calque de saison (`halloween/hallDecor.ts`),
//     confrontée au manifeste RENDU : rien ne se chevauche, rien n'est
//     enfermé, les portes et l'arrivée restent libres ; sa zone `halloween`
//     n'existe qu'avec elle ;
//   * la ronde du fantôme (`halloween/ghostRoute.ts`) : sur des cases libres
//     du vrai hall, sans couper les coins, sans téléportation (même quand la
//     ronde reboucle), la même pour un même instant ;
//   * le « Bouh ! » (`halloween/boo.ts`) : la distance et l'attente.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFurniture } from '../../config/library/furniture';
import { homeEventSpotlight } from '../../config/homeEventSpotlight';
import {
  type LibraryManifest,
  mergeCatalog,
  parseManifest,
} from '../../features/player/library/engine/assets';
import { hotspotBox } from '../../features/player/library/engine/hotspots';
import { isWalkable } from '../../features/player/library/engine/pathfinding';
import {
  buildWalkGrid,
  itemTiles,
  layoutIssues,
  specOf,
} from '../../features/player/library/engine/room';
import { subscribeHallSpots } from '../../features/player/library/hall/spotRequests';
import {
  BOO_COOLDOWN_MS,
  BOO_RADIUS_M,
  booTargets,
  EMPTY_BOO_MEMORY,
} from '../../features/player/library/halloween/boo';
import {
  halloweenEventAt,
  halloweenSignupHref,
  isHalloweenActive,
} from '../../features/player/library/halloween/event';
import {
  buildGhostRoute,
  GHOST_BOB_M,
  GHOST_HOVER_M,
  GHOST_SPEED,
  ghostPoseAt,
  HALL_GHOST_WAYPOINTS,
  HALLOWEEN_HALL_ROOM,
  hallDoorFootTiles,
  hallGhostGrid,
  hallGhostRoute,
  halloweenGhostAt,
} from '../../features/player/library/halloween/ghostRoute';
import {
  HALLOWEEN_HALL_ITEMS,
  HALLOWEEN_HOTSPOT,
  hallSeasonAt,
} from '../../features/player/library/halloween/hallDecor';
import {
  HALL_HOTSPOTS,
  HALL_PLAYER_START,
  HALL_ROOM,
  HALL_SPOT_IDS,
} from '../../features/player/library/layouts/hall';
import { fakeEnterResponse } from '../../features/player/library/dev/fakeRealtime';
import { sceneOf } from '../../features/player/library/roomStageModel';
import { roomHotspotsOf } from '../../features/player/library/ui/places/useRoomHotspots';

const manifest = parseManifest(
  JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '../../public/library/spike/manifest.json'),
      'utf8'
    )
  )
) as LibraryManifest;
const catalog = mergeCatalog(manifest);

/** Pendant l'événement (l'affiche court jusqu'au 1er novembre 2026). */
const IN_SEASON = Date.parse('2026-10-21T18:00:00+02:00');
/** Après `visibleUntil`. */
const AFTER = Date.parse('2026-11-01T00:00:00+01:00');

const unsubscribers: (() => void)[] = [];
afterEach(() => {
  for (const u of unsubscribers.splice(0)) u();
});

describe('la fenêtre de l’événement', () => {
  it('ouverte pendant l’affiche, fermée dès `visibleUntil`', () => {
    expect(isHalloweenActive(IN_SEASON)).toBe(true);
    expect(halloweenEventAt(IN_SEASON)?.tournamentSlug).toBe('halloween-2026');
    expect(isHalloweenActive(AFTER - 1)).toBe(true);
    expect(isHalloweenActive(AFTER)).toBe(false);
    expect(isHalloweenActive(Number.NaN)).toBe(false);
  });

  it('seulement un événement regroupé, et seulement Halloween', () => {
    const event = homeEventSpotlight;
    if (!event) throw new Error('encart attendu');
    expect(isHalloweenActive(IN_SEASON, null)).toBe(false);
    expect(isHalloweenActive(IN_SEASON, { ...event, pooledTeams: false })).toBe(
      false
    );
    expect(
      isHalloweenActive(IN_SEASON, { ...event, tournamentSlug: 'noel-2026' })
    ).toBe(false);
    expect(halloweenSignupHref(event)).toBe(
      '/tournament/halloween-2026/inscription-solo'
    );
  });
});

describe('la citrouille du hall (calque de saison)', () => {
  const room = {
    ...HALL_ROOM,
    items: [...HALL_ROOM.items, ...HALLOWEEN_HALL_ITEMS],
  };

  it('hors saison : rien ; pendant : la pile, la lanterne et leur zone', () => {
    expect(hallSeasonAt(AFTER)).toBeNull();
    expect(hallSeasonAt(Number.NaN)).toBeNull();
    const season = hallSeasonAt(IN_SEASON);
    expect(season?.event.tournamentSlug).toBe('halloween-2026');
    expect(season?.items).toEqual(HALLOWEEN_HALL_ITEMS);
    expect(season?.hotspots).toEqual([HALLOWEEN_HOTSPOT]);
    expect(season?.hrefOf('halloween')).toBe(
      '/tournament/halloween-2026/inscription-solo'
    );
    expect(season?.hrefOf('board')).toBeNull();
    for (const item of HALLOWEEN_HALL_ITEMS)
      expect(Object.hasOwn(manifest.furniture, item.key)).toBe(true);
    const ids = room.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('la scène d’une salle commune prend les meubles de la saison en plus', () => {
    const hall = fakeEnterResponse('hall');
    const base = sceneOf(hall).items.map((i) => i.inventoryId);
    const withSeason = sceneOf(hall, HALLOWEEN_HALL_ITEMS);
    expect(withSeason.items.map((i) => i.inventoryId)).toEqual([
      ...base,
      'halloween-pumpkins',
      'halloween-lantern',
    ]);
    expect(withSeason.items.at(-2)).toEqual({
      inventoryId: 'halloween-pumpkins',
      key: 'pumpkin_pile',
      gx: 2,
      gy: 13,
      rotation: 0,
    });
    expect(withSeason.fixed?.start).toEqual(HALL_PLAYER_START);
  });

  it('tient sans chevauchement ni débordement (layoutIssues)', () => {
    expect(layoutIssues(room, catalog)).toEqual([]);
  });

  it('ni sur l’arrivée, ni au pied d’une porte, ni devant', () => {
    const grid = buildWalkGrid(room, catalog);
    expect(isWalkable(grid, HALL_PLAYER_START.i, HALL_PLAYER_START.j)).toBe(
      true
    );
    for (const t of hallDoorFootTiles()) {
      expect(isWalkable(grid, t.i, t.j)).toBe(true);
      // La case devant la porte (un pas dans la salle) aussi.
      const front = t.j === 0 ? { i: t.i, j: 1 } : { i: 1, j: t.j };
      expect(isWalkable(grid, front.i, front.j)).toBe(true);
    }
  });

  it('n’enferme aucune case : tout reste atteignable depuis l’arrivée', () => {
    const grid = buildWalkGrid(room, catalog);
    const seen = new Uint8Array(grid.w * grid.d);
    const stack = [[HALL_PLAYER_START.i, HALL_PLAYER_START.j]];
    seen[HALL_PLAYER_START.j * grid.w + HALL_PLAYER_START.i] = 1;
    while (stack.length) {
      const [i, j] = stack.pop() as number[];
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const a = i + di;
        const b = j + dj;
        if (!isWalkable(grid, a, b) || seen[b * grid.w + a]) continue;
        seen[b * grid.w + a] = 1;
        stack.push([a, b]);
      }
    }
    const enclosed: string[] = [];
    for (let j = 0; j < grid.d; j++)
      for (let i = 0; i < grid.w; i++)
        if (isWalkable(grid, i, j) && !seen[j * grid.w + i])
          enclosed.push(`${i},${j}`);
    expect(enclosed).toEqual([]);
  });

  it('sa zone couvre exactement les deux citrouilles, plus haut qu’elles', () => {
    const shape = HALLOWEEN_HOTSPOT.shape;
    if (shape.kind !== 'area') throw new Error('pavé attendu');
    const covered = new Set<string>();
    for (const item of HALLOWEEN_HALL_ITEMS)
      for (const t of itemTiles(item, specOf(catalog, item.key)))
        covered.add(`${t.i},${t.j}`);
    for (const key of covered) {
      const [i, j] = key.split(',').map(Number);
      expect(i >= shape.area.minX && i < shape.area.maxX).toBe(true);
      expect(j >= shape.area.minY && j < shape.area.maxY).toBe(true);
    }
    const box = hotspotBox({ room, catalog }, shape);
    const tallest = Math.max(
      ...HALLOWEEN_HALL_ITEMS.map((i) => specOf(catalog, i.key).height)
    );
    expect(box?.maxZ).toBeGreaterThan(tallest);
  });

  it('la zone `halloween` n’est pas une zone de base du hall', () => {
    expect(HALL_SPOT_IDS).toContain('halloween');
    expect(HALL_HOTSPOTS.map((h) => h.id)).not.toContain('halloween');
  });
});

describe('roomHotspotsOf — la citrouille', () => {
  const labels = { halloween: 'Citrouille', board: 'Panneau' };
  const anchor = { x: 0, y: 0 };
  const season = hallSeasonAt(IN_SEASON);

  it('pendant l’événement : nommée, l’appui va à l’écran du hall', () => {
    const navigate = vi.fn();
    const { hotspots, onHotspotTap } = roomHotspotsOf(
      'hall',
      labels,
      navigate,
      season
    );
    expect(hotspots.map((h) => h.id)).toEqual([
      ...HALL_HOTSPOTS.map((h) => h.id),
      'halloween',
    ]);
    expect(hotspots.find((h) => h.id === 'halloween')?.label).toBe(
      'Citrouille'
    );
    const heard = vi.fn();
    unsubscribers.push(subscribeHallSpots(heard));
    onHotspotTap({ id: 'halloween', anchor });
    expect(heard).toHaveBeenCalledWith('halloween');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('sans écran abonné : la page d’inscription', () => {
    const navigate = vi.fn();
    roomHotspotsOf('hall', labels, navigate, season).onHotspotTap({
      id: 'halloween',
      anchor,
    });
    expect(navigate).toHaveBeenCalledWith(
      '/tournament/halloween-2026/inscription-solo'
    );
  });

  it('hors saison : pas de citrouille, et son appui ne mène nulle part', () => {
    for (const s of [hallSeasonAt(AFTER), null, undefined]) {
      const navigate = vi.fn();
      const spots = roomHotspotsOf('hall', labels, navigate, s);
      expect(spots.hotspots.map((h) => h.id)).not.toContain('halloween');
      spots.onHotspotTap({ id: 'halloween', anchor });
      expect(navigate).not.toHaveBeenCalled();
    }
  });
});

describe('la ronde du fantôme', () => {
  const route = hallGhostRoute();
  if (!route) throw new Error('ronde attendue');
  /** La grille du MOTEUR (manifeste rendu), citrouilles comprises. */
  const engineGrid = buildWalkGrid(HALLOWEEN_HALL_ROOM, catalog);
  const doors = new Set(hallDoorFootTiles().map((t) => `${t.i},${t.j}`));
  const walkable = (i: number, j: number) =>
    isWalkable(engineGrid, i, j) && !doors.has(`${i},${j}`);

  it('le catalogue de l’API et le manifeste disent les mêmes empreintes', () => {
    for (const { key } of HALLOWEEN_HALL_ROOM.items) {
      const api = getFurniture(key);
      const spec = specOf(catalog, key);
      expect({ key, fp: api?.footprint, layer: api?.layer }).toEqual({
        key,
        fp: spec.footprint,
        layer: spec.layer,
      });
    }
  });

  it('5 à 7 points, tous libres, avec une pause chacun', () => {
    expect(HALL_GHOST_WAYPOINTS.length).toBeGreaterThanOrEqual(5);
    expect(HALL_GHOST_WAYPOINTS.length).toBeLessThanOrEqual(7);
    for (const wp of HALL_GHOST_WAYPOINTS) {
      expect(walkable(wp.tile.i, wp.tile.j)).toBe(true);
      expect(wp.pauseS).toBeGreaterThan(0);
    }
    expect(route.legs.filter((l) => l.kind === 'pause')).toHaveLength(
      HALL_GHOST_WAYPOINTS.length
    );
  });

  it('chaque case parcourue est libre dans le vrai hall, sans couper de coin', () => {
    const tiles = route.tiles;
    expect(tiles.length).toBeGreaterThan(20);
    for (const t of tiles) expect(walkable(t.i, t.j)).toBe(true);
    for (let k = 0; k < tiles.length; k++) {
      const a = tiles[k];
      const b = tiles[(k + 1) % tiles.length];
      const di = b.i - a.i;
      const dj = b.j - a.j;
      expect(Math.max(Math.abs(di), Math.abs(dj))).toBe(1);
      if (di !== 0 && dj !== 0) {
        expect(walkable(a.i + di, a.j)).toBe(true);
        expect(walkable(a.i, a.j + dj)).toBe(true);
      }
    }
  });

  it('0,8 m/s, une boucle d’environ une minute', () => {
    expect(route.speed).toBeCloseTo(GHOST_SPEED, 9);
    expect(GHOST_SPEED).toBeCloseTo(1.6, 9);
    const pauses = HALL_GHOST_WAYPOINTS.reduce((s, w) => s + w.pauseS, 0);
    expect(route.period).toBeCloseTo(pauses + route.length / GHOST_SPEED, 6);
    expect(route.period).toBeGreaterThan(40);
    expect(route.period).toBeLessThan(120);
  });

  it('toujours sur une case libre, sans téléportation, même en rebouclant', () => {
    const dt = 0.05;
    const t0 = IN_SEASON - 3_000;
    const steps = Math.ceil((route.period + 6) / dt);
    let prev = ghostPoseAt(route, t0);
    let paused = 0;
    for (let s = 1; s <= steps; s++) {
      const pose = ghostPoseAt(route, t0 + s * dt * 1000);
      expect(walkable(Math.floor(pose.x), Math.floor(pose.y))).toBe(true);
      const moved = Math.hypot(pose.x - prev.x, pose.y - prev.y);
      expect(moved).toBeLessThanOrEqual(GHOST_SPEED * dt + 1e-6);
      expect(pose.dir).toBeGreaterThanOrEqual(0);
      expect(pose.dir).toBeLessThanOrEqual(7);
      expect(pose.z).toBeGreaterThanOrEqual(GHOST_HOVER_M - GHOST_BOB_M - 1e-9);
      expect(pose.z).toBeLessThanOrEqual(GHOST_HOVER_M + GHOST_BOB_M + 1e-9);
      expect(pose.bob).toBeGreaterThanOrEqual(0);
      expect(pose.bob).toBeLessThan(2 * Math.PI);
      if (pose.paused) paused++;
      prev = pose;
    }
    expect(paused).toBeGreaterThan(0);
  });

  it('pile au point de jonction de la boucle : la même position des deux côtés', () => {
    const periodMs = route.period * 1000;
    const k = Math.ceil(IN_SEASON / periodMs);
    const wrap = k * periodMs;
    const before = ghostPoseAt(route, wrap - 1);
    const after = ghostPoseAt(route, wrap + 1);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(
      0.01
    );
    const start = HALL_GHOST_WAYPOINTS[0].tile;
    expect(after.x).toBeCloseTo(start.i + 0.5, 6);
    expect(after.y).toBeCloseTo(start.j + 0.5, 6);
    expect(after.paused).toBe(true);
  });

  it('déterministe : même instant, même fantôme ; ronde recalculée identique', () => {
    const again = buildGhostRoute(hallGhostGrid());
    expect(again).toEqual(route);
    for (const at of [IN_SEASON, IN_SEASON + 12_345, IN_SEASON + 987_654])
      expect(ghostPoseAt(route, at)).toEqual(ghostPoseAt(route, at));
  });

  it('passe à moins de 1,5 m de l’arrivée (les nouvelles venues ont leur « bouh »)', () => {
    const start = {
      x: HALL_PLAYER_START.i + 0.5,
      y: HALL_PLAYER_START.j + 0.5,
    };
    let closest = Number.POSITIVE_INFINITY;
    for (let s = 0; s < route.period; s += 0.1) {
      const p = ghostPoseAt(route, s * 1000);
      closest = Math.min(closest, Math.hypot(p.x - start.x, p.y - start.y));
    }
    expect(closest * 0.5).toBeLessThanOrEqual(BOO_RADIUS_M);
  });

  it('un point bloqué : pas de ronde (null), jamais d’exception', () => {
    const blocked = hallGhostGrid();
    const wp = HALL_GHOST_WAYPOINTS[2].tile;
    blocked.blocked[wp.j * blocked.w + wp.i] = 1;
    expect(buildGhostRoute(blocked)).toBeNull();
    expect(
      buildGhostRoute(hallGhostGrid(), HALL_GHOST_WAYPOINTS.slice(0, 1))
    ).toBeNull();
  });

  it('halloweenGhostAt : seulement pendant l’événement', () => {
    expect(halloweenGhostAt(IN_SEASON)).toEqual(ghostPoseAt(route, IN_SEASON));
    expect(halloweenGhostAt(AFTER)).toBeNull();
  });
});

describe('le « Bouh ! »', () => {
  const ghost = { x: 10, y: 10 };
  const near = { id: 'a', x: 11, y: 12 }; // √5 cases ≈ 1,12 m
  const far = { id: 'b', x: 14, y: 10 }; // 4 cases = 2 m

  it('à 1,5 m ou moins seulement, et pas sans fantôme', () => {
    const r = booTargets(ghost, [near, far], 1_000);
    expect(r.boo).toEqual(['a']);
    expect(r.memory.get('a')).toBe(1_000);
    expect(booTargets(null, [near], 1_000).boo).toEqual([]);
    const edge = { id: 'e', x: 13, y: 10 }; // 3 cases = 1,5 m pile
    expect(booTargets(ghost, [edge], 0).boo).toEqual(['e']);
  });

  it('25 s d’attente pour la même joueuse, pas pour une autre', () => {
    const first = booTargets(ghost, [near], 1_000);
    const again = booTargets(ghost, [near], 1_000 + 10_000, first.memory);
    expect(again.boo).toEqual([]);
    const other = booTargets(
      ghost,
      [near, { id: 'c', x: 10, y: 11 }],
      1_000 + 10_000,
      again.memory
    );
    expect(other.boo).toEqual(['c']);
    const later = booTargets(
      ghost,
      [near],
      1_000 + BOO_COOLDOWN_MS,
      other.memory
    );
    expect(later.boo).toEqual(['a']);
  });

  it('une mémoire qui oublie et ne change pas pour rien', () => {
    const first = booTargets(ghost, [near], 0);
    const quiet = booTargets(ghost, [far], 5_000, first.memory);
    expect(quiet.boo).toEqual([]);
    expect(quiet.memory).toBe(first.memory);
    const forgotten = booTargets(null, [], BOO_COOLDOWN_MS + 1, first.memory);
    expect(forgotten.memory.size).toBe(0);
    expect(booTargets(null, [], 0).memory).toBe(EMPTY_BOO_MEMORY);
  });

  it('une avatar listée deux fois n’a qu’un « bouh »', () => {
    expect(booTargets(ghost, [near, near], 0).boo).toEqual(['a']);
  });
});
