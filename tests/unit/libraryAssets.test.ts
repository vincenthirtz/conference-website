import { describe, expect, it } from 'vitest';
import {
  avatarIdsOf,
  loadManifest,
  mergeCatalog,
  parseManifest,
  PLACEHOLDER_CATALOG,
} from '../../features/player/library/engine/assets';
import { DEMO_ROOM } from '../../features/player/library/demoRoom';
import { layoutIssues } from '../../features/player/library/engine/room';

const frame = (r: number) => ({
  src: `/library/spike/furniture/bookshelf_r${r}.webp`,
  width: 256,
  height: 300,
  anchor: { x: 120, y: 80 },
});

// Avatar au format empaqueté (détail : libraryAvatarSheets.test.ts).
const sheetJson = (over: Record<string, unknown> = {}) => ({
  sheet: '/library/spike/avatars/a01.webp',
  sheetWidth: 1024,
  sheetHeight: 1024,
  animations: {
    idle: {
      fps: 1,
      directions: { 4: [{ x: 0, y: 0, w: 80, h: 280, ax: 40, ay: 260 }] },
    },
  },
  ...over,
});

const valid = {
  version: 1,
  tile: { width: 64, height: 32, meters: 0.5 },
  pixelRatio: 2,
  furniture: {
    bookshelf: {
      footprint: { w: 3, d: 2 },
      height: 2.1,
      rotations: [frame(0), frame(1), frame(2), frame(3)],
    },
    broken: { footprint: { w: 1, d: 1 }, height: 1, rotations: [frame(0)] },
  },
  avatars: {
    ada: sheetJson(),
    grace: sheetJson({ sheet: '/library/spike/avatars/grace.webp' }),
    nope: sheetJson({ sheetWidth: 0 }),
  },
};

describe('parseManifest', () => {
  it('garde les meubles et avatars valides, ignore les mal formés', () => {
    const m = parseManifest(valid);
    expect(m?.pixelRatio).toBe(2);
    expect(m?.tile).toEqual({ width: 64, height: 32, meters: 0.5 });
    expect(Object.keys(m?.furniture ?? {})).toEqual(['bookshelf']);
    expect(m?.furniture.bookshelf.footprint).toEqual({ w: 3, d: 2 });
    expect(m?.furniture.bookshelf.rotations[3].src).toContain('_r3');
    expect(avatarIdsOf(m)).toEqual(['ada', 'grace']);
  });

  it('sans section avatars : manifeste valide, aucun avatar', () => {
    const noAvatars = { ...valid, avatars: undefined };
    expect(parseManifest(noAvatars)).not.toBeNull();
    expect(avatarIdsOf(parseManifest(noAvatars))).toEqual([]);
    expect(avatarIdsOf(null)).toEqual([]);
  });

  it('rejette une autre version ou une autre case (px ou mètres)', () => {
    expect(parseManifest({ ...valid, version: 2 })).toBeNull();
    expect(
      parseManifest({ ...valid, tile: { width: 128, height: 64, meters: 0.5 } })
    ).toBeNull();
    // Ancien manifeste « 1 case = 1 m » : `meters` absent → remplaçants.
    expect(
      parseManifest({ ...valid, tile: { width: 64, height: 32 } })
    ).toBeNull();
    expect(
      parseManifest({ ...valid, tile: { width: 64, height: 32, meters: 1 } })
    ).toBeNull();
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest('nope')).toBeNull();
  });
});

describe('loadManifest', () => {
  it('absent (404) ou réseau en panne : null, sans exception', async () => {
    expect(
      await loadManifest('/x.json', async () => ({
        ok: false,
        json: async () => ({}),
      }))
    ).toBeNull();
    expect(
      await loadManifest('/x.json', async () => {
        throw new Error('offline');
      })
    ).toBeNull();
  });

  it('présent : manifeste validé', async () => {
    const m = await loadManifest('/x.json', async () => ({
      ok: true,
      json: async () => valid,
    }));
    expect(m?.furniture.bookshelf.height).toBe(2.1);
  });
});

describe('mergeCatalog et disposition de démo', () => {
  it('le manifeste l’emporte, les remplaçants comblent le reste', () => {
    const c = mergeCatalog(parseManifest(valid));
    expect(c.bookshelf.height).toBe(2.1);
    expect(c.table).toEqual({ footprint: { w: 4, d: 2 }, height: 0.75 });
    expect(mergeCatalog(null)).toEqual(PLACEHOLDER_CATALOG);
  });

  it('la salle de démo 24 × 24 tient sans chevauchement avec les remplaçants', () => {
    expect(DEMO_ROOM.w).toBe(24);
    expect(DEMO_ROOM.d).toBe(24);
    expect(layoutIssues(DEMO_ROOM, PLACEHOLDER_CATALOG)).toEqual([]);
  });

  it('layoutIssues signale chevauchement et débordement', () => {
    const room = {
      w: 6,
      d: 6,
      wallHeight: 2.6,
      items: [
        { id: 'a', key: 'bookshelf', gx: 0, gy: 0, r: 0 as const },
        { id: 'b', key: 'bookshelf', gx: 2, gy: 1, r: 0 as const },
        { id: 'c', key: 'bookshelf', gx: 4, gy: 4, r: 0 as const },
      ],
    };
    expect(layoutIssues(room, PLACEHOLDER_CATALOG).sort()).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});
