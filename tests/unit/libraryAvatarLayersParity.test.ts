// Women's Library, lot 13 — parité entre les listes fermées du look
// (config/library/avatarLook.ts, copie synchronisée de l'API), la spec des
// calques du pipeline (tools/library-assets/avatar-layers.json) et l'index des
// calques RENDUS (public/library/spike/avatars/layers/layers.json).
//
// Un identifiant ajouté à l'API sans son calque rendu retomberait sur
// l'avatar `avatarId` : ce test le dit avant la mise en ligne. Il vérifie
// aussi que les feuilles annoncées existent, et que chaque look prédéfini des
// douze avatars d'origine se compose.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LIBRARY_AVATAR_PRESETS,
  LIBRARY_LOOK_HAIRS,
  LIBRARY_LOOK_OUTFITS,
  LIBRARY_LOOK_SKINS,
} from '../../config/library/avatarLook';
import {
  lookLayers,
  parseLayerIndex,
} from '../../features/player/library/engine/avatarLayers';

const ROOT = path.resolve(__dirname, '../..');
const spec = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'tools/library-assets/avatar-layers.json'),
    'utf8'
  )
) as {
  skins: Record<string, number[]>;
  outfits: Record<string, { top: { sleeves: string } }>;
  hairs: string[];
  shortestOutfit: string;
};
const INDEX = path.join(
  ROOT,
  'public/library/spike/avatars/layers/layers.json'
);

describe('spec des calques ↔ listes fermées', () => {
  it('mêmes carnations (et mêmes couleurs), tenues et coiffures', () => {
    expect(Object.keys(spec.skins)).toEqual(
      LIBRARY_LOOK_SKINS.map((s) => s.id)
    );
    for (const s of LIBRARY_LOOK_SKINS)
      expect(spec.skins[s.id], s.id).toEqual([...s.rgb]);
    expect(Object.keys(spec.outfits)).toEqual([...LIBRARY_LOOK_OUTFITS]);
    expect(spec.hairs).toEqual([...LIBRARY_LOOK_HAIRS]);
    expect(spec.outfits[spec.shortestOutfit]).toBeTruthy();
  });

  it('toute tenue a des manches (au moins courtes) : du cou aux chevilles', () => {
    for (const [id, o] of Object.entries(spec.outfits))
      expect(['short', 'elbow', 'three_quarter', 'long'], id).toContain(
        o.top.sleeves
      );
  });
});

describe('index des calques rendus', () => {
  const raw = fs.existsSync(INDEX)
    ? JSON.parse(fs.readFileSync(INDEX, 'utf8'))
    : null;
  const index = parseLayerIndex(raw);

  it('existe et se lit', () => {
    expect(index).not.toBeNull();
  });

  it('a chaque calque des listes, 3 animations × 8 directions, feuilles présentes', () => {
    if (!index) return;
    const ids = [
      ...LIBRARY_LOOK_SKINS.map((s) => `body.${s.id}`),
      ...LIBRARY_LOOK_OUTFITS.flatMap((o) => [`top.${o}`, `bottom.${o}`]),
      ...LIBRARY_LOOK_HAIRS.map((h) => `hair.${h}`),
    ];
    // Tout calque brut annoncé a passé la validation du moteur.
    expect(Object.keys(index.layers).sort()).toEqual(
      Object.keys(raw.layers).sort()
    );
    for (const id of ids) {
      const layer = index.layers[id];
      expect(layer, id).toBeTruthy();
      for (const name of ['idle', 'walk', 'sit'] as const) {
        const a = layer?.[name];
        expect(a, `${id} ${name}`).toBeTruthy();
        if (!a) continue;
        expect(
          a.directions.every((d) => d && d.length > 0),
          `${id} ${name}`
        ).toBe(true);
        expect(a.directions[0]?.length).toBe(name === 'walk' ? 8 : 1);
        const file = path.join(ROOT, 'public', a.sheet.src);
        expect(fs.existsSync(file), a.sheet.src).toBe(true);
      }
    }
  });

  it('chaque avatar d’origine se compose', () => {
    if (!index) return;
    for (const [id, look] of Object.entries(LIBRARY_AVATAR_PRESETS))
      for (const l of lookLayers(look))
        expect(index.layers[l.id], `${id} → ${l.id}`).toBeTruthy();
  });
});
