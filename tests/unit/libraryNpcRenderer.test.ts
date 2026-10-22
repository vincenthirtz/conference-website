// Women's Library, lot 16 — le rendu et le PNJ (`engine/renderer.ts`), sur
// un faux contexte 2D qui journalise : à chaque image le PNJ avance d'abord
// (position, « bouh »), son ombre passe avec les tracés au sol, AVANT les
// meubles et les avatars, son image est triée avec eux, et le rendu lui dit
// s'il est à l'écran (taille CSS du cadre). Sans PNJ, rien ne change.
import { describe, expect, it, vi } from 'vitest';
import type { ImageCache } from '../../features/player/library/engine/assets';
import type { NpcLayer } from '../../features/player/library/engine/npcLayer';
import type { Camera } from '../../features/player/library/engine/projection';
import { LibraryRenderer } from '../../features/player/library/engine/renderer';
import { LibraryWorld } from '../../features/player/library/engine/world';

/** Un contexte 2D qui accepte tout et note les appels qui dessinent. */
function fakeCanvas(log: string[]) {
  const state: Record<string | symbol, unknown> = {};
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient')
        return () => ({ addColorStop() {} });
      if (k === 'createPattern') return () => null;
      if (k === 'measureText')
        return (s: string) => ({ width: String(s).length * 6 });
      return (..._args: unknown[]) => {
        if (k === 'fill' || k === 'drawImage' || k === 'stroke')
          log.push(`ctx:${String(k)}`);
      };
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
  return {
    width: 0,
    height: 0,
    style: {},
    dataset: {},
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

const images = { get: () => null } as unknown as ImageCache;
const CAM: Camera = { x: 300, y: 80, zoom: 1 };

function stubNpc(log: string[], withBox = true) {
  return {
    step: vi.fn(() => log.push('npc:step')),
    drawShadow: vi.fn(() => log.push('npc:shadow')),
    box: () =>
      withBox
        ? { minX: 4, maxX: 4.9, minY: 4, maxY: 4.9, minZ: 0.25, maxZ: 1.2 }
        : null,
    draw: vi.fn(() => {
      log.push('npc:draw');
      return true;
    }),
    overlay: () => null,
    markVisible: vi.fn(() => log.push('npc:visible')),
  };
}

function scene(log: string[], npc: ReturnType<typeof stubNpc> | null) {
  const world = new LibraryWorld(
    {
      w: 12,
      d: 10,
      wallHeight: 2.6,
      items: [{ id: 'table', key: 'table', gx: 6, gy: 6, r: 0 }],
    },
    { table: { footprint: { w: 2, d: 2 }, height: 0.8 } }
  );
  world.addAvatar('me', { i: 8, j: 2 }, 0);
  world.npc = npc as unknown as NpcLayer;
  const renderer = new LibraryRenderer(fakeCanvas(log), images);
  renderer.resize(800, 600, 2);
  return { world, renderer };
}

describe('LibraryRenderer — le PNJ', () => {
  it('avance, puis son ombre, puis son image triée, puis « à l’écran ? »', () => {
    const log: string[] = [];
    const npc = stubNpc(log);
    const { world, renderer } = scene(log, npc);
    const stats = renderer.draw(world, CAM);
    const at = (s: string) => log.indexOf(s);
    expect(npc.step).toHaveBeenCalledWith(world);
    expect(at('npc:step')).toBe(0);
    expect(at('npc:shadow')).toBeGreaterThan(at('npc:step'));
    expect(at('npc:draw')).toBeGreaterThan(at('npc:shadow'));
    expect(at('npc:visible')).toBeGreaterThan(at('npc:draw'));
    // Taille CSS du cadre (le tampon est en px × dpr).
    expect(npc.markVisible).toHaveBeenCalledWith(CAM, 800, 600);
    // Trié AVEC les meubles et les avatars (un objet de plus).
    expect(stats.objects).toBe(3);
    expect(stats.sprites).toBe(1);
  });

  it('sans boîte (pas de fantôme maintenant) : ni image ni objet en plus', () => {
    const log: string[] = [];
    const npc = stubNpc(log, false);
    const { world, renderer } = scene(log, npc);
    const stats = renderer.draw(world, CAM);
    expect(npc.draw).not.toHaveBeenCalled();
    expect(stats.objects).toBe(2);
  });

  it('sans PNJ : le rendu d’avant', () => {
    const log: string[] = [];
    const { world, renderer } = scene(log, null);
    const stats = renderer.draw(world, CAM);
    expect(log.some((l) => l.startsWith('npc:'))).toBe(false);
    expect(stats.objects).toBe(2);
  });
});
