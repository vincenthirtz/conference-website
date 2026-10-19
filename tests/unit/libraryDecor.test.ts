// Décor des salles (lot 3) : section `decor` du manifeste, découpe des murs
// en segments, motif du sol, calques des meubles (tapis, décor mural).
import { describe, expect, it } from 'vitest';
import {
  mergeCatalog,
  parseManifest,
} from '../../features/player/library/engine/assets';
import {
  decorSources,
  floorPatternMatrix,
  layoutWall,
  parseDecor,
  roomWalls,
  segmentOrigin,
  type WallStyle,
} from '../../features/player/library/engine/decor';
import {
  buildWalkGrid,
  layoutIssues,
  onBackWall,
  type RoomModel,
} from '../../features/player/library/engine/room';

const PR = 2;

const frame = (src: string, w = 68, h = 497) => ({
  src,
  width: w,
  height: h,
  anchor: { x: 2, y: 30 },
});

const side = (prefix: string) => ({
  plain: { ...frame(`${prefix}_plain.webp`), span: 1 },
  window: { ...frame(`${prefix}_window.webp`, 132), span: 2 },
  door: { ...frame(`${prefix}_door.webp`, 132), span: 2 },
  end: { ...frame(`${prefix}_end.webp`, 23), span: 0 },
});

const decorJson = () => ({
  floors: {
    parquet: {
      src: '/f/parquet.webp',
      width: 512,
      height: 256,
      periodTiles: 4,
      anchor: { x: 256, y: 0 },
    },
    carpet: {
      src: '/f/carpet.webp',
      width: 128,
      height: 64,
      periodTiles: 1,
      anchor: { x: 64, y: 0 },
    },
    // Pas une cellule du réseau (largeur ≠ N × 64 × 2) : rejeté.
    skewed: {
      src: '/f/skewed.webp',
      width: 500,
      height: 256,
      periodTiles: 4,
      anchor: { x: 250, y: 0 },
    },
    // Ancre hors du milieu du bord haut : rejeté.
    shifted: {
      src: '/f/shifted.webp',
      width: 128,
      height: 64,
      periodTiles: 1,
      anchor: { x: 10, y: 0 },
    },
  },
  walls: {
    library: {
      height: 2.8,
      thickness: 0.15,
      left: side('l'),
      right: side('r'),
    },
    // Sans variante `plain` d'un côté : style rejeté (rien pour combler).
    broken: {
      height: 2.8,
      thickness: 0.15,
      left: { window: { ...frame('w.webp'), span: 2 } },
      right: side('r'),
    },
  },
});

describe('parseDecor', () => {
  it('garde les sols qui sont une cellule exacte du réseau', () => {
    const d = parseDecor(decorJson(), PR);
    expect(Object.keys(d.floors).sort()).toEqual(['carpet', 'parquet']);
    expect(d.floors.parquet.periodTiles).toBe(4);
  });

  it('garde un style de mur complet, rejette celui sans case simple', () => {
    const d = parseDecor(decorJson(), PR);
    expect(Object.keys(d.walls)).toEqual(['library']);
    expect(d.walls.library.right.door.span).toBe(2);
    expect(d.walls.library.left.end.span).toBe(0);
  });

  it('ignore une variante incohérente (span 0 hors `end`)', () => {
    const json = decorJson();
    (json.walls.library.right as Record<string, unknown>).arch = {
      ...frame('a.webp'),
      span: 0,
    };
    const d = parseDecor(json, PR);
    expect(Object.hasOwn(d.walls.library.right, 'arch')).toBe(false);
  });

  it('absent ou illisible : aucun décor, sans exception', () => {
    expect(parseDecor(undefined, PR)).toEqual({ floors: {}, walls: {} });
    expect(parseDecor('nope', PR)).toEqual({ floors: {}, walls: {} });
  });

  it('parseManifest porte le décor et le calque des meubles', () => {
    const rot = (r: number) => frame(`/m/rug_r${r}.webp`, 600, 300);
    const m = parseManifest({
      version: 1,
      tile: { width: 64, height: 32, meters: 0.5 },
      pixelRatio: 2,
      furniture: {
        rug: {
          footprint: { w: 6, d: 4 },
          height: 0.02,
          layer: 'floor',
          rotations: [rot(0), rot(1), rot(2), rot(3)],
        },
        odd: {
          footprint: { w: 1, d: 1 },
          height: 1,
          layer: 'ceiling',
          rotations: [rot(0), rot(1), rot(2), rot(3)],
        },
      },
      decor: decorJson(),
    });
    expect(m?.furniture.rug.layer).toBe('floor');
    expect(Object.hasOwn(m?.furniture ?? {}, 'odd')).toBe(false);
    expect(mergeCatalog(m).rug).toEqual({
      footprint: { w: 6, d: 4 },
      height: 0.02,
      layer: 'floor',
    });
    expect(Object.keys(m?.decor.floors ?? {}).sort()).toEqual([
      'carpet',
      'parquet',
    ]);
  });
});

describe('layoutWall', () => {
  const spans = (v: string) =>
    ({ plain: 1, window: 2, door: 2, bookshelf: 3 })[v] ?? null;

  it('comble de cases simples autour des variantes', () => {
    const { segments, issues } = layoutWall(
      8,
      [
        { at: 5, variant: 'window' },
        { at: 1, variant: 'door' },
      ],
      spans
    );
    expect(issues).toEqual([]);
    expect(segments).toEqual([
      { at: 0, span: 1, variant: 'plain' },
      { at: 1, span: 2, variant: 'door' },
      { at: 3, span: 1, variant: 'plain' },
      { at: 4, span: 1, variant: 'plain' },
      { at: 5, span: 2, variant: 'window' },
      { at: 7, span: 1, variant: 'plain' },
    ]);
    // Le mur est couvert exactement, sans trou ni recouvrement.
    expect(segments.reduce((n, s) => n + s.span, 0)).toBe(8);
  });

  it('signale et ignore inconnue, débordement et chevauchement', () => {
    const { segments, issues } = layoutWall(
      6,
      [
        { at: 0, variant: 'arch' },
        { at: 5, variant: 'bookshelf' },
        { at: 1, variant: 'door' },
        { at: 2, variant: 'window' },
      ],
      spans
    );
    expect(issues).toEqual([
      'arch@0: unknown variant',
      'window@2: overlaps',
      'bookshelf@5: out of wall',
    ]);
    expect(segments.map((s) => s.variant)).toEqual([
      'plain',
      'door',
      'plain',
      'plain',
      'plain',
    ]);
  });
});

describe('murs d’une salle', () => {
  const style = parseDecor(decorJson(), PR).walls.library as WallStyle;
  const room = {
    w: 10,
    d: 6,
    decor: {
      wallStyle: 'library',
      right: [{ at: 3, variant: 'door' }],
      left: [{ at: 2, variant: 'window' }],
    },
  };

  it('mur droit le long de gx, mur gauche le long de gy', () => {
    const walls = roomWalls(room, style);
    expect(walls.issues).toEqual([]);
    expect(walls.right.reduce((n, s) => n + s.span, 0)).toBe(10);
    expect(walls.left.reduce((n, s) => n + s.span, 0)).toBe(6);
    expect(segmentOrigin('right', 3)).toEqual({ gx: 3, gy: 0 });
    expect(segmentOrigin('left', 2)).toEqual({ gx: 0, gy: 2 });
  });

  it('une variante absente du côté demandé est signalée', () => {
    const walls = roomWalls(
      {
        ...room,
        decor: { ...room.decor, left: [{ at: 1, variant: 'bookshelf' }] },
      },
      style
    );
    expect(walls.issues).toEqual(['left bookshelf@1: unknown variant']);
  });

  it('précharge sol, cases simples, bouts et variantes utilisées', () => {
    const decor = parseDecor(decorJson(), PR);
    const srcs = decorSources(decor, {
      decor: { ...room.decor, floor: 'parquet' },
    });
    expect(srcs.sort()).toEqual(
      [
        '/f/parquet.webp',
        'l_end.webp',
        'l_plain.webp',
        'l_window.webp',
        'r_door.webp',
        'r_end.webp',
        'r_plain.webp',
      ].sort()
    );
  });
});

describe('motif du sol', () => {
  it('l’ancre de la cellule tombe sur l’origine du monde, à l’échelle 1/pr', () => {
    const floor = parseDecor(decorJson(), PR).floors.parquet;
    const [a, b, c, d, e, f] = floorPatternMatrix(floor, PR);
    expect([a, b, c, d]).toEqual([0.5, 0, 0, 0.5]);
    // Pixel (256, 0) de l'image → (0, 0) du monde.
    expect(256 * a + e).toBe(0);
    expect(0 * d + f).toBe(0);
    // Période de 4 cases : 4 × 64 px CSS en x, 4 × 32 en y.
    expect(floor.width * a).toBe(256);
    expect(floor.height * d).toBe(128);
  });
});

describe('calques des meubles', () => {
  const catalog = {
    rug: { footprint: { w: 4, d: 3 }, height: 0.02, layer: 'floor' as const },
    frame: { footprint: { w: 2, d: 1 }, height: 1.8, layer: 'wall' as const },
    table: { footprint: { w: 2, d: 2 }, height: 0.75 },
  };
  const room = (items: RoomModel['items']): RoomModel => ({
    w: 8,
    d: 8,
    wallHeight: 2.8,
    items,
  });

  it('un tapis sous une table n’est pas un chevauchement, deux tapis oui', () => {
    expect(
      layoutIssues(
        room([
          { id: 'rug', key: 'rug', gx: 1, gy: 1, r: 0 },
          { id: 'table', key: 'table', gx: 2, gy: 2, r: 0 },
        ]),
        catalog
      )
    ).toEqual([]);
    expect(
      layoutIssues(
        room([
          { id: 'a', key: 'rug', gx: 1, gy: 1, r: 0 },
          { id: 'b', key: 'rug', gx: 3, gy: 2, r: 0 },
        ]),
        catalog
      ).sort()
    ).toEqual(['a', 'b']);
  });

  it('tapis et décor mural restent franchissables', () => {
    const g = buildWalkGrid(
      room([
        { id: 'rug', key: 'rug', gx: 1, gy: 1, r: 0 },
        { id: 'frame', key: 'frame', gx: 3, gy: 0, r: 0 },
        { id: 'table', key: 'table', gx: 5, gy: 5, r: 0 },
      ]),
      catalog
    );
    expect(g.blocked[1 * 8 + 1]).toBe(0);
    expect(g.blocked[0 * 8 + 3]).toBe(0);
    expect(g.blocked[5 * 8 + 5]).toBe(1);
  });

  it('le décor mural doit avoir le dos contre un mur du fond', () => {
    expect(onBackWall({ id: 'a', key: 'frame', gx: 4, gy: 0, r: 0 })).toBe(
      true
    );
    expect(onBackWall({ id: 'b', key: 'frame', gx: 0, gy: 4, r: 1 })).toBe(
      true
    );
    expect(onBackWall({ id: 'c', key: 'frame', gx: 4, gy: 1, r: 0 })).toBe(
      false
    );
    expect(onBackWall({ id: 'd', key: 'frame', gx: 0, gy: 4, r: 0 })).toBe(
      false
    );
    expect(
      layoutIssues(
        room([{ id: 'loose', key: 'frame', gx: 3, gy: 3, r: 0 }]),
        catalog
      )
    ).toEqual(['loose']);
  });
});
