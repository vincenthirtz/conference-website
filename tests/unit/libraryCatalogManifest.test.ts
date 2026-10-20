// Women's Library, lot 11 — le grand catalogue confronté à ce que le site
// livre vraiment :
//   * le MANIFESTE compact (une ligne par meuble, images déduites de la clé)
//     se lit, et un manifeste suspect est refusé ;
//   * chaque clé du catalogue (copie synchronisée de l'API) a ses 4 rotations
//     au manifeste RENDU, et leurs images existent ;
//   * le manifeste reste léger : il ne grossit que de quelques dizaines
//     d'octets par meuble ;
//   * chaque meuble, famille, teinte et set a son nom en français et en
//     anglais.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIBRARY_FURNITURE } from '../../config/library/furniture';
import { FURNITURE_SET_IDS } from '../../config/library/furnitureSets';
import { LIBRARY_FAMILY_COLORS } from '../../config/library/furnitureVariants';
import {
  furnitureSpriteUrl,
  mergeCatalog,
  parseManifest,
} from '../../features/player/library/engine/assets';
import enLibrary from '../../lib/i18n/locales/en/playerLibrary';
import nsLibrary from '../../lib/i18n/locales/fr/playerLibrary';

const PUBLIC = path.resolve(__dirname, '../../public');
const MANIFEST = path.join(PUBLIC, 'library/spike/manifest.json');
const raw = fs.readFileSync(MANIFEST, 'utf8');
const manifest = parseManifest(JSON.parse(raw));

const base = {
  version: 1,
  tile: { width: 64, height: 32, meters: 0.5 },
  pixelRatio: 2,
};
const r = [
  [256, 300, 120, 80],
  [250, 290, 110, 70],
  [256, 300, 120, 80],
  [250, 290, 110, 70],
];

describe('manifeste compact (lot 11)', () => {
  it('se lit : images déduites de la clé et du dossier', () => {
    const m = parseManifest({
      ...base,
      furnitureBase: '/library/spike/furniture/',
      furniture: {
        sofa_blue: { f: [3, 2], h: 0.8, r },
        rug_blue: { f: [6, 4], h: 0.02, l: 'floor', r },
      },
    });
    expect(m?.furniture.sofa_blue).toEqual({
      footprint: { w: 3, d: 2 },
      height: 0.8,
      rotations: r.map(([width, height, x, y], i) => ({
        src: `/library/spike/furniture/sofa_blue_r${i}.webp`,
        width,
        height,
        anchor: { x, y },
      })),
    });
    expect(m?.furniture.rug_blue.layer).toBe('floor');
    expect(mergeCatalog(m).sofa_blue).toEqual({
      footprint: { w: 3, d: 2 },
      height: 0.8,
    });
  });

  it('ignore une entrée mal formée, garde les autres (format du lot 3 compris)', () => {
    const m = parseManifest({
      ...base,
      furniture: {
        ok: { f: [1, 1], h: 1, r },
        three: { f: [1, 1], h: 1, r: r.slice(0, 3) },
        zero: { f: [0, 1], h: 1, r },
        layer: { f: [1, 1], h: 1, l: 'ceiling', r },
        BAD_KEY: { f: [1, 1], h: 1, r },
        verbose: {
          footprint: { w: 1, d: 1 },
          height: 1,
          rotations: [0, 1, 2, 3].map((i) => ({
            src: `/x/verbose_r${i}.webp`,
            width: 10,
            height: 10,
            anchor: { x: 1, y: 1 },
          })),
        },
      },
    });
    expect(Object.keys(m?.furniture ?? {}).sort()).toEqual(['ok', 'verbose']);
    // Sans `furnitureBase` : le dossier du pipeline.
    expect(m?.furniture.ok.rotations[2].src).toBe(
      '/library/spike/furniture/ok_r2.webp'
    );
  });

  it('refuse un dossier de sprites d’une autre origine ou qui remonte', () => {
    for (const furnitureBase of [
      'https://evil.example/',
      '//evil.example/',
      '/library/../../x/',
      'library/spike/',
      42,
    ])
      expect(
        parseManifest({ ...base, furnitureBase, furniture: {} }),
        String(furnitureBase)
      ).toBeNull();
  });

  it('furnitureSpriteUrl : la règle du pipeline, rien pour une clé suspecte', () => {
    expect(furnitureSpriteUrl('sofa_blue')).toBe(
      '/library/spike/furniture/sofa_blue_r0.webp'
    );
    expect(furnitureSpriteUrl('sofa', 3)).toBe(
      '/library/spike/furniture/sofa_r3.webp'
    );
    expect(furnitureSpriteUrl('../x')).toBeNull();
    expect(furnitureSpriteUrl('sofa', 4)).toBeNull();
  });
});

describe('manifeste RENDU face au catalogue', () => {
  it('se lit', () => {
    expect(manifest).not.toBeNull();
  });

  it('chaque clé du catalogue a ses 4 rotations, et leurs images existent', () => {
    const missing: string[] = [];
    for (const f of LIBRARY_FURNITURE) {
      const entry = manifest?.furniture[f.key];
      if (!entry || entry.rotations.length !== 4) {
        missing.push(`${f.key} (manifeste)`);
        continue;
      }
      for (const rot of entry.rotations)
        if (!fs.existsSync(path.join(PUBLIC, rot.src)))
          missing.push(`${f.key} (${rot.src})`);
      // L'empreinte rendue est celle du catalogue (collisions API = image).
      expect(entry.footprint, f.key).toEqual(f.footprint);
    }
    expect(missing).toEqual([]);
    expect(LIBRARY_FURNITURE.length).toBeGreaterThanOrEqual(200);
  });

  it('reste léger : le manifeste ne grossit que de peu par meuble', () => {
    const json = JSON.parse(raw);
    const furnitureBytes = Object.entries(json.furniture).reduce(
      (s, [k, v]) => s + k.length + JSON.stringify(v).length + 8,
      0
    );
    const perItem = furnitureBytes / Object.keys(json.furniture).length;
    expect(perItem).toBeLessThan(160);
  });
});

describe('noms du grand catalogue, en français et en anglais', () => {
  const fr = nsLibrary.fr;
  const en = enLibrary;

  it('chaque meuble a son nom', () => {
    for (const f of LIBRARY_FURNITURE) {
      expect(fr.furniture, f.key).toHaveProperty(f.key);
      expect(en.furniture, f.key).toHaveProperty(f.key);
    }
  });

  it('chaque famille à variantes a son titre, chaque teinte et chaque set leur libellé', () => {
    for (const family of Object.keys(LIBRARY_FAMILY_COLORS)) {
      expect(fr.families, family).toHaveProperty(family);
      expect(en.families, family).toHaveProperty(family);
    }
    for (const f of LIBRARY_FURNITURE)
      if (f.variant) {
        expect(fr.colors, f.key).toHaveProperty(f.variant);
        expect(en.colors, f.key).toHaveProperty(f.variant);
      }
    for (const s of FURNITURE_SET_IDS) {
      expect(fr.sets).toHaveProperty(s);
      expect(en.sets).toHaveProperty(s);
    }
  });
});
