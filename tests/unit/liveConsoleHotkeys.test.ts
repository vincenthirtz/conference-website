// Raccourcis de la console live — components/admin/broadcast/LiveConsoleHotkeys.
// Toujours avec Maj : une frappe seule ne doit pas couper l'antenne.

import { describe, it, expect } from 'vitest';
import { hotkeyAction } from '../../components/admin/broadcast/LiveConsoleHotkeys';
import { LIVE_SCENES } from '../../utils/broadcast/liveScenes';

const key = (over: Partial<Parameters<typeof hotkeyAction>[0]>) =>
  hotkeyAction({
    code: '',
    key: '',
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...over,
  });

describe('hotkeyAction', () => {
  it('Maj+1…6 : les scènes, dans l’ordre des boutons', () => {
    LIVE_SCENES.forEach((scene, i) => {
      expect(key({ code: `Digit${i + 1}`, shiftKey: true })).toEqual({
        kind: 'scene',
        scene,
      });
    });
    expect(key({ code: 'Digit9', shiftKey: true })).toBeNull();
  });

  it('Maj+A : l’antenne ; Maj+P : le PiP', () => {
    expect(key({ code: 'KeyA', shiftKey: true })).toEqual({ kind: 'air' });
    expect(key({ code: 'KeyP', shiftKey: true })).toEqual({ kind: 'pip' });
  });

  it('sans Maj, rien ne se déclenche (un « a » tapé à côté)', () => {
    expect(key({ code: 'KeyA' })).toBeNull();
    expect(key({ code: 'Digit1' })).toBeNull();
  });

  it('les combinaisons du navigateur restent au navigateur', () => {
    expect(key({ code: 'KeyA', shiftKey: true, ctrlKey: true })).toBeNull();
    expect(key({ code: 'KeyP', shiftKey: true, metaKey: true })).toBeNull();
  });

  it('? ouvre l’aide', () => {
    expect(key({ key: '?', shiftKey: true })).toEqual({ kind: 'help' });
  });
});
