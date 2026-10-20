// Women's Library, lot 5 phase B — ce qui flotte au-dessus des avatars
// (engine/avatarOverlays.ts), sans canvas : un contexte qui ENREGISTRE.
//   * un pseudo trop long est élidé (« … ») sans couper un emoji ;
//   * du fond vers l'avant, seulement les avatars qui portent quelque chose,
//     au-dessus de la tête ;
//   * pseudo, repère « discrète » (pointillés) et bulle (pictogramme + mot)
//     sont dessinés, rien quand il n'y a rien.

import { describe, expect, it } from 'vitest';
import {
  avatarOverlays,
  drawAvatarOverlays,
  ElideCache,
  elideText,
  LABEL_MAX_W,
} from '../../features/player/library/engine/avatarOverlays';
import { gridToScreen } from '../../features/player/library/engine/projection';
import { LibraryWorld } from '../../features/player/library/engine/world';

const CHAR_W = 7;
const measure = (s: string) => Array.from(s).length * CHAR_W;

/** Un contexte 2D qui enregistre textes, pointillés et sauvegardes. */
function recordingCtx() {
  const calls = {
    text: [] as string[],
    dashes: [] as number[][],
    saves: 0,
  };
  const ctx = {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save: () => {
      calls.saves += 1;
    },
    restore: () => {},
    setTransform: () => {},
    beginPath: () => {},
    roundRect: () => {},
    moveTo: () => {},
    lineTo: () => {},
    fill: () => {},
    stroke: () => {},
    setLineDash: (d: number[]) => calls.dashes.push(d),
    measureText: (s: string) => ({ width: measure(s) }),
    fillText: (s: string) => calls.text.push(s),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const ROOM = { w: 14, d: 12, wallHeight: 2.6, items: [] };
const CAM = { x: 300, y: 80, zoom: 1 };
const IRIS = '00000000-0000-4000-8000-000000000011';
const NOVA = '00000000-0000-4000-8000-000000000012';

describe('elideText', () => {
  it('garde un texte qui tient, élide celui qui déborde', () => {
    expect(elideText('Iris', 70, measure)).toBe('Iris');
    const out = elideText('Bartholomea-Fitzgerald', 70, measure);
    expect(out.endsWith('…')).toBe(true);
    expect(measure(out)).toBeLessThanOrEqual(70);
    expect('Bartholomea-Fitzgerald'.startsWith(out.slice(0, -1))).toBe(true);
  });

  it('ne coupe jamais un emoji en deux', () => {
    expect(elideText('👋👋👋👋👋', 3 * CHAR_W, measure)).toBe('👋👋…');
  });
});

describe('avatarOverlays', () => {
  it('du fond vers l’avant, au-dessus de la tête, seulement ce qui porte un texte', () => {
    const w = new LibraryWorld(ROOM, {});
    w.addAvatar('me', { i: 10, j: 10 }, 0);
    w.syncRemoteAvatars(
      [
        {
          id: NOVA,
          nickname: 'Nova',
          avatarId: null,
          tile: { i: 6, j: 6 },
          dir: 4,
          target: null,
          bubble: null,
        },
        {
          id: IRIS,
          nickname: 'Iris',
          avatarId: null,
          tile: { i: 2, j: 2 },
          dir: 4,
          target: null,
          bubble: { key: 'k', glyph: '👋', text: 'Saluer', shownAt: 0 },
        },
      ],
      0
    );
    // La joueuse sans repère ni bulle : rien au-dessus d'elle.
    let list = avatarOverlays(w, CAM);
    expect(list.map((o) => o.id)).toEqual([IRIS, NOVA]);
    const foot = gridToScreen(2.5, 2.5);
    expect(list[0].head.y).toBeLessThan(foot.y + CAM.y - 100);
    expect(list[0].bubble).toEqual({ glyph: '👋', text: 'Saluer' });

    w.setMarker('me', 'discrète');
    list = avatarOverlays(w, CAM);
    expect(list.at(-1)).toMatchObject({
      id: 'me',
      marker: 'discrète',
      label: null,
    });
  });
});

describe('drawAvatarOverlays', () => {
  it('pseudo élidé, bulle (pictogramme puis mot), repère en pointillés', () => {
    const { ctx, calls } = recordingCtx();
    const long = 'x'.repeat(40);
    drawAvatarOverlays(
      ctx,
      2,
      [
        {
          id: IRIS,
          head: { x: 100, y: 100 },
          depth: 1,
          label: long,
          marker: null,
          bubble: { glyph: '👋', text: 'Saluer' },
        },
        {
          id: 'me',
          head: { x: 200, y: 100 },
          depth: 2,
          label: null,
          marker: 'discrète',
          bubble: null,
        },
      ],
      'sans-serif',
      new ElideCache()
    );
    const [label, glyph, word, marker] = calls.text;
    expect(label.endsWith('…')).toBe(true);
    expect(measure(label)).toBeLessThanOrEqual(LABEL_MAX_W);
    expect([glyph, word, marker]).toEqual(['👋', 'Saluer', 'discrète']);
    expect(calls.dashes).toContainEqual([3, 2]);
  });

  it('rien à dessiner : le contexte n’est pas touché', () => {
    const { ctx, calls } = recordingCtx();
    drawAvatarOverlays(ctx, 1, [], 'sans-serif', new ElideCache());
    expect(calls.saves).toBe(0);
    expect(calls.text).toEqual([]);
  });
});
