// Décor de pièce (lot 12 de docs/PLAN-womens-library.md) côté moteur et
// modèle : du décor choisi aux segments des murs (porte, fenêtres), décor du
// lot 4 lu à l'identique, sprites du manifeste RENDU pour chaque valeur de
// config/library/decor.ts, et mise en page des vignettes.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LIBRARY_DOORS,
  LIBRARY_FLOORS,
  LIBRARY_WALL_FINISHES,
  LIBRARY_WINDOWS,
  libraryWallVariants,
  resolveApartmentDecor,
} from '../../config/library/decor';
import { apartmentDecor } from '../../features/player/library/apartmentModel';
import {
  type LibraryManifest,
  parseManifest,
} from '../../features/player/library/engine/assets';
import {
  decorSources,
  type ManifestDecor,
  missingDecor,
  roomWalls,
  type WallStyle,
} from '../../features/player/library/engine/decor';
import { fitDecorCamera } from '../../features/player/library/engine/decorRenderer';
import { gridToScreen } from '../../features/player/library/engine/projection';
import {
  decorChoiceOf,
  finishThumb,
  floorThumb,
  openingThumb,
  slotOptions,
  themeOf,
  withSlot,
} from '../../features/player/library/ui/apartment/decor/decorPickerModel';
import { previewRoom } from '../../features/player/library/ui/apartment/decor/decorPreviewScene';

const ROOT = path.resolve(__dirname, '../..');
const PR = 2;

/** Un manifeste de décor complet, factice : chaque style a chaque variante. */
function fakeDecor(): ManifestDecor {
  const frame = (src: string, span: number) => ({
    src,
    width: span ? span * 64 + 4 : 23,
    height: 500,
    anchor: { x: 2, y: 460 },
    span,
  });
  const side = (style: string, s: string) => {
    const out: WallStyle['left'] = {};
    for (const v of libraryWallVariants())
      out[v] = frame(`/d/${style}_${s}_${v}.webp`, v === 'plain' ? 1 : 2);
    out.end = frame(`/d/${style}_${s}_end.webp`, 0);
    return out;
  };
  const walls: ManifestDecor['walls'] = {};
  for (const f of LIBRARY_WALL_FINISHES)
    walls[f] = {
      height: 2.8,
      thickness: 0.15,
      left: side(f, 'l'),
      right: side(f, 'r'),
    };
  const floors: ManifestDecor['floors'] = {};
  for (const f of LIBRARY_FLOORS)
    floors[f] = {
      src: `/d/floor_${f}.webp`,
      width: 512,
      height: 256,
      periodTiles: 4,
      anchor: { x: 256, y: 0 },
    };
  return { floors, walls };
}

const room14 = (decor: Record<string, unknown>) => ({
  width: 14,
  depth: 12,
  decor: decor as never,
});

describe('du décor choisi à la salle du moteur', () => {
  it('un décor du lot 4 donne exactement la salle du lot 4', () => {
    const lot4 = [1, 5, 9].map((at) => ({ at, variant: 'window' }));
    expect(apartmentDecor(room14({ floor: 'carpet', wall: 'window' }))).toEqual(
      {
        floor: 'carpet',
        wallStyle: 'library',
        right: lot4,
        left: lot4,
      }
    );
    expect(apartmentDecor(room14({ floor: 'parquet', wall: 'plain' }))).toEqual(
      {
        floor: 'parquet',
        wallStyle: 'library',
        right: [],
        left: [],
      }
    );
  });

  it('habillage = style de mur, fenêtres et porte = variantes ; la porte sur le mur gauche', () => {
    const d = apartmentDecor(
      room14({
        floor: 'slate',
        wall: 'window',
        finish: 'paper_trellis',
        window: 'greenhouse',
        door: 'glazed',
      })
    );
    expect(d.floor).toBe('slate');
    expect(d.wallStyle).toBe('paper_trellis');
    expect(d.right?.map((s) => `${s.variant}@${s.at}`)).toEqual([
      'window_greenhouse@1',
      'window_greenhouse@5',
      'window_greenhouse@9',
    ]);
    expect(d.left?.map((s) => `${s.variant}@${s.at}`)).toEqual([
      'window_greenhouse@1',
      'window_greenhouse@5',
      'door_glazed@9',
    ]);
  });

  it('chaque combinaison se pose sans problème de mur (manifeste complet)', () => {
    const manifest = fakeDecor();
    for (const finish of LIBRARY_WALL_FINISHES)
      for (const window of LIBRARY_WINDOWS)
        for (const door of LIBRARY_DOORS) {
          const decor = apartmentDecor(
            room14({ floor: 'oak', wall: 'plain', finish, window, door })
          );
          const walls = roomWalls(
            { w: 14, d: 12, decor },
            manifest.walls[decor.wallStyle as string]
          );
          expect(walls.issues, `${finish}/${window}/${door}`).toEqual([]);
          const used = [...walls.left, ...walls.right].map((s) => s.variant);
          if (window !== 'none')
            expect(used.some((v) => v.startsWith('window'))).toBe(true);
          expect(used.some((v) => v.startsWith('door'))).toBe(door !== 'none');
        }
  });

  it('le préchargement prend le sol, le style, la porte et la fenêtre choisis', () => {
    const decor = apartmentDecor(
      room14({
        floor: 'terrazzo',
        wall: 'window',
        finish: 'navy',
        window: 'round',
        door: 'arched',
      })
    );
    const srcs = decorSources(fakeDecor(), { decor });
    expect(srcs).toEqual(
      expect.arrayContaining([
        '/d/floor_terrazzo.webp',
        '/d/navy_r_plain.webp',
        '/d/navy_l_window_round.webp',
        '/d/navy_l_door_arched.webp',
        '/d/navy_r_end.webp',
      ])
    );
    expect(srcs.some((s) => s.includes('library'))).toBe(false);
  });

  it('missingDecor dit ce qui manque, rien quand tout y est', () => {
    const want = {
      floors: LIBRARY_FLOORS,
      walls: LIBRARY_WALL_FINISHES,
      variants: libraryWallVariants(),
    };
    expect(missingDecor(fakeDecor(), want)).toEqual([]);
    const partial = fakeDecor();
    delete partial.floors.tatami;
    delete partial.walls.esport;
    delete partial.walls.navy.left.door_modern;
    expect(missingDecor(partial, want)).toEqual([
      'floor tatami',
      'wall navy left door_modern',
      'wall esport',
    ]);
  });
});

describe('aperçu', () => {
  it('la salle de l’aperçu est celle de la scène, vide, murs de 2,8 m', () => {
    const choice = decorChoiceOf({
      floor: 'oak',
      finish: 'brick',
      window: 'loft',
      door: 'modern',
    });
    const r = previewRoom({ width: 14, depth: 12, choice, manifest: null });
    expect(r).toMatchObject({ w: 14, d: 12, wallHeight: 2.8, items: [] });
    expect(r.decor).toEqual(
      apartmentDecor(room14({ ...choice, wall: 'window' }))
    );
  });

  it('fitDecorCamera fait tenir toute la pièce dans le cadre', () => {
    for (const [w, h] of [
      [320, 220],
      [560, 260],
    ]) {
      const cam = fitDecorCamera({ w: 14, d: 12 }, 2.8, w, h);
      const pts = [
        gridToScreen(0, 12),
        gridToScreen(14, 0),
        gridToScreen(0, 0, 2.8),
        gridToScreen(14, 12, -0.2),
      ].map((p) => ({ x: p.x * cam.zoom + cam.x, y: p.y * cam.zoom + cam.y }));
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(w);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(h);
      }
    }
  });
});

describe('modèle du choix', () => {
  it('chaque emplacement propose la liste de la config', () => {
    expect(slotOptions('floor')).toBe(LIBRARY_FLOORS);
    expect(slotOptions('finish')).toBe(LIBRARY_WALL_FINISHES);
    expect(slotOptions('window')).toBe(LIBRARY_WINDOWS);
    expect(slotOptions('door')).toBe(LIBRARY_DOORS);
  });

  it('decorChoiceOf lit un décor du lot 4 ; withSlot ignore une valeur hors liste', () => {
    const c = decorChoiceOf({ floor: 'carpet', wall: 'window' });
    expect(c).toEqual({
      floor: 'carpet',
      finish: 'library',
      window: 'classic',
      door: 'none',
    });
    expect(withSlot(c, 'door', 'glazed').door).toBe('glazed');
    expect(withSlot(c, 'door', 'trappe')).toBe(c);
    expect(themeOf(c)).toBeNull();
    expect(
      themeOf({
        floor: 'concrete',
        finish: 'esport',
        window: 'loft',
        door: 'modern',
      })
    ).toBe('esport');
  });

  it('vignettes : composées des sprites du manifeste, rien sans manifeste', () => {
    const m = {
      pixelRatio: PR,
      decor: fakeDecor(),
    } as unknown as LibraryManifest;
    expect(floorThumb(null, 'oak')).toBeNull();
    expect(floorThumb(m, 'oak')).toEqual({
      src: '/d/floor_oak.webp',
      width: 256,
      height: 128,
      anchorX: 128,
    });
    const corner = finishThumb(m, 'sage');
    expect(corner?.layers.map((l) => l.src)).toEqual([
      '/d/sage_r_plain.webp',
      '/d/sage_r_plain.webp',
      '/d/sage_l_plain.webp',
      '/d/sage_l_plain.webp',
    ]);
    const win = openingThumb(m, 'sage', 'window', 'arched');
    expect(win?.layers.map((l) => l.src)).toEqual([
      '/d/sage_r_window_arched.webp',
      '/d/sage_r_plain.webp',
    ]);
    const none = openingThumb(m, 'sage', 'door', 'none');
    expect(none?.layers).toHaveLength(3);
    for (const t of [corner, win, none]) {
      expect(t).not.toBeNull();
      for (const l of t?.layers ?? []) {
        expect(l.left).toBeGreaterThanOrEqual(0);
        expect(l.top).toBeGreaterThanOrEqual(0);
        expect(l.left + l.width).toBeLessThanOrEqual((t?.width ?? 0) + 1e-9);
      }
    }
  });
});

describe('manifeste rendu (public/library) : un sprite pour chaque valeur du décor', () => {
  const file = path.join(ROOT, 'public/library/spike/manifest.json');
  const manifest = parseManifest(JSON.parse(fs.readFileSync(file, 'utf8')));

  it('le manifeste est lisible et garde le contrat de case', () => {
    expect(manifest).not.toBeNull();
    expect(manifest?.pixelRatio).toBe(PR);
  });

  it('chaque sol, chaque habillage et chaque fenêtre / porte de chaque côté', () => {
    const missing = missingDecor((manifest as LibraryManifest).decor, {
      floors: LIBRARY_FLOORS,
      walls: LIBRARY_WALL_FINISHES,
      variants: libraryWallVariants(),
    });
    expect(missing).toEqual([]);
  });

  it('le style `library` du lot 3 garde ses variantes (hall, salle de lecture)', () => {
    const lib = (manifest as LibraryManifest).decor.walls.library;
    for (const side of ['left', 'right'] as const)
      for (const v of ['plain', 'window', 'door', 'bookshelf', 'end'])
        expect(Object.hasOwn(lib[side], v), `${side} ${v}`).toBe(true);
  });

  it('chaque image du décor est versionnée, et légère', () => {
    const decor = (manifest as LibraryManifest).decor;
    const srcs = [
      ...Object.values(decor.floors).map((f) => f.src),
      ...Object.values(decor.walls).flatMap((w) =>
        [...Object.values(w.left), ...Object.values(w.right)].map((v) => v.src)
      ),
    ];
    for (const src of srcs) {
      const disk = path.join(ROOT, 'public', src);
      expect(fs.existsSync(disk), src).toBe(true);
      // Un segment de mur ou une cellule de sol : bien sous 64 Ko.
      expect(fs.statSync(disk).size, src).toBeLessThan(64 * 1024);
    }
  });

  it('le décor par défaut se dessine en sprites', () => {
    const d = resolveApartmentDecor({});
    const decor = (manifest as LibraryManifest).decor;
    expect(Object.hasOwn(decor.floors, d.floor)).toBe(true);
    expect(Object.hasOwn(decor.walls, d.finish)).toBe(true);
  });
});
