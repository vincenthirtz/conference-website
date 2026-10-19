// Feuilles d'avatars empaquetées (format 2, tools/library-assets/iso_pack.py) :
// validation, choix de l'image (distance / temps), miroir, ancres, feuille
// propre de `sit` chargée à la demande, et le manifeste rendu lui-même.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../features/player/library/engine/assets';
import {
  type AvatarSheet,
  animationFor,
  avatarFrame,
  frameDestination,
  MAX_SHEET_PX,
  parseAvatarSheet,
  resolveDirection,
  sheetMatchesImage,
  sheetsOf,
} from '../../features/player/library/engine/avatarSprites';
import type { Direction } from '../../features/player/library/engine/motion';

const rect = (x: number, y = 0, over: Record<string, number> = {}) => ({
  x,
  y,
  w: 80,
  h: 280,
  ax: 30,
  ay: 260,
  ...over,
});
const dirs = (frames: number, only = [0, 1, 2, 3, 4, 5, 6, 7], y = 0) =>
  Object.fromEntries(
    only.map((d) => [
      String(d),
      Array.from({ length: frames }, (_, k) => rect(d * 100 + k, y)),
    ])
  );

/** Entrée telle qu'émise par le pipeline (8 directions toujours rendues). */
const entry = (over: Record<string, unknown> = {}) => ({
  sheet: '/library/spike/avatars/a01.webp',
  sheetWidth: 2048,
  sheetHeight: 1400,
  animations: {
    idle: { fps: 1, directions: dirs(1) },
    walk: { fps: 10, strideMeters: 1.3, directions: dirs(8, undefined, 300) },
    sit: {
      fps: 1,
      sheet: '/library/spike/avatars/a01-sit.webp',
      sheetWidth: 900,
      sheetHeight: 300,
      directions: dirs(1),
    },
  },
  ...over,
});

const clock = { timeSec: 0, travelledMeters: 0 };
const at = (f: ReturnType<typeof avatarFrame>) => {
  if (!f) throw new Error('image attendue');
  return f;
};

describe('parseAvatarSheet (format empaqueté)', () => {
  const sheet = parseAvatarSheet(entry()) as AvatarSheet;

  it('parse la forme émise, `sit` dans sa propre feuille', () => {
    expect(sheet.sheet).toEqual({
      src: '/library/spike/avatars/a01.webp',
      width: 2048,
      height: 1400,
    });
    expect(sheet.animations.walk.strideMeters).toBe(1.3);
    expect(sheet.animations.walk.directions[3]).toHaveLength(8);
    // idle et walk partagent la feuille de l'avatar.
    expect(sheet.animations.idle.sheet).toBe(sheet.sheet);
    expect(sheet.animations.sit.sheet.src).toBe(
      '/library/spike/avatars/a01-sit.webp'
    );
    expect(sheetsOf(sheet).map((s) => s.src)).toEqual([
      '/library/spike/avatars/a01.webp',
      '/library/spike/avatars/a01-sit.webp',
    ]);
  });

  it('rejette l’avatar entier au moindre rect ou feuille incohérent', () => {
    const bad = (over: Record<string, unknown>) =>
      parseAvatarSheet(entry(over));
    const withIdle = (directions: unknown) => ({
      animations: { idle: { fps: 1, directions } },
    });
    // Rect qui sort de la feuille (x + w > sheetWidth, y + h > sheetHeight).
    expect(bad(withIdle({ 0: [rect(1990)] }))).toBeNull();
    expect(bad(withIdle({ 0: [rect(0, 1200)] }))).toBeNull();
    // Ancre hors du rect, taille nulle, coordonnée non entière.
    expect(bad(withIdle({ 0: [rect(0, 0, { ax: 81 })] }))).toBeNull();
    expect(bad(withIdle({ 0: [rect(0, 0, { ay: -1 })] }))).toBeNull();
    expect(bad(withIdle({ 0: [rect(0, 0, { w: 0 })] }))).toBeNull();
    expect(bad(withIdle({ 0: [rect(0.5)] }))).toBeNull();
    // Direction inconnue ou vide, aucune direction.
    expect(bad(withIdle({ 8: [rect(0)] }))).toBeNull();
    expect(bad(withIdle({ 0: [] }))).toBeNull();
    expect(bad(withIdle({}))).toBeNull();
    // Feuille plus grande que la limite des GPU mobiles.
    expect(bad({ sheetWidth: MAX_SHEET_PX + 1 })).toBeNull();
    expect(bad({ sheetHeight: undefined })).toBeNull();
    // `idle` obligatoire ; stride nul ; feuille propre incomplète.
    expect(
      bad({ animations: { walk: { fps: 10, directions: dirs(8) } } })
    ).toBeNull();
    expect(
      bad({
        animations: {
          idle: { fps: 1, directions: dirs(1) },
          walk: { fps: 10, strideMeters: 0, directions: dirs(8) },
        },
      })
    ).toBeNull();
    expect(
      bad({
        animations: {
          idle: { fps: 1, directions: dirs(1) },
          sit: { fps: 1, sheet: '/s.webp', directions: dirs(1) },
        },
      })
    ).toBeNull();
    // Un rect valide dans la feuille de l'avatar peut sortir d'une feuille
    // propre plus petite : il est validé contre SA feuille.
    expect(
      bad({
        animations: {
          idle: { fps: 1, directions: dirs(1) },
          sit: {
            fps: 1,
            sheet: '/s.webp',
            sheetWidth: 100,
            sheetHeight: 300,
            directions: { 4: [rect(400)] },
          },
        },
      })
    ).toBeNull();
  });

  it('l’ancien format en grille est refusé (silhouette)', () => {
    expect(
      parseAvatarSheet({
        sheet: '/a.webp',
        frameWidth: 212,
        frameHeight: 360,
        columns: 8,
        rows: 24,
        anchor: { x: 106, y: 307 },
        directions: [0, 1, 2, 3, 4, 5, 6, 7],
        animations: { idle: { rowStart: 0, frames: 1, fps: 1 } },
      })
    ).toBeNull();
  });

  it('taille de l’image chargée = taille annoncée de SA feuille', () => {
    expect(
      sheetMatchesImage(sheet.sheet, {
        naturalWidth: 2048,
        naturalHeight: 1400,
      })
    ).toBe(true);
    expect(
      sheetMatchesImage(sheet.sheet, {
        naturalWidth: 2047,
        naturalHeight: 1400,
      })
    ).toBe(false);
    expect(
      sheetMatchesImage(sheet.animations.sit.sheet, {
        naturalWidth: 900,
        naturalHeight: 300,
      })
    ).toBe(true);
  });
});

describe('avatarFrame', () => {
  const sheet = parseAvatarSheet(entry()) as AvatarSheet;

  it('attente : le rect de la direction, ancre dans le rect', () => {
    const f = at(avatarFrame(sheet, 6, 'idle', clock));
    expect(f).toMatchObject({
      src: '/library/spike/avatars/a01.webp',
      sx: 600,
      sy: 0,
      sw: 80,
      sh: 280,
      anchorX: 30,
      anchorY: 260,
      mirrored: false,
    });
  });

  it('marche avec strideMeters : l’image suit la distance, pas le temps', () => {
    const walk = (m: number, t = 0) =>
      at(avatarFrame(sheet, 4, 'walk', { timeSec: t, travelledMeters: m }));
    // 8 images sur 1,3 m : 0,1625 m par image ; rects x = 400 + k.
    expect(walk(0).sx).toBe(400);
    expect(walk(0.2).sx).toBe(401);
    expect(walk(0.2).sy).toBe(300);
    expect(walk(1.25).sx).toBe(407);
    expect(walk(1.3 + 0.2).sx).toBe(401); // cycle suivant
    expect(walk(0.2, 99).sx).toBe(401); // le temps n'y fait rien
  });

  it('marche sans strideMeters : retombe sur fps (au temps)', () => {
    const noStride = parseAvatarSheet(
      entry({
        animations: {
          idle: { fps: 1, directions: dirs(1) },
          walk: { fps: 10, directions: dirs(8) },
        },
      })
    ) as AvatarSheet;
    const f = at(
      avatarFrame(noStride, 4, 'walk', { timeSec: 0.35, travelledMeters: 5 })
    );
    expect(f.sx).toBe(403);
  });

  it('marche ou assise absentes : image de l’attente', () => {
    const idleOnly = parseAvatarSheet(
      entry({ animations: { idle: { fps: 1, directions: dirs(1) } } })
    ) as AvatarSheet;
    for (const pose of ['walk', 'sit'] as const) {
      expect(animationFor(idleOnly, pose).name).toBe('idle');
      expect(
        at(avatarFrame(idleOnly, 4, pose, { timeSec: 0, travelledMeters: 3 }))
          .sx
      ).toBe(400);
    }
  });

  it('assise : image dans la feuille propre de `sit` (chargée à la demande)', () => {
    const f = at(avatarFrame(sheet, 2, 'sit', clock));
    expect(f.src).toBe('/library/spike/avatars/a01-sit.webp');
    expect(animationFor(sheet, 'sit').anim.sheet.width).toBe(900);
    // Les autres poses ne touchent jamais la feuille de `sit`.
    for (const pose of ['idle', 'walk'] as const)
      for (let d = 0; d < 8; d++)
        expect(
          at(
            avatarFrame(sheet, d as Direction, pose, {
              timeSec: d,
              travelledMeters: d,
            })
          ).src
        ).toBe('/library/spike/avatars/a01.webp');
  });

  it('direction absente : miroir de (8 − d) mod 8, ancre retournée (w − ax)', () => {
    const half = parseAvatarSheet(
      entry({
        animations: { idle: { fps: 1, directions: dirs(1, [0, 1, 2, 3, 4]) } },
      })
    ) as AvatarSheet;
    const idle = half.animations.idle;
    for (const [d, base] of [
      [5, 3],
      [6, 2],
      [7, 1],
    ] as const) {
      expect(resolveDirection(idle, d)?.mirrored).toBe(true);
      const f = at(avatarFrame(half, d, 'idle', clock));
      expect(f.sx).toBe(base * 100);
      expect(f.mirrored).toBe(true);
      expect(f.anchorX).toBe(80 - 30);
      expect(f.anchorY).toBe(260);
    }
    expect(resolveDirection(idle, 3)?.mirrored).toBe(false);
  });

  it('ni la direction ni son miroir : pas d’image (silhouette)', () => {
    const only = parseAvatarSheet(
      entry({ animations: { idle: { fps: 1, directions: dirs(1, [4]) } } })
    ) as AvatarSheet;
    expect(resolveDirection(only.animations.idle, 0)).toBeNull();
    expect(avatarFrame(only, 2, 'idle', clock)).toBeNull();
    expect(avatarFrame(only, 4, 'idle', clock)).not.toBeNull();
  });

  it('posée par son ancre : écran − (ax, ay) / pixelRatio, taille (w, h) / pr', () => {
    const foot = { x: 100, y: 200 };
    expect(
      frameDestination(at(avatarFrame(sheet, 4, 'idle', clock)), foot, 2)
    ).toEqual({ x: 100 - 15, y: 200 - 130, w: 40, h: 140 });
    const half = parseAvatarSheet(
      entry({
        animations: { idle: { fps: 1, directions: dirs(1, [0, 1, 2, 3, 4]) } },
      })
    ) as AvatarSheet;
    const m = frameDestination(
      at(avatarFrame(half, 6, 'idle', clock)),
      foot,
      2
    );
    expect(m.x).toBe(100 - (80 - 30) / 2);
  });
});

describe('feuilles rendues (public/library/spike)', () => {
  const root = path.resolve(__dirname, '../../public');
  const manifest = parseManifest(
    JSON.parse(
      fs.readFileSync(path.join(root, 'library/spike/manifest.json'), 'utf8')
    )
  );

  it('les 12 avatars passent la validation, 8 directions par animation', () => {
    const ids = Object.keys(manifest?.avatars ?? {});
    expect(ids).toHaveLength(12);
    for (const a of Object.values(manifest?.avatars ?? {})) {
      for (const name of ['idle', 'walk', 'sit']) {
        const anim = a.animations[name];
        expect(Object.keys(anim.directions)).toHaveLength(8);
        expect(anim.directions[4]).toHaveLength(name === 'walk' ? 8 : 1);
      }
      expect(a.animations.sit.sheet.src).not.toBe(a.sheet.src);
    }
  });

  it('chaque feuille existe et tient dans 4096 px', () => {
    for (const a of Object.values(manifest?.avatars ?? {}))
      for (const s of sheetsOf(a)) {
        expect(fs.existsSync(path.join(root, s.src))).toBe(true);
        expect(Math.max(s.width, s.height)).toBeLessThanOrEqual(4096);
      }
  });
});
