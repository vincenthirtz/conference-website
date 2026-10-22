// Women's Library, lot 16 — l'index des PNJ (`engine/npcSprites.ts`) contre
// celui RENDU par `tools/library-assets/build_npc.mjs`
// (public/library/spike/npc/npc.json) : le fantôme a ses 8 directions, chaque
// image existe et a sa taille, l'ancre tombe sous son axe ; un index d'une
// autre case ou mal formé ne donne rien (jamais d'exception).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadNpcIndex,
  NPC_INDEX_URL,
  npcFrame,
  parseNpcIndex,
} from '../../features/player/library/engine/npcSprites';

const PUBLIC = path.resolve(__dirname, '../../public');
const raw = JSON.parse(
  fs.readFileSync(path.join(PUBLIC, 'library/spike/npc/npc.json'), 'utf8')
);

/** Largeur et hauteur d'un WebP (VP8, VP8L ou VP8X), lues dans son en-tête. */
function webpSize(file: string): { w: number; h: number } {
  const b = fs.readFileSync(file);
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X')
    return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
  }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
}

describe('index des PNJ rendu', () => {
  const index = parseNpcIndex(raw);

  it('se lit : le fantôme, 8 directions, en 2×', () => {
    expect(index).not.toBeNull();
    expect(index?.pixelRatio).toBe(2);
    const ghost = index?.npcs.ghost;
    expect(ghost?.frames).toHaveLength(8);
    // Le modèle `ghost` du set Halloween : ~1 m de haut, ~0,35 m de rayon.
    expect(ghost?.height).toBeGreaterThan(0.8);
    expect(ghost?.height).toBeLessThan(1.2);
    expect(ghost?.radius).toBeGreaterThan(0.25);
    expect(ghost?.radius).toBeLessThan(0.45);
  });

  it('chaque image existe, à la taille annoncée, ancre sous l’axe', () => {
    const ghost = index?.npcs.ghost;
    if (!ghost) throw new Error('fantôme attendu');
    ghost.frames.forEach((f, k) => {
      expect(f.src).toBe(`/library/spike/npc/ghost_d${k}.webp`);
      const size = webpSize(path.join(PUBLIC, f.src));
      expect(size).toEqual({ w: f.width, h: f.height });
      // L'axe du modèle est au milieu de l'image, le pied au bas.
      expect(Math.abs(f.anchor.x - f.width / 2)).toBeLessThanOrEqual(2);
      expect(f.anchor.y).toBeGreaterThan(f.height * 0.7);
      expect(f.anchor.y).toBeLessThanOrEqual(f.height);
    });
    expect(npcFrame(ghost, 4)).toBe(ghost.frames[4]);
  });

  it('rien d’autre que des images de PNJ dans le dossier', () => {
    const files = fs.readdirSync(path.join(PUBLIC, 'library/spike/npc'));
    expect(files.sort()).toEqual(
      [
        'npc.json',
        ...Array.from({ length: 8 }, (_, k) => `ghost_d${k}.webp`),
      ].sort()
    );
  });
});

describe('parseNpcIndex', () => {
  it('rejette une autre version ou une autre case', () => {
    expect(parseNpcIndex({ ...raw, version: 2 })).toBeNull();
    expect(
      parseNpcIndex({ ...raw, tile: { width: 64, height: 32, meters: 1 } })
    ).toBeNull();
    expect(parseNpcIndex({ ...raw, pixelRatio: 0 })).toBeNull();
    expect(parseNpcIndex(null)).toBeNull();
  });

  it('ignore un PNJ mal formé ou à la clé douteuse', () => {
    const ghost = raw.npcs.ghost;
    const index = parseNpcIndex({
      ...raw,
      npcs: {
        ghost,
        short: { ...ghost, d: ghost.d.slice(0, 4) },
        flat: { ...ghost, h: 0 },
        '../evil': ghost,
      },
    });
    expect(Object.keys(index?.npcs ?? {})).toEqual(['ghost']);
  });

  it('loadNpcIndex : absent ou en échec, null', async () => {
    expect(NPC_INDEX_URL).toBe('/library/spike/npc/npc.json');
    expect(
      await loadNpcIndex(NPC_INDEX_URL, async () => ({
        ok: false,
        json: async () => raw,
      }))
    ).toBeNull();
    expect(
      await loadNpcIndex(NPC_INDEX_URL, async () => {
        throw new TypeError('Failed to fetch');
      })
    ).toBeNull();
    expect(
      (
        await loadNpcIndex(NPC_INDEX_URL, async () => ({
          ok: true,
          json: async () => raw,
        }))
      )?.npcs.ghost.frames
    ).toHaveLength(8);
  });
});
